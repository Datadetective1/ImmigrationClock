// =============================================================================
// CONTENT STRATEGY — the tests that exist because of one published post
//
// On the evening of the first successful live run, this went out:
//
//     "No implementation date has been set; ImmigrationClock labels each
//      figure's derivation and period completeness, publishes source limits,
//      and does not collect profiles, tracking, or identifying personal data."
//
// It passed every gate the system had. Nothing in it is false, no figure is
// invented, the link is whitelisted, the attribution is grounded. It is still
// the weakest thing this account could have said, for two reasons that live in
// two different layers:
//
//   SELECTION  The evening slot could see fifteen standing pages and nothing
//              else. All fifteen scored within fourteen points of each other,
//              because the "score" was `1000 + (poolSize - rotationPosition)` —
//              a rotation index. The methodology page won on 1015 the way a
//              raffle ticket wins. Real developments were never in the running,
//              because they were not in the pool.
//
//   COPY       The TIMING block told the model, for every subject, to state
//              plainly when no implementation date was recorded. For a rule that
//              is exactly the right instruction. For a page explaining how we
//              classify data it produces a sentence about the absence of a date
//              that was never going to exist — and it produced it FIRST, before
//              the post had named what it was about.
//
// So these tests are organised around the nine properties that would have caught
// it, and the three that must not regress while fixing it.
//
// The second design removed the standing-asset pool altogether: there is one
// queue, and the evergreen tier is explainers, data signals and tools, each with
// its own page. The methodology page is not in the queue to be ranked. The
// properties below are stated against that queue.
// =============================================================================

import { describe, it, expect } from "vitest";
import { candidatesFor, eventCandidates } from "@/lib/social/select";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { applyRotation, buildMemory } from "@/lib/social/rotation";
import { decideCadence } from "@/lib/social/cadence";
import { runSlot } from "@/lib/social/run";
import { validatePost, LIMITS, subjectAnchors, mentionsDate, measuredLength } from "@/lib/social/validate";
import { buildEventFacts, buildAssetFacts } from "@/lib/social/facts";
import { buildUserPrompt } from "@/lib/social/prompt";
import { checkSubject, checkWording } from "@/lib/social/dedupe";
import {
  CATEGORY_TIER,
  MIX_PENALTY,
  MIX_TARGET,
  mixBucketFor,
  mixBucketForPost,
  categoryForAsset,
  isOverTarget,
  type ContentCategory,
} from "@/lib/social/categories";
import { CONTENT_TYPES } from "@/lib/social/content-types";
import { ASSET_BY_ID } from "@/lib/social/links";
import { assetInsights } from "@/lib/social/asset-facts";
import { READER_VALUE_FLOOR, readerValueForAsset } from "@/lib/social/reader-value";
import { EMPTY_POST_LEDGER, appendRecords, type PostLedger, type PostRecord } from "@/lib/social/ledger";
import type { IndexedEvent } from "@/lib/event-index";
import type { CopyEngine, EngineResult, FactSet } from "@/lib/social/types";

const TODAY = "2026-08-15";

function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:strategy-1",
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
    entityIds: ["agency:dhs", "topic:policy-changes"],
    ...over,
  };
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
    text: "Some earlier post.",
    deepLink: "https://immigrationclock.com/what-changed",
    externalId: "1",
    externalUrl: null,
    model: "openai:gpt-5",
    promptVersion: "social-prompt/5",
    validatorVersion: "social-validator/4",
    factsHash: null,
    approvalId: null,
    approvedBy: null,
    topicKey: "topic:other",
    topicFamily: "other",
    category: "development",
    readerValue: null,
    readerValueExplain: null,
    treatment: null,
    adjustedScore: 70_000,
    rotationExplain: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    attempts: null,
    ...over,
  };
}

/** The methodology page's real fact set, as the failing run built it. */
function methodologyFacts(): FactSet {
  const facts = buildAssetFacts(ASSET_BY_ID.get("methodology")!, TODAY);
  expect(facts, "the methodology asset must still be in the catalogue").not.toBeNull();
  return facts!;
}

// =============================================================================
// 1. CONTEXTLESS OPENING REJECTION
// =============================================================================

