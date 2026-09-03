// =============================================================================
// READER VALUE — the tests for "would anyone stop scrolling for this?"
//
// THE POST THAT PROMPTED THIS FILE
// --------------------------------
//     "USCIS Policy Manual update on investigations and examinations for
//      naturalization eligibility."
//
// Every existing gate passed it. It names its subject, invents no figure, links
// where it should, states the right stage. It reads like a database row, and
// nobody who saw it in a timeline had a reason to read past the third word —
// even though the underlying document is about whether somebody becomes a U.S.
// citizen, which is roughly the highest-stakes thing this account ever handles.
//
// So there are two failures here and they need different fixes:
//
//   SELECTION  Nothing in the stack asked whether a human had a reason to care.
//              Ranking asks how consequential the INSTRUMENT is, categories ask
//              what KIND it is, rotation asks whether we said it recently. A
//              methodology page and a fee rule could therefore be separated by a
//              rotation index, and a routine notice published this morning
//              outranked a fee rule from last week by two whole tiers because
//              freshness alone bought the top band.
//
//   COPY       The first sentence led with the document's genre. The version
//              that works leads with the person: "Applying for U.S. citizenship?
//              USCIS just changed part of its guidance on…"
//
// The tests below are organised around the eight properties that decide whether
// this is fixed, plus the invariants that must survive fixing it.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  candidatesFor,
  eventCandidates,
  clearsReaderValueFloor,
  readerValueMerit,
  WHAT_CHANGED_NEWS_AGE_DAYS,
  RECENCY_DECAY_PER_DAY,
} from "@/lib/social/select";
import {
  DEVELOPMENT_READER_VALUE_FLOOR,
  IMPACT_WEIGHT,
  LOW_VALUE_CEILING,
  READER_VALUE_FLOOR,
  READER_VALUE_WEIGHT,
  impactCorpus,
  largestDollarFigure,
  TREATMENT_BRIEF,
  TREATMENT_LABEL,
  readerValueForAsset,
  readerValueForEvent,
  readerValueForKeyDate,
  treatmentFor,
  type EditorialTreatment,
} from "@/lib/social/reader-value";
import { CATEGORY_TIER, TIER_STEP, categoryForEvent } from "@/lib/social/categories";
import { runSlot } from "@/lib/social/run";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { buildEventFacts } from "@/lib/social/facts";
import { buildUserPrompt, SYSTEM_PROMPT } from "@/lib/social/prompt";
import { BREAKING_MAX_AGE_DAYS, describesAProposal, isRepairable, validatePost } from "@/lib/social/validate";
import { ASSET_BY_ID } from "@/lib/social/links";
import { assetInsights } from "@/lib/social/asset-facts";
import { KEY_DATES } from "@/lib/key-dates";
import {
  OPENING_REPEAT_LIMIT,
  bannedOpeningLines,
  checkOpeningVariety,
  openingConstruction,
  overusedOpenings,
} from "@/lib/social/dedupe";
import { EMPTY_POST_LEDGER, type PostLedger, type PostRecord } from "@/lib/social/ledger";
import { EVENT_INDEX, type IndexedEvent } from "@/lib/event-index";
import type { CopyEngine, CopyRequest, EngineResult } from "@/lib/social/types";

const TODAY = "2026-08-15";

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:rv-1",
    title: "Fee Adjustment for Certain Immigration Benefit Requests",
    publishedAt: TODAY,
    effectiveAt: null,
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/documents/rv-1",
    summary:
      "DHS is amending the fee schedule that applies to benefit requests, raising the filing fee to $2,400 for petitioners. The change reaches every applicant filing on or after the effective date.",
    entityIds: ["agency:dhs", "visa:h-1b"],
    ...over,
  };
}

/** A real Federal Register genre: paperwork about paperwork. */
function routineNotice(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return event({
    id: "federal_register:rv-routine",
    title:
      "Agency Information Collection Activities; Extension, Without Change, of a Currently Approved Collection: Application for Employment Authorization",
    severity: "notable",
    classification: "announcement",
    summary:
      "USCIS invites comments on an information collection currently approved under the Paperwork Reduction Act. The extension makes no change to the form or to the burden estimate.",
    entityIds: ["agency:uscis"],
    ...over,
  });
}

function record(over: Partial<PostRecord> = {}): PostRecord {
  return {
    localDate: TODAY,
    localTime: "09:07",
    runAtUtc: `${TODAY}T14:07:00.000Z`,
    slot: "morning",
    pool: "news",
    platform: "x",
    decision: "POSTED",
    reason: "Published",
    subjectId: "event:other:1",
    subjectLabel: "Something else",
    angle: "breaking_change",
    score: 70_000,
    text: "Some earlier post about something.",
    deepLink: "https://immigrationclock.com/what-changed",
    externalId: "1",
    externalUrl: null,
    model: "openai:gpt-5",
    promptVersion: "social-prompt/8",
    validatorVersion: "social-validator/6",
    factsHash: null,
    approvalId: null,
    approvedBy: null,
    topicKey: "topic:other",
    topicFamily: "other",
    category: "development",
    readerValue: 70,
    readerValueExplain: null,
    treatment: "important_change",
    adjustedScore: 70_000,
    rotationExplain: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    attempts: null,
    ...over,
  };
}

const ledgerOf = (...rows: PostRecord[]): PostLedger => ({ version: 1, posts: rows });

/** Counts calls so "no API call was made" is a fact rather than an inference. */
class CountingEngine implements CopyEngine {
  readonly id = "test:counting";
  calls = 0;
  async generate(req: CopyRequest): Promise<EngineResult> {
    this.calls++;
    return {
      copy: {
        x: `A post about ${req.facts.title.slice(0, 60)}. ${req.facts.deepLink}`,
        linkedin: `${"A post. ".repeat(50)}\n\n${req.facts.deepLink}`,
        deepLink: req.facts.deepLink,
      },
      usage: {
        model: "test",
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: null,
        costUsd: 0,
      },
    };
  }
}

// =============================================================================
// 1. A MAJOR FEE INCREASE BEATS METHODOLOGY
// =============================================================================

