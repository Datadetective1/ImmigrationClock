// =============================================================================
// SELECTION, SCORING AND DEEP LINKS
//
// Two things are load-bearing here and both are about honesty rather than taste:
//
//   • The three pools must not overlap, or the afternoon slot can "explain" a
//     rule the morning slot broke six hours earlier — the single most
//     recognisable tell of an automated account padding a schedule.
//
//   • Every deep link must go somewhere the app actually serves. An earlier
//     version emitted /what-changed?event=<id>, a parameter the explorer does
//     not read, so the reader landed on an unfiltered archive. Those tests are
//     written against the real route contract.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  newsPool,
  knowledgePool,
  standingPool,
  candidatesFor,
  anglesForArchiveEvent,
  NEWS_LOOKBACK_DAYS,
  KNOWLEDGE_MIN_AGE_DAYS,
} from "@/lib/social/select";
import { scoreEvent, isPostableSeverity, isSubstantive, NEWS_SCORE_FLOOR } from "@/lib/social/score";
import { resolveDeepLink, queryFor, STANDING_ASSETS, isPublishableDestination } from "@/lib/social/links";
import { SLOTS, SLOT_BY_ID } from "@/lib/social/slots";
import { EVENT_INDEX } from "@/lib/event-index";
import type { IndexedEvent } from "@/lib/event-index";

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:test-1",
    title: "Fee Adjustment for Certain Benefit Requests",
    publishedAt: "2026-08-10",
    effectiveAt: null,
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/documents/test",
    summary:
      "DHS is amending the fee schedule that applies to all benefit requests, changing filing fee requirements for every applicant.",
    entityIds: ["agency:dhs", "topic:policy-changes"],
    ...over,
  };
}

describe("news pool", () => {
  const today = "2026-08-10";

  it("takes an event published today", () => {
    expect(newsPool([event()], today)).toHaveLength(1);
  });

  it("takes an event inside the lookback", () => {
    const e = event({ publishedAt: "2026-08-08" });
    expect(newsPool([e], today)).toHaveLength(1);
  });

  it("drops an event older than the lookback", () => {
    const e = event({ publishedAt: "2026-08-01" });
    expect(newsPool([e], today)).toHaveLength(0);
  });

  it("drops routine severity whatever it scores", () => {
    expect(newsPool([event({ severity: "routine" })], today)).toHaveLength(0);
  });

  it("drops a scheduled-for-publication document", () => {
    // The Federal Register puts items on public inspection ahead of publication.
    // Posting one would force "scheduled for publication on..." phrasing, which
    // is weaker and much easier to get subtly wrong than simply waiting.
    const e = event({ publishedAt: "2026-08-12", scheduled: true });
    expect(newsPool([e], today)).toHaveLength(0);
  });

  it("drops anything below the score floor", () => {
    const narrow = event({
      title: "Notice about diplomatic officers",
      summary: "A notice concerning certain aliens who are diplomatic officers.",
      severity: "notable",
      classification: "announcement",
    });
    const scored = scoreEvent(narrow, "2026-08-08", today);
    expect(scored.score).toBeLessThan(NEWS_SCORE_FLOOR);
    expect(newsPool([narrow], today)).toHaveLength(0);
  });

  it("only ever offers the breaking angle", () => {
    expect(newsPool([event()], today)[0].supportedAngles).toEqual(["breaking_change"]);
  });

  it("orders by score, highest first", () => {
    const strong = event({ id: "a:1" });
    const weak = event({
      id: "a:2",
      title: "Notice concerning nationals of one country",
      summary: "A notice limited to nationals of a specific country and no one else.",
      entityIds: ["country:haiti"],
      severity: "notable",
    });
    const pool = newsPool([weak, strong], today);
    expect(pool[0].subjectId).toContain("a:1");
  });
});

describe("knowledge pool does not overlap news", () => {
  const today = "2026-08-10";

  it("excludes anything the news pool could still claim", () => {
    const fresh = event({ publishedAt: "2026-08-09" });
    expect(knowledgePool([fresh], today, SLOT_BY_ID.get("afternoon")!)).toHaveLength(0);
  });

  it("starts exactly where the news lookback stops", () => {
    expect(KNOWLEDGE_MIN_AGE_DAYS).toBe(NEWS_LOOKBACK_DAYS + 1);
  });

  it("accepts an older event with a supported angle", () => {
    const older = event({
      publishedAt: "2026-07-01",
      entityIds: ["agency:dhs", "visa:h-1b"],
    });
    const pool = knowledgePool([older], today, SLOT_BY_ID.get("afternoon")!);
    expect(pool).toHaveLength(1);
    expect(pool[0].supportedAngles).toContain("who_is_affected");
  });

  it("drops an event whose data supports no angle this slot allows", () => {
    const bare = event({
      publishedAt: "2026-07-01",
      classification: "final_rule",
      entityIds: ["topic:policy-changes"],
      title: "A rule",
    });
    expect(knowledgePool([bare], today, SLOT_BY_ID.get("afternoon")!)).toHaveLength(0);
  });
});