describe("1 — a post may not open on an orphan", () => {
  const facts = buildEventFacts(event(), "/what-changed?q=fee", TODAY);
  const link = facts.deepLink;

  it("REJECTS the exact opening that published", () => {
    // The post that went out, reconstructed against its own fact set. This is
    // the regression test for the whole exercise.
    const published =
      `No implementation date has been set; ImmigrationClock labels each figure's derivation ` +
      `and period completeness, publishes source limits, and does not collect profiles, ` +
      `tracking, or identifying personal data. ${methodologyFacts().deepLink}`;

    const result = validatePost(published, "x", methodologyFacts());
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/cold reader/i);
  });

  it("rejects a bare negative before the subject is named", () => {
    const bad = `No implementation date has been set for the change. ${link}`;
    const r = validatePost(bad, "x", facts);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/bare negative/i);
  });

  it("rejects a pronoun standing in for a subject that was never given", () => {
    for (const opener of ["It now requires", "This affects", "They will need to know"]) {
      const bad = `${opener} a new fee for benefit requests under the schedule. ${link}`;
      const r = validatePost(bad, "x", facts);
      expect(r.ok, opener).toBe(false);
      expect(r.failures.join(" "), opener).toMatch(/pronoun/i);
    }
  });

  it("rejects a continuation of a post the reader cannot see", () => {
    for (const opener of ["Also,", "Meanwhile,", "In addition,"]) {
      const bad = `${opener} DHS adjusted the fee schedule for benefit requests. ${link}`;
      const r = validatePost(bad, "x", facts);
      expect(r.ok, opener).toBe(false);
      expect(r.failures.join(" "), opener).toMatch(/continuation/i);
    }
  });

  it("rejects opening by describing the page instead of what it shows", () => {
    const bad = `The page lists every H-1B sponsoring employer with approvals and denials. ${link}`;
    const r = validatePost(bad, "x", facts);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/describing a page/i);
  });

  it("ACCEPTS the subject-first rewrite of the same fact", () => {
    // The "Better:" example from the brief, in the shape the account should use.
    const good =
      `DHS has adjusted the fee schedule for immigration benefit requests. ` +
      `No implementation date has been set. ${link}`;
    const r = validatePost(good, "x", facts);
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("does not mistake a legitimate 'no' opening that names its subject", () => {
    // "No" is not banned as a word. What is banned is a negative with nothing
    // behind it — this one names the rule in the same clause.
    const good = `No fee rule change takes effect this month for benefit requests under the current schedule. ${link}`;
    expect(validatePost(good, "x", facts).ok).toBe(true);
  });
});

// =============================================================================
// 2. PROPOSED VERSUS FINAL
// =============================================================================

describe("2 — a proposal is never reported as a change", () => {
  const proposed = buildEventFacts(
    event({
      classification: "proposed_rule",
      title: "Proposed Fee Adjustment for Immigration Benefit Requests",
      summary: "DHS proposes to amend the fee schedule for benefit requests. The proposed fee is $500.",
    }),
    "/what-changed?q=fee",
    TODAY
  );
  const link = proposed.deepLink;

  it("rejects a proposal that never says it is one", () => {
    const bad = `DHS adjusted the fee schedule for immigration benefit requests to $500. ${link}`;
    const r = validatePost(bad, "x", proposed);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/proposed rule but the post never says so/i);
  });

  it("rejects a proposal described as being in effect", () => {
    const bad = `DHS proposed a fee change that takes effect for benefit requests at $500. ${link}`;
    const r = validatePost(bad, "x", proposed);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/in effect/i);
  });

  it("rejects a proposal asserted in the present tense despite saying 'proposed'", () => {
    // The subtle one: the word "proposed" is present, and the post still tells a
    // reader to plan around a fee that does not exist.
    const bad =
      `DHS proposed a fee rule for benefit requests. Petitioners must now pay $500 at filing. ${link}`;
    const r = validatePost(bad, "x", proposed);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/current obligation|settled/i);
  });

  it("rejects a start date attached to a proposal", () => {
    for (const clause of ["starting September", "beginning September", "as of September"]) {
      const bad = `DHS has proposed a fee change for benefit requests, ${clause}. ${link}`;
      const r = validatePost(bad, "x", proposed);
      expect(r.ok, clause).toBe(false);
      expect(r.failures.join(" "), clause).toMatch(/start date|effective date/i);
    }
  });

  it("ACCEPTS conditional framing", () => {
    const good =
      `DHS has proposed amending the fee schedule for immigration benefit requests. ` +
      `The proposal would set the fee at $500 and has no implementation date. ${link}`;
    const r = validatePost(good, "x", proposed);
    expect(r.failures).toEqual([]);
  });

  it("tells the copy engine, in the prompt, that a proposal is not on a calendar", () => {
    const prompt = buildUserPrompt({
      facts: proposed,
      slot: SLOT_BY_ID.get("morning")!,
      angle: "breaking_change",
      avoidOpenings: [],
    });
    expect(prompt).toMatch(/PROPOSAL/);
    expect(prompt).toMatch(/not on anyone's calendar/i);
  });

  it("ranks a proposal below an active obligation, and both below fresh news", () => {
    expect(CATEGORY_TIER.proposed).toBeLessThan(CATEGORY_TIER.actionable);
    expect(CATEGORY_TIER.actionable).toBeLessThan(CATEGORY_TIER.deadline);
    expect(CATEGORY_TIER.deadline).toBeLessThan(CATEGORY_TIER.development);
  });
});