describe("1 — a major fee increase beats a page about our methodology", () => {
  it("scores a large fee change near the top of the scale", () => {
    const value = readerValueForEvent(event(), TODAY);
    expect(value.signals).toContain("financial_impact");
    expect(value.signals).toContain("large_fee_change");
    expect(value.score).toBeGreaterThanOrEqual(DEVELOPMENT_READER_VALUE_FLOOR);
  });

  it("scores the methodology page at zero and keeps it out of the pool entirely", () => {
    const value = readerValueForAsset(
      ASSET_BY_ID.get("methodology")!,
      assetInsights("methodology", TODAY)
    );
    expect(value.score).toBe(0);
    expect(value.lowValue).toContain("methodology");
    expect(clearsReaderValueFloor(value)).toBe(false);

    // And the standing catalogue is no longer a pool at all: no `asset:`
    // subject is ever in the queue, on any day.
    expect(candidatesFor([], TODAY).map((c) => c.subjectId)).not.toContain("asset:methodology");
    expect(candidatesFor([], TODAY).some((c) => c.subjectId.startsWith("asset:"))).toBe(false);
  });

  it("puts the fee rule above every evergreen candidate the evening can see", () => {
    // The evening window is the one that published the methodology post. There
    // is one queue now, and the fee rule outranks every explainer, signal and
    // tool in it by a tier, not by a tie-break.
    const candidates = candidatesFor([event()], TODAY);
    const fee = candidates.find((c) => c.subjectId.startsWith("event:"))!;

    expect(fee).toBeDefined();
    expect(candidates[0].subjectId).toBe(fee.subjectId);
    for (const other of candidates.filter((c) => c.tier === "evergreen")) {
      expect(fee.score, other.subjectId).toBeGreaterThan(other.score);
    }
  });
});

// =============================================================================
// 2. A DEADLINE BEATS A GENERIC DATASET PAGE
// =============================================================================

describe("2 — a deadline beats a generic dataset page", () => {
  it("keeps the change feed and the timeline out — a container is not a subject", () => {
    // Both hold enormously useful material. A post ABOUT either is a description
    // of a page, which is the shape this account was asked to stop publishing.
    // The reader-value model still says so about the pages themselves; the
    // queue no longer holds standing pages at all.
    for (const id of ["what-changed", "timeline"]) {
      const value = readerValueForAsset(ASSET_BY_ID.get(id)!, assetInsights(id, TODAY));
      expect(clearsReaderValueFloor(value), id).toBe(false);
      expect(value.lowValue, id).toContain("generic_description");
    }
    for (const id of ["what-changed", "timeline"]) {
      expect(candidatesFor([], TODAY).map((c) => c.subjectId), id).not.toContain(`asset:${id}`);
    }
  });

  it("scores every recurring filing window well above the floor", () => {
    for (const kd of KEY_DATES) {
      const value = readerValueForKeyDate(kd, 30);
      expect(value.signals, kd.id).toContain("deadline");
      expect(clearsReaderValueFloor(value), kd.id).toBe(true);
    }
  });

  it("ranks a live deadline above every data signal, explainer and tool", () => {
    // 2026-09-17 is exactly fourteen days before the 1 October fiscal-year
    // start, so the key date crosses a milestone and enters the queue.
    const queue = candidatesFor([], "2026-09-17");
    const deadline = queue.find((c) => c.subjectId.startsWith("keydate:"))!;
    expect(deadline).toBeDefined();
    expect(queue[0].subjectId).toBe(deadline.subjectId);

    for (const evergreen of queue.filter((c) => c.tier === "evergreen")) {
      expect(deadline.score, evergreen.subjectId).toBeGreaterThan(evergreen.score);
    }
  });

  it("gives a document with a future effective date the deadline signal, without a keyword", () => {
    // The archive already holds the fact. A structural signal beats a regex
    // wherever one exists, and a title that never says "deadline" still has one.
    const dated = event({
      title: "Signature Requirements for the Submission of Benefit Requests",
      summary: "USCIS is revising how signatures are accepted on benefit requests.",
      effectiveAt: "2026-09-30",
    });
    expect(readerValueForEvent(dated, TODAY).signals).toContain("deadline");
  });
});

// =============================================================================
// 3. AN ELIGIBILITY CHANGE BEATS AN EVERGREEN EXPLAINER
// =============================================================================

describe("3 — an eligibility change beats an evergreen explainer", () => {
  const eligibility = event({
    id: "uscis_policy_manual:rv-elig",
    title: "Policy alert: Investigations and Examinations for Naturalization Eligibility",
    summary:
      "USCIS is updating guidance on the investigations and examinations used when determining whether an applicant is eligible for naturalization.",
    classification: "updated_information",
    sourceKey: "uscis_policy_manual",
    sourceUrl: "https://www.uscis.gov/policy-manual/rv-elig",
    entityIds: ["agency:uscis", "topic:citizenship"],
  });

  it("reads eligibility and naturalization out of the document", () => {
    const value = readerValueForEvent(eligibility, TODAY);
    expect(value.signals).toContain("eligibility");
    expect(value.signals).toContain("naturalization");
    expect(value.score).toBeGreaterThanOrEqual(DEVELOPMENT_READER_VALUE_FLOOR);
  });

  it("outranks every evergreen explainer in the queue", () => {
    const candidates = candidatesFor([eligibility], TODAY);

    const change = candidates.find((c) => c.subjectId.startsWith("event:"))!;
    const explainers = candidates.filter((c) => c.contentType === "explainer");

    expect(change).toBeDefined();
    expect(explainers.length).toBeGreaterThan(0);
    // The explainers are still publishable — they are genuinely useful — they
    // simply never displace a change to who qualifies for citizenship.
    for (const explainer of explainers) {
      expect(change.score, explainer.subjectId).toBeGreaterThan(explainer.score);
    }
    expect(candidates[0].subjectId).toBe(change.subjectId);
  });

  it("still lets the explainer through on a day with no eligibility change", () => {
    // The goal is fewer weak posts, not an empty catalogue. A page explaining
    // what separates the work-visa categories clears the bar on its own merits.
    const value = readerValueForAsset(
      ASSET_BY_ID.get("work-visas")!,
      assetInsights("work-visas", TODAY)
    );
    expect(clearsReaderValueFloor(value)).toBe(true);
  });
});

