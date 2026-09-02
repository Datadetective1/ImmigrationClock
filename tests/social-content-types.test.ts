// =============================================================================
// CONTENT TYPES, SHAPES AND THE SELECTOR
//
// The second design's identity: eight kinds of post drawn from one queue,
// sixteen shapes the writer chooses between, and a selector that decides which
// kinds a record may become from its own fields. These tests pin the mapping
// so a change to it is a visible decision.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  CONTENT_TYPES,
  STRUCTURES_FOR_TYPE,
  STRUCTURE_BRIEF,
  STRUCTURE_LABEL,
  TIER_FOR_TYPE,
  TYPE_MAX_AGE_DAYS,
  ALL_STRUCTURES,
  isContentType,
  isStructure,
} from "@/lib/social/content-types";
import {
  candidatesFor,
  eventCandidates,
  explainerCandidates,
  signalCandidates,
  discoveryCandidates,
  keyDateCandidates,
  qualifiesAsNews,
  EFFECTIVE_DATE_HORIZON_DAYS,
  WHAT_CHANGED_MAX_AGE_DAYS,
} from "@/lib/social/select";
import { scoreEvent, NEWS_SCORE_FLOOR } from "@/lib/social/score";
import { isPublishableDestination } from "@/lib/social/links";
import { ANGLE_FOR_TYPE } from "@/lib/social/types";
import { implicationsFor, longDate } from "@/lib/social/implications";
import { EXPLAINERS } from "@/lib/editorial/explainers";
import { buildSignals } from "@/lib/editorial/signals";
import { buildDiscoveries } from "@/lib/editorial/discovery";
import type { IndexedEvent } from "@/lib/event-index";

const TODAY = "2026-09-02";

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:ct-1",
    title: "Rescission of Coordinated Enforcement Regulations",
    publishedAt: "2026-09-01",
    effectiveAt: "2026-09-30",
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/documents/ct-1",
    summary:
      "The Department of Labor (Department) is rescinding the regulations that established formal procedures for coordination of enforcement activities among its agencies with respect to migrant and seasonal farmworkers. This action will remove regulatory burden on employers and align the Department's enforcement strategy with coordination models already in use.",
    entityIds: ["agency:dol", "topic:enforcement"],
    ...over,
  };
}

describe("the registry", () => {
  it("names eight content types, each with a tier and at least two shapes", () => {
    expect(CONTENT_TYPES).toHaveLength(8);
    for (const t of CONTENT_TYPES) {
      expect(["news", "follow_up", "evergreen"]).toContain(TIER_FOR_TYPE[t]);
      expect(STRUCTURES_FOR_TYPE[t].length).toBeGreaterThanOrEqual(2);
      for (const s of STRUCTURES_FOR_TYPE[t]) expect(isStructure(s)).toBe(true);
      expect(ANGLE_FOR_TYPE[t]).toBeTruthy();
    }
    expect(isContentType("breaking_change")).toBe(true);
    expect(isContentType("clickbait")).toBe(false);
  });

  it("gives every shape a label and a brief that tells the writer what to do", () => {
    expect(ALL_STRUCTURES.length).toBeGreaterThanOrEqual(12);
    for (const s of ALL_STRUCTURES) {
      expect(STRUCTURE_LABEL[s]).toBeTruthy();
      expect(STRUCTURE_BRIEF[s].length).toBeGreaterThan(40);
    }
  });

  it("keeps the narrative types short-lived", () => {
    expect(TYPE_MAX_AGE_DAYS.breaking_change).toBe(2);
    expect(TYPE_MAX_AGE_DAYS.what_changed).toBeLessThanOrEqual(7);
    expect(TYPE_MAX_AGE_DAYS.why_it_matters).toBeLessThanOrEqual(10);
  });
});