// =============================================================================
// 3. EFFECTIVE-DATE PRESERVATION
// =============================================================================

describe("3 — a future effective date survives into the copy", () => {
  const dated = buildEventFacts(
    event({
      effectiveAt: "2026-09-15",
      title: "Form Edition Requirements for Benefit Requests",
      // The brief's own example names USCIS, so the fact set has to support that
      // attribution — the validator checks agency names against the source
      // material, and an unsupported one is rejected however true it is.
      summary:
        "USCIS will reject older editions of the forms listed in this notice for filings received on or after the effective date.",
    }),
    "/what-changed?q=form",
    TODAY
  );
  const link = dated.deepLink;

  it("rejects a post that drops the date it was given", () => {
    const bad = `USCIS will reject older editions of the forms named in the notice. ${link}`;
    const r = validatePost(bad, "x", dated);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/drops the effective date/i);
  });

  it("ACCEPTS the deadline-alert shape from the brief", () => {
    const good = `Starting September 15, USCIS will reject older editions of the forms covered by this notice. ${link}`;
    const r = validatePost(good, "x", dated);
    expect(r.failures).toEqual([]);
  });

  it("accepts any honest way of writing the date", () => {
    for (const form of ["2026-09-15", "September 15", "15 September", "Sept 15", "9/15"]) {
      expect(mentionsDate(`the change lands ${form} for filings`, "2026-09-15"), form).toBe(true);
    }
  });

  it("does not demand a date that is already in the past", () => {
    // A rule that started last month is history. Repeating its date is not what
    // makes that post useful, and requiring it would reject good archive copy.
    const past = buildEventFacts(
      event({
        effectiveAt: "2026-07-01",
        title: "Form Edition Requirements for Benefit Requests",
        summary:
          "USCIS will reject older editions of the forms listed in this notice for filings received on or after the effective date.",
      }),
      "/what-changed?q=form",
      TODAY
    );
    const ok = `USCIS rejects older editions of the forms covered by this notice. ${past.deepLink}`;
    expect(validatePost(ok, "x", past).ok).toBe(true);
  });

  it("still refuses to invent a date when the archive holds none", () => {
    const undated = buildEventFacts(event(), "/what-changed?q=fee", TODAY);
    const bad = `DHS fee changes for benefit requests take effect on a date the notice sets. ${undated.deepLink}`;
    const r = validatePost(bad, "x", undated);
    expect(r.failures.join(" ")).toMatch(/records none/i);
  });
});

// =============================================================================
// 4. DEADLINES AND ACTIONABILITY OUTRANK EVERGREEN
// =============================================================================