// =============================================================================
// 4. A ROUTINE ADMINISTRATIVE NOTICE PRODUCES SILENCE
// =============================================================================

describe("4 — a routine administrative notice produces SILENT, and costs nothing", () => {
  it("scores an information-collection notice below the floor", () => {
    const value = readerValueForEvent(routineNotice(), TODAY);
    expect(value.lowValue).toContain("minor_procedural");
    expect(value.score).toBeLessThan(READER_VALUE_FLOOR);
  });

  it("keeps it out of the queue even though it clears the ranking floor", () => {
    // The point of the test: the older gates let this through. The document is
    // `notable`, it is substantive by classification, and its language about
    // employment authorization scores real breadth. Nothing before reader value
    // asked whether it does anything to anybody.
    expect(eventCandidates([routineNotice()], TODAY)).toEqual([]);
  });

  it("makes the morning window silent rather than filling it", async () => {
    const engine = new CountingEngine();
    const result = await runSlot({
      slot: SLOT_BY_ID.get("morning")!,
      events: [routineNotice()],
      ledger: EMPTY_POST_LEDGER,
      engine,
      publishers: {},
      now: new Date(`${TODAY}T14:05:00.000Z`),
      live: false,
      platforms: ["x"],
    });

    // The queue still holds the evergreen tier, and the morning may not draw on
    // it — so the window is silent by cadence rather than by an empty queue.
    // Either way, nothing about the notice was chosen.
    expect(["SKIPPED_NO_QUALIFYING_CONTENT", "SKIPPED_CADENCE"]).toContain(
      result.outcome.platforms[0].decision
    );
    expect(result.outcome.subjectId).toBeNull();
    // THE COST CONTROL AND THE QUALITY BAR ARE THE SAME MECHANISM. A window that
    // decided it had nothing to say must not have paid to find that out.
    expect(engine.calls).toBe(0);
  });

  it("records why it was silent, so the decision is auditable later", () => {
    const value = readerValueForEvent(routineNotice(), TODAY);
    expect(value.reason).toMatch(/reader value \d+\/100/);
    expect(value.reason).toMatch(/minor procedural notice/);
  });
});

// =============================================================================
// 5. A PROPOSED CHANGE STAYS LABELLED PROPOSED
// =============================================================================

describe("5 — a proposed change stays clearly labelled proposed", () => {
  const nprm = event({
    classification: "proposed_rule",
    title: "Fee for Certain H-1B Petitions",
    summary: "DHS proposes a $100,000 fee for certain H-1B petitions.",
    effectiveAt: null,
  });
  const facts = () => buildEventFacts(nprm, "/what-changed?q=fee%20h1b", TODAY);

  it("rejects copy that never says the rule is proposed", () => {
    const f = facts();
    const bad = `DHS is adding a $100,000 fee to certain H-1B petitions filed by employers. ${f.deepLink}`;
    const r = validatePost(bad, "x", f);
    expect(r.ok).toBe(false);
    expect(r.codes).toContain("proposed-not-labelled");
  });

  it("rejects a proposal asserted in the present tense, label or no label", () => {
    const f = facts();
    const bad =
      `DHS proposed a fee rule for H-1B petitions. Employers must now pay $100,000 per petition. ${f.deepLink}`;
    const r = validatePost(bad, "x", f);
    expect(r.ok).toBe(false);
    expect(r.codes).toContain("proposed-asserted-as-fact");
  });

  it("ACCEPTS conditional framing that keeps the stage", () => {
    const f = facts();
    const good =
      `Hiring on an H-1B? DHS has proposed a $100,000 fee on certain H-1B petitions. ` +
      `It is a proposal — nothing has changed, and it would have to be finalised first. ${f.deepLink}`;
    expect(validatePost(good, "x", f).failures).toEqual([]);
  });

  it("protects a proposal ANNOUNCED as news, not just a Federal Register NPRM", () => {
    // The gap this closes. "DHS Proposes Additional H-1B Fee" is classified
    // `announcement`, so the whole stage-protection block used to be skipped for
    // it — and a post reading "DHS is adding a fee to H-1B petitions" would have
    // passed every check while telling people to plan around a rule nobody has
    // made.
    const announced = event({
      classification: "announcement",
      sourceKey: "uscis_newsroom",
      sourceUrl: "https://www.uscis.gov/newsroom/rv-2",
      title: "DHS Proposes Additional H-1B Fee",
      summary: "DHS has announced a proposal to add a fee to certain H-1B petitions.",
      effectiveAt: null,
    });
    const f = buildEventFacts(announced, "/what-changed?q=h1b%20fee", TODAY);

    expect(describesAProposal(f)).toBe(true);
    const bad = `DHS is adding a new fee to certain H-1B petitions filed by employers. ${f.deepLink}`;
    expect(validatePost(bad, "x", f).codes).toContain("proposed-not-labelled");
  });

  it("does NOT relabel a rule that is actually in force", () => {
    // A final rule's summary routinely refers back to the proposal it came from.
    // Reading that as a stage would demote rules that are law.
    const final = event({
      classification: "final_rule",
      effectiveAt: "2026-09-18",
      summary: "This final rule adopts the proposed rule published in March without change.",
    });
    expect(describesAProposal(buildEventFacts(final, "/what-changed?q=fee", TODAY))).toBe(false);
  });

  it("keeps a proposal below an active obligation in the category ladder", () => {
    expect(CATEGORY_TIER.proposed).toBeLessThan(CATEGORY_TIER.actionable);
    expect(CATEGORY_TIER.proposed).toBeLessThan(CATEGORY_TIER.deadline);
    expect(
      categoryForEvent({
        classification: "proposed_rule",
        fresh: true,
        obligationLevel: 3,
        hasUpcomingEffectiveDate: false,
        readerValue: 100,
      })
    ).toBe("proposed");
  });
});

// =============================================================================
// 6. THE EFFECTIVE DATE SURVIVES INTO THE FINAL COPY
// =============================================================================

