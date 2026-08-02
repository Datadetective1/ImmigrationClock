// =============================================================================
// CBP NATIONWIDE ENCOUNTERS ADAPTER
//
// This adapter projects the existing CBP pipeline into the event model rather
// than fetching CBP again, so its risks are different from the others. Nothing
// can be mis-parsed; what CAN go wrong is a date being conflated or a number
// being described as something it is not.
//
// The two claims that would mislead a reader most:
//   • that an encounter is a person (it is an enforcement action, and one
//     person can be encountered several times)
//   • that a year-to-date figure is a year (it is not comparable until the
//     fiscal year closes)
//
// Both are asserted on every event, and tested here.
// =============================================================================
import { describe, it, expect } from "vitest";
import { __testing as CBP } from "@/domains/graph/adapters/cbp-encounters";
import { validateEvent } from "@/domains/graph/events";

const TODAY = new Date().toISOString().slice(0, 10);

const entry = (over: Record<string, unknown> = {}) => ({
  period: "June 2026",
  month: "JUN",
  order: 9,
  fy: 2026,
  cbpNationwideYtd: 280656,
  publishedFolder: "2026-07",
  backfilled: false,
  ...over,
});

const refresh = {
  ok: true,
  reportingMonth: "JUN",
  reportingMonthLabel: "June 2026",
  currentFy: 2026,
  currentFyYtd: 280656,
  datasetUrl: "https://www.cbp.gov/sites/default/files/2026-07/nationwide-encounters-fy23-fy26-jun-aor.csv",
  sourceUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
  sourceUpdatedAt: "2026-07-17",
};

describe("the three dates", () => {
  it("sets data-through to the END of the covered month", () => {
    // "through June 2026" means through the 30th. Dating it to the 1st would
    // understate coverage by a month.
    expect(CBP.dataThroughDate({ period: "June 2026", month: "JUN" })).toBe("2026-06-30");
    expect(CBP.dataThroughDate({ period: "January 2026", month: "JAN" })).toBe("2026-01-31");
  });

  it("handles February in a leap year", () => {
    expect(CBP.dataThroughDate({ period: "February 2028", month: "FEB" })).toBe("2028-02-29");
    expect(CBP.dataThroughDate({ period: "February 2026", month: "FEB" })).toBe("2026-02-28");
  });

  it("returns null for a period it cannot parse rather than guessing", () => {
    expect(CBP.dataThroughDate({ period: "sometime recently", month: null })).toBeNull();
    expect(CBP.dataThroughDate({ period: "", month: null })).toBeNull();
  });

  it("dates publication from CBP's folder month", () => {
    // CBP publishes no release date, only a year-month folder.
    expect(CBP.publishedDate(entry({ publishedFolder: "2026-07" }))).toBe("2026-07-01");
  });

  it("returns null when there is no publication month at all", () => {
    expect(CBP.publishedDate(entry({ publishedFolder: null }))).toBeNull();
    expect(CBP.publishedDate(entry({ publishedFolder: "garbage" }))).toBeNull();
  });

  it("keeps published and data-through distinct on the event", () => {
    // The single most important thing this adapter gets right. CBP published in
    // July; the numbers cover through June. Conflating them would misstate how
    // current the data is by a full reporting cycle.
    const e = CBP.toEvent(entry(), "2026-07-01", refresh, TODAY);
    expect(e.publishedAt).toBe("2026-07-01");
    expect(e.dataThrough).toBe("2026-06-30");
    expect(e.publishedAt).not.toBe(e.dataThrough);
  });
});