describe("4 — time-sensitive and actionable content outranks durable content", () => {
  it("orders the tiers the way the brief orders them", () => {
    const order: ContentCategory[] = [
      "development",
      "deadline",
      "actionable",
      "proposed",
      "data_insight",
      "explainer",
      "methodology",
    ];
    for (let i = 1; i < order.length; i++) {
      expect(
        CATEGORY_TIER[order[i - 1]],
        `${order[i - 1]} must outrank ${order[i]}`
      ).toBeGreaterThan(CATEGORY_TIER[order[i]]);
    }
  });

  it("puts every key-date deadline above every evergreen candidate", () => {
    // 2026-09-17 is a milestone day (14 days to the 1 October dates), so the
    // queue holds live deadlines alongside the explainers, signals and tools.
    const queue = candidatesFor([], "2026-09-17");
    const deadlines = queue.filter((c) => c.category === "deadline");
    const evergreen = queue.filter((c) => c.tier === "evergreen");
    expect(deadlines.length).toBeGreaterThan(0);
    expect(evergreen.length).toBeGreaterThan(0);
    for (const d of deadlines) {
      for (const p of evergreen) {
        expect(d.score, `${d.subjectId} vs ${p.subjectId}`).toBeGreaterThan(p.score);
      }
    }
  });

  it("cannot be reversed by accumulating intrinsic score", () => {
    // The tier gap is wider than the ranking model's entire range, so no
    // combination of breadth, obligation, magnitude, authority and recency lets
    // a lower band overtake a higher one. That is what makes it a ladder rather
    // than a suggestion.
    const RANKING_MODEL_CEILING = 4_450;
    expect(CATEGORY_TIER.development - CATEGORY_TIER.deadline).toBeGreaterThan(
      RANKING_MODEL_CEILING
    );
  });
});

// =============================================================================
// 5. THE METHODOLOGY PAGE LOSES TO A REAL DEVELOPMENT
// =============================================================================