describe("6 — a future effective date survives into the final copy", () => {
  const dated = event({ effectiveAt: "2026-09-18" });
  const facts = () => buildEventFacts(dated, "/what-changed?q=fee", TODAY);

  it("rejects copy that drops the date it was given", () => {
    const f = facts();
    const bad = `DHS is raising the filing fee to $2,400 for petitioners filing benefit requests. ${f.deepLink}`;
    const r = validatePost(bad, "x", f);
    expect(r.ok).toBe(false);
    expect(r.codes).toContain("effective-date-dropped");
  });

  it("ACCEPTS a reader-first hook that keeps the date", () => {
    // The shape the new brief asks for: the person first, the change second, the
    // date third — with nothing sacrificed to make room for the hook.
    const f = facts();
    const good =
      `Filing an immigration benefit request? DHS is raising the filing fee to $2,400, ` +
      `and the new schedule applies to filings on or after 2026-09-18. ${f.deepLink}`;
    expect(validatePost(good, "x", f).failures).toEqual([]);
  });

  it("names the date as uncuttable in the repair brief, so shortening cannot lose it", () => {
    const prompt = buildUserPrompt({
      facts: facts(),
      slot: SLOT_BY_ID.get("morning")!,
      angle: "breaking_change",
      avoidOpenings: [],
      validatorFeedback: ["[x] Too long for x: 300 chars (max 275)"],
      previousCopy: { x: "too long", linkedin: "too long" },
    });
    expect(prompt).toMatch(/WHAT YOU MAY NOT CUT/);
    expect(prompt).toMatch(/the effective date, if the fact set records one/);
  });

  it("still routes a dated subject to the DEADLINE treatment when it is not fresh news", () => {
    const value = readerValueForEvent(dated, TODAY);
    const treatment = treatmentFor({
      subjectKind: "document",
      angle: "effective_date_reminder",
      ageDays: 20,
      hasFutureEffectiveDate: true,
      hasFigures: true,
      value,
    });
    expect(treatment).toBe("deadline_date");
    expect(TREATMENT_BRIEF[treatment]).toMatch(/the exact date, as the fact set gives it, must appear/);
  });
});

// =============================================================================
// 7. A CONSEQUENTIAL OLDER ITEM BEATS A TRIVIAL NEWER ONE
// =============================================================================

describe("7 — newest is not automatically best", () => {
  // Both are inside the five-day news window and both clear the floor, so this
  // is a genuine contest rather than one of them being filtered out.
  const consequential = event({
    id: "federal_register:rv-old-big",
    publishedAt: "2026-08-11", // four days back — the far edge of the window
    title: "Fee Adjustment for Certain Immigration Benefit Requests",
  });
  const trivial = event({
    id: "uscis_newsroom:rv-new-small",
    publishedAt: TODAY, // this morning
    title: "USCIS Updates Filing Address for Form I-129",
    summary:
      "USCIS has updated the filing address for Form I-129. Petitioners sending benefit requests by mail should use the revised lockbox procedures; the form instructions show the new address.",
    severity: "notable",
    classification: "announcement",
    sourceKey: "uscis_newsroom",
    sourceUrl: "https://www.uscis.gov/newsroom/rv-new-small",
    entityIds: ["agency:uscis", "visa:h-1b"],
  });

  it("scores the older item higher on reader value", () => {
    const older = readerValueForEvent(consequential, TODAY);
    const newer = readerValueForEvent(trivial, TODAY);
    expect(older.score).toBeGreaterThan(newer.score);
  });

  it("lets the older, more consequential item lead the queue", () => {
    const changes = candidatesFor([consequential, trivial], TODAY).filter((c) =>
      c.subjectId.startsWith("event:")
    );
    expect(new Set(changes.map((c) => c.subjectId)).size).toBe(2);
    expect(changes[0].subjectId).toBe(`event:${consequential.id}`);
  });

  it("sizes reader value so it can always outrun the recency gradient", () => {
    // THE ARITHMETIC, STATED RATHER THAN ASSUMED.
    //
    // The most recency can ever move a news candidate is the news tier's whole
    // decay — nothing older than two days is news. A sixteen-point reader-value
    // gap therefore overturns any age difference the tier is capable of
    // producing.
    const maxRecency = Math.max(BREAKING_MAX_AGE_DAYS, WHAT_CHANGED_NEWS_AGE_DAYS) * RECENCY_DECAY_PER_DAY;
    expect(readerValueMerit({ score: 16 } as never)).toBeGreaterThan(maxRecency);
  });

  it("no longer hands the top band to a fresh item merely for being fresh", () => {
    // The structural half of the same argument. Before this, `fresh` alone
    // bought the `development` tier — 70,000 — so a trivial item published this
    // morning outranked a consequential one from last week by two whole bands,
    // and no merit can cross a band.
    const weakButFresh = categoryForEvent({
      classification: "announcement",
      fresh: true,
      obligationLevel: 1,
      hasUpcomingEffectiveDate: false,
      readerValue: DEVELOPMENT_READER_VALUE_FLOOR - 1,
    });
    expect(weakButFresh).not.toBe("development");

    const strongAndFresh = categoryForEvent({
      classification: "final_rule",
      fresh: true,
      obligationLevel: 3,
      hasUpcomingEffectiveDate: false,
      readerValue: DEVELOPMENT_READER_VALUE_FLOOR,
    });
    expect(strongAndFresh).toBe("development");
  });

  it("lets a consequential archive item outrank a fresh trivial one across the tiers", () => {
    // The end-to-end version: one queue sees both. A dated, obligation-bearing
    // rule from three weeks ago sits in the deadline band as an effective-date
    // reminder, and a fresh administrative item no longer sits above it.
    const older = event({
      id: "federal_register:rv-archive",
      publishedAt: "2026-07-20",
      effectiveAt: "2026-09-10",
      title: "Public Charge Ground of Inadmissibility",
      summary:
        "DHS is rescinding the public charge ground of inadmissibility regulations. Eligibility determinations for benefit requests decided on or after the effective date are affected.",
      entityIds: ["agency:dhs", "topic:green-card"],
    });

    const candidates = candidatesFor([older, trivial], TODAY);
    expect(candidates[0].subjectId).toBe(`event:${older.id}`);
    expect(candidates[0].contentType).toBe("effective_date");
    expect(eventCandidates([older], TODAY).map((c) => c.contentType)).toEqual(["effective_date"]);
  });
});