describe("what the event claims", () => {
  const e = () => CBP.toEvent(entry(), "2026-07-01", refresh, TODAY);

  it("produces events that pass validation", () => {
    expect(validateEvent(e())).toEqual([]);
  });

  it("says an encounter is not a person", () => {
    // The most consequential misreading available for this dataset, and the one
    // most often made in public reporting.
    expect(e().summary).toMatch(/not a person/i);
    expect(e().limitations?.join(" ")).toMatch(/one person can be encountered several times/i);
  });

  it("says a year-to-date figure is not a year", () => {
    expect(e().limitations?.join(" ")).toMatch(/not comparable to a full year/i);
    expect(e().limitations?.join(" ")).toMatch(/begins on 1 October/);
  });

  it("discloses that the publication day is approximate", () => {
    expect(e().limitations?.join(" ")).toMatch(/does not publish a release date/i);
  });

  it("ranks a scheduled release as routine, however large the number", () => {
    // A statistical release is the calendar doing its job. Ranking it higher
    // because the figure is striking is exactly the manufactured importance the
    // platform refuses.
    expect(CBP.toEvent(entry({ cbpNationwideYtd: 9_000_000 }), "2026-07-01", refresh, TODAY).severity).toBe(
      "routine"
    );
    expect(e().severity).toBe("routine");
  });

  it("classifies the release as a data release, not a policy change", () => {
    expect(e().classification).toBe("data_release");
  });

  it("never gives a statistical release an effective date", () => {
    // It changes nobody's obligations, so there is nothing to take effect.
    expect(e().effectiveAt).toBeNull();
  });

  it("labels the figures as reported rather than modeled", () => {
    expect(e().provenance).toBe("reported");
  });

  it("explains that nobody's status is affected, rather than showing a blank", () => {
    // An empty "who is affected" reads as "nobody is affected by anything here",
    // which is a different and vaguer claim than the true one.
    expect(e().impact?.undetermined).toMatch(/does not change anyone's status/i);
  });

  it("links both the landing page and the underlying CSV", () => {
    expect(e().sourceUrl).toBe("https://www.cbp.gov/newsroom/stats/nationwide-encounters");
    expect(e().sourceDataUrl).toMatch(/nationwide-encounters.*\.csv$/);
  });

  it("attributes the release to CBP explicitly", () => {
    const issued = e().entities.find((l) => l.relation === "issued_by")!;
    expect(issued.entityId).toBe("agency:cbp");
    expect(issued.basis).toBe("explicit");
  });

  it("produces a deterministic id per fiscal month", () => {
    expect(CBP.stableId(entry())).toBe("cbp_encounters:fy2026-jun");
    expect(CBP.stableId(entry())).toBe(CBP.stableId(entry()));
    expect(CBP.stableId(entry({ month: "JUL", period: "July 2026" }))).not.toBe(CBP.stableId(entry()));
  });
});

describe("backfilled figures", () => {
  it("says so when a figure was reconstructed rather than observed", () => {
    // The number is identical either way — it is CBP's own total. What differs
    // is whether we watched the release happen, and the archive already knows.
    const e = CBP.toEvent(entry({ backfilled: true }), "2026-07-01", refresh, TODAY);
    expect(e.limitations?.join(" ")).toMatch(/reconstructed from a later cumulative CBP file/i);
  });

  it("adds no such caveat to an observed release", () => {
    const e = CBP.toEvent(entry({ backfilled: false }), "2026-07-01", refresh, TODAY);
    expect(e.limitations?.join(" ")).not.toMatch(/reconstructed/i);
  });
});

describe("building from pipeline output", () => {
  const history = {
    cbpNationwideYtd: [
      entry({ period: "October 2025", month: "OCT", order: 1, cbpNationwideYtd: 30573, publishedFolder: "2025-11", backfilled: true }),
      entry({ period: "November 2025", month: "NOV", order: 2, cbpNationwideYtd: 60926, publishedFolder: "2025-12", backfilled: true }),
      entry({ period: "June 2026", month: "JUN", order: 9, cbpNationwideYtd: 280656, publishedFolder: null, backfilled: false }),
    ],
  };

  it("emits one event per recorded release", () => {
    const { events } = CBP.buildEvents({ history, refresh: { cbp: refresh } }, TODAY);
    expect(events).toHaveLength(3);
    expect(new Set(events.map((e) => e.id)).size).toBe(3);
  });

  it("dates the newest release from the pipeline's observed date", () => {
    // The current month has no archived folder yet, but the refresh record knows
    // when our pipeline actually saw the file — a real date, not a guess.
    const { events } = CBP.buildEvents({ history, refresh: { cbp: refresh } }, TODAY);
    const june = events.find((e) => e.id === "cbp_encounters:fy2026-jun")!;
    expect(june.publishedAt).toBe("2026-07-17");
  });

  it("skips an undateable release rather than inventing a date", () => {
    const orphan = {
      cbpNationwideYtd: [entry({ period: "May 2026", month: "MAY", publishedFolder: null })],
    };
    const { events, warnings } = CBP.buildEvents({ history: orphan, refresh: { cbp: {} } }, TODAY);
    expect(events).toHaveLength(0);
    expect(warnings.join(" ")).toMatch(/dated by guess/);
  });

  it("reports an empty archive instead of failing", () => {
    const { events, warnings } = CBP.buildEvents({ history: {}, refresh: { cbp: {} } }, TODAY);
    expect(events).toEqual([]);
    expect(warnings.join(" ")).toMatch(/no CBP history/);
  });

  it("produces only valid events from real-shaped input", () => {
    const { events } = CBP.buildEvents({ history, refresh: { cbp: refresh } }, TODAY);
    for (const e of events) expect(validateEvent(e), e.id).toEqual([]);
  });
});