describe("5 — a page about ImmigrationClock never displaces a development", () => {
  it("classifies the three self-referential pages as methodology", () => {
    for (const id of ["methodology", "sources", "following"]) {
      expect(categoryForAsset(ASSET_BY_ID.get(id)!), id).toBe("methodology");
    }
  });

  it("lets EVERY window see a qualifying development at all", () => {
    // The heart of the failure: the evening's list used to contain fifteen
    // pages and no events, so the slot could not have chosen news if it wanted
    // to. There is one queue now, and a development is in it whatever the hour.
    const candidates = candidatesFor([event()], TODAY);
    expect(candidates.some((c) => c.subjectId.startsWith("event:"))).toBe(true);
  });

  it("ranks that development above every evergreen candidate", () => {
    const candidates = candidatesFor([event()], TODAY);

    const development = candidates.find((c) => c.subjectId.startsWith("event:"))!;
    expect(development).toBeDefined();
    expect(development.category).toBe("development");

    for (const c of candidates.filter((x) => x.tier === "evergreen")) {
      expect(development.score, c.subjectId).toBeGreaterThan(c.score);
    }
    // And it wins outright, not merely on a tie-break.
    expect(candidates[0].subjectId).toBe(development.subjectId);
  });

  it("NO LONGER lets the methodology page post at all, on any evening", () => {
    // THE RULE CHANGED HERE, DELIBERATELY, AND THIS TEST IS THE RECORD OF IT.
    //
    // The old rule was "methodology may post, it simply must not outrank news",
    // on the reasoning that an account which never explains how it knows things
    // is also failing. That reasoning is sound about the SITE and wrong about
    // the FEED: /methodology is one click from every post, and a timeline is the
    // worst place to explain provenance to somebody who has not yet decided the
    // account is worth reading.
    //
    // Two layers now say so. The standing-asset pool is gone — no `asset:`
    // subject is ever a candidate — and reader value still scores a page whose
    // subject is ImmigrationClock at 0/100, so it could not clear the floor
    // even if the pool came back.
    const candidates = candidatesFor([], TODAY);
    expect(candidates.some((c) => c.subjectId === "asset:methodology")).toBe(false);
    expect(candidates.some((c) => c.subjectId.startsWith("asset:"))).toBe(false);

    for (const id of ["methodology", "sources", "following"]) {
      const value = readerValueForAsset(ASSET_BY_ID.get(id)!, assetInsights(id, TODAY));
      expect(value.score, id).toBeLessThan(READER_VALUE_FLOOR);
      expect(value.lowValue.join(" "), id).toMatch(/methodology|product_documentation/);
    }
  });

  it("keeps the containers out too — a way of finding things is not a subject", () => {
    // The change feed and the timeline are indexes. What they hold is valuable;
    // a post ABOUT them is a generic dataset description, which is the shape
    // this account was asked to stop publishing. A tool post about SEARCHING
    // the archive is a different thing — it has the reader's need in it — and
    // that is what the discovery tier carries instead.
    const inQueue = candidatesFor([], TODAY).map((c) => c.subjectId);
    for (const id of ["what-changed", "timeline"]) {
      expect(inQueue, id).not.toContain(`asset:${id}`);
    }
  });

  it("does not let a rotation index decide anything across kinds any more", () => {
    // Every standing candidate used to sit within 14 points of every other. Now
    // the evergreen tier is three kinds in three bands — data signals, then
    // explainers, then tools — and the spread across them is at least a tier.
    const evergreen = candidatesFor([], TODAY).filter((c) => c.tier === "evergreen");
    const scores = evergreen.map((c) => c.score);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(CATEGORY_TIER.methodology / 2);
    expect(new Set(evergreen.map((c) => c.category)).size).toBeGreaterThanOrEqual(3);
  });

  it("keeps the morning window's silence intact — nothing evergreen fills a quiet morning", () => {
    // The cadence must not move. A morning with no qualifying development still
    // posts nothing rather than reaching for an explainer: the queue holds the
    // evergreen tier, and the morning window is not allowed to draw on it.
    const morning = SLOT_BY_ID.get("morning")!;
    const now = new Date(`${TODAY}T14:05:00.000Z`); // 09:05 America/Chicago
    const cadence = decideCadence({ ledger: EMPTY_POST_LEDGER, platform: "x", slot: morning, localDate: TODAY, now });
    expect(cadence.allowedTiers).not.toContain("evergreen");

    const quiet = candidatesFor([], TODAY);
    expect(quiet.length).toBeGreaterThan(0);
    expect(quiet.every((c) => !cadence.allowedTiers.includes(c.tier))).toBe(true);
  });

  it("makes that silence free — a quiet morning never calls the engine", async () => {
    class CountingEngine implements CopyEngine {
      readonly id = "test:counting";
      calls = 0;
      async generate(): Promise<EngineResult> {
        this.calls++;
        throw new Error("should not be called");
      }
    }
    const engine = new CountingEngine();
    const r = await runSlot({
      slot: SLOT_BY_ID.get("morning")!,
      events: [],
      ledger: EMPTY_POST_LEDGER,
      engine,
      publishers: {},
      now: new Date(`${TODAY}T14:05:00.000Z`),
      live: false,
      platforms: ["x"],
    });
    expect(engine.calls).toBe(0);
    expect(r.outcome.platforms[0].decision).toBe("SKIPPED_CADENCE");
    expect(r.outcome.platforms[0].reason).toMatch(/none in a tier this window may publish/);
  });

  it("lets the afternoon take the day's first evergreen post when the day is quiet", () => {
    // The change from the first design, stated: a window with nothing new no
    // longer stays silent by construction. The cadence opens the evergreen tier
    // in the afternoon on a quiet day, and closes it again once anything has
    // published.
    const afternoon = SLOT_BY_ID.get("afternoon")!;
    const now = new Date(`${TODAY}T20:05:00.000Z`); // 15:05 America/Chicago
    const quiet = decideCadence({ ledger: EMPTY_POST_LEDGER, platform: "x", slot: afternoon, localDate: TODAY, now });
    expect(quiet.allowedTiers).toContain("evergreen");

    const busy = decideCadence({
      ledger: appendRecords(EMPTY_POST_LEDGER, [record({ runAtUtc: `${TODAY}T14:07:00.000Z` })]),
      platform: "x",
      slot: afternoon,
      localDate: TODAY,
      now,
    });
    expect(busy.allowedTiers).not.toContain("evergreen");
    expect(busy.allowedTiers).toContain("news");
  });
});

// =============================================================================
// 6. COLD-READER COMPREHENSIBILITY
// =============================================================================