// =============================================================================
// 8. THE FEED DOES NOT REUSE ONE OPENING
// =============================================================================

describe("8 — the account does not keep opening posts the same way", () => {
  const HOUSE_SENTENCE = "USCIS has updated its guidance on";

  it("keys an opening on its construction, not on its subject", () => {
    // Two posts about entirely different rules, opening identically. Trigram
    // similarity across the whole post is low; the frame is the thing repeating.
    const a = `${HOUSE_SENTENCE} naturalization eligibility reviews. https://x.test/a`;
    const b = `${HOUSE_SENTENCE} employment authorization documents. https://x.test/b`;
    expect(openingConstruction(a)).toBe(openingConstruction(b));
    expect(openingConstruction(a)).toBe("uscis has updated");
  });

  it("ignores digits, so two fee posts do not read as different openings", () => {
    expect(openingConstruction("USCIS raised the $500 fee.")).toBe(
      openingConstruction("USCIS raised the $715 fee.")
    );
  });

  it("allows a construction its first uses and refuses the one after", () => {
    const posts = Array.from({ length: OPENING_REPEAT_LIMIT }, (_, i) =>
      record({
        runAtUtc: `2026-08-1${i}T14:07:00.000Z`,
        subjectId: `event:x${i}`,
        text: `${HOUSE_SENTENCE} a different subject number ${i}. https://x.test/${i}`,
      })
    );

    // One short of the limit: still allowed.
    const almost = ledgerOf(...posts.slice(0, OPENING_REPEAT_LIMIT - 1));
    expect(checkOpeningVariety(almost, `${HOUSE_SENTENCE} fees. x`, "x").ok).toBe(true);

    // At the limit: refused, and the reason names the construction.
    const full = ledgerOf(...posts);
    const blocked = checkOpeningVariety(full, `${HOUSE_SENTENCE} fees. x`, "x");
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toMatch(/uscis has updated/);
    expect(blocked.reason).toMatch(/house sentence/i);

    // A different construction about the same subject is fine — the rule is
    // about the frame, not about the topic.
    expect(
      checkOpeningVariety(full, "Applying for citizenship? The guidance changed. x", "x").ok
    ).toBe(true);
  });

  it("tells the copy engine which constructions are refused, so the rule is followable", () => {
    const full = ledgerOf(
      record({ runAtUtc: "2026-08-10T14:00:00.000Z", text: `${HOUSE_SENTENCE} one. https://x.test/1` }),
      record({ runAtUtc: "2026-08-11T14:00:00.000Z", text: `${HOUSE_SENTENCE} two. https://x.test/2` })
    );
    expect(overusedOpenings(full, "x").map((o) => o.construction)).toContain("uscis has updated");

    // THE LINES ARE PROSE, NOT KEYS. "h-1b l-1 visas" is a comparison key and a
    // useless instruction; the model is shown the real opening beside it.
    const banned = bannedOpeningLines(full, ["x", "linkedin"]);
    expect(banned.join(" ")).toContain(HOUSE_SENTENCE);
    expect(banned.join(" ")).toContain("uscis has updated");

    const prompt = buildUserPrompt({
      facts: buildEventFacts(event(), "/what-changed?q=fee", TODAY),
      slot: SLOT_BY_ID.get("morning")!,
      angle: "breaking_change",
      avoidOpenings: [],
      bannedOpenings: banned,
    });
    expect(prompt).toMatch(/OPENING CONSTRUCTIONS THIS ACCOUNT HAS ALREADY USED/);
    expect(prompt).toContain(HOUSE_SENTENCE);
    expect(prompt).toMatch(/Changing the nouns is not enough/);
  });

  it("keeps visa designations distinct, because the digit IS the subject", () => {
    // The collision that would have refused a legitimately different post:
    // normalizeForComparison() deletes digits, so "H-1B/L-1 visas" and
    // "H-2B/L-1 visas" both reduced to "h b l" and the second was blocked for
    // repeating an opening it does not share.
    const a = "H-1B/L-1 visas: the entry-exit fee applies at filing. https://x.test/a";
    const b = "H-2B/L-1 visas: the seasonal worker cap is unchanged. https://x.test/b";
    expect(openingConstruction(a)).not.toBe(openingConstruction(b));
    expect(openingConstruction(a)).toBe("h-1b l-1 visas");

    const ledger = ledgerOf(
      record({ runAtUtc: "2026-08-10T14:00:00.000Z", text: a }),
      record({ runAtUtc: "2026-08-11T14:00:00.000Z", text: a })
    );
    expect(checkOpeningVariety(ledger, a, "x").ok).toBe(false);
    expect(checkOpeningVariety(ledger, b, "x").ok).toBe(true);
  });

  it("fails open on a post too short to have a construction", () => {
    // Missing data must never silence a slot — the same rule same-day variety
    // follows.
    expect(openingConstruction("https://x.test/a")).toBe("");
    expect(checkOpeningVariety(EMPTY_POST_LEDGER, "https://x.test/a", "x").ok).toBe(true);
  });
});

// =============================================================================
// WHAT THE ADVERSARIAL REVIEW FOUND
//
// Every test below pins a defect that was in the first cut of this model and was
// caught by measuring it against the real archive rather than by reading it.
// They are grouped because they share a lesson: an additive keyword model is
// exactly as good as its corpus and its vetoes, and both have to be checked
// against the documents that actually exist.
// =============================================================================

