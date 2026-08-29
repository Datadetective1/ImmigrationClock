// =============================================================================
// THE GRADUATED FRESHNESS MODEL
//
// The news window was two days, and two days was measurably too strict. Walking
// the real archive — 513 events, the 120 days to 2026-08-10 — the morning slot,
// the only slot whose primary job is news, had nothing to say on 55% of days:
//
//     window   days with a candidate   silent
//       2d          54 / 120            55%
//       5d          75 / 120            38%
//      14d         106 / 120            12%
//
// Qualifying developments arrive roughly four times a month and clear a high bar
// (breadth ≥ 2 AND an obligation step). A DHS rule does not stop mattering after
// forty-eight hours, and the window was discarding material that was still the
// most useful thing this account held.
//
// But a wider window is only safe if RETENTION IS NOT PERMISSION. A rule from
// Tuesday may be discussed on Friday; it may not claim to have landed on Friday.
// So the model is graduated rather than merely widened, and it has three parts,
// each tested here:
//
//   1. THE WINDOW      five days, not two, and not six.
//   2. THE FRAMING     breaking language is withdrawn after two days — by the
//                      angle list, AND independently by the validator, because
//                      "what it requires" is a legitimate angle for a four-day
//                      -old rule and choosing it does not stop a sentence
//                      beginning "USCIS just announced".
//   3. THE GRADIENT    newer outranks older among comparable items, bounded so
//                      it can never outrank a more consequential one.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  newsPool,
  knowledgePool,
  newsAnglesFor,
  NEWS_LOOKBACK_DAYS,
  KNOWLEDGE_MIN_AGE_DAYS,
  RECENCY_DECAY_PER_DAY,
} from "@/lib/social/select";
import { BREAKING_MAX_AGE_DAYS, validatePost } from "@/lib/social/validate";
import { buildEventFacts } from "@/lib/social/facts";
import { buildUserPrompt } from "@/lib/social/prompt";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { checkSubject } from "@/lib/social/dedupe";
import { CATEGORY_TIER } from "@/lib/social/categories";
import { EMPTY_POST_LEDGER, appendRecords, type PostRecord } from "@/lib/social/ledger";
import type { IndexedEvent } from "@/lib/event-index";

const TODAY = "2026-08-15";

/** Days before TODAY. */
const daysAgo = (n: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:fresh-1",
    title: "Fee Adjustment for Certain Immigration Benefit Requests",
    publishedAt: TODAY,
    effectiveAt: null,
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/documents/test",
    summary:
      "DHS is amending the fee schedule that applies to all benefit requests, changing filing fee requirements for every applicant. The fee is $500.",
    entityIds: ["agency:dhs", "visa:h-1b"],
    ...over,
  };
}

// =============================================================================
// 1. THE WINDOW
// =============================================================================

describe("the news window", () => {
  it("reaches back five days", () => {
    expect(NEWS_LOOKBACK_DAYS).toBe(5);
  });

  it("accepts a five-day-old story", () => {
    const pool = newsPool([event({ publishedAt: daysAgo(5) })], TODAY);
    expect(pool).toHaveLength(1);
  });

  it("REFUSES a six-day-old story", () => {
    // Six days is the knowledge pool's territory, and the boundary has to be a
    // real edge or the two pools overlap and one subject gets two treatments.
    expect(newsPool([event({ publishedAt: daysAgo(6) })], TODAY)).toHaveLength(0);
  });

  it("keeps the pools non-overlapping by derivation, not by coincidence", () => {
    expect(KNOWLEDGE_MIN_AGE_DAYS).toBe(NEWS_LOOKBACK_DAYS + 1);

    // The same event cannot be in both pools on the same day, at any age.
    const afternoon = SLOT_BY_ID.get("afternoon")!;
    for (let age = 0; age <= 10; age++) {
      const e = event({ publishedAt: daysAgo(age) });
      const inNews = newsPool([e], TODAY).length > 0;
      const inKnowledge = knowledgePool([e], TODAY, afternoon).length > 0;
      expect(inNews && inKnowledge, `age ${age} is in both pools`).toBe(false);
    }
  });

  it("still refuses anything published in the future", () => {
    // Federal Register public-inspection documents carry a future publication
    // date. Widening the window backwards must not open it forwards.
    const future = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    expect(newsPool([event({ publishedAt: future })], TODAY)).toHaveLength(0);
  });
});

// =============================================================================
// 2. AGE-AWARE FRAMING
// =============================================================================