describe("6 — the cold reader test", () => {
  it("derives anchors a stranger would recognise as the subject", () => {
    const facts = buildEventFacts(
      event({ title: "H-1B Registration Fee for Fiscal Year 2028", entityIds: ["visa:h-1b"] }),
      "/h1b/employers",
      TODAY
    );
    const anchors = subjectAnchors(facts);
    expect(anchors).toContain("registration");
    expect(anchors.some((a) => a.includes("h-1b"))).toBe(true);
  });

  it("does not accept generic filler as a subject", () => {
    const facts = buildEventFacts(event(), "/what-changed?q=fee", TODAY);
    // "data", "notice", "update", "page" are stopwords precisely because a post
    // opening on them has not told anyone anything.
    for (const filler of ["data", "notice", "update", "page", "information"]) {
      expect(subjectAnchors(facts), filler).not.toContain(filler);
    }
  });

  it("passes copy that names its subject within the opening", () => {
    const facts = buildEventFacts(event(), "/what-changed?q=fee", TODAY);
    const good = `DHS is amending the fee schedule for immigration benefit requests, with no implementation date set. ${facts.deepLink}`;
    expect(validatePost(good, "x", facts).ok).toBe(true);
  });

  it("applies to LinkedIn as well, where the fold makes the opening matter more", () => {
    const facts = buildEventFacts(event(), "/what-changed?q=fee", TODAY);
    const orphan =
      `It now applies to every benefit request filed under the amended schedule, and the ` +
      `notice sets out how the agency will handle filings received before the change. ` +
      `The fee is $500 for the affected categories, and the schedule is published in full.\n\n` +
      `The notice covers the categories named in the fact set and nothing beyond them.\n\n${facts.deepLink}`;
    const r = validatePost(orphan, "linkedin", facts);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/cold reader/i);
  });

  it("tells the model which anchors exist, so the rule is followable", () => {
    // Same discipline as PERMITTED ATTRIBUTION: a rule the model is judged by
    // and cannot see produces rejections nobody can act on.
    const prompt = buildUserPrompt({
      facts: methodologyFacts(),
      slot: SLOT_BY_ID.get("evening")!,
      angle: "data_insight",
      avoidOpenings: [],
    });
    expect(prompt).toMatch(/NAMING THE SUBJECT/);
    expect(prompt).toMatch(/cold reader test/i);
  });

  it("stops asking a durable page about its implementation date", () => {
    // The direct cause of the published opening. A resource has no start date,
    // so the prompt must not invite a sentence reporting that it lacks one.
    const prompt = buildUserPrompt({
      facts: methodologyFacts(),
      slot: SLOT_BY_ID.get("evening")!,
      angle: "data_insight",
      avoidOpenings: [],
    });
    expect(prompt).not.toMatch(/No effective or implementation date is recorded/i);
    expect(prompt).toMatch(/not a dated change/i);
    expect(prompt).toMatch(/none is missing/i);
  });

  it("still tells a DOCUMENT its date is missing, and never to open on the absence", () => {
    // The absence is still information for a rule. What changed in the ninth
    // prompt is the instruction: the writer MAY say so in plain words, and may
    // not lead with it — which is the exact sentence that published.
    const prompt = buildUserPrompt({
      facts: buildEventFacts(event(), "/what-changed?q=fee", TODAY),
      slot: SLOT_BY_ID.get("morning")!,
      angle: "breaking_change",
      avoidOpenings: [],
    });
    expect(prompt).toMatch(/No effective or implementation date is recorded for this document/);
    expect(prompt).toMatch(/never open on its absence/);
  });
});

// =============================================================================
// 7. DEDUPLICATION STILL BEHAVES (regression)
// =============================================================================

describe("7 — deduplication is unchanged", () => {
  it("still blocks a subject inside its cooldown", () => {
    const ledger = appendRecords(EMPTY_POST_LEDGER, [
      record({ subjectId: "event:federal_register:strategy-1", runAtUtc: `${TODAY}T14:07:00.000Z` }),
    ]);
    const check = checkSubject(
      ledger,
      "event:federal_register:strategy-1",
      ["breaking_change"],
      "x",
      "https://immigrationclock.com/what-changed",
      new Date(`${TODAY}T23:07:00.000Z`),
      "news"
    );
    expect(check.ok).toBe(false);
  });

  it("still blocks near-identical wording", () => {
    const text = "DHS is amending the fee schedule for immigration benefit requests.";
    const ledger = appendRecords(EMPTY_POST_LEDGER, [record({ text })]);
    const result = checkWording(ledger, `${text} `, "x");
    expect(result.ok).toBe(false);
  });

  it("still blocks a repeat subject even when it is now a higher tier", () => {
    // Tiers must not become a way around the cooldown: a candidate promoted to
    // the development band is still the same subject.
    const ledger = appendRecords(EMPTY_POST_LEDGER, [
      record({ subjectId: "asset:methodology", category: "methodology" }),
    ]);
    const rotation = applyRotation(
      {
        subjectId: "asset:methodology",
        topicFamily: "other",
        category: "development",
        deepLink: "https://immigrationclock.com/methodology",
        angle: "breaking_change",
        baseScore: CATEGORY_TIER.development,
        hasNewInformation: true,
      },
      buildMemory(ledger, "x", new Date(`${TODAY}T23:07:00.000Z`), TODAY)
    );
    expect(rotation.eligible).toBe(false);
  });
});