describe("agency names are identity, not consequence", () => {
  it("does not read the USCIS masthead as a citizenship consequence", () => {
    // THE WORST DEFECT THIS MODEL SHIPPED WITH. `/\bcitizenship\b/` is worth 18
    // points and also appears in "U.S. Citizenship and Immigration Services",
    // the byline on most of the archive: the pattern matched 175 of 525 events
    // and in 162 of them the ONLY occurrence was the agency's own name.
    const bylineOnly = event({
      title: "U.S. Citizenship and Immigration Services Announces Office Relocation",
      summary:
        "U.S. Citizenship and Immigration Services has moved a field office. Applicants should consult the office locator.",
      severity: "notable",
      classification: "announcement",
      effectiveAt: null,
      entityIds: [],
    });
    expect(readerValueForEvent(bylineOnly, TODAY).signals).not.toContain("naturalization");
  });

  it("still reads a real naturalization change", () => {
    const real = event({
      title: "Policy alert: Naturalization Eligibility and the Continuous Residence Requirement",
      summary: "USCIS is updating how continuous residence is assessed for naturalization applicants.",
    });
    expect(readerValueForEvent(real, TODAY).signals).toContain("naturalization");
  });

  it("does not read an ICE or CBP byline as an enforcement consequence", () => {
    const byline = event({
      title: "Immigration and Customs Enforcement Publishes Annual Report",
      summary: "U.S. Immigration and Customs Enforcement has published its annual report of activities.",
      entityIds: [],
    });
    expect(readerValueForEvent(byline, TODAY).signals).not.toContain("enforcement_consequence");

    const real = event({
      title: "Expanded Use of Expedited Removal",
      summary: "The rule expands expedited removal and the circumstances in which a person may be detained.",
      entityIds: [],
    });
    expect(readerValueForEvent(real, TODAY).signals).toContain("enforcement_consequence");
  });

  it("strips the mastheads everywhere, not only for events", () => {
    expect(impactCorpus("U.S. Citizenship and Immigration Services")).not.toMatch(/citizenship/);
    expect(impactCorpus("DHS and CBP and ICE and EOIR")).not.toMatch(/\b(dhs|cbp|ice|eoir)\b/);
    // And leaves the words that describe an act.
    expect(impactCorpus("USCIS expanded expedited removal")).toMatch(/expedited removal/);
  });
});

describe("a status is scored the same in both directions", () => {
  // The model was systematically one-sided: of 42 Temporary Protected Status
  // events in the archive, all 31 terminations cleared the floor on the single
  // word "terminate", and only 2 of 9 extensions and vacaturs did. An account
  // that reports every TPS termination and no TPS extension is not cautious,
  // it is partial — on the subject where the stakes are highest.
  const tps = (title: string, summary: string) =>
    readerValueForEvent(
      event({ title, summary, severity: "major", classification: "announcement", effectiveAt: null }),
      TODAY
    );

  it("clears the floor for a termination", () => {
    const v = tps(
      "Termination of the Designation of Venezuela for Temporary Protected Status",
      "DHS is terminating the designation of Venezuela for Temporary Protected Status."
    );
    expect(v.score).toBeGreaterThanOrEqual(READER_VALUE_FLOOR);
  });

  it("clears the floor for an extension too", () => {
    const v = tps(
      "Extension of the Designation of Ukraine for Temporary Protected Status",
      "DHS is extending the designation of Ukraine for Temporary Protected Status."
    );
    expect(v.score).toBeGreaterThanOrEqual(READER_VALUE_FLOOR);
  });

  it("clears the floor for a vacatur", () => {
    const v = tps(
      "Partial Vacatur of the 2024 Temporary Protected Status Decision for Haiti",
      "DHS is vacating in part the 2024 Temporary Protected Status decision for Haiti."
    );
    expect(v.score).toBeGreaterThanOrEqual(READER_VALUE_FLOOR);
  });
});

describe("some weaknesses disqualify rather than demote", () => {
  it("caps paperwork about paperwork below the floor, whatever nouns it contains", () => {
    // The real notice that scored 61/100 under a flat penalty, by accumulating
    // four signals out of its own boilerplate: "public charge", "bond",
    // "expired", and a named population. None of them describes anything
    // happening to anybody.
    const omb = event({
      title:
        "Agency Information Collection Activities; Reinstatement, With Change, of a Previously Approved Collection for Which Approval Has Expired: Public Charge Bond",
      summary:
        "USCIS invites comments on a collection of information for the public charge bond, approval for which has expired.",
      severity: "major",
      classification: "announcement",
      effectiveAt: null,
    });
    const v = readerValueForEvent(omb, TODAY);
    expect(v.lowValue).toContain("minor_procedural");
    expect(v.score).toBeLessThan(READER_VALUE_FLOOR);
    expect(v.score).toBeLessThanOrEqual(LOW_VALUE_CEILING.minor_procedural!);
  });

  it("caps a page about ImmigrationClock at zero, so no vocabulary can rescue it", () => {
    for (const id of ["methodology", "sources", "following"]) {
      const v = readerValueForAsset(ASSET_BY_ID.get(id)!, assetInsights(id, TODAY));
      expect(v.score, id).toBe(0);
    }
  });

  it("does NOT let a bare 'Correction' suffix disqualify a major fee rule", () => {
    // A flat penalty on the word "Correction" put a major fee rule at 7/100.
    // The genre patterns are now `technical correction` and `correcting
    // amendment`; a rule that corrects a fee schedule is still a fee rule.
    const corrected = event({
      title: "USCIS Immigration Fees and Related Procedures Required by H.R.1 Reconciliation Bill; Correction",
      summary: "This document corrects the fee schedule published earlier for immigration benefit requests.",
    });
    const v = readerValueForEvent(corrected, TODAY);
    expect(v.lowValue).not.toContain("minor_procedural");
    expect(v.score).toBeGreaterThanOrEqual(READER_VALUE_FLOOR);
  });
});

describe("a fee is read at its true magnitude", () => {
  it("reads the scale word, so a billion is not one-point-five", () => {
    expect(largestDollarFigure("a $1.5 billion programme")).toBe(1_500_000_000);
    expect(largestDollarFigure("a $250 million surcharge")).toBe(250_000_000);
    expect(largestDollarFigure("a $103,265 fee")).toBe(103_265);
    expect(largestDollarFigure("no money here")).toBe(0);
  });

  it("fires large_fee_change on a figure written with a scale word", () => {
    const big = event({
      title: "Fee for Certain Petitions",
      summary: "DHS is establishing a $1.5 million fee for certain petitions.",
    });
    expect(readerValueForEvent(big, TODAY).signals).toContain("large_fee_change");
  });
});

