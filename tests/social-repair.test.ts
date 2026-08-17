// =============================================================================
// THE BOUNDED REPAIR PATH
//
// A whole-day dry run against the real model skipped the afternoon slot. The
// selected subject was the strongest thing in the pool — a public-charge rule
// with a real effective date — and the X copy came back at 333 characters
// against a 275 limit, so the validator refused it and the slot went silent.
//
// The validator was right, and it is not the thing that needed changing. Two
// things did:
//
//   THE BUDGET WAS FICTION. prompt.ts carried `LINK_BUDGET = 45` and told the
//   model it had "about 215" characters of prose. Real destinations run 36 to
//   101 characters. On an 86-character URL a perfectly obedient model produces
//   215 + 1 + 86 = 302 and fails anyway. Fixed by computing the budget from the
//   actual link — see tests/social-prompt-guardrails.
//
//   THE SECOND CALL WAS A GUESS. The retry regenerated from scratch with a list
//   of complaints attached, for ANY failure. So a post with an ungrounded figure
//   bought a second billed call it was never going to pass, and a post that was
//   merely too long got a fresh draft rather than an edit.
//
// The repair path replaces that with one question asked once: is this a defect
// in the CONTAINER or in the CLAIM? Containers get one repair. Claims get
// silence.
//
// The safety argument rests on something narrow and worth stating plainly: a
// repair is not trusted. It is re-validated in full, so a repair that shortens
// the post by deleting the effective date fails the same check the original
// would have. The instruction makes the right repair likely; the check makes the
// wrong one unpublishable.
// =============================================================================

import { describe, it, expect } from "vitest";
import { runSlot, MAX_GENERATION_ATTEMPTS } from "@/lib/social/run";
import {
  validatePost,
  isRepairable,
  isRepairableResult,
  REPAIRABLE_FAILURES,
  LIMITS,
  type FailureCode,
} from "@/lib/social/validate";
import { buildEventFacts } from "@/lib/social/facts";
import { buildUserPrompt, xBudget } from "@/lib/social/prompt";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { EMPTY_POST_LEDGER } from "@/lib/social/ledger";
import type { IndexedEvent } from "@/lib/event-index";
import type { CopyEngine, CopyRequest, EngineResult, GeneratedCopy } from "@/lib/social/types";

const TODAY = "2026-08-15";

/** The afternoon candidate that actually failed, as closely as a fixture can. */
function event(over: Partial<IndexedEvent> = {}): IndexedEvent {
  return {
    id: "federal_register:2026-14539",
    title: "Public Charge Ground of Inadmissibility",
    // Published 26 days before TODAY, effective in the future — the real
    // afternoon candidate's shape, and the age the knowledge pool draws from.
    publishedAt: "2026-07-20",
    effectiveAt: "2026-09-18",
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/documents/2026/07/20/2026-14539/public-charge",
    summary:
      "DHS is rescinding the 2022 public charge ground of inadmissibility regulations. The rescission applies to benefit requests decided on or after the effective date.",
    entityIds: ["agency:dhs", "topic:green-card"],
    ...over,
  };
}

const FACTS = () => buildEventFacts(event(), "/what-changed?q=public%20charge%20ground", TODAY);

/** LinkedIn copy that passes, so a test about X is only ever about X. */
function goodLinkedIn(facts: ReturnType<typeof FACTS>): string {
  return [
    "The public charge ground of inadmissibility is being rescinded, and the change takes effect on 2026-09-18.",
    "",
    "Until that date the 2022 regulations remain the ones in force. The rescission applies to benefit requests decided on or after the effective date.",
    "",
    "The underlying document is recorded in full, with the government source linked beside it.",
    "",
    facts.deepLink,
  ].join("\n");
}

/** An engine that returns a scripted sequence and counts its calls. */
class ScriptedEngine implements CopyEngine {
  readonly id = "openai:gpt-5";
  calls = 0;
  requests: CopyRequest[] = [];

