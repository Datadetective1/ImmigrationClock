// =============================================================================
// SELECTION, SCORING AND DEEP LINKS
//
// Two things are load-bearing here and both are about honesty rather than taste:
//
//   • What a recorded change may BECOME is decided by its own data and its age.
//     A change is breaking news for two days, a plain-English what-changed for
//     five, a why-it-matters for seven, and a dated reminder for as long as its
//     effective date is ahead. A record that has aged past every treatment is
//     not padded into one.
//
//   • Every deep link must go somewhere the app actually serves. A candidate's
//     deepLink is the record's own canonical page, site-relative, and the
//     absolute tracked URL the post must carry lives on the fact set.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  candidatesFor,
  eventCandidates,
  keyDateCandidates,
  explainerCandidates,
  signalCandidates,
  discoveryCandidates,
  anglesForArchiveEvent,
  qualifiesAsNews,
  WHAT_CHANGED_MAX_AGE_DAYS,
  WHY_IT_MATTERS_MAX_AGE_DAYS,
  WHAT_CHANGED_NEWS_AGE_DAYS,
  EFFECTIVE_DATE_HORIZON_DAYS,
} from "@/lib/social/select";
import {
  scoreEvent,
  isPostableSeverity,
  isSubstantive,
  NEWS_SCORE_FLOOR,
  KNOWLEDGE_SCORE_FLOOR,
} from "@/lib/social/score";
import { resolveDeepLink, queryFor, STANDING_ASSETS, isPublishableDestination } from "@/lib/social/links";
import { changePath } from "@/lib/share";
import { TIER_FOR_TYPE } from "@/lib/social/content-types";
import { BREAKING_MAX_AGE_DAYS } from "@/lib/social/validate";
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

const today = "2026-08-10";