// =============================================================================
// 8. SOURCE AND FIGURE GROUNDING STILL BEHAVES (regression)
// =============================================================================

describe("8 — grounding is unchanged", () => {
  const facts = buildEventFacts(event(), "/what-changed?q=fee", TODAY);

  it("still rejects a figure that is nowhere in the fact set", () => {
    const bad = `DHS is amending the fee schedule, affecting 47000 applicants this year. ${facts.deepLink}`;
    const r = validatePost(bad, "x", facts);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/47000/);
  });

  it("still allows a figure the source states", () => {
    const good = `DHS is amending the fee schedule for benefit requests; the fee is $500. ${facts.deepLink}`;
    expect(validatePost(good, "x", facts).ok).toBe(true);
  });

  it("still rejects an unsupported agency attribution", () => {
    const bad = `USCIS is amending the fee schedule for immigration benefit requests. ${facts.deepLink}`;
    const r = validatePost(bad, "x", facts);
    expect(r.failures.join(" ")).toMatch(/uscis/i);
  });

  it("still rejects a URL outside the whitelist", () => {
    const bad = `DHS is amending the fee schedule for benefit requests. https://example.com/elsewhere`;
    const r = validatePost(bad, "x", facts);
    expect(r.failures.join(" ")).toMatch(/not in the permitted set/i);
  });

  it("still rejects a quotation that is not verbatim", () => {
    const bad = `DHS called the fee schedule "a necessary modernisation" in the notice. ${facts.deepLink}`;
    const r = validatePost(bad, "x", facts);
    expect(r.failures.join(" ")).toMatch(/not verbatim/i);
  });
});

// =============================================================================
// 9. X CHARACTER LIMIT STILL BEHAVES (regression)
// =============================================================================

describe("9 — the X limit is unchanged", () => {
  const facts = buildEventFacts(event(), "/what-changed?q=fee", TODAY);

  it("keeps the 275-character hard limit", () => {
    expect(LIMITS.x.maxChars).toBe(275);
  });

  it("rejects copy one character over", () => {
    const filler = "DHS is amending the fee schedule for immigration benefit requests. ".repeat(10);
    const bad = `${filler}${facts.deepLink}`;
    expect(bad.length).toBeGreaterThan(LIMITS.x.maxChars);
    const r = validatePost(bad, "x", facts);
    expect(r.ok).toBe(false);
    expect(r.failures.join(" ")).toMatch(/Too long for x/);
  });

  it("rejects copy under the minimum", () => {
    const r = validatePost(`DHS fees. ${facts.deepLink}`, "x", facts);
    expect(r.failures.join(" ")).toMatch(/Too short for x/);
  });

  it("accepts a post that lands inside the band, cold-reader rules and all", () => {
    const good =
      `DHS is amending the fee schedule for immigration benefit requests. The notice sets the ` +
      `fee at $500 and records no implementation date. ${facts.deepLink}`;
    // Measured the way X measures: the tracked URL is long, and X charges a
    // fixed t.co width for it.
    expect(measuredLength(good, "x")).toBeLessThanOrEqual(LIMITS.x.maxChars);
    const r = validatePost(good, "x", facts);
    expect(r.failures).toEqual([]);
  });
});

// =============================================================================
// THE MIX — targets, and the proof they are not quotas
// =============================================================================