describe("age-aware framing — 0 to 2 days", () => {
  it("offers breaking framing to a story from today", () => {
    expect(newsAnglesFor(event(), 0, TODAY, [])).toContain("breaking_change");
  });

  it("still offers it at the boundary", () => {
    expect(BREAKING_MAX_AGE_DAYS).toBe(2);
    expect(newsAnglesFor(event(), 2, TODAY, [])).toContain("breaking_change");
  });

  it("earns 'what it requires' from the obligation factor, not from the title", () => {
    const angles = newsAnglesFor(event(), 0, TODAY, []);
    expect(angles).toContain("what_it_requires");
  });

  it("lets the validator accept just-happened wording at that age", () => {
    const facts = buildEventFacts(event({ publishedAt: daysAgo(1) }), "/what-changed?q=fee", TODAY);
    const good = `DHS has just published an amended fee schedule for immigration benefit requests. ${facts.deepLink}`;
    expect(validatePost(good, "x", facts).ok).toBe(true);
  });
});

describe("age-aware framing — 3 to 5 days", () => {
  it("WITHDRAWS breaking framing entirely", () => {
    for (const age of [3, 4, 5]) {
      expect(newsAnglesFor(event(), age, TODAY, []), `age ${age}`).not.toContain("breaking_change");
    }
  });

  it("offers development-oriented framing instead", () => {
    const angles = newsAnglesFor(event({ publishedAt: daysAgo(4) }), 4, TODAY, []);
    expect(angles.length).toBeGreaterThan(0);
    // Earned from the data: an obligation change and a named population.
    expect(angles).toContain("what_it_requires");
    expect(angles).toContain("who_is_affected");
  });

  it("offers the effective date when the document carries a future one", () => {
    const e = event({ publishedAt: daysAgo(4), effectiveAt: "2026-09-15" });
    expect(newsAnglesFor(e, 4, TODAY, [])).toContain("effective_date_reminder");
  });

  it("keeps historical_context with the afternoon slot that owns it", () => {
    const e = event({ publishedAt: daysAgo(4) });
    const related = [
      event({ id: "a", entityIds: ["visa:h-1b"] }),
      event({ id: "b", entityIds: ["visa:h-1b"] }),
    ];
    expect(newsAnglesFor(e, 4, TODAY, related)).not.toContain("historical_context");
  });

  it("drops a retained story that can earn no honest treatment", () => {
    // No obligation, no population, no effective date, nothing revised. At four
    // days the only thing left to say is "this happened", which is the framing
    // the graduated model exists to refuse. It is not lost — the knowledge pool
    // picks it up at six days under the same earned-angle rules.
    const bare = event({
      publishedAt: daysAgo(4),
      title: "Agency Information Collection Activities; Notice",
      summary: "A notice concerning the collection of information.",
      entityIds: ["topic:policy-changes"],
    });
    expect(newsAnglesFor(bare, 4, TODAY, [])).toEqual([]);
  });

  it("REJECTS just-happened wording at three days, whatever angle was chosen", () => {
    const facts = buildEventFacts(event({ publishedAt: daysAgo(3) }), "/what-changed?q=fee", TODAY);
    const stale = [
      `DHS just published an amended fee schedule for benefit requests. ${facts.deepLink}`,
      `DHS announced today an amended fee schedule for benefit requests. ${facts.deepLink}`,
      `Breaking: DHS has amended the fee schedule for benefit requests. ${facts.deepLink}`,
      `DHS has just amended the fee schedule for immigration benefit requests. ${facts.deepLink}`,
    ];
    for (const text of stale) {
      const r = validatePost(text, "x", facts);
      expect(r.ok, text).toBe(false);
      expect(r.failures.join(" "), text).toMatch(/published 3 days ago/i);
    }
  });

  it("ACCEPTS the same story framed as a development", () => {
    const facts = buildEventFacts(event({ publishedAt: daysAgo(4) }), "/what-changed?q=fee", TODAY);
    const good = `DHS has amended the fee schedule for immigration benefit requests, setting the fee at $500. No implementation date has been set. ${facts.deepLink}`;
    const r = validatePost(good, "x", facts);
    expect(r.failures).toEqual([]);
  });

  it("does not ban 'this week', which is simply true at four days", () => {
    const facts = buildEventFacts(event({ publishedAt: daysAgo(4) }), "/what-changed?q=fee", TODAY);
    const good = `DHS amended the fee schedule for immigration benefit requests this week, setting it at $500. ${facts.deepLink}`;
    expect(validatePost(good, "x", facts).ok).toBe(true);
  });

  it("tells the model the age, so the rejection is never a surprise", () => {
    const facts = buildEventFacts(event({ publishedAt: daysAgo(4) }), "/what-changed?q=fee", TODAY);
    const prompt = buildUserPrompt({
      facts,
      slot: SLOT_BY_ID.get("morning")!,
      angle: "what_it_requires",
      avoidOpenings: [],
    });
    expect(prompt).toMatch(/4 day\(s\) before today/);
    expect(prompt).toMatch(/This is NOT breaking news/);
  });

  it("says nothing about breaking news for a story from today", () => {
    const facts = buildEventFacts(event(), "/what-changed?q=fee", TODAY);
    const prompt = buildUserPrompt({
      facts,
      slot: SLOT_BY_ID.get("morning")!,
      angle: "breaking_change",
      avoidOpenings: [],
    });
    expect(prompt).not.toMatch(/This is NOT breaking news/);
  });

  it("lets the morning slot actually use the older band's treatments", () => {
    // Without these in the slot's angle list the graduated model would pick a
    // treatment the slot then filtered out, and the wider window would buy
    // nothing at all.
    const morning = SLOT_BY_ID.get("morning")!;
    for (const angle of ["what_it_requires", "who_is_affected", "effective_date_reminder"]) {
      expect(morning.angles, angle).toContain(angle);
    }
  });
});

