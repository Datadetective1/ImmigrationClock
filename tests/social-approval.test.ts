// =============================================================================
// THE EXACT-COPY APPROVAL PATH
//
// This is the only path on which a human's judgement about a specific sentence
// is load-bearing, so the tests are written as an adversary: for every gate,
// the case that must pass, and the nearest case that must not.
//
// The property the whole file exists to defend:
//
//     What publishes is the text that was read, or nothing publishes.
//
// Two halves to that. The digest tests cover "the text that was read" — any
// divergence between the approved bytes and the publishing bytes must be
// refused. The re-check tests cover "or nothing" — an approval is a permission,
// never a bypass, and every deterministic gate the unattended path applies is
// applied again at publication.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  APPROVAL_VERSION,
  MAX_APPROVAL_AGE_HOURS,
  approveEnvelope,
  buildApproval,
  checkApproval,
  contentDigest,
  parseApproval,
  recomputeDigest,
  serializeApproval,
  type ApprovalEnvelope,
} from "@/lib/social/approval";
import { runApproved, hashFacts, isPublishingEnabled } from "@/lib/social/run";
import { candidatesFor } from "@/lib/social/select";
import { VALIDATOR_VERSION } from "@/lib/social/validate";
import { PROMPT_VERSION } from "@/lib/social/prompt";
import {
  EMPTY_POST_LEDGER,
  appendRecords,
  type PostLedger,
  type PostRecord,
} from "@/lib/social/ledger";
import { EVENT_INDEX } from "@/lib/event-index";
import type { PublishResult, Publisher } from "@/lib/social/platforms/types";
import type { Candidate, FactSet, GeneratedCopy, Platform } from "@/lib/social/types";

// 23:05 UTC on 2026-08-09 is 18:05 America/Chicago — the evening window.
const NOW = new Date("2026-08-09T23:05:00.000Z");
const TODAY = "2026-08-09";

/**
 * Copy that passes the real validator for any explainer.
 *
 * Deliberately digit-free and agency-free, so these tests exercise the approval
 * machinery rather than re-testing figure grounding — which social-validate
 * covers from both directions. "ImmigrationClock" is a subject anchor on every
 * fact set, so the cold-reader check passes whichever explainer is chosen.
 */
function copyFor(facts: FactSet): GeneratedCopy {
  const x = `ImmigrationClock keeps this reference current, with the source and the date shown beside every entry on it. ${facts.deepLink}`;
  const linkedin = [
    "ImmigrationClock keeps this reference current, and shows the source and the date beside every entry rather than leaving a reader to take it on trust.",
    "",
    "The record is assembled from published government material and reorganised around the question people actually arrive with, which is rarely the question a filing was written to answer.",
    "",
    "It reaches anyone who needs to check a claim rather than repeat one.",
    "",
    facts.deepLink,
  ].join("\n");
  return { x, linkedin, deepLink: facts.deepLink };
}

function firstCandidate(): Candidate {
  // An explainer: the most stable evergreen record — a static registry rather
  // than a data snapshot — so the fixture does not move with a refresh.
  const candidates = candidatesFor(EVENT_INDEX, TODAY);
  const explainer = candidates.find((c) => c.subjectId.startsWith("explainer:"));
  if (!explainer) throw new Error("no explainer in the queue — fixture assumption broke");
  return explainer;
}

function envelopeFor(candidate = firstCandidate(), now = NOW): ApprovalEnvelope {
  const copy = copyFor(candidate.facts);
  return buildApproval({
    candidate,
    angle: "explainer",
    slot: "evening",
    copy,
    facts: candidate.facts,
    factsHash: hashFacts(candidate.facts),
    usage: { model: "test-model", inputTokens: 100, outputTokens: 50, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: null, costUsd: 0.001 },
    validation: {
      x: { ok: true, failures: [], codes: [], checked: ["length"] },
      linkedin: { ok: true, failures: [], codes: [], checked: ["length"] },
    },
    promptVersion: PROMPT_VERSION,
    now,
    id: "test-approval-id",
  });
}