/** ISO date N days before `today`. */
const daysAgo = (n: number, from = today) =>
  new Date(Date.parse(`${from}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

const types = (events: IndexedEvent[], date = today) =>
  eventCandidates(events, date).map((c) => c.contentType);

describe("what a fresh consequential change becomes", () => {
  it("yields a breaking_change candidate in the news tier", () => {
    const fresh = eventCandidates([event()], today).find((c) => c.contentType === "breaking_change");
    expect(fresh).toBeDefined();
    expect(fresh!.tier).toBe("news");
    expect(fresh!.category).toBe("development");
    expect(fresh!.supportedAngles[0]).toBe("breaking_change");
  });

  it("also yields a plain-English what-changed, still news at this age", () => {
    const wc = eventCandidates([event()], today).find((c) => c.contentType === "what_changed");
    expect(wc).toBeDefined();
    expect(wc!.tier).toBe("news");
  });

  it("takes a change inside the breaking window", () => {
    expect(types([event({ publishedAt: daysAgo(BREAKING_MAX_AGE_DAYS) })])).toContain("breaking_change");
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
    const queue = candidatesFor([weak, strong], today);
    expect(queue[0].subjectId).toBe("event:a:1");
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i - 1].score).toBeGreaterThanOrEqual(queue[i].score);
    }
  });
});

describe("what an older change becomes", () => {
  it("a four-day-old change is a what-changed FOLLOW-UP, and no longer breaking", () => {
    const cands = eventCandidates([event({ publishedAt: daysAgo(4) })], today);
    const wc = cands.find((c) => c.contentType === "what_changed");
    expect(wc).toBeDefined();
    expect(wc!.tier).toBe("follow_up");
    expect(cands.map((c) => c.contentType)).not.toContain("breaking_change");
  });

  it("the news/follow-up boundary for what-changed is two days", () => {
    expect(WHAT_CHANGED_NEWS_AGE_DAYS).toBe(2);
    const atBoundary = eventCandidates([event({ publishedAt: daysAgo(2) })], today).find(
      (c) => c.contentType === "what_changed"
    );
    expect(atBoundary?.tier).toBe("news");
    const past = eventCandidates([event({ publishedAt: daysAgo(3) })], today).find(
      (c) => c.contentType === "what_changed"
    );
    expect(past?.tier).toBe("follow_up");
  });

  it("stops offering what-changed past its window, and why-it-matters past its own", () => {
    expect(WHAT_CHANGED_MAX_AGE_DAYS).toBe(5);
    expect(WHY_IT_MATTERS_MAX_AGE_DAYS).toBe(7);
    expect(types([event({ publishedAt: daysAgo(5) })])).toContain("what_changed");
    expect(types([event({ publishedAt: daysAgo(6) })])).not.toContain("what_changed");
    expect(types([event({ publishedAt: daysAgo(7) })])).toContain("why_it_matters");
    expect(types([event({ publishedAt: daysAgo(8) })])).not.toContain("why_it_matters");
  });

  it("yields NOTHING for a change that has aged past every narrative treatment", () => {
    // Not lost — its page is the record. But it is not padded into a post.
    expect(eventCandidates([event({ publishedAt: daysAgo(8) })], today)).toEqual([]);
  });

  it("drops a scheduled-for-publication document", () => {
    // The Federal Register puts items on public inspection ahead of publication.
    // Posting one would force "scheduled for publication on..." phrasing, which
    // is weaker and much easier to get subtly wrong than simply waiting.
    const e = event({ publishedAt: "2026-08-12", scheduled: true });
    expect(eventCandidates([e], today)).toHaveLength(0);
  });
});

describe("the effective-date reminder", () => {
  it("appears only inside the horizon", () => {
    expect(EFFECTIVE_DATE_HORIZON_DAYS).toBe(30);
    const inside = event({ publishedAt: daysAgo(10), effectiveAt: "2026-09-05" });
    const outside = event({ publishedAt: daysAgo(10), effectiveAt: "2026-09-15" });
    expect(types([inside])).toContain("effective_date");
    expect(types([outside])).not.toContain("effective_date");
  });

  it("is a follow-up in the deadline band, ordered by how soon the date is", () => {
    const soon = event({ id: "e:soon", publishedAt: daysAgo(10), effectiveAt: "2026-08-20" });
    const later = event({ id: "e:later", publishedAt: daysAgo(10), effectiveAt: "2026-09-05" });
    // candidatesFor() is the sorted view; eventCandidates() is in ranking order.
    const cands = candidatesFor([soon, later], today).filter((c) => c.contentType === "effective_date");
    expect(cands).toHaveLength(2);
    for (const c of cands) {
      expect(c.tier).toBe("follow_up");
      expect(c.category).toBe("deadline");
      expect(c.supportedAngles[0]).toBe("effective_date_reminder");
    }
    expect(cands[0].subjectId).toBe("event:e:soon");
  });

  it("is not offered to a change that is still breaking news", () => {
    // A rule that published today AND starts on a known date is a development
    // first; the validator's effective-date check keeps the date in the copy.
    expect(types([event({ effectiveAt: "2026-09-05" })])).not.toContain("effective_date");
  });

  it("reaches further back than the narrative treatments", () => {
    const old = event({ publishedAt: daysAgo(60), effectiveAt: "2026-09-05" });
    expect(types([old])).toEqual(["effective_date"]);
  });
});

describe("the floors", () => {
  it("drops routine severity whatever it scores", () => {
    expect(eventCandidates([event({ severity: "routine" })], today)).toHaveLength(0);
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
    expect(eventCandidates([narrow], today)).toHaveLength(0);
  });

  it("gives a record with no abstract a dated reminder and nothing narrative", () => {
    // A record with no summary can only be restated as its title. It is a real
    // record and its page is real, but a post that "explains" it would be
    // explaining nothing.
    const noAbstract = event({ summary: "No abstract was published for this document." });
    expect(eventCandidates([noAbstract], today)).toEqual([]);

    const dated = event({
      summary: "No abstract was published for this document.",
      publishedAt: daysAgo(5),
      effectiveAt: "2026-09-01",
    });
    expect(types([dated])).toEqual(["effective_date"]);
  });
});

describe("qualifiesAsNews — a court order qualifies on its kind", () => {
  // The first design required breadth ≥ 2 AND one obligation step (2100), so a
  // court order enjoining two policy memos scored 2,029 — its summary named no
  // obligation — and never entered a pool. Kind now counts at the knowledge
  // floor; reader value still has to clear the bar separately.
  const court = (rank: number) =>
    qualifiesAsNews(event({ classification: "court_decision", sourceKey: "federal_courts" }), rank);

  it("accepts anything at or above the news floor", () => {
    expect(qualifiesAsNews(event({ classification: "announcement" }), NEWS_SCORE_FLOOR)).toBe(true);
  });

  it("accepts a court decision at breadth 2 with no obligation step", () => {
    expect(court(2029)).toBe(true);
    expect(court(KNOWLEDGE_SCORE_FLOOR)).toBe(true);
  });

  it("accepts an executive action and a major final rule at the knowledge floor", () => {
    expect(qualifiesAsNews(event({ classification: "executive_action" }), 2029)).toBe(true);
    expect(qualifiesAsNews(event({ classification: "final_rule", severity: "major" }), 2029)).toBe(true);
  });

  it("does not extend the exception to an announcement or a notable final rule", () => {
    expect(qualifiesAsNews(event({ classification: "announcement" }), 2029)).toBe(false);
    expect(qualifiesAsNews(event({ classification: "final_rule", severity: "notable" }), 2029)).toBe(false);
  });

  it("never reaches below the knowledge floor, whatever the kind", () => {
    expect(court(KNOWLEDGE_SCORE_FLOOR - 1)).toBe(false);
  });

  it("puts a real court order in the news tier end to end", () => {
    const order = event({
      id: "federal_courts:c1",
      classification: "court_decision",
      sourceKey: "federal_courts",
      sourceUrl: "https://www.courtlistener.com/c1",
      title: "Order Enjoining Two Policy Memoranda",
      summary:
        "The court enjoined enforcement of two policy memoranda nationwide. The order applies to all applicants and petitioners while the case proceeds.",
    });
    const breaking = eventCandidates([order], today).find((c) => c.contentType === "breaking_change");
    expect(breaking).toBeDefined();
    expect(breaking!.tier).toBe("news");
  });
});

describe("angles must be earned by the data", () => {
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

  it("puts the content type's own angle first, with the earned ones behind it", () => {
    const c = eventCandidates([event({ entityIds: ["visa:h-1b"] })], today).find(
      (x) => x.contentType === "breaking_change"
    )!;
    expect(c.supportedAngles[0]).toBe("breaking_change");
    expect(c.supportedAngles).toContain("who_is_affected");
  });
});

describe("recurring dates — at milestones only", () => {
  it("offers a key date on a milestone day, in the deadline band", () => {
    // 2026-09-17 is exactly 14 days before the 1 October fiscal-year start.
    const cands = keyDateCandidates("2026-09-17");
    expect(cands.length).toBeGreaterThan(0);
    for (const c of cands) {
      expect(c.subjectId.startsWith("keydate:")).toBe(true);
      expect(c.contentType).toBe("key_date");
      expect(c.tier).toBe("follow_up");
      expect(c.category).toBe("deadline");
      expect(c.deepLink).toBe("/key-dates");
    }
  });

  it("offers no key date at all on a non-milestone day", () => {
    // 2026-09-10 is 21 days out — close, but not a threshold anyone crosses.
    // A countdown that decrements by one is not new content every single day.
    expect(keyDateCandidates("2026-09-10")).toHaveLength(0);
  });

  it("puts a live deadline ahead of every evergreen candidate", () => {
    const queue = candidatesFor([], "2026-09-17");
    expect(queue[0].subjectId.startsWith("keydate:")).toBe(true);
    const deadline = queue[0];
    for (const c of queue.filter((x) => x.tier === "evergreen")) {
      expect(deadline.score, c.subjectId).toBeGreaterThan(c.score);
    }
  });
});

describe("the evergreen tier is always present", () => {
  it("offers explainers, signals and discovery on any day, all in the evergreen tier", () => {
    for (const date of ["2026-08-10", "2026-01-15", "2026-11-01"]) {
      const explainers = explainerCandidates([], date);
      const signals = signalCandidates(date);
      const discovery = discoveryCandidates(date);
      expect(explainers.length, `${date} explainers`).toBeGreaterThan(0);
      expect(signals.length, `${date} signals`).toBeGreaterThan(0);
      expect(discovery.length, `${date} discovery`).toBeGreaterThan(0);
      for (const c of [...explainers, ...signals, ...discovery]) {
        expect(c.tier, c.subjectId).toBe("evergreen");
        expect(c.pool, c.subjectId).toBe("editorial");
        expect(TIER_FOR_TYPE[c.contentType], c.subjectId).toBe("evergreen");
      }
    }
  });

  it("gives each evergreen kind its own subject prefix, content type and page", () => {
    for (const c of explainerCandidates([], today)) {
      expect(c.subjectId.startsWith("explainer:")).toBe(true);
      expect(c.contentType).toBe("explainer");
      expect(c.deepLink.startsWith("/explained/")).toBe(true);
    }
    for (const c of signalCandidates(today)) {
      expect(c.subjectId.startsWith("signal:")).toBe(true);
      expect(c.contentType).toBe("data_signal");
      expect(c.deepLink.startsWith("/insights/")).toBe(true);
    }
    for (const c of discoveryCandidates(today)) {
      expect(c.subjectId.startsWith("discovery:")).toBe(true);
      expect(c.contentType).toBe("data_discovery");
    }
  });

  it("rotates deterministically: the same day gives the same order", () => {
    const a = candidatesFor([], today).map((c) => c.subjectId);
    const b = candidatesFor([], today).map((c) => c.subjectId);
    expect(a).toEqual(b);
  });

  it("rotates: a different day leads with a different explainer", () => {
    const leader = (d: string) => explainerCandidates([], d).sort((x, y) => y.score - x.score)[0].subjectId;
    expect(leader("2026-08-10")).not.toBe(leader("2026-08-11"));
  });

  it("never offers a standing asset — that pool is gone", () => {
    for (const c of candidatesFor(EVENT_INDEX, today)) {
      expect(c.subjectId.startsWith("asset:"), c.subjectId).toBe(false);
    }
  });
});

describe("the one queue", () => {
  it("carries every kind of candidate, sorted by score, with a total order", () => {
    const queue = candidatesFor([event({ publishedAt: "2026-09-17" })], "2026-09-17");
    const kinds = new Set(queue.map((c) => c.subjectId.split(":")[0]));
    expect([...kinds].sort()).toEqual(["discovery", "event", "explainer", "keydate", "signal"]);
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i - 1].score).toBeGreaterThanOrEqual(queue[i].score);
    }
    const ids = queue.map((c) => `${c.subjectId}::${c.contentType}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every candidate a tier that matches its content type", () => {
    // what_changed is the one type whose tier moves with age: news for two
    // days, a follow-up after. Every other type's tier is fixed by its kind.
    for (const c of candidatesFor(EVENT_INDEX, today)) {
      if (c.contentType === "what_changed") {
        expect(["news", "follow_up"], c.subjectId).toContain(c.tier);
      } else {
        expect(c.tier, c.subjectId).toBe(TIER_FOR_TYPE[c.contentType]);
      }
      expect(c.structures.length, c.subjectId).toBeGreaterThan(0);
      expect(c.storyKey, c.subjectId).toBeTruthy();
    }
  });
});