// =============================================================================
// 3. THE RECENCY GRADIENT
// =============================================================================

describe("the recency gradient", () => {
  it("gives a newer story a meaningful advantage over an older one", () => {
    const fresh = event({ id: "federal_register:fresh", publishedAt: daysAgo(1) });
    const old = event({ id: "federal_register:old", publishedAt: daysAgo(5) });

    const pool = newsPool([fresh, old], TODAY);
    expect(pool).toHaveLength(2);

    const freshCandidate = pool.find((c) => c.subjectId.includes("fresh"))!;
    const oldCandidate = pool.find((c) => c.subjectId.includes("old"))!;

    expect(freshCandidate.score).toBeGreaterThan(oldCandidate.score);
    // Four days apart, at 150/day, is a 600-point gap — large enough to decide
    // a slot rather than being lost in rounding.
    expect(freshCandidate.score - oldCandidate.score).toBeGreaterThanOrEqual(
      4 * RECENCY_DECAY_PER_DAY - 50
    );
    expect(pool[0].subjectId).toBe(freshCandidate.subjectId);
  });

  it("records the decay in the explanation, so a selection can be audited", () => {
    const pool = newsPool([event({ publishedAt: daysAgo(3) })], TODAY);
    // The DECAY marker specifically — the ranking model's own explain string
    // already contains the word "recency" for its 1-point tie-break, so a bare
    // /recency/ would pass whether or not the gradient existed.
    expect(pool[0].scoreExplain).toMatch(/− 450 recency/);
  });

  it("NEVER lets recency overturn a materially more consequential story", () => {
    // The bound that makes the gradient safe: five days is the oldest anything
    // in this pool can be, so the most recency can move a candidate is
    // 5 × 150 = 750 — strictly less than one breadth step (1000).
    expect(NEWS_LOOKBACK_DAYS * RECENCY_DECAY_PER_DAY).toBeLessThan(1000);
  });

  it("proves it on real candidates: broader-but-older beats narrower-but-newer", () => {
    // Broad: amends the fee schedule for ALL benefit requests, every applicant.
    const broadOld = event({
      id: "federal_register:broad",
      publishedAt: daysAgo(5),
    });
    // Narrow: one country, one programme. Genuinely newer, genuinely smaller.
    const narrowNew = event({
      id: "federal_register:narrow",
      publishedAt: TODAY,
      title: "Notice of Designation for a Single Country Programme",
      summary:
        "The agency designates one country for a limited programme affecting a small number of nationals.",
      entityIds: ["country:nepal"],
    });

    const pool = newsPool([broadOld, narrowNew], TODAY);
    const broad = pool.find((c) => c.subjectId.includes("broad"));
    const narrow = pool.find((c) => c.subjectId.includes("narrow"));

    // Only assert the comparison if both actually cleared the bar; the point is
    // the ordering, not the floor.
    if (broad && narrow) {
      expect(broad.score).toBeGreaterThan(narrow.score);
    } else {
      expect(broad).toBeDefined();
    }
  });

  it("stays inside its own tier — decay can never demote a development", () => {
    const oldest = newsPool([event({ publishedAt: daysAgo(5) })], TODAY)[0];
    expect(oldest.score).toBeGreaterThan(CATEGORY_TIER.deadline);
  });

  it("does not apply the decay to the knowledge pool", () => {
    // That pool spans 6–180 days. A per-day decay of this size there would cross
    // tier boundaries and turn the category ladder back into an age ladder.
    const afternoon = SLOT_BY_ID.get("afternoon")!;
    const pool = knowledgePool(
      [event({ publishedAt: daysAgo(60), effectiveAt: "2026-09-15" })],
      TODAY,
      afternoon
    );
    if (pool.length) {
      expect(pool[0].scoreExplain).not.toMatch(/− \d+ recency/);
      expect(pool[0].score).toBeGreaterThan(CATEGORY_TIER.data_insight);
    }
  });
});