/** Approve an envelope the way the script does: confirm the digest you read. */
function approved(
  e: ApprovalEnvelope,
  platforms: Platform[] = ["x", "linkedin"],
  now = NOW
): ApprovalEnvelope {
  const result = approveEnvelope(e, {
    approvedBy: "Test Operator",
    platforms,
    confirmedDigest: recomputeDigest(e),
    now,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.envelope;
}

/** Re-seal after a deliberate edit, so integrity tests can target one gate. */
function reseal(e: ApprovalEnvelope): ApprovalEnvelope {
  return { ...e, contentDigest: contentDigest(e) };
}

function check(e: ApprovalEnvelope, ledger: PostLedger = EMPTY_POST_LEDGER, now = NOW) {
  return checkApproval({ envelope: e, events: EVENT_INDEX, ledger, now, hashFacts });
}

class FakePublisher implements Publisher {
  published: string[] = [];
  constructor(
    readonly platform: Platform,
    private readonly result: PublishResult = {
      ok: true,
      credentialProblem: false,
      error: null,
      externalId: "id-1",
      externalUrl: "https://example.test/id-1",
    }
  ) {}
  async publish(text: string): Promise<PublishResult> {
    this.published.push(text);
    return this.result;
  }
}

function ledgerWith(over: Partial<PostRecord>): PostLedger {
  const base: PostRecord = {
    localDate: TODAY,
    localTime: "09:05",
    runAtUtc: "2026-08-09T14:05:00.000Z",
    slot: "morning",
    pool: "standing",
    readerValue: null,
    readerValueExplain: null,
    treatment: null,
    category: null,
    platform: "x",
    decision: "POSTED",
    reason: "Published",
    subjectId: "subject",
    subjectLabel: "label",
    angle: "data_insight",
    score: 1,
    text: "prior text",
    deepLink: "https://immigrationclock.com/elsewhere",
    externalId: null,
    externalUrl: null,
    model: "m",
    promptVersion: null,
    validatorVersion: null,
    factsHash: null,
    approvalId: null,
    approvedBy: null,
    topicKey: null,
    topicFamily: null,
    adjustedScore: null,
    rotationExplain: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    attempts: null,
  };
  return appendRecords(EMPTY_POST_LEDGER, [{ ...base, ...over }]);
}

// -----------------------------------------------------------------------------

describe("the envelope round-trips", () => {
  it("serializes and parses without changing its digest", () => {
    const e = approved(envelopeFor());
    const back = parseApproval(serializeApproval(e));
    expect(back).not.toBeNull();
    expect(recomputeDigest(back!)).toBe(recomputeDigest(e));
    expect(back!.copy).toEqual(e.copy);
  });

  it("refuses anything that is not an envelope of this version", () => {
    expect(parseApproval("not json")).toBeNull();
    expect(parseApproval("{}")).toBeNull();
    expect(parseApproval(JSON.stringify({ version: "social-approval/0" }))).toBeNull();
    const e = approved(envelopeFor());
    expect(parseApproval(JSON.stringify({ ...e, copy: { x: 1 } }))).toBeNull();
    expect(parseApproval(JSON.stringify({ ...e, slot: "midnight" }))).toBeNull();
    expect(parseApproval(JSON.stringify({ ...e, id: "" }))).toBeNull();
  });

  it("is unapproved when written", () => {
    expect(envelopeFor().approval).toBeNull();
    expect(envelopeFor().version).toBe(APPROVAL_VERSION);
  });
});

describe("approving binds a decision to a specific reading", () => {
  it("accepts the digest the operator was shown", () => {
    const e = envelopeFor();
    const r = approveEnvelope(e, {
      approvedBy: "Operator",
      platforms: ["x"],
      confirmedDigest: recomputeDigest(e),
      now: NOW,
    });
    expect(r.ok).toBe(true);
  });

  it("refuses a digest from a different reading", () => {
    const e = envelopeFor();
    const r = approveEnvelope(e, {
      approvedBy: "Operator",
      platforms: ["x"],
      confirmedDigest: "0".repeat(64),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/Re-inspect it before approving/);
  });

  it("refuses a file that was edited before approval", () => {
    const e = envelopeFor();
    const edited = { ...e, copy: { ...e.copy, x: `Something else entirely. ${e.deepLink}` } };
    const r = approveEnvelope(edited, {
      approvedBy: "Operator",
      platforms: ["x"],
      confirmedDigest: recomputeDigest(edited),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/modified since it was written/);
  });

  it("refuses an unnamed approver", () => {
    const e = envelopeFor();
    const r = approveEnvelope(e, {
      approvedBy: "   ",
      platforms: ["x"],
      confirmedDigest: recomputeDigest(e),
      now: NOW,
    });
    expect(r.ok).toBe(false);
  });

  it("refuses an approval that names no platform", () => {
    const e = envelopeFor();
    const r = approveEnvelope(e, {
      approvedBy: "Operator",
      platforms: [],
      confirmedDigest: recomputeDigest(e),
      now: NOW,
    });
    expect(r.ok).toBe(false);
  });

  it("refuses to approve a platform whose copy failed validation", () => {
    const e = envelopeFor();
    const failing: ApprovalEnvelope = {
      ...e,
      validationAtGeneration: {
        ...e.validationAtGeneration,
        linkedin: { ok: false, codes: [], failures: ["Too short"], checked: [] },
      },
    };
    const r = approveEnvelope(failing, {
      approvedBy: "Operator",
      platforms: ["linkedin"],
      confirmedDigest: recomputeDigest(failing),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect((r as { reason: string }).reason).toMatch(/did not pass validation/);
  });
});

describe("the publish-time gate — integrity", () => {
  it("passes a clean, freshly approved envelope", () => {
    const result = check(approved(envelopeFor()));
    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.eligible).toEqual(["x", "linkedin"]);
  });

  it("refuses an envelope that was never approved", () => {
    const result = check(envelopeFor());
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/has not been approved/);
  });

  it("refuses copy edited after approval, even with the digest field rewritten", () => {
    // The realistic tamper: change the text AND recompute the file's own digest.
    // `approvedDigest` is what the human signed, and it does not move.
    const e = approved(envelopeFor());
    const tampered = reseal({
      ...e,
      copy: { ...e.copy, x: `Entirely different wording now. ${e.deepLink}` },
    });
    const result = check(tampered);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/copy changed after approval/);
  });

  it("refuses copy edited after approval without rewriting the digest", () => {
    const e = approved(envelopeFor());
    const tampered = { ...e, copy: { ...e.copy, x: `Different. ${e.deepLink}` } };
    const result = check(tampered);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/has been modified/);
  });

  it("refuses when the approval names no approver", () => {
    const e = approved(envelopeFor());
    const result = check({ ...e, approval: { ...e.approval!, approvedBy: "" } });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/no approver/);
  });

  it("refuses an approval dated before the copy it approves", () => {
    const e = approved(envelopeFor());
    const result = check({
      ...e,
      approval: { ...e.approval!, approvedAtUtc: "2026-08-01T00:00:00.000Z" },
    });
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/dated before the copy/);
  });

  it("stops at the first integrity failure rather than reporting downstream noise", () => {
    const result = check(envelopeFor());
    expect(result.candidate).toBeNull();
    expect(result.checked).not.toContain("facts-unchanged");
  });
});