describe("what a record may become", () => {
  it("a fresh, consequential final rule is a breaking change in the news tier, with a what-changed and a why-it-matters behind it", () => {
    const types = eventCandidates([event()], TODAY).map((c) => [c.contentType, c.tier]);
    expect(types).toContainEqual(["breaking_change", "news"]);
    expect(types).toContainEqual(["what_changed", "news"]);
    expect(types).toContainEqual(["why_it_matters", "follow_up"]);
  });

  it("past two days the breaking treatment is withdrawn and what-changed becomes a follow-up", () => {
    const cs = eventCandidates([event({ publishedAt: "2026-08-28" })], TODAY);
    expect(cs.some((c) => c.contentType === "breaking_change")).toBe(false);
    const wc = cs.find((c) => c.contentType === "what_changed");
    expect(wc?.tier).toBe("follow_up");
  });

  it("past WHAT_CHANGED_MAX_AGE_DAYS only the dated reminder remains", () => {
    const cs = eventCandidates([event({ publishedAt: "2026-08-20" })], TODAY);
    expect(cs.map((c) => c.contentType)).toEqual(["effective_date"]);
    expect(WHAT_CHANGED_MAX_AGE_DAYS).toBeLessThan(13);
  });

  it("an effective date beyond the horizon earns no reminder yet", () => {
    const cs = eventCandidates([event({ publishedAt: "2026-08-20", effectiveAt: "2026-12-01" })], TODAY);
    expect(cs.some((c) => c.contentType === "effective_date")).toBe(false);
    expect(EFFECTIVE_DATE_HORIZON_DAYS).toBe(30);
  });

  it("a court decision qualifies as news on its kind, even with a terse summary", () => {
    const order = event({
      id: "uscis_newsroom:order",
      title: "Recent Court Order on Hold Policies",
      classification: "court_decision",
      severity: "major",
      effectiveAt: null,
      sourceKey: "uscis_newsroom",
      sourceUrl: "https://www.uscis.gov/newsroom/alerts/recent-court-order-on-hold-policies",
      summary:
        "On Aug. 24, 2026, the U.S. District Court for the Northern District of California issued an order in Red Eagle Law, L.C., et al., v. Joseph B. Edlow, enjoining PM 602-0192 and PM 602-0194.",
      entityIds: ["agency:uscis", "topic:policy-changes"],
    });
    const rank = scoreEvent(order, "2026-08-01", TODAY).score;
    expect(rank).toBeLessThan(NEWS_SCORE_FLOOR);
    expect(qualifiesAsNews(order, rank)).toBe(true);
    const cs = eventCandidates([order], TODAY);
    expect(cs.some((c) => c.contentType === "breaking_change")).toBe(true);
  });

  it("a record with no abstract can carry a dated reminder and nothing narrative", () => {
    const cs = eventCandidates(
      [event({ publishedAt: "2026-08-20", summary: "No abstract was published with this document." })],
      TODAY
    );
    expect(cs.map((c) => c.contentType)).toEqual(["effective_date"]);
    // And a fresh one with no abstract is not "breaking" either.
    const freshOne = eventCandidates([event({ summary: "No abstract was published with this document." })], TODAY);
    expect(freshOne.some((c) => c.contentType === "breaking_change" || c.contentType === "what_changed")).toBe(false);
  });

  it("routine severity yields nothing", () => {
    expect(eventCandidates([event({ severity: "routine" })], TODAY)).toHaveLength(0);
  });

  it("every event candidate lands on the record's own share page", () => {
    for (const c of eventCandidates([event()], TODAY)) {
      expect(c.deepLink).toMatch(/^\/what-changed\/rescission-of-coordinated-enforcement-regulations-[a-z0-9]{6}$/);
      expect(isPublishableDestination(c.deepLink)).toBe(true);
      expect(c.facts.deepLink).toContain("utm_source=x");
      expect(c.facts.deepLink).toContain(`utm_campaign=${c.contentType}`);
      expect(c.facts.allowedUrls).toContain(c.facts.shareUrl!);
      expect(c.storyKey).toMatch(/^change:[a-z0-9]{6}$/);
    }
  });
});

