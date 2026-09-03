// =============================================================================
// WHAT AN ALERT MAY SAY
//
// Alerts are the paid product's substance, so this file exists mostly to hold
// the line on what cannot be claimed. Two rules matter more than the selection
// logic itself:
//
//   1. NO EMPLOYER-LINKED POLICY CHANGES. The archive carries entity ids for
//      agencies, topics, visas, countries, policies, court cases and executive
//      actions, and NOT for employers. An alert saying "a policy change
//      mentions your employer" would be fabricated, and a test asserts the
//      selector cannot produce one.
//
//   2. THE WARN CAVEAT TRAVELS WITH THE SIGNAL. The employer pages already say
//      that appearing in both datasets does not imply one caused the other. An
//      alert is short, and a short format is exactly where a caveat gets
//      dropped, so the sentence is asserted here.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  CURSOR_MEMORY,
  buildAlertBatch,
  changeAlerts,
  h1bAlerts,
  initialCursor,
  parseCursor,
  serializeCursor,
  warnAlerts,
  type AlertCursor,
  type H1bEmployerLike,
  type WarnEmployerLike,
} from "@/lib/billing/alerts";
import type { IndexedEvent } from "@/lib/event-index";

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:2026-1",
    title: "A rule about H-1B petitions",
    publishedAt: "2026-09-02",
    effectiveAt: null,
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/x",
    summary: "Something changed.",
    entityIds: ["visa:h-1b", "agency:uscis"],
    ...over,
  };
}

const WARN_EMPLOYER: WarnEmployerLike = {
  slug: "acme-corp",
  name: "Acme Corp",
  notices: 3,
  employees: 1_250,
  states: ["TX", "NJ"],
  latestNotice: "2026-09-01",
};

const H1B_EMPLOYER: H1bEmployerLike = { slug: "acme-corp", name: "Acme Corp", approvals: 400, denials: 100 };

const EMPTY: AlertCursor = {};

// -----------------------------------------------------------------------------
// CHANGES
// -----------------------------------------------------------------------------

describe("change alerts", () => {
  it("selects only changes that match a follow", () => {
    const events = [event(), event({ id: "e2", entityIds: ["country:mexico"] })];
    const alerts = changeAlerts(events, ["visa:h-1b"], EMPTY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].matched).toEqual(["visa:h-1b"]);
    expect(alerts[0].href).toBe("/what-changed/federal_register:2026-1");
  });

  it("says nothing to an empty watchlist", () => {
    expect(changeAlerts([event()], [], EMPTY)).toEqual([]);
  });

  it("never matches an employer follow, because no change record links to one", () => {
    // The rule this whole module is built around. Employer ids do not appear
    // in any event's entityIds; a selector that matched them would be inventing
    // the link.
    const withEmployerLookalike = event({ entityIds: ["employer:acme-corp"] });
    expect(changeAlerts([withEmployerLookalike], ["employer:acme-corp"], EMPTY)).toEqual([]);
  });

  it("does not repeat a change it already sent", () => {
    const cursor: AlertCursor = { sent: ["change:federal_register:2026-1"] };
    expect(changeAlerts([event()], ["visa:h-1b"], cursor)).toEqual([]);
  });

  it("does not send anything older than the cursor's date", () => {
    const cursor: AlertCursor = { lastChangeDate: "2026-09-02" };
    expect(changeAlerts([event({ publishedAt: "2026-09-01" })], ["visa:h-1b"], cursor)).toEqual([]);
    expect(changeAlerts([event({ publishedAt: "2026-09-03" })], ["visa:h-1b"], cursor)).toHaveLength(1);
  });

  it("carries the effective date when the record has one", () => {
    const alerts = changeAlerts([event({ effectiveAt: "2026-10-01" })], ["visa:h-1b"], EMPTY);
    expect(alerts[0].detail).toContain("takes effect 2026-10-01");
  });

  it("orders newest first", () => {
    const events = [
      event({ id: "old", publishedAt: "2026-08-01" }),
      event({ id: "new", publishedAt: "2026-09-02" }),
    ];
    expect(changeAlerts(events, ["visa:h-1b"], EMPTY).map((a) => a.id)).toEqual(["change:new", "change:old"]);
  });
});

// -----------------------------------------------------------------------------
// EMPLOYER MONITORING — the differentiated one
// -----------------------------------------------------------------------------