describe("the publish-time gate — freshness", () => {
  it("refuses copy older than the approval window", () => {
    const e = approved(envelopeFor());
    const later = new Date(NOW.getTime() + (MAX_APPROVAL_AGE_HOURS + 1) * 3_600_000);
    const result = check(e, EMPTY_POST_LEDGER, later);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/Stale/);
  });

  it("refuses copy written for a different Chicago day", () => {
    const e = approved(envelopeFor());
    // 18:05 CT the next day: inside 24h of nothing, but a different local date.
    const tomorrow = new Date("2026-08-10T20:00:00.000Z");
    const result = check(e, EMPTY_POST_LEDGER, tomorrow);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/but today is 2026-08-10/);
  });

  it("refuses an envelope approved under an older validator", () => {
    const e = approved(reseal({ ...envelopeFor(), validatorVersion: "social-validator/0" }));
    const result = check(e);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/but the validator is now/);
    expect(e.validatorVersion).not.toBe(VALIDATOR_VERSION);
  });
});

describe("the publish-time gate — the candidate must still be real", () => {
  it("refuses a subject that has left the queue", () => {
    const e = approved(reseal({ ...envelopeFor(), subjectId: "explainer:no-such-page" }));
    const result = check(e);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/no longer a candidate/);
  });

  it("finds the candidate by subject AND content type, so the right treatment is re-checked", () => {
    const e = approved(envelopeFor());
    expect(e.contentType).toBe("explainer");
    const result = check(e);
    expect(result.candidate?.contentType).toBe("explainer");
    expect(result.candidate?.subjectId).toBe(e.subjectId);
  });

  it("refuses when the underlying data has moved since generation", () => {
    // The guard that matters most now that the evening copy states real figures:
    // a refresh between approval and publication must not ship yesterday's
    // numbers under today's sentence.
    const e = approved(reseal({ ...envelopeFor(), factsHash: "0123456789abcdef" }));
    const result = check(e);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/underlying data changed since generation/);
  });

  it("refuses when the destination has moved", () => {
    const e = approved(reseal({ ...envelopeFor(), deepLink: "/explained/somewhere-else" }));
    const result = check(e);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/Destination moved|no longer supports/);
  });

  it("keeps the envelope's destination site-relative, like the candidate's", () => {
    // The ledger, the cooldowns and the rotation memory key on the canonical
    // path; the tracked absolute URL lives on the fact set and in the copy.
    const e = envelopeFor();
    expect(e.deepLink.startsWith("/explained/")).toBe(true);
    expect(e.copy.x).toContain(e.facts.deepLink);
    expect(e.facts.deepLink).toContain(e.deepLink);
  });
});

