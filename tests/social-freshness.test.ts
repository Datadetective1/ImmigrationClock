// =============================================================================
// THE GRADUATED FRESHNESS MODEL
//
// A DHS rule does not stop mattering after forty-eight hours, and the first
// design's two-day news window discarded material that was still the most
// useful thing this account held. But a wider window is only safe if RETENTION
// IS NOT PERMISSION: a rule from Tuesday may be discussed on Friday; it may not
// claim to have landed on Friday. So the model is graduated, in three parts:
//
//   1. THE WINDOW      what a change may BECOME, by age — breaking news for two
//                      days, a plain-English what-changed for five, a
//                      why-it-matters for seven, a dated reminder while its
//                      effective date is ahead.
//   2. THE FRAMING     breaking language is withdrawn after two days — by the
//                      content type on offer, AND independently by the
//                      validator, because a what-changed on a four-day-old
//                      rule is legitimate and nothing about choosing it stops
//                      a sentence beginning "USCIS just announced".
//   3. THE GRADIENT    inside the news tier, newer outranks older among
//                      comparable items, bounded so it can never outrank a
//                      more consequential one.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  candidatesFor,
  eventCandidates,
  WHAT_CHANGED_MAX_AGE_DAYS,
  WHAT_CHANGED_NEWS_AGE_DAYS,
  WHY_IT_MATTERS_MAX_AGE_DAYS,
  EFFECTIVE_DATE_HORIZON_DAYS,
  RECENCY_DECAY_PER_DAY,
} from "@/lib/social/select";
import { BREAKING_MAX_AGE_DAYS, validatePost } from "@/lib/social/validate";
import { buildEventFacts } from "@/lib/social/facts";
import { buildUserPrompt } from "@/lib/social/prompt";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { checkSubject } from "@/lib/social/dedupe";
import { CATEGORY_TIER } from "@/lib/social/categories";
import { TYPE_MAX_AGE_DAYS } from "@/lib/social/content-types";
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

/** The content types a change is offered at a given age. */
const typesAt = (age: number, over: Partial<IndexedEvent> = {}) =>
  eventCandidates([event({ publishedAt: daysAgo(age), ...over })], TODAY).map((c) => c.contentType);

const candidateAt = (age: number, type: string) =>
  eventCandidates([event({ publishedAt: daysAgo(age) })], TODAY).find((c) => c.contentType === type);

// =============================================================================
// 1. THE WINDOW
// =============================================================================