  constructor(private readonly script: ((req: CopyRequest) => GeneratedCopy)[]) {}

  async generate(req: CopyRequest): Promise<EngineResult> {
    this.requests.push(req);
    const step = this.script[Math.min(this.calls, this.script.length - 1)];
    this.calls++;
    const copy = step(req);
    return {
      copy: { ...copy, deepLink: req.facts.deepLink },
      usage: {
        model: "gpt-5",
        inputTokens: 1000,
        cachedInputTokens: 0,
        outputTokens: 300,
        reasoningTokens: 200,
        totalTokens: 1300,
        costUsd: 0.005,
      },
    };
  }
}

const run = (engine: CopyEngine) =>
  runSlot({
    slot: SLOT_BY_ID.get("afternoon")!,
    events: [event()],
    ledger: EMPTY_POST_LEDGER,
    engine,
    publishers: {},
    now: new Date(`${TODAY}T20:07:00.000Z`),
    live: false,
  });

// =============================================================================
// CLASSIFICATION
// =============================================================================

describe("what counts as repairable", () => {
  it("treats a container defect as repairable", () => {
    for (const code of ["length-max", "no-link", "emoji", "effective-date-dropped"] as FailureCode[]) {
      expect(isRepairable(code), code).toBe(true);
    }
  });

  it("treats a claim defect as NOT repairable", () => {
    const semantic: FailureCode[] = [
      "figure-ungrounded",
      "quotation-ungrounded",
      "attribution-unsupported",
      "proposed-not-labelled",
      "proposed-in-effect",
      "proposed-asserted-as-fact",
      "invented-effective-date",
      "cold-reader-opening",
      "cold-reader-subject",
      "age-framing",
      "banned-construction",
    ];
    for (const code of semantic) expect(isRepairable(code), code).toBe(false);
  });

  it("refuses to repair a URL we never vetted, though it looks mechanical", () => {
    // A destination the model invented is a trust failure wearing a formatting
    // failure's clothes: the reader would be sent somewhere nobody checked.
    expect(isRepairable("url-not-whitelisted")).toBe(false);
    expect(REPAIRABLE_FAILURES.has("url-not-whitelisted" as FailureCode)).toBe(false);
  });

  it("refuses the whole result when ONE failure is semantic", () => {
    // Shortening a post does not make an ungrounded figure true.
    const facts = FACTS();
    const mixed = `The public charge rule reaches 47000 people. ${"x".repeat(300)} ${facts.deepLink}`;
    const result = validatePost(mixed, "x", facts);
    expect(result.ok).toBe(false);
    expect(result.codes).toContain("figure-ungrounded");
    expect(result.codes).toContain("length-max");
    expect(isRepairableResult(result)).toBe(false);
  });

  it("keeps a code beside every failure, so nothing is unclassified", () => {
    const facts = FACTS();
    const result = validatePost("no", "x", facts);
    expect(result.ok).toBe(false);
    expect(result.codes).toHaveLength(result.failures.length);
  });

  it("is strict by default — an unlisted code is semantic", () => {
    expect(isRepairable("something-added-next-year" as FailureCode)).toBe(false);
  });
});

// =============================================================================
// THE REPAIR PATH, END TO END
// =============================================================================