describe("the publish-time gate — the full pipeline runs again", () => {
  it("re-runs the validator against the recomputed facts, not the stored ones", () => {
    // Built so every other gate passes: the digest is consistent, and factsHash
    // still hashes the REAL candidate facts (the stored `facts` object is not in
    // the digest). Only the stored fact set is doctored to permit an invented
    // figure that the copy then uses.
    //
    // If the publisher validated against the envelope's own facts, this would
    // sail through. It validates against today's recomputed facts, so it does not.
    const candidate = firstCandidate();
    const copy = copyFor(candidate.facts);
    const forged = approved(
      buildApproval({
        candidate,
        angle: "explainer",
        slot: "evening",
        copy: {
          ...copy,
          x: `ImmigrationClock keeps this reference current across 4815 entries. ${candidate.facts.deepLink}`,
        },
        facts: {
          ...candidate.facts,
          figures: [...candidate.facts.figures, "4815"],
          summary: `${candidate.facts.summary} There are 4815 entries.`,
        },
        factsHash: hashFacts(candidate.facts),
        usage: { model: "test-model", inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: null, costUsd: 0 },
        validation: {
          x: { ok: true, failures: [], codes: [], checked: [] },
          linkedin: { ok: true, failures: [], codes: [], checked: [] },
        },
        promptVersion: PROMPT_VERSION,
        now: NOW,
        id: "forged-approval",
      })
    );

    const result = check(forged);
    expect(result.eligible).not.toContain("x");
    expect(result.failures.join(" ")).toMatch(/4815/);
  });

  it("re-runs the subject cooldown against the current ledger", () => {
    const e = approved(envelopeFor());
    const ledger = ledgerWith({
      subjectId: e.subjectId,
      platform: "x",
      deepLink: e.deepLink,
      runAtUtc: "2026-08-08T14:05:00.000Z",
    });
    const result = check(e, ledger);
    expect(result.eligible).toEqual(["linkedin"]);
    expect(result.failures.join(" ")).toMatch(/\[x\].*cooldown/i);
  });

  it("re-runs the wording similarity check against the current ledger", () => {
    const e = approved(envelopeFor());
    const ledger = ledgerWith({
      subjectId: "something:else",
      platform: "x",
      deepLink: "https://immigrationclock.com/elsewhere",
      text: e.copy.x,
      runAtUtc: "2026-07-01T14:05:00.000Z",
    });
    const result = check(e, ledger);
    expect(result.eligible).toEqual(["linkedin"]);
    expect(result.failures.join(" ")).toMatch(/\[x\] Too similar/);
  });

  it("refuses an approval that has already been published — single use", () => {
    const e = approved(envelopeFor());
    const ledger = ledgerWith({
      approvalId: e.id,
      subjectId: "unrelated:subject",
      deepLink: "https://immigrationclock.com/elsewhere",
    });
    const result = check(e, ledger);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/single-use/);
  });

  it("only considers the platforms that were approved", () => {
    const result = check(approved(envelopeFor(), ["x"]));
    expect(result.eligible).toEqual(["x"]);
  });
});