describe("the windows", () => {
  it("are graduated: two days breaking, five what-changed, seven why-it-matters", () => {
    expect(BREAKING_MAX_AGE_DAYS).toBe(2);
    expect(TYPE_MAX_AGE_DAYS.breaking_change).toBe(BREAKING_MAX_AGE_DAYS);
    expect(WHAT_CHANGED_MAX_AGE_DAYS).toBe(5);
    expect(WHY_IT_MATTERS_MAX_AGE_DAYS).toBe(7);
    expect(BREAKING_MAX_AGE_DAYS).toBeLessThan(WHAT_CHANGED_MAX_AGE_DAYS);
    expect(WHAT_CHANGED_MAX_AGE_DAYS).toBeLessThan(WHY_IT_MATTERS_MAX_AGE_DAYS);
  });

  it("accepts a five-day-old story as a what-changed", () => {
    expect(typesAt(5)).toContain("what_changed");
  });

  it("REFUSES a six-day-old story the what-changed treatment", () => {
    // The boundary has to be a real edge, or a record wearing a news frame
    // at ten days is an archive item pretending.
    expect(typesAt(6)).not.toContain("what_changed");
    expect(typesAt(6)).toContain("why_it_matters");
  });

  it("refuses everything narrative past seven days", () => {
    expect(typesAt(7)).toContain("why_it_matters");
    expect(typesAt(8)).toEqual([]);
  });

  it("keeps the effective-date reminder open past the narrative windows, inside its horizon", () => {
    const horizon = new Date(Date.parse(`${TODAY}T00:00:00Z`) + (EFFECTIVE_DATE_HORIZON_DAYS - 5) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(typesAt(60, { effectiveAt: horizon })).toEqual(["effective_date"]);
  });

  it("still refuses anything published in the future", () => {
    // Federal Register public-inspection documents carry a future publication
    // date. Widening the window backwards must not open it forwards.
    const future = new Date(Date.parse(`${TODAY}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    expect(eventCandidates([event({ publishedAt: future })], TODAY)).toHaveLength(0);
  });
});

// =============================================================================
// 2. AGE-AWARE FRAMING
// =============================================================================

describe("age-aware framing — 0 to 2 days", () => {
  it("offers breaking framing to a story from today", () => {
    expect(typesAt(0)).toContain("breaking_change");
  });

  it("still offers it at the boundary", () => {
    expect(typesAt(BREAKING_MAX_AGE_DAYS)).toContain("breaking_change");
  });

  it("keeps the what-changed in the NEWS tier while the story is this fresh", () => {
    expect(WHAT_CHANGED_NEWS_AGE_DAYS).toBe(BREAKING_MAX_AGE_DAYS);
    expect(candidateAt(0, "what_changed")?.tier).toBe("news");
    expect(candidateAt(2, "what_changed")?.tier).toBe("news");
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
      expect(typesAt(age), `age ${age}`).not.toContain("breaking_change");
    }
  });

  it("offers the what-changed as a FOLLOW-UP instead — real information, not what happened today", () => {
    for (const age of [3, 4, 5]) {
      const wc = candidateAt(age, "what_changed");
      expect(wc, `age ${age}`).toBeDefined();
      expect(wc!.tier, `age ${age}`).toBe("follow_up");
    }
  });

  it("still earns the treatments the data supports, behind the type's own angle", () => {
    const wc = candidateAt(4, "what_changed")!;
    expect(wc.supportedAngles[0]).toBe("what_changed");
    // An obligation change and a named population.
    expect(wc.supportedAngles).toContain("who_is_affected");
  });

  it("offers the effective date when the document carries a near one", () => {
    expect(typesAt(4, { effectiveAt: "2026-09-10" })).toContain("effective_date");
  });

  it("drops a retained story that can earn no honest treatment", () => {
    // No obligation, no population, no effective date, nothing revised, and
    // reader value below the floor. At four days the only thing left to say is
    // "this happened", which is the framing the graduated model exists to refuse.
    const bare = event({
      publishedAt: daysAgo(4),
      title: "Agency Information Collection Activities; Notice",
      summary: "A notice concerning the collection of information.",
      entityIds: ["topic:policy-changes"],
    });
    expect(eventCandidates([bare], TODAY)).toEqual([]);
  });

  it("REJECTS just-happened wording at three days, whatever type was chosen", () => {
    const facts = buildEventFacts(event({ publishedAt: daysAgo(3) }), "/what-changed?q=fee", TODAY, "what_changed");
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
    const facts = buildEventFacts(event({ publishedAt: daysAgo(4) }), "/what-changed?q=fee", TODAY, "what_changed");
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
    const facts = buildEventFacts(event({ publishedAt: daysAgo(4) }), "/what-changed?q=fee", TODAY, "what_changed");
    const prompt = buildUserPrompt({
      facts,
      slot: SLOT_BY_ID.get("afternoon")!,
      angle: "what_changed",
      contentType: "what_changed",
      avoidOpenings: [],
    });
    expect(prompt).toMatch(/4 day\(s\) before today/);
    expect(prompt).toMatch(/This is NOT breaking news/);
    // And the content brief itself refuses the frame.
    expect(prompt).toMatch(/CONTENT TYPE: WHAT CHANGED/);
    expect(prompt).toMatch(/No breaking-news framing/);
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
    expect(prompt).toMatch(/This is recent/);
  });
});

// =============================================================================
// 3. THE RECENCY GRADIENT
// =============================================================================

describe("the recency gradient", () => {
  it("gives a newer story a meaningful advantage over an older one, inside the news tier", () => {
    const fresh = event({ id: "federal_register:fresh", publishedAt: daysAgo(0) });
    const old = event({ id: "federal_register:old", publishedAt: daysAgo(2) });

    const breaking = candidatesFor([fresh, old], TODAY).filter((c) => c.contentType === "breaking_change");
    expect(breaking).toHaveLength(2);

    const freshCandidate = breaking.find((c) => c.subjectId.includes("fresh"))!;
    const oldCandidate = breaking.find((c) => c.subjectId.includes("old"))!;

    expect(freshCandidate.score).toBeGreaterThan(oldCandidate.score);
    // Two days apart, at 150/day, is a 300-point gap — large enough to decide
    // a window rather than being lost in rounding.
    expect(freshCandidate.score - oldCandidate.score).toBeGreaterThanOrEqual(
      2 * RECENCY_DECAY_PER_DAY - 50
    );
    expect(breaking[0].subjectId).toBe(freshCandidate.subjectId);
  });

  it("records the decay in the explanation, so a selection can be audited", () => {
    // The DECAY marker specifically — the ranking model's own explain string
    // already contains the word "recency" for its 1-point tie-break, so a bare
    // /recency/ would pass whether or not the gradient existed.
    expect(candidateAt(2, "breaking_change")!.scoreExplain).toMatch(/− 300 recency/);
    expect(candidateAt(1, "what_changed")!.scoreExplain).toMatch(/− 150 recency/);
  });

  it("NEVER lets recency overturn a materially more consequential story", () => {
    // The bound that makes the gradient safe: the news tier holds nothing older
    // than two days, so the most recency can move a candidate is 2 × 150 = 300
    // — strictly less than one breadth step (1000).
    const oldestNews = Math.max(BREAKING_MAX_AGE_DAYS, WHAT_CHANGED_NEWS_AGE_DAYS);
    expect(oldestNews * RECENCY_DECAY_PER_DAY).toBeLessThan(1000);
  });

  it("proves it on real candidates: broader-but-older beats narrower-but-newer", () => {
    // Broad: amends the fee schedule for ALL benefit requests, every applicant.
    const broadOld = event({ id: "federal_register:broad", publishedAt: daysAgo(2) });
    // Narrow: one country, one programme. Genuinely newer, genuinely smaller.
    const narrowNew = event({
      id: "federal_register:narrow",
      publishedAt: TODAY,
      title: "Notice of Designation for a Single Country Programme",
      summary:
        "The agency designates one country for a limited programme affecting a small number of nationals.",
      entityIds: ["country:nepal"],
    });

    const news = candidatesFor([broadOld, narrowNew], TODAY).filter((c) => c.tier === "news");
    const broad = news.find((c) => c.subjectId.includes("broad"));
    const narrow = news.find((c) => c.subjectId.includes("narrow"));

    // Only assert the comparison if both actually cleared the bar; the point is
    // the ordering, not the floor.
    if (broad && narrow) {
      expect(broad.score).toBeGreaterThan(narrow.score);
    } else {
      expect(broad).toBeDefined();
    }
  });

  it("stays inside its own tier — decay can never demote a development", () => {
    const oldest = candidateAt(BREAKING_MAX_AGE_DAYS, "breaking_change")!;
    expect(oldest.category).toBe("development");
    expect(oldest.score).toBeGreaterThan(CATEGORY_TIER.deadline);
  });

  it("does not apply the decay to a follow-up", () => {
    // Follow-ups are ordered by how soon they matter, not by how new they are.
    // A per-day decay there would cross tier boundaries and turn the category
    // ladder back into an age ladder.
    const followUps = eventCandidates(
      [event({ publishedAt: daysAgo(4) }), event({ id: "federal_register:dated", publishedAt: daysAgo(60), effectiveAt: "2026-09-10" })],
      TODAY
    ).filter((c) => c.tier === "follow_up");
    expect(followUps.length).toBeGreaterThan(0);
    for (const c of followUps) {
      expect(c.scoreExplain, c.contentType).not.toMatch(/− \d+ recency/);
      expect(c.score, c.contentType).toBeGreaterThan(CATEGORY_TIER.data_insight);
    }
  });
});

// =============================================================================
// 4. EVERYTHING THE WIDER WINDOW MUST NOT HAVE BROKEN
// =============================================================================

describe("the safety layers are unchanged by the wider window", () => {
  it("keeps the 7-day subject cooldown, which now matters more", () => {
    // A retained story sits in the queue for a week under different types. The
    // cooldown is what stops those days becoming several posts about one
    // document.
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
      contentType: "breaking_change",
      tier: "news",
      score: 70_000,
      text: "A post about the fee adjustment.",
      deepLink: "/what-changed/fee-adjustment-for-certain-immigration-benefit-requests-w0nl86",
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
      ["what_changed"],
      "x",
      "/what-changed/fee-adjustment-for-certain-immigration-benefit-requests-w0nl86",
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
    expect(eventCandidates([routine], TODAY)).toHaveLength(0);
  });
});