describe("the evergreen tier", () => {
  it("offers every explainer, every supported signal and every discovery, all evergreen", () => {
    const ex = explainerCandidates([event()], TODAY);
    const sg = signalCandidates(TODAY);
    const dc = discoveryCandidates(TODAY);
    expect(ex).toHaveLength(EXPLAINERS.length);
    expect(sg).toHaveLength(buildSignals(TODAY).length);
    expect(dc).toHaveLength(buildDiscoveries().length);
    for (const c of [...ex, ...sg, ...dc]) {
      expect(c.tier).toBe("evergreen");
      expect(isPublishableDestination(c.deepLink)).toBe(true);
      expect(c.facts.dataPoints.length).toBeGreaterThan(0);
    }
  });

  it("boosts an explainer whose keywords match a change from the last fortnight", () => {
    // The rescission rule carries a future effective date, which makes the
    // effective-date explainer topical; a ceremony alert makes the
    // naturalization one topical.
    const ceremony = event({
      id: "uscis_policy_manual:ceremony",
      sourceKey: "uscis_policy_manual",
      classification: "updated_information",
      effectiveAt: null,
      summary: "USCIS is reinstating guidance on organizations at administrative naturalization ceremonies.",
    });
    const ex = explainerCandidates([event(), ceremony], TODAY);
    const topical = ex.filter((c) => c.scoreExplain.includes("topical"));
    expect(topical.map((c) => c.subjectId)).toContain("explainer:effective-date-vs-publication-date");
    expect(topical.map((c) => c.subjectId)).toContain("explainer:naturalization-ceremony");
    for (const c of topical) expect(c.hasNewInformation).toBe(true);
    // And an untopical one sits below a topical one.
    const untopical = ex.find((c) => !c.scoreExplain.includes("topical"));
    expect(topical[0].score).toBeGreaterThan(untopical!.score);
  });

  it("explainer fact sets carry the cited sources as permitted URLs", () => {
    for (const c of explainerCandidates([], TODAY)) {
      expect(c.facts.allowedUrls.length).toBeGreaterThanOrEqual(3);
      expect(c.facts.figures.every((f) => /\d/.test(f))).toBe(true);
    }
  });
});

describe("the whole queue", () => {
  it("is sorted by score and never contains a duplicate id/type pair", () => {
    const all = candidatesFor([event()], TODAY);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].score).toBeGreaterThanOrEqual(all[i].score);
    const keys = new Set(all.map((c) => `${c.subjectId}::${c.contentType}`));
    expect(keys.size).toBe(all.length);
  });

  it("puts a fresh development above every evergreen item", () => {
    const all = candidatesFor([event()], TODAY);
    const firstEvergreen = all.findIndex((c) => c.tier === "evergreen");
    const lastNews = all.map((c) => c.tier).lastIndexOf("news");
    expect(lastNews).toBeLessThan(firstEvergreen);
  });

  it("includes key dates only at milestones", () => {
    // 2026-09-02 is 29 days before the DV window — not a milestone (60/45/30/14/7/3/1).
    expect(keyDateCandidates("2026-09-02").some((c) => c.subjectId === "keydate:dv-lottery")).toBe(false);
    expect(keyDateCandidates("2026-09-01").some((c) => c.subjectId === "keydate:dv-lottery")).toBe(true);
  });
});

describe("implications are restatements", () => {
  it("derive the stage, the date, the reversal and the watch line from the record's own fields", () => {
    const lines = implicationsFor(event(), TODAY);
    expect(lines.some((l) => l.includes("does not apply until September 30, 2026"))).toBe(true);
    expect(lines.some((l) => l.startsWith("A rescission removes the rule it names"))).toBe(true);
    expect(lines.some((l) => l.includes("watching the September 30, 2026 effective date"))).toBe(true);
  });

  it("say a proposal is a proposal and never give it a date", () => {
    const lines = implicationsFor(event({ classification: "proposed_rule", effectiveAt: null }), TODAY);
    expect(lines[0]).toMatch(/proposal open for comment, not a rule/);
    expect(lines.join(" ")).not.toMatch(/takes effect|in effect since/);
    expect(lines.some((l) => l.includes("watching for a final rule"))).toBe(true);
  });

  it("describe a reinstatement as which guidance applies, not as new law", () => {
    const lines = implicationsFor(
      event({
        classification: "updated_information",
        sourceKey: "uscis_policy_manual",
        effectiveAt: null,
        summary: "USCIS is rescinding the August 29, 2025 policy and reinstating policy guidance to permit nonprofit organizations to participate in ceremonies.",
      }),
      TODAY
    );
    expect(lines.some((l) => l.includes("the earlier guidance is back in force"))).toBe(true);
    expect(lines.some((l) => l.includes("Policy Manual guidance instructs USCIS officers"))).toBe(true);
  });

  it("writes dates as words", () => {
    expect(longDate("2026-09-30")).toBe("September 30, 2026");
  });
});