describe("deep links", () => {
  it("gives every candidate a site-relative canonical path the app will serve", () => {
    for (const c of candidatesFor(EVENT_INDEX, "2026-09-17")) {
      expect(c.deepLink.startsWith("/"), c.subjectId).toBe(true);
      expect(c.deepLink.startsWith("//"), c.subjectId).toBe(false);
      expect(isPublishableDestination(c.deepLink), c.subjectId).toBe(true);
    }
  });

  it("sends every recorded change to its own page under /what-changed/", () => {
    for (const c of candidatesFor(EVENT_INDEX, today).filter((x) => x.event)) {
      expect(c.deepLink.startsWith("/what-changed/"), c.subjectId).toBe(true);
      expect(c.deepLink).toBe(changePath(c.event!));
    }
  });

  it("puts the TRACKED absolute URL on the fact set, and both forms on the whitelist", () => {
    const c = eventCandidates([event()], today)[0];
    expect(c.facts.deepLink.startsWith("https://")).toBe(true);
    expect(c.facts.deepLink).toContain(c.deepLink);
    expect(c.facts.deepLink).toContain("utm_source=x");
    expect(c.facts.deepLink).toContain(`utm_campaign=${c.contentType}`);
    expect(c.facts.shareUrl).toBeDefined();
    expect(c.facts.shareUrl!.endsWith(c.deepLink)).toBe(true);
    expect(c.facts.allowedUrls).toContain(c.facts.deepLink);
    expect(c.facts.allowedUrls).toContain(c.facts.shareUrl);
    expect(c.facts.allowedUrls).toContain(c.sourceUrl);
  });

  it("resolveDeepLink never returns the homepage", () => {
    for (const e of EVENT_INDEX.slice(0, 120)) {
      const link = resolveDeepLink(e);
      expect(link).not.toBeNull();
      expect(isPublishableDestination(link as string)).toBe(true);
      expect(link).not.toBe("/");
    }
  });

  it("resolveDeepLink only ever uses query parameters the explorer actually reads", () => {
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

describe("standing assets — retained for history, never selected", () => {
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