describe("runApproved publishes the approved bytes and nothing else", () => {
  it("cannot generate: it publishes with no engine and no API key", async () => {
    // The strongest available statement that this path makes no model call —
    // runApproved takes no CopyEngine, and this run succeeds with the key gone.
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const e = approved(envelopeFor());
      const x = new FakePublisher("x");
      const result = await runApproved({
        envelope: e,
        events: EVENT_INDEX,
        ledger: EMPTY_POST_LEDGER,
        publishers: { x },
        now: NOW,
        live: true,
      });
      const outcome = result.outcome.platforms.find((p) => p.platform === "x")!;
      expect(outcome.decision).toBe("POSTED");
      // Byte for byte.
      expect(x.published).toEqual([e.copy.x]);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("records the approval id and the approver in the ledger", async () => {
    const e = approved(envelopeFor(), ["x"]);
    const result = await runApproved({
      envelope: e,
      events: EVENT_INDEX,
      ledger: EMPTY_POST_LEDGER,
      publishers: { x: new FakePublisher("x") },
      now: NOW,
      live: true,
    });
    const row = result.records.find((r) => r.platform === "x")!;
    expect(row.decision).toBe("POSTED");
    expect(row.approvalId).toBe("test-approval-id");
    expect(row.approvedBy).toBe("Test Operator");
    expect(row.factsHash).toBe(e.factsHash);
  });

  it("withholds when publishing is not live, without touching a publisher", async () => {
    const e = approved(envelopeFor(), ["x"]);
    const x = new FakePublisher("x");
    const result = await runApproved({
      envelope: e,
      events: EVENT_INDEX,
      ledger: EMPTY_POST_LEDGER,
      publishers: { x },
      now: NOW,
      live: false,
    });
    expect(result.outcome.platforms.find((p) => p.platform === "x")!.decision).toBe("DRY_RUN");
    expect(x.published).toEqual([]);
  });

  it("publishes nothing when a re-check fails, and still writes the ledger", async () => {
    const e = approved(reseal({ ...envelopeFor(), factsHash: "stale-hash-value" }));
    const x = new FakePublisher("x");
    const result = await runApproved({
      envelope: e,
      events: EVENT_INDEX,
      ledger: EMPTY_POST_LEDGER,
      publishers: { x },
      now: NOW,
      live: true,
    });
    expect(x.published).toEqual([]);
    for (const p of result.outcome.platforms) {
      expect(p.decision).toBe("SKIPPED_VALIDATION_FAILED");
    }
    expect(result.records).toHaveLength(2);
    expect(result.records[0].approvalId).toBe("test-approval-id");
  });

  it("marks an unapproved platform as not enabled rather than publishing it", async () => {
    const e = approved(envelopeFor(), ["x"]);
    const linkedin = new FakePublisher("linkedin");
    const result = await runApproved({
      envelope: e,
      events: EVENT_INDEX,
      ledger: EMPTY_POST_LEDGER,
      publishers: { x: new FakePublisher("x"), linkedin },
      now: NOW,
      live: true,
    });
    expect(result.outcome.platforms.find((p) => p.platform === "linkedin")!.decision).toBe(
      "SKIPPED_NOT_ENABLED"
    );
    expect(linkedin.published).toEqual([]);
  });

  it("refuses the second publication from the same approval", async () => {
    const e = approved(envelopeFor(), ["x"]);
    const first = await runApproved({
      envelope: e,
      events: EVENT_INDEX,
      ledger: EMPTY_POST_LEDGER,
      publishers: { x: new FakePublisher("x") },
      now: NOW,
      live: true,
    });
    const second = new FakePublisher("x");
    const replay = await runApproved({
      envelope: e,
      events: EVENT_INDEX,
      ledger: first.ledger,
      publishers: { x: second },
      now: NOW,
      live: true,
    });
    expect(second.published).toEqual([]);
    expect(replay.outcome.platforms.every((p) => p.decision !== "POSTED")).toBe(true);
  });

  it("keeps platforms independent when one publisher fails", async () => {
    const e = approved(envelopeFor());
    const linkedin = new FakePublisher("linkedin", {
      ok: false,
      credentialProblem: true,
      error: "token expired",
      externalId: null,
      externalUrl: null,
    });
    const result = await runApproved({
      envelope: e,
      events: EVENT_INDEX,
      ledger: EMPTY_POST_LEDGER,
      publishers: { x: new FakePublisher("x"), linkedin },
      now: NOW,
      live: true,
    });
    expect(result.outcome.platforms.find((p) => p.platform === "x")!.decision).toBe("POSTED");
    expect(result.outcome.platforms.find((p) => p.platform === "linkedin")!.decision).toBe(
      "SKIPPED_CREDENTIAL_EXPIRED"
    );
  });
});

describe("the publishing switch is exact-match", () => {
  it("is enabled only by the exact string", () => {
    expect(isPublishingEnabled({ SOCIAL_POST_ENABLED: "true" })).toBe(true);
  });

  it("is disabled for everything else, including the near misses", () => {
    for (const value of [undefined, "", "TRUE", "True", " true", "true ", "1", "yes", "on", "false"]) {
      expect(
        isPublishingEnabled({ SOCIAL_POST_ENABLED: value }),
        JSON.stringify(value)
      ).toBe(false);
    }
  });

  it("is disabled when the variable is absent from the environment entirely", () => {
    expect(isPublishingEnabled({})).toBe(false);
  });
});