describe("an address is a claim about who the post is for", () => {
  const facts = buildEventFacts(event({ effectiveAt: null }), "/what-changed?q=fee", TODAY);

  it("rejects a question aimed at a population the facts do not name", () => {
    // Passes every other check — the subject IS named inside the opening
    // window, every figure is grounded, the attribution is supported — and is
    // still false to the reader most likely to act on it.
    const wrong =
      `Applying for U.S. citizenship? DHS is amending the fee schedule for benefit requests, ` +
      `raising the filing fee to $2,400 for petitioners. ${facts.deepLink}`;
    const r = validatePost(wrong, "x", facts);
    expect(r.ok).toBe(false);
    expect(r.codes).toContain("cold-reader-address");
  });

  it("ACCEPTS a question aimed at a population the facts do name", () => {
    const right =
      `Sponsoring an H-1B worker? DHS is amending the fee schedule for benefit requests, ` +
      `raising the filing fee to $2,400 for petitioners. ${facts.deepLink}`;
    expect(validatePost(right, "x", facts).failures).toEqual([]);
  });

  it("leaves a post that does not open with a question alone", () => {
    const plain =
      `DHS is amending the fee schedule for benefit requests, raising the filing fee to ` +
      `$2,400 for petitioners filing on or after the effective date. ${facts.deepLink}`;
    const r = validatePost(plain, "x", facts);
    expect(r.codes).not.toContain("cold-reader-address");
    expect(r.checked).toContain("cold-reader-address");
  });

  it("treats a wrong address as a claim, not a formatting slip", () => {
    // Semantic, so it fails once and stays failed. Making the sentence shorter
    // would not make it aimed at the right people.
    expect(isRepairable("cold-reader-address")).toBe(false);
  });
});

describe("a repeated opening is repaired, not paid for and thrown away", () => {
  const HOUSE = "DHS has updated its guidance on";

  /** Returns the given opening first, then a distinct one on the repair. */
  class TwoOpeningsEngine implements CopyEngine {
    readonly id = "test:two-openings";
    calls = 0;
    async generate(req: CopyRequest): Promise<EngineResult> {
      this.calls++;
      const link = req.facts.deepLink;
      const lede =
        this.calls === 1
          ? `${HOUSE} the fee schedule for benefit requests, raising the filing fee to $2,400`
          : `Filing a benefit request? DHS is raising the fee to $2,400 for petitioners`;
      return {
        copy: {
          x: `${lede}. ${link}`,
          linkedin: `${lede}.\n\n${"The document is recorded with its source. ".repeat(6)}\n\n${link}`,
          deepLink: link,
        },
        usage: {
          model: "test",
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          totalTokens: null,
          costUsd: 0,
        },
      };
    }
  }

  const stale = () =>
    ledgerOf(
      ...[0, 1].map((i) =>
        record({
          // EARLIER DAYS, deliberately. A row carrying today's localDate and the
          // same slot trips the re-run guard instead, which removes X from the
          // slot entirely and would leave this test proving nothing.
          localDate: `2026-08-1${i}`,
          runAtUtc: `2026-08-1${i}T14:00:00.000Z`,
          subjectId: `event:unrelated-${i}`,
          platform: "x",
          text: `${HOUSE} something unrelated number ${i}. https://x.test/${i}`,
        })
      )
    );

  it("spends the second attempt on the opening and publishes the repair", async () => {
    const engine = new TwoOpeningsEngine();
    const result = await runSlot({
      slot: SLOT_BY_ID.get("morning")!,
      events: [event({ effectiveAt: null })],
      ledger: stale(),
      engine,
      publishers: {},
      now: new Date(`${TODAY}T14:05:00.000Z`),
      live: false,
    });

    // THE POINT: the first call was not thrown away for nothing. The old gate
    // sat below the generation loop, so a repeated opening ended the slot with
    // a billed call and no post.
    expect(engine.calls).toBe(2);
    expect(result.outcome.platforms.find((p) => p.platform === "x")?.decision).toBe("DRY_RUN");
    expect(result.outcome.attempts).toHaveLength(2);
    expect(result.outcome.attempts[0].validation).toMatch(/opening variety/i);
    expect(result.outcome.attempts[1].validation).toBe("pass");
  });

  it("tells the engine which openings are refused, in readable prose", async () => {
    class CapturingEngine extends TwoOpeningsEngine {
      seen: CopyRequest[] = [];
      async generate(req: CopyRequest): Promise<EngineResult> {
        this.seen.push(req);
        return super.generate(req);
      }
    }
    const engine = new CapturingEngine();
    await runSlot({
      slot: SLOT_BY_ID.get("morning")!,
      events: [event({ effectiveAt: null })],
      ledger: stale(),
      engine,
      publishers: {},
      now: new Date(`${TODAY}T14:05:00.000Z`),
      live: false,
    });
    expect(engine.seen[0].bannedOpenings?.join(" ")).toContain(HOUSE);
  });
});

// =============================================================================
// INVARIANTS THAT MUST SURVIVE ALL OF THE ABOVE
// =============================================================================

describe("the tier ladder still cannot be crossed by merit", () => {
  it("holds against the whole real archive, not only against the arithmetic", () => {
    // The symbolic bound below is only as good as the assumption that no real
    // candidate exceeds it. This checks the assumption, over every candidate the
    // queue actually produces across a fortnight of real dates — recency decay,
    // effective-date proximity and the explainers' topical boost included.
    for (let d = 0; d < 14; d++) {
      const date = new Date(Date.parse("2026-08-16T00:00:00Z") + d * 86_400_000)
        .toISOString()
        .slice(0, 10);

      for (const c of candidatesFor(EVENT_INDEX, date)) {
        const merit = c.score - CATEGORY_TIER[c.category];
        expect(merit, `${date} ${c.subjectId}::${c.contentType}`).toBeGreaterThanOrEqual(0);
        expect(merit, `${date} ${c.subjectId}::${c.contentType}`).toBeLessThan(TIER_STEP);
      }
    }
  });

  it("keeps every within-tier merit below one tier step, reader value included", () => {
    // The property the whole category design rests on: a question of KIND is
    // settled one level up and no accumulation of merit can overturn it.
    const rankingMax = 3 * 1000 + 3 * 100 + 3 * 20 + 3 * 4 + 1; // breadth..recency
    const readerValueMax = 100 * READER_VALUE_WEIGHT;
    expect(rankingMax + readerValueMax).toBeLessThan(TIER_STEP);
  });

  it("keeps reader value able to outrank a whole breadth step", () => {
    // Breadth answers "how many people does the document mention"; reader value
    // answers "does it do anything to them". A twenty-point gap resolves that
    // disagreement toward the second question.
    expect(20 * READER_VALUE_WEIGHT).toBeGreaterThanOrEqual(1000);
  });

  it("orders the impact weights the way a life is ordered", () => {
    expect(IMPACT_WEIGHT.financial_impact).toBeGreaterThan(IMPACT_WEIGHT.filing_requirements);
    expect(IMPACT_WEIGHT.eligibility).toBeGreaterThan(IMPACT_WEIGHT.processing_change);
    expect(IMPACT_WEIGHT.work_authorization).toBeGreaterThan(IMPACT_WEIGHT.employer_obligations);
  });
});