describe("the content mix", () => {
  it("targets the shares the brief asks for", () => {
    // News still leads; the evergreen and product shares grew when explainers
    // and tools became content types with their own pages rather than filler.
    expect(MIX_TARGET.news).toBe(0.45);
    expect(MIX_TARGET.alerts).toBe(0.2);
    expect(MIX_TARGET.data).toBe(0.15);
    expect(MIX_TARGET.evergreen).toBe(0.12);
    expect(MIX_TARGET.product).toBe(0.08);
    expect(Object.values(MIX_TARGET).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("maps every category into exactly one bucket", () => {
    const categories: ContentCategory[] = [
      "development", "deadline", "actionable", "proposed",
      "data_insight", "explainer", "discovery", "methodology",
    ];
    for (const c of categories) expect(MIX_TARGET[mixBucketFor(c)]).toBeGreaterThan(0);
  });

  it("counts a post by what KIND of post it was, falling back to its category", () => {
    // A why-it-matters on a court order is news to a reader even though the
    // order's archive category is "explainer". Counting it as evergreen put that
    // bucket over its share and penalised every real explainer by a tier step.
    for (const type of CONTENT_TYPES) expect(MIX_TARGET[mixBucketForPost("explainer", type)]).toBeGreaterThan(0);
    expect(mixBucketForPost("explainer", "why_it_matters")).toBe("news");
    expect(mixBucketForPost("explainer", "breaking_change")).toBe("news");
    expect(mixBucketForPost("actionable", "effective_date")).toBe("alerts");
    expect(mixBucketForPost("data_insight", "data_signal")).toBe("data");
    expect(mixBucketForPost("explainer", "explainer")).toBe("evergreen");
    expect(mixBucketForPost("discovery", "data_discovery")).toBe("product");
    // Rows written before content types existed carry none, and fall back.
    expect(mixBucketForPost("development", null)).toBe("news");
    expect(mixBucketForPost("explainer", undefined)).toBe("evergreen");
  });

  it("moves a second same-day development down exactly one band, not out", () => {
    const ledger = appendRecords(EMPTY_POST_LEDGER, [record({ category: "development" })]);
    const memory = buildMemory(ledger, "x", new Date(`${TODAY}T23:07:00.000Z`), TODAY);

    const second = applyRotation(
      {
        subjectId: "event:federal_register:other",
        topicFamily: "fees",
        category: "development",
        deepLink: "https://immigrationclock.com/x",
        angle: "breaking_change",
        baseScore: CATEGORY_TIER.development,
        hasNewInformation: true,
      },
      memory
    );

    expect(second.eligible).toBe(true);
    expect(second.explain).toMatch(/already posted today/);
    // Down one tier: now competing with deadlines on merit rather than winning
    // on category. Still in the running — a major second story can take it.
    expect(second.adjustedScore).toBeLessThanOrEqual(CATEGORY_TIER.deadline);
  });

  it("never promotes anything — the mix has only penalties", () => {
    // The guarantee behind "targets, not quotas": an under-served bucket gets no
    // boost, so nothing can be lifted over a quality gate to fill a share.
    const empty = buildMemory(EMPTY_POST_LEDGER, "x", new Date(`${TODAY}T23:07:00.000Z`), TODAY);
    const r = applyRotation(
      {
        subjectId: "asset:methodology",
        topicFamily: "other",
        category: "methodology",
        deepLink: "https://immigrationclock.com/methodology",
        angle: "data_insight",
        baseScore: CATEGORY_TIER.methodology,
        hasNewInformation: false,
      },
      empty
    );
    expect(r.adjustedScore).toBeLessThanOrEqual(CATEGORY_TIER.methodology);
  });

  it("ignores a share until the sample is big enough to mean anything", () => {
    const counts = { news: 2, alerts: 0, data: 0, evergreen: 0, product: 0 };
    expect(isOverTarget("news", counts)).toBe(false);
  });

  it("penalises a bucket genuinely running over its share", () => {
    const counts = { news: 10, alerts: 1, data: 1, evergreen: 0, product: 0 };
    expect(isOverTarget("news", counts)).toBe(true);
    expect(isOverTarget("data", counts)).toBe(false);
  });

  it("sizes the same-day penalty at exactly one tier step", () => {
    expect(MIX_PENALTY.sameDayBucket).toBe(CATEGORY_TIER.development - CATEGORY_TIER.deadline);
  });
});