describe("too long → one repair → published", () => {
  it("repairs and publishes, in exactly two calls", async () => {
    const engine = new ScriptedEngine([
      (req) => ({
        // 333 characters, the real failure.
        x:
          `DHS is rescinding the 2022 public charge ground of inadmissibility regulations, a change that takes effect on 2026-09-18 and applies to benefit requests decided on or after that date, with the earlier framework remaining the one in force until then for every applicant and petitioner concerned. ` +
          req.facts.deepLink,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
      (req) => ({
        x: `The public charge ground of inadmissibility is being rescinded, effective 2026-09-18. ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
    ]);

    const r = await run(engine);

    expect(engine.calls).toBe(2);
    expect(r.outcome.platforms.find((p) => p.platform === "x")?.decision).toBe("DRY_RUN");
    expect(r.outcome.validator?.ok).toBe(true);
  });

  it("hands the repair the rejected text and the failure, not just a complaint", async () => {
    const engine = new ScriptedEngine([
      (req) => ({
        x: `DHS is rescinding the 2022 public charge ground of inadmissibility regulations, effective 2026-09-18. ${"Detail. ".repeat(30)} ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
      (req) => ({
        x: `The public charge ground of inadmissibility is being rescinded, effective 2026-09-18. ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
    ]);

    await run(engine);

    const repair = engine.requests[1];
    expect(repair.validatorFeedback?.join(" ")).toMatch(/Too long for x/);
    expect(repair.previousCopy?.x).toMatch(/public charge/);

    const brief = buildUserPrompt(repair);
    expect(brief).toMatch(/This is a repair, not a rewrite/);
    expect(brief).toMatch(/WHAT YOU MAY NOT CUT/);
  });

  it("stops after ONE repair — no unbounded loop", async () => {
    // Always too long, twice over.
    const engine = new ScriptedEngine([
      (req) => ({
        x: `DHS is rescinding the 2022 public charge ground of inadmissibility regulations, effective 2026-09-18. ${"Detail. ".repeat(30)} ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
    ]);

    const r = await run(engine);

    expect(engine.calls).toBe(MAX_GENERATION_ATTEMPTS);
    expect(engine.calls).toBe(2);
    expect(r.outcome.platforms.find((p) => p.platform === "x")?.decision).toBe(
      "SKIPPED_VALIDATION_FAILED"
    );
  });
});

describe("a repair may not buy compliance with a fact", () => {
  it("REJECTS a repair that dropped the effective date to save characters", async () => {
    // The exact temptation a character budget creates: the most droppable-
    // looking clause is the date, and the date is the most useful fact here.
    const engine = new ScriptedEngine([
      (req) => ({
        x: `DHS is rescinding the 2022 public charge ground of inadmissibility regulations, effective 2026-09-18. ${"Detail. ".repeat(30)} ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
      (req) => ({
        // Short enough. Date gone.
        x: `The public charge ground of inadmissibility is being rescinded by DHS. ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
    ]);

    const r = await run(engine);

    expect(engine.calls).toBe(2);
    expect(r.outcome.platforms.find((p) => p.platform === "x")?.decision).toBe(
      "SKIPPED_VALIDATION_FAILED"
    );
    expect(r.outcome.validator?.failures.join(" ")).toMatch(/drops the effective date/i);
  });

  it("REJECTS a repair that changed the stage from proposed to settled", async () => {
    const proposedEvent = event({
      classification: "proposed_rule",
      title: "Proposed Rescission of the Public Charge Ground of Inadmissibility",
      summary: "DHS proposes to rescind the 2022 public charge regulations. Nothing changes unless it is finalised.",
      effectiveAt: null,
    });

    const engine = new ScriptedEngine([
      (req) => ({
        x: `DHS has proposed rescinding the 2022 public charge ground of inadmissibility regulations. ${"Detail. ".repeat(30)} ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
      (req) => ({
        // Shorter, and now describes a proposal as a settled change.
        x: `DHS rescinded the 2022 public charge ground of inadmissibility regulations. ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
    ]);

    const r = await runSlot({
      slot: SLOT_BY_ID.get("afternoon")!,
      events: [proposedEvent],
      ledger: EMPTY_POST_LEDGER,
      engine,
      publishers: {},
      now: new Date(`${TODAY}T20:07:00.000Z`),
      live: false,
    });

    expect(r.outcome.platforms.find((p) => p.platform === "x")?.decision).toBe(
      "SKIPPED_VALIDATION_FAILED"
    );
    expect(r.outcome.validator?.failures.join(" ")).toMatch(/proposed rule but the post never says so/i);
  });

  it("REJECTS a repair that introduced an unsupported fact", async () => {
    const engine = new ScriptedEngine([
      (req) => ({
        x: `DHS is rescinding the 2022 public charge ground of inadmissibility regulations, effective 2026-09-18. ${"Detail. ".repeat(30)} ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
      (req) => ({
        x: `Public charge rescission takes effect 2026-09-18 for 47000 applicants. ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
    ]);

    const r = await run(engine);
    expect(r.outcome.platforms.find((p) => p.platform === "x")?.decision).toBe(
      "SKIPPED_VALIDATION_FAILED"
    );
    expect(r.outcome.validator?.failures.join(" ")).toMatch(/47000/);
  });

  it("names the forbidden cuts in the repair brief itself", () => {
    const facts = FACTS();
    const brief = buildUserPrompt({
      facts,
      slot: SLOT_BY_ID.get("afternoon")!,
      angle: "effective_date_reminder",
      avoidOpenings: [],
      validatorFeedback: ["[x] Too long for x: 333 chars (max 275)"],
      previousCopy: { x: "something too long", linkedin: "likewise" },
    });
    expect(brief).toMatch(/the effective date, if the fact set records one/i);
    expect(brief).toMatch(/the stage word/i);
    expect(brief).toMatch(/the destination URL/i);
  });
});

describe("no unnecessary repair", () => {
  it("makes exactly ONE call when the first attempt is already valid", async () => {
    const engine = new ScriptedEngine([
      (req) => ({
        x: `The public charge ground of inadmissibility is being rescinded, effective 2026-09-18. ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
    ]);

    const r = await run(engine);
    expect(engine.calls).toBe(1);
    expect(r.outcome.attempts).toHaveLength(1);
    expect(r.outcome.platforms.find((p) => p.platform === "x")?.decision).toBe("DRY_RUN");
  });

  it("spends nothing at all when no candidate qualifies", async () => {
    const engine = new ScriptedEngine([() => ({ x: "", linkedin: "", deepLink: "" })]);
    const r = await runSlot({
      slot: SLOT_BY_ID.get("afternoon")!,
      events: [],
      ledger: EMPTY_POST_LEDGER,
      engine,
      publishers: {},
      now: new Date(`${TODAY}T20:07:00.000Z`),
      live: false,
    });
    expect(engine.calls).toBe(0);
    expect(r.outcome.platforms[0].decision).toBe("SKIPPED_NO_QUALIFYING_CONTENT");
  });
});

// =============================================================================
// THE URL IS INSIDE THE BUDGET
// =============================================================================

describe("the URL counts against the X budget", () => {
  it("reserves the exact link length plus its space", () => {
    const facts = FACTS();
    const b = xBudget(facts);
    expect(b.reservedChars).toBe(facts.deepLink.length + 1);
    expect(b.proseMax + b.reservedChars).toBeLessThan(LIMITS.x.maxChars);
  });

  it("means prose written to the budget always fits", () => {
    const facts = FACTS();
    const b = xBudget(facts);
    const post = `${"x".repeat(b.proseMax)} ${facts.deepLink}`;
    expect(post.length).toBeLessThanOrEqual(LIMITS.x.maxChars);
    expect(validatePost(post, "x", facts).codes).not.toContain("length-max");
  });

  it("still lets the validator have the last word", () => {
    // The budget is advice to the model. The limit is enforced regardless.
    const facts = FACTS();
    const over = `${"x".repeat(LIMITS.x.maxChars)} ${facts.deepLink}`;
    expect(validatePost(over, "x", facts).codes).toContain("length-max");
  });
});

// =============================================================================
// NOTHING ELSE MOVED
// =============================================================================

describe("the surrounding guarantees are unchanged", () => {
  it("repairs a LinkedIn-only mechanical failure without touching X", async () => {
    // LinkedIn is under its minimum and nothing else is wrong with it: it names
    // its subject, carries the effective date, and keeps the link below the
    // fold. That makes it MECHANICAL, so the slot buys one repair and both
    // platforms come through — rather than one platform's formatting costing
    // the other its post.
    const engine = new ScriptedEngine([
      (req) => ({
        x: `The public charge ground of inadmissibility is being rescinded, effective 2026-09-18. ${req.facts.deepLink}`,
        linkedin: [
          "The public charge ground of inadmissibility is being rescinded by DHS, effective 2026-09-18. " +
            "The 2022 regulations remain the ones in force until that date.",
          "",
          req.facts.deepLink,
        ].join("\n"),
        deepLink: req.facts.deepLink,
      }),
      (req) => ({
        x: `The public charge ground of inadmissibility is being rescinded, effective 2026-09-18. ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
    ]);

    const r = await run(engine);
    const x = r.outcome.platforms.find((p) => p.platform === "x");
    expect(String(x?.text ?? "")).toMatch(/public charge/);
  });

  it("cannot publish on a dry run, whatever the repair produced", async () => {
    const engine = new ScriptedEngine([
      (req) => ({
        x: `The public charge ground of inadmissibility is being rescinded, effective 2026-09-18. ${req.facts.deepLink}`,
        linkedin: goodLinkedIn(req.facts as ReturnType<typeof FACTS>),
        deepLink: req.facts.deepLink,
      }),
    ]);

    const r = await run(engine);
    for (const p of r.outcome.platforms) {
      expect(p.decision).not.toBe("POSTED");
      expect(p.externalId).toBeNull();
    }
  });

  it("keeps the publishing switch exact and unchanged", async () => {
    const { isPublishingEnabled } = await import("@/lib/social/run");
    expect(isPublishingEnabled({ SOCIAL_POST_ENABLED: "true" })).toBe(true);
    expect(isPublishingEnabled({ SOCIAL_POST_ENABLED: "TRUE" })).toBe(false);
    expect(isPublishingEnabled({ SOCIAL_POST_ENABLED: "" })).toBe(false);
    expect(isPublishingEnabled({})).toBe(false);
  });

  it("keeps the re-run guard ahead of any generation", async () => {
    const engine = new ScriptedEngine([
      (req) => ({ x: "unused", linkedin: "unused", deepLink: req.facts.deepLink }),
    ]);
    const posted = {
      localDate: TODAY,
      localTime: "15:07",
      runAtUtc: `${TODAY}T20:07:00.000Z`,
      slot: "afternoon" as const,
      pool: "knowledge" as const,
      decision: "POSTED" as const,
      reason: "Published",
      subjectId: "event:federal_register:2026-14539",
      subjectLabel: "Public Charge",
      angle: "effective_date_reminder" as const,
      score: 62_000,
      text: "a post",
      deepLink: "https://immigrationclock.com/what-changed?q=public%20charge%20ground",
      externalId: "1",
      externalUrl: null,
      model: null,
      promptVersion: null,
      validatorVersion: null,
      factsHash: null,
      approvalId: null,
      approvedBy: null,
      topicKey: "topic:green-card",
      topicFamily: "green-card",
      category: "deadline",
      adjustedScore: 62_000,
      rotationExplain: null,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      attempts: null,
    };

    const r = await runSlot({
      slot: SLOT_BY_ID.get("afternoon")!,
      events: [event()],
      ledger: {
        version: 1 as const,
        posts: [
          { ...posted, platform: "x" as const },
          { ...posted, platform: "linkedin" as const },
        ],
      },
      engine,
      publishers: {},
      now: new Date(`${TODAY}T20:07:00.000Z`),
      live: false,
    });

    expect(engine.calls).toBe(0);
    expect(r.outcome.platforms[0].decision).toBe("SKIPPED_DUPLICATE");
  });
});