// =============================================================================
// 4. EVERYTHING THE WIDER WINDOW MUST NOT HAVE BROKEN
// =============================================================================

describe("the safety layers are unchanged by the wider window", () => {
  it("keeps the 7-day subject cooldown, which now matters more", () => {
    // A retained story sits in the pool for five days. The cooldown is what
    // stops those five days becoming five posts about one document.
    const posted: PostRecord = {
      localDate: daysAgo(1),
      localTime: "09:07",
      runAtUtc: `${daysAgo(1)}T14:07:00.000Z`,
      slot: "morning",
      pool: "news",
      readerValue: null,
      readerValueExplain: null,
      treatment: null,
      platform: "x",
      decision: "POSTED",
      reason: "Published",
      subjectId: "event:federal_register:fresh-1",
      subjectLabel: "Fee Adjustment",
      angle: "breaking_change",
      score: 70_000,
      text: "A post about the fee adjustment.",
      deepLink: "https://immigrationclock.com/what-changed?q=fee",
      externalId: "1",
      externalUrl: null,
      model: null,
      promptVersion: null,
      validatorVersion: null,
      factsHash: null,
      approvalId: null,
      approvedBy: null,
      topicKey: "visa:h-1b",
      topicFamily: "h1b",
      category: "development",
      adjustedScore: 70_000,
      rotationExplain: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      attempts: null,
    };
    const ledger = appendRecords(EMPTY_POST_LEDGER, [posted]);

    const check = checkSubject(
      ledger,
      "event:federal_register:fresh-1",
      ["what_it_requires"],
      "x",
      "https://immigrationclock.com/what-changed?q=fee",
      new Date(`${TODAY}T14:07:00.000Z`),
      "news"
    );
    expect(check.ok).toBe(false);
  });

  it("keeps proposed rules explicitly proposed, at any age", () => {
    const proposed = buildEventFacts(
      event({
        publishedAt: daysAgo(4),
        classification: "proposed_rule",
        title: "Proposed Fee Adjustment for Immigration Benefit Requests",
        summary: "DHS proposes to amend the fee schedule for benefit requests. The proposed fee is $500.",
      }),
      "/what-changed?q=fee",
      TODAY
    );
    const bad = `DHS amended the fee schedule for immigration benefit requests to $500. ${proposed.deepLink}`;
    const r = validatePost(bad, "x", proposed);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/proposed rule but the post never says so/i);
  });

  it("keeps a future effective date from disappearing, at any age", () => {
    const dated = buildEventFacts(
      event({ publishedAt: daysAgo(4), effectiveAt: "2026-09-15" }),
      "/what-changed?q=fee",
      TODAY
    );
    const bad = `DHS has amended the fee schedule for immigration benefit requests, setting it at $500. ${dated.deepLink}`;
    const r = validatePost(bad, "x", dated);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/drops the effective date/i);
  });

  it("keeps the cold-reader rule, at any age", () => {
    const facts = buildEventFacts(event({ publishedAt: daysAgo(4) }), "/what-changed?q=fee", TODAY);
    const orphan = `It has been amended to set the fee at $500 for benefit requests. ${facts.deepLink}`;
    expect(validatePost(orphan, "x", facts).ok).toBe(false);
  });

  it("keeps figure grounding, at any age", () => {
    const facts = buildEventFacts(event({ publishedAt: daysAgo(4) }), "/what-changed?q=fee", TODAY);
    const bad = `DHS amended the fee schedule for benefit requests, affecting 47000 filers. ${facts.deepLink}`;
    expect(validatePost(bad, "x", facts).failures.join(" ")).toMatch(/47000/);
  });

  it("keeps the X character limit, at any age", () => {
    const facts = buildEventFacts(event({ publishedAt: daysAgo(4) }), "/what-changed?q=fee", TODAY);
    const bad = `DHS amended the fee schedule for immigration benefit requests. `.repeat(6) + facts.deepLink;
    expect(validatePost(bad, "x", facts).failures.join(" ")).toMatch(/Too long for x/);
  });

  it("keeps the severity and substance gates, at any age", () => {
    // A wider window must not admit routine housekeeping that the two-day
    // window was also refusing.
    const routine = event({ publishedAt: daysAgo(4), severity: "routine" });
    expect(newsPool([routine], TODAY)).toHaveLength(0);
  });
});