describe("treatments come from the facts, never from a rotation", () => {
  it("gives the same subject the same shape on any day", () => {
    const value = readerValueForEvent(event({ effectiveAt: "2026-09-18" }), TODAY);
    const shape = (angle: Parameters<typeof treatmentFor>[0]["angle"]) =>
      treatmentFor({
        subjectKind: "document",
        angle,
        ageDays: 20,
        hasFutureEffectiveDate: true,
        hasFigures: true,
        value,
      });
    expect(shape("effective_date_reminder")).toBe(shape("effective_date_reminder"));
  });

  it("never gives a court ruling a countdown voice", () => {
    const ruling = event({
      id: "federal_courts:rv-court",
      classification: "court_decision",
      sourceKey: "federal_courts",
      sourceUrl: "https://www.courtlistener.com/rv-court",
      title: "Order Vacating the Public Charge Rule",
      summary: "The court vacated the rule and enjoined its enforcement nationwide.",
      effectiveAt: null,
    });
    const value = readerValueForEvent(ruling, TODAY);
    expect(value.signals).toContain("court_ruling");
    expect(
      treatmentFor({
        subjectKind: "document",
        angle: "who_is_affected",
        ageDays: 30,
        hasFutureEffectiveDate: false,
        hasFigures: false,
        value,
      })
    ).toBe("important_change");
  });

  it("gives a resource with a real figure the data treatment, and one without an explainer", () => {
    const value = readerValueForAsset(
      ASSET_BY_ID.get("h1b-employers")!,
      assetInsights("h1b-employers", TODAY)
    );
    const withFigures = treatmentFor({
      subjectKind: "resource",
      angle: "data_insight",
      ageDays: null,
      hasFutureEffectiveDate: false,
      hasFigures: true,
      value,
    });
    const without = treatmentFor({
      subjectKind: "resource",
      angle: "data_insight",
      ageDays: null,
      hasFutureEffectiveDate: false,
      hasFigures: false,
      value,
    });
    expect(withFigures).toBe("data_insight");
    expect(without).toBe("context_explainer");
  });

  it("carries all five treatments, each with a brief about the first sentence", () => {
    const all: EditorialTreatment[] = [
      "important_change",
      "what_this_means_for_you",
      "deadline_date",
      "data_insight",
      "context_explainer",
    ];
    for (const t of all) {
      expect(TREATMENT_LABEL[t], t).toBeTruthy();
      expect(TREATMENT_BRIEF[t], t).toMatch(/[Ss]entence one/);
    }
  });
});

describe("the prompt asks the first sentence to earn its place", () => {
  const facts = buildEventFacts(event(), "/what-changed?q=fee", TODAY);
  const value = readerValueForEvent(event(), TODAY);

  it("states the question, and the shape of the answer", () => {
    expect(SYSTEM_PROMPT).toMatch(/WHY SHOULD SOMEONE CARE/);
    expect(SYSTEM_PROMPT).toMatch(/The first sentence gives a real person a reason/);
    // The worked contrast: the change as a person would say it, not the
    // document's genre.
    expect(SYSTEM_PROMPT).toContain('Prefer "USCIS just changed…"');
  });

  it("names what that sentence must not become", () => {
    expect(SYSTEM_PROMPT).toMatch(/not sensational/);
    expect(SYSTEM_PROMPT).toMatch(/not salesy/);
    expect(SYSTEM_PROMPT).toMatch(/not adding urgency/);
    expect(SYSTEM_PROMPT).toMatch(/no engagement bait/);
  });

  it("keeps the opening-question exception narrow", () => {
    // An address that names the population is allowed; a question that asks
    // the reader to wonder is not. The validator's cold-reader-address check is
    // what enforces the first half; the "did you know" ban enforces the second.
    expect(SYSTEM_PROMPT).toMatch(/A short opening question is allowed only when it names the population this reaches/);
    expect(SYSTEM_PROMPT).toMatch(/or asks the question the post immediately answers with a fact/);
    expect(SYSTEM_PROMPT).toMatch(/no "did you know"/);
  });

  it("allows a small subject to be small rather than inflated", () => {
    expect(SYSTEM_PROMPT).toMatch(/If the honest answer is "they probably shouldn't"/);
    expect(SYSTEM_PROMPT).toMatch(/let the post be small/);
  });

  it("renders the treatment and the derived reasons a reader would care", () => {
    const prompt = buildUserPrompt({
      facts,
      slot: SLOT_BY_ID.get("morning")!,
      angle: "breaking_change",
      treatment: "important_change",
      readerValue: value,
      avoidOpenings: [],
    });
    expect(prompt).toContain(`EDITORIAL EMPHASIS: ${TREATMENT_LABEL.important_change}`);
    expect(prompt).toContain(TREATMENT_BRIEF.important_change);
    expect(prompt).toMatch(/WHY A READER WOULD CARE/);
    expect(prompt).toMatch(/pointers to what the facts already contain, not extra facts/i);
  });

  it("still works from a bare fact set, with no reader value supplied", () => {
    // The approval path and the fixtures hold facts and nothing else. A request
    // that carries no reader value must still produce a complete prompt.
    const prompt = buildUserPrompt({
      facts,
      slot: SLOT_BY_ID.get("morning")!,
      angle: "breaking_change",
      avoidOpenings: [],
    });
    expect(prompt).toContain("FACT SET:");
    expect(prompt).not.toMatch(/WHY A READER WOULD CARE/);
  });
});