describe("WARN alerts", () => {
  it("alerts on a followed employer's newest notice", () => {
    const alerts = warnAlerts([WARN_EMPLOYER], ["employer:acme-corp"], EMPTY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toContain("Acme Corp");
    expect(alerts[0].href).toBe("/employer/acme-corp");
    expect(alerts[0].date).toBe("2026-09-01");
  });

  it("carries the caveat in the alert itself", () => {
    // The employer pages say this; a short format must not drop it.
    const [alert] = warnAlerts([WARN_EMPLOYER], ["employer:acme-corp"], EMPTY);
    expect(alert.detail).toMatch(/does not indicate whether or how those roles relate to visa sponsorship/i);
    expect(alert.detail).toContain("1,250");
    expect(alert.detail).toContain("TX, NJ");
  });

  it("ignores an employer nobody follows", () => {
    expect(warnAlerts([WARN_EMPLOYER], ["employer:someone-else"], EMPTY)).toEqual([]);
    expect(warnAlerts([WARN_EMPLOYER], ["visa:h-1b"], EMPTY)).toEqual([]);
  });

  it("fires again only when a NEWER notice appears", () => {
    const first = warnAlerts([WARN_EMPLOYER], ["employer:acme-corp"], EMPTY);
    const cursor: AlertCursor = { sent: first.map((a) => a.id) };
    // Same latest notice: nothing.
    expect(warnAlerts([WARN_EMPLOYER], ["employer:acme-corp"], cursor)).toEqual([]);
    // A newer one: a new alert.
    const later = warnAlerts(
      [{ ...WARN_EMPLOYER, latestNotice: "2026-09-20", notices: 4 }],
      ["employer:acme-corp"],
      cursor
    );
    expect(later).toHaveLength(1);
    expect(later[0].id).toContain("2026-09-20");
  });

  it("says nothing about an employer with no notice on file", () => {
    expect(warnAlerts([{ ...WARN_EMPLOYER, latestNotice: null }], ["employer:acme-corp"], EMPTY)).toEqual([]);
  });
});

describe("H-1B export alerts", () => {
  it("alerts once per employer per fiscal year, with the counts caveat", () => {
    const alerts = h1bAlerts([H1B_EMPLOYER], ["employer:acme-corp"], "2024", EMPTY);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].detail).toContain("400");
    expect(alerts[0].detail).toContain("80% approved");
    expect(alerts[0].detail).toMatch(/petition counts, not workers/i);

    const cursor: AlertCursor = { sent: alerts.map((a) => a.id) };
    expect(h1bAlerts([H1B_EMPLOYER], ["employer:acme-corp"], "2024", cursor)).toEqual([]);
    // A new export is a new alert.
    expect(h1bAlerts([H1B_EMPLOYER], ["employer:acme-corp"], "2025", cursor)).toHaveLength(1);
  });

  it("handles an employer with no petitions without dividing by zero", () => {
    const alerts = h1bAlerts(
      [{ ...H1B_EMPLOYER, approvals: 0, denials: 0 }],
      ["employer:acme-corp"],
      "2024",
      EMPTY
    );
    expect(alerts[0].detail).not.toContain("NaN");
    expect(alerts[0].detail).not.toContain("%");
  });
});

// -----------------------------------------------------------------------------
// THE BATCH
// -----------------------------------------------------------------------------

describe("assembling one email's worth", () => {
  const input = {
    events: [event(), event({ id: "e2", publishedAt: "2026-08-30", entityIds: ["visa:h-1b"] })],
    warnEmployers: [WARN_EMPLOYER],
    h1bEmployers: [H1B_EMPLOYER],
    fiscalYear: "2024",
  };
  const follows = ["visa:h-1b", "employer:acme-corp"];

  it("combines every kind, newest first", () => {
    const batch = buildAlertBatch(input, follows, EMPTY);
    expect(new Set(batch.alerts.map((a) => a.kind))).toEqual(new Set(["change", "warn_notice", "h1b_export"]));
    const dates = batch.alerts.map((a) => a.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("caps a batch so a wide watchlist cannot produce an unreadable email", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      event({ id: `e${i}`, publishedAt: `2026-09-${String((i % 28) + 1).padStart(2, "0")}` })
    );
    expect(buildAlertBatch({ ...input, events: many }, follows, EMPTY).alerts.length).toBeLessThanOrEqual(12);
  });

  it("returns a cursor that stops the same batch sending twice", () => {
    const first = buildAlertBatch(input, follows, EMPTY);
    expect(first.alerts.length).toBeGreaterThan(0);
    const second = buildAlertBatch(input, follows, first.cursor);
    expect(second.alerts).toEqual([]);
  });

  it("bounds how much the cursor remembers", () => {
    const cursor: AlertCursor = { sent: Array.from({ length: 500 }, (_, i) => `change:old-${i}`) };
    const next = buildAlertBatch(input, follows, cursor);
    expect(next.cursor.sent!.length).toBeLessThanOrEqual(CURSOR_MEMORY);
  });

  it("starts a new subscriber from today, not from the whole archive", () => {
    // Otherwise the welcome email is 500 changes that already happened.
    const cursor = initialCursor("2026-09-02");
    const batch = buildAlertBatch(input, ["visa:h-1b"], cursor);
    expect(batch.alerts.every((a) => a.kind !== "change" || a.date > "2026-09-02")).toBe(true);
  });

  it("survives a damaged cursor rather than going silent forever", () => {
    expect(parseCursor("not json")).toEqual({});
    expect(parseCursor(null)).toEqual({});
    const round = parseCursor(serializeCursor({ lastChangeDate: "2026-09-02", sent: ["a", "b"] }));
    expect(round).toEqual({ lastChangeDate: "2026-09-02", sent: ["a", "b"] });
  });
});