describe("angles must be earned by the data", () => {
  const today = "2026-08-10";

  it("offers an effective-date reminder only for a real future date", () => {
    const future = event({ effectiveAt: "2026-09-01" });
    expect(anglesForArchiveEvent(future, today, [])).toContain("effective_date_reminder");

    const past = event({ effectiveAt: "2026-01-01" });
    expect(anglesForArchiveEvent(past, today, [])).not.toContain("effective_date_reminder");

    const none = event({ effectiveAt: null });
    expect(anglesForArchiveEvent(none, today, [])).not.toContain("effective_date_reminder");
  });

  it("offers who-is-affected only when a concrete population is linked", () => {
    const concrete = event({ entityIds: ["visa:h-1b"] });
    expect(anglesForArchiveEvent(concrete, today, [])).toContain("who_is_affected");

    // topic:policy-changes is the catch-all and identifies nobody.
    const vague = event({ entityIds: ["agency:dhs", "topic:policy-changes"] });
    expect(anglesForArchiveEvent(vague, today, [])).not.toContain("who_is_affected");
  });

  it("offers historical context only when there is a sequence to place it in", () => {
    const e = event({ entityIds: ["visa:h-1b"] });
    expect(anglesForArchiveEvent(e, today, [e])).not.toContain("historical_context");

    const related = [e, event({ id: "b", entityIds: ["visa:h-1b"] }), event({ id: "c", entityIds: ["visa:h-1b"] })];
    expect(anglesForArchiveEvent(e, today, related)).toContain("historical_context");
  });
});

describe("standing pool", () => {
  it("is never empty — the evening slot always has something to offer", () => {
    expect(standingPool("2026-08-10").length).toBeGreaterThan(0);
  });

  it("rotates deterministically: the same day gives the same order", () => {
    const a = standingPool("2026-08-10").map((c) => c.subjectId);
    const b = standingPool("2026-08-10").map((c) => c.subjectId);
    expect(a).toEqual(b);
  });

  it("rotates: a different day leads with a different asset", () => {
    const assetsOn = (d: string) =>
      standingPool(d).filter((c) => c.subjectId.startsWith("asset:"))[0].subjectId;
    expect(assetsOn("2026-08-10")).not.toBe(assetsOn("2026-08-11"));
  });

  it("puts an urgent deadline ahead of every dataset", () => {
    // 2026-09-10 is within 45 days of the 1 October fiscal-year start.
    const top = standingPool("2026-09-10")[0];
    expect(top.subjectId.startsWith("keydate:")).toBe(true);
  });

  it("offers assets only the data-insight angle", () => {
    const asset = standingPool("2026-08-10").find((c) => c.subjectId.startsWith("asset:"));
    expect(asset?.supportedAngles).toEqual(["data_insight"]);
  });
});

describe("candidatesFor filters angles to the slot", () => {
  it("never returns an angle the slot does not own", () => {
    for (const slot of SLOTS) {
      for (const c of candidatesFor(slot, EVENT_INDEX, "2026-08-10")) {
        for (const angle of c.supportedAngles) {
          expect(slot.angles).toContain(angle);
        }
      }
    }
  });
});

describe("deep links", () => {
  it("never returns the homepage", () => {
    for (const e of EVENT_INDEX.slice(0, 120)) {
      const link = resolveDeepLink(e);
      expect(link).not.toBeNull();
      expect(isPublishableDestination(link as string)).toBe(true);
      expect(link).not.toBe("/");
    }
  });

  it("only ever uses query parameters the explorer actually reads", () => {
    // EventExplorer reads ?entity= and ?q= and nothing else. A parameter it
    // ignores produces a link that looks purposeful and does nothing.
    for (const e of EVENT_INDEX.slice(0, 200)) {
      const link = resolveDeepLink(e) as string;
      const q = link.split("?")[1];
      if (!q) continue;
      for (const pair of q.split("&")) {
        expect(["entity", "q"]).toContain(pair.split("=")[0]);
      }
    }
  });

  it("prefers a country page when the archive linked one", () => {
    const e = event({ entityIds: ["country:mexico", "agency:dhs"] });
    expect(resolveDeepLink(e)).toBe("/country/mexico");
  });

  it("prefers a visa page over an agency fallback", () => {
    const e = event({ entityIds: ["agency:dol", "visa:h-1b"] });
    expect(resolveDeepLink(e)).toBe("/h1b/top-sponsors");
  });

  it("falls back to a search that would actually find the event", () => {
    const e = event({ entityIds: [], title: "Public Charge Ground of Inadmissibility" });
    const link = resolveDeepLink(e) as string;
    expect(link.startsWith("/what-changed?q=")).toBe(true);

    // Every term must appear in the event's own text, or the filter returns
    // nothing — EventExplorer requires ALL terms to match.
    const terms = decodeURIComponent(link.split("q=")[1]).split(" ");
    const hay = `${e.title} ${e.summary} ${e.sourceKey}`.toLowerCase();
    for (const t of terms) expect(hay).toContain(t);
  });

  it("queryFor does not repeat a word", () => {
    const q = queryFor("Evidence, Requests for Evidence, and Notices of Intent to Deny");
    const terms = q.split(" ");
    expect(new Set(terms).size).toBe(terms.length);
  });
});

describe("standing assets", () => {
  it("all point at site-relative paths", () => {
    for (const a of STANDING_ASSETS) {
      expect(a.path.startsWith("/")).toBe(true);
      expect(isPublishableDestination(a.path)).toBe(true);
    }
  });

  it("have unique ids and paths", () => {
    expect(new Set(STANDING_ASSETS.map((a) => a.id)).size).toBe(STANDING_ASSETS.length);
    expect(new Set(STANDING_ASSETS.map((a) => a.path)).size).toBe(STANDING_ASSETS.length);
  });

  it("carry a description long enough to write from", () => {
    for (const a of STANDING_ASSETS) expect(a.description.length).toBeGreaterThan(80);
  });
});

describe("score gating helpers", () => {
  it("rejects routine severity", () => {
    expect(isPostableSeverity(event({ severity: "routine" }))).toBe(false);
    expect(isPostableSeverity(event({ severity: "notable" }))).toBe(true);
  });

  it("rejects non-substantive classifications", () => {
    expect(isSubstantive(event({ classification: "data_release" }))).toBe(false);
    expect(isSubstantive(event({ classification: "final_rule" }))).toBe(true);
  });
});
