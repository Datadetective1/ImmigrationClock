// =============================================================================
// THE RUNNER — one slot, end to end
//
// Pure with respect to the outside world: the archive, the ledger, the clock,
// the engine and the publishers all arrive as arguments. That is what lets the
// seven-day simulation and the production script execute exactly the same code
// path, which in turn is what makes the simulation worth reading.
//
// THE ORDER OF THE GATES IS THE COST CONTROL
// ------------------------------------------
// Selection, scoring, subject eligibility and cooldowns all run BEFORE the copy
// engine. A slot with nothing to say never makes an API call, so the quality bar
// and the budget are the same mechanism. Only wording similarity has to run
// after generation, because wording does not exist until then.
//
// PLATFORMS ARE INDEPENDENT ALL THE WAY DOWN
// ------------------------------------------
// Eligibility, validation, wording and publication are evaluated per platform.
// One call to the engine produces both variants — they should share a subject
// and an angle — but from that point on X's outcome never depends on LinkedIn's.
// A LinkedIn credential that expired two weeks ago costs LinkedIn its posts and
// costs X nothing.
// =============================================================================

import { createHash } from "node:crypto";
import type { IndexedEvent } from "@/lib/event-index";
import { candidatesFor } from "./select";
import { checkSameDayVariety, checkSubject, checkWording } from "./dedupe";
import { validatePost } from "./validate";
import { VALIDATOR_VERSION } from "./validate";
import { PROMPT_VERSION } from "./prompt";
import { chicagoParts, SLOT_BY_ID } from "./slots";
import { checkApproval, type ApprovalEnvelope } from "./approval";
import { appendRecords, recentOpenings, type PostLedger, type PostRecord } from "./ledger";
import type { Publisher } from "./platforms/types";
import type {
  Angle,
  Candidate,
  CopyEngine,
  EngineUsage,
  FactSet,
  GeneratedCopy,
  Platform,
  PlatformOutcome,
  SlotDef,
  SlotOutcome,
  ValidationResult,
} from "./types";
import { PLATFORMS } from "./types";

/** One regeneration, never a loop. Two strikes and the slot stays silent. */
export const MAX_GENERATION_ATTEMPTS = 2;

/**
 * The publishing switch, as an exact string match and nothing looser.
 *
 * Not `Boolean(env.X)`, not a truthy list, not case-insensitive. "TRUE", "1",
 * "yes" and an accidental " true" all mean disabled, because every one of those
 * is more likely to be a mistake than an intention, and the failure mode of
 * guessing generously is an unattended process posting to a public account.
 *
 * Takes the environment as an argument so the rule itself is testable rather
 * than only observable by running the script.
 */
export function isPublishingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SOCIAL_POST_ENABLED === "true";
}

/** How many recent openings are shown to the engine as a variety nudge. */
const OPENINGS_SHOWN = 12;

export interface RunOptions {
  slot: SlotDef;
  events: IndexedEvent[];
  ledger: PostLedger;
  engine: CopyEngine;
  /** Absent for a platform means "not configured" — that platform skips. */
  publishers: Partial<Record<Platform, Publisher>>;
  /** The instant this run represents. Everything date-derived comes from here. */
  now: Date;
  /**
   * False (the default) means generate and validate everything, publish nothing.
   * This is the mode the system ships in.
   */
  live: boolean;
}

export interface RunResult {
  outcome: SlotOutcome;
  records: PostRecord[];
  ledger: PostLedger;
}

export async function runSlot(opts: RunOptions): Promise<RunResult> {
  const { slot, events, ledger, engine, publishers, now, live } = opts;
  const parts = chicagoParts(now);
  const today = parts.date;

  const base = {
    localDate: today,
    localTime: parts.time,
    runAtUtc: now.toISOString(),
    slot: slot.id,
    pool: slot.pool,
  };

  const candidates = candidatesFor(slot, events, today);

  // ---- gate 1: is there anything at all? -----------------------------------
  if (candidates.length === 0) {
    return finish(
      opts,
      emptyOutcome(base, slot, 0),
      "SKIPPED_NO_QUALIFYING_CONTENT",
      `No candidate in the ${slot.pool} pool cleared the quality bar for ${today}`
    );
  }

  // ---- gate 2: subject eligibility, per platform ---------------------------
  const chosen = chooseCandidate(candidates, ledger, now, today);
  if (!chosen) {
    const why = firstRejection(candidates, ledger, now);
    return finish(
      opts,
      emptyOutcome(base, slot, candidates.length),
      why.includes("cooldown") ? "SKIPPED_COOLDOWN" : "SKIPPED_DUPLICATE",
      why
    );
  }

  const { candidate, angle, eligible } = chosen;

  // ---- gate 3: generate ----------------------------------------------------
  let copy: GeneratedCopy | null = null;
  let usage: EngineUsage | null = null;
  let validation: Record<Platform, ValidationResult> | null = null;
  let feedback: string[] = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    let generated;
    try {
      generated = await engine.generate({
        facts: candidate.facts,
        slot,
        angle,
        avoidOpenings: recentOpenings(ledger, "x", OPENINGS_SHOWN),
        validatorFeedback: attempt > 1 ? feedback : undefined,
      });
    } catch (err) {
      return finish(
        opts,
        {
          ...emptyOutcome(base, slot, candidates.length),
          subjectId: candidate.subjectId,
          subjectLabel: candidate.label,
          angle,
          score: candidate.score,
          scoreExplain: candidate.scoreExplain,
          deepLink: candidate.deepLink,
        },
        "SKIPPED_ENGINE_UNAVAILABLE",
        `Copy engine failed: ${(err as Error).message}`
      );
    }

    copy = generated.copy;
    usage = generated.usage;

    // ---- gate 4: validate, per platform ------------------------------------
    validation = {
      x: validatePost(generated.copy.x, "x", candidate.facts),
      linkedin: validatePost(generated.copy.linkedin, "linkedin", candidate.facts),
    };

    // Only the platforms we would actually publish to have to pass. Rejecting a
    // whole slot because LinkedIn copy failed while X's was clean — on a day
    // LinkedIn is locked out anyway — would be the coupling this design exists
    // to avoid.
    const relevant = eligible.filter((p) => publishers[p] || !live);
    const failing = relevant.filter((p) => !validation![p].ok);
    if (failing.length === 0) break;

    feedback = failing.flatMap((p) => validation![p].failures.map((f) => `[${p}] ${f}`));

    if (attempt === MAX_GENERATION_ATTEMPTS) {
      return finish(
        opts,
        {
          ...emptyOutcome(base, slot, candidates.length),
          subjectId: candidate.subjectId,
          subjectLabel: candidate.label,
          angle,
          score: candidate.score,
          scoreExplain: candidate.scoreExplain,
          deepLink: candidate.deepLink,
          validator: mergeValidation(validation, relevant),
          usage,
        },
        "SKIPPED_VALIDATION_FAILED",
        feedback.join("; ")
      );
    }
  }

  // Unreachable in practice; the loop either breaks with copy or returns.
  if (!copy || !usage || !validation) {
    return finish(
      opts,
      emptyOutcome(base, slot, candidates.length),
      "SKIPPED_ENGINE_UNAVAILABLE",
      "Copy engine produced nothing"
    );
  }

  // ---- gate 5: wording, then publish, per platform -------------------------
  const outcomes: PlatformOutcome[] = [];
  let dedupeResult = null;

  for (const platform of PLATFORMS) {
    const text = copy[platform];

    if (!eligible.includes(platform)) {
      outcomes.push({
        platform,
        decision: "SKIPPED_DUPLICATE",
        reason: `This subject and angle are not available on ${platform}`,
        text: null,
        externalId: null,
        externalUrl: null,
      });
      continue;
    }

    if (!validation[platform].ok) {
      outcomes.push({
        platform,
        decision: "SKIPPED_VALIDATION_FAILED",
        reason: validation[platform].failures.join("; "),
        text,
        externalId: null,
        externalUrl: null,
      });
      continue;
    }

    const wording = checkWording(ledger, text, platform);
    if (platform === "x") dedupeResult = wording;
    if (!wording.ok) {
      outcomes.push({
        platform,
        decision: "SKIPPED_DUPLICATE",
        reason: wording.reason,
        text,
        externalId: null,
        externalUrl: null,
      });
      continue;
    }

    if (!live) {
      outcomes.push({
        platform,
        decision: "DRY_RUN",
        reason: "Dry run — validated and withheld",
        text,
        externalId: null,
        externalUrl: null,
      });
      continue;
    }

    const publisher = publishers[platform];
    if (!publisher) {
      outcomes.push({
        platform,
        decision: "SKIPPED_CREDENTIAL_EXPIRED",
        reason: `No usable ${platform} credential is configured`,
        text,
        externalId: null,
        externalUrl: null,
      });
      continue;
    }

    const result = await publisher.publish(text);
    outcomes.push({
      platform,
      decision: result.ok
        ? "POSTED"
        : result.credentialProblem
          ? "SKIPPED_CREDENTIAL_EXPIRED"
          : "SKIPPED_PUBLISH_FAILED",
      reason: result.ok ? "Published" : (result.error ?? "Publish failed"),
      text,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
    });
  }

  const outcome: SlotOutcome = {
    ...emptyOutcome(base, slot, candidates.length),
    subjectId: candidate.subjectId,
    subjectLabel: candidate.label,
    angle,
    score: candidate.score,
    scoreExplain: candidate.scoreExplain,
    topicKey: candidate.topicKey,
    deepLink: candidate.deepLink,
    validator: mergeValidation(validation, eligible),
    dedupe: dedupeResult,
    usage,
    platforms: outcomes,
  };

  const records = outcomes.map((o) => toRecord(base, outcome, o, engine.id, candidate, null));
  return { outcome, records, ledger: appendRecords(ledger, records) };
}

// -----------------------------------------------------------------------------

interface Chosen {
  candidate: Candidate;
  angle: Angle;
  /** Platforms this subject+angle may run on today. */
  eligible: Platform[];
}

/**
 * The highest-scoring candidate that is still available somewhere, with the
 * best angle still open for it.
 *
 * Walking the list rather than testing only the top candidate is what stops one
 * permanently-blocked subject from silencing a slot indefinitely.
 */
function chooseCandidate(
  candidates: Candidate[],
  ledger: PostLedger,
  now: Date,
  localDate: string
): Chosen | null {
  for (const candidate of candidates) {
    const perPlatform = new Map<Platform, Angle[]>();

    for (const platform of PLATFORMS) {
      // Same-day variety first: it is the cheapest check and the one most
      // likely to reject, because the three slots run against a ledger that
      // already holds today's earlier posts.
      if (!checkSameDayVariety(ledger, candidate.topicKey, localDate, platform).ok) continue;

      const check = checkSubject(
        ledger,
        candidate.subjectId,
        candidate.supportedAngles,
        platform,
        candidate.deepLink,
        now,
        candidate.pool
      );
      if (check.ok) perPlatform.set(platform, check.availableAngles);
    }

    if (perPlatform.size === 0) continue;

    // Prefer an angle open on the most platforms; ties break on the candidate's
    // own preference order, which select.ts already sorted by how well the data
    // supports each treatment.
    for (const angle of candidate.supportedAngles) {
      const eligible = PLATFORMS.filter((p) => perPlatform.get(p)?.includes(angle));
      if (eligible.length > 0) return { candidate, angle, eligible };
    }
  }
  return null;
}

function firstRejection(candidates: Candidate[], ledger: PostLedger, now: Date): string {
  const top = candidates[0];
  const check = checkSubject(
    ledger,
    top.subjectId,
    top.supportedAngles,
    "x",
    top.deepLink,
    now,
    top.pool
  );
  return `${candidates.length} candidate(s) considered; none available. Top candidate "${top.label}": ${check.reason}`;
}

function emptyOutcome(
  base: Pick<SlotOutcome, "localDate" | "localTime" | "runAtUtc" | "slot" | "pool">,
  slot: SlotDef,
  poolSize: number
): SlotOutcome {
  return {
    ...base,
    slot: slot.id,
    pool: slot.pool,
    subjectId: null,
    subjectLabel: null,
    angle: null,
    score: null,
    scoreExplain: null,
    topicKey: null,
    deepLink: null,
    poolSize,
    validator: null,
    dedupe: null,
    usage: null,
    platforms: [],
  };
}

function mergeValidation(
  validation: Record<Platform, ValidationResult>,
  relevant: Platform[]
): ValidationResult {
  const failures = relevant.flatMap((p) => validation[p].failures.map((f) => `[${p}] ${f}`));
  const checked = [...new Set(relevant.flatMap((p) => validation[p].checked))];
  return { ok: failures.length === 0, failures, checked };
}

/** A skip: same record shape, written for every platform, so nothing is invisible. */
function finish(
  opts: RunOptions,
  outcome: SlotOutcome,
  decision: PostRecord["decision"],
  reason: string
): RunResult {
  return finishWith(opts.ledger, opts.engine.id, outcome, decision, reason, null);
}

/** The shared skip path, engine-agnostic so the approved path can use it too. */
function finishWith(
  ledger: PostLedger,
  engineId: string,
  outcome: SlotOutcome,
  decision: PostRecord["decision"],
  reason: string,
  provenance: RecordProvenance | null
): RunResult {
  const platforms: PlatformOutcome[] = PLATFORMS.map((platform) => ({
    platform,
    decision,
    reason,
    text: null,
    externalId: null,
    externalUrl: null,
  }));
  const full = { ...outcome, platforms };
  const records = platforms.map((p) =>
    toRecord(
      {
        localDate: outcome.localDate,
        localTime: outcome.localTime,
        runAtUtc: outcome.runAtUtc,
        slot: outcome.slot,
        pool: outcome.pool,
      },
      full,
      p,
      engineId,
      null,
      provenance
    )
  );
  return { outcome: full, records, ledger: appendRecords(ledger, records) };
}

/** Who approved this text, when it came through the exact-copy path. */
interface RecordProvenance {
  approvalId: string;
  approvedBy: string;
  factsHash: string;
}

function toRecord(
  base: Pick<SlotOutcome, "localDate" | "localTime" | "runAtUtc" | "slot" | "pool">,
  outcome: SlotOutcome,
  platform: PlatformOutcome,
  engineId: string,
  candidate: Candidate | null,
  provenance: RecordProvenance | null
): PostRecord {
  return {
    ...base,
    platform: platform.platform,
    decision: platform.decision,
    reason: platform.reason,
    subjectId: outcome.subjectId,
    subjectLabel: outcome.subjectLabel,
    angle: outcome.angle,
    score: outcome.score,
    topicKey: outcome.topicKey,
    text: platform.text,
    deepLink: outcome.deepLink,
    externalId: platform.externalId,
    externalUrl: platform.externalUrl,
    model: outcome.usage?.model ?? engineId,
    promptVersion: outcome.usage ? PROMPT_VERSION : null,
    validatorVersion: outcome.validator ? VALIDATOR_VERSION : null,
    factsHash: provenance?.factsHash ?? (candidate ? factsHash(candidate) : null),
    approvalId: provenance?.approvalId ?? null,
    approvedBy: provenance?.approvedBy ?? null,
    inputTokens: outcome.usage?.inputTokens ?? null,
    outputTokens: outcome.usage?.outputTokens ?? null,
    costUsd: outcome.usage?.costUsd ?? null,
  };
}

/** Ties a published string to the exact facts it was generated from. */
export function factsHash(candidate: Candidate): string {
  return hashFacts(candidate.facts);
}

/** The same hash, over a bare fact set. Used by the approval gate. */
export function hashFacts(facts: FactSet): string {
  return createHash("sha256").update(JSON.stringify(facts)).digest("hex").slice(0, 16);
}

// -----------------------------------------------------------------------------
// THE EXACT-COPY PATH
// -----------------------------------------------------------------------------

export interface RunApprovedOptions {
  envelope: ApprovalEnvelope;
  events: IndexedEvent[];
  ledger: PostLedger;
  publishers: Partial<Record<Platform, Publisher>>;
  now: Date;
  live: boolean;
}

/**
 * Publish the exact text a human approved, or publish nothing.
 *
 * NOTE THE SIGNATURE: there is no CopyEngine. Generation is not merely skipped
 * on this path, it is unreachable — nothing here can call a model, so the text
 * that ships is necessarily the text that was read.
 *
 * Everything else is the unattended path's own machinery: checkApproval()
 * re-runs the validator, the subject and URL cooldowns, and the wording
 * similarity check against the CURRENT ledger, and the records written here are
 * the same records runSlot() writes, with the approval id and approver added.
 */
export async function runApproved(opts: RunApprovedOptions): Promise<RunResult> {
  const { envelope, events, ledger, publishers, now, live } = opts;
  const parts = chicagoParts(now);
  const slot = SLOT_BY_ID.get(envelope.slot);

  const base = {
    localDate: parts.date,
    localTime: parts.time,
    runAtUtc: now.toISOString(),
    slot: envelope.slot,
    pool: envelope.pool,
  };

  const skeleton: SlotOutcome = {
    ...base,
    subjectId: envelope.subjectId,
    subjectLabel: envelope.subjectLabel,
    angle: envelope.angle,
    score: envelope.score,
    scoreExplain: envelope.scoreExplain,
    topicKey: null,
    deepLink: envelope.deepLink,
    poolSize: 0,
    validator: null,
    dedupe: null,
    usage: null,
    platforms: [],
  };

  const provenance: RecordProvenance | null = envelope.approval
    ? {
        approvalId: envelope.id,
        approvedBy: envelope.approval.approvedBy,
        factsHash: envelope.factsHash,
      }
    : null;

  if (!slot) {
    return finishWith(
      ledger,
      envelope.model,
      skeleton,
      "SKIPPED_VALIDATION_FAILED",
      `Unknown slot "${envelope.slot}"`,
      provenance
    );
  }

  const check = checkApproval({ envelope, events, ledger, now, hashFacts });

  const validator: ValidationResult = {
    ok: check.ok,
    failures: check.failures,
    checked: check.checked,
  };

  if (!check.ok || !check.candidate) {
    return finishWith(
      ledger,
      envelope.model,
      { ...skeleton, validator },
      "SKIPPED_VALIDATION_FAILED",
      check.failures.join("; ") || "Approval did not pass re-checking",
      provenance
    );
  }

  const approvedPlatforms = envelope.approval?.platforms ?? [];
  const outcomes: PlatformOutcome[] = [];

  for (const platform of PLATFORMS) {
    const text = envelope.copy[platform];

    if (!approvedPlatforms.includes(platform)) {
      outcomes.push({
        platform,
        decision: "SKIPPED_NOT_ENABLED",
        reason: `${platform} was not approved in this envelope`,
        text: null,
        externalId: null,
        externalUrl: null,
      });
      continue;
    }

    if (!check.eligible.includes(platform)) {
      outcomes.push({
        platform,
        decision: "SKIPPED_VALIDATION_FAILED",
        reason: check.failures.filter((f) => f.startsWith(`[${platform}]`)).join("; ") ||
          "Failed re-checking at publication time",
        text,
        externalId: null,
        externalUrl: null,
      });
      continue;
    }

    if (!live) {
      outcomes.push({
        platform,
        decision: "DRY_RUN",
        reason: "Approved and re-checked, but publishing is not enabled",
        text,
        externalId: null,
        externalUrl: null,
      });
      continue;
    }

    const publisher = publishers[platform];
    if (!publisher) {
      outcomes.push({
        platform,
        decision: "SKIPPED_CREDENTIAL_EXPIRED",
        reason: `No usable ${platform} credential is configured`,
        text,
        externalId: null,
        externalUrl: null,
      });
      continue;
    }

    const result = await publisher.publish(text);
    outcomes.push({
      platform,
      decision: result.ok
        ? "POSTED"
        : result.credentialProblem
          ? "SKIPPED_CREDENTIAL_EXPIRED"
          : "SKIPPED_PUBLISH_FAILED",
      reason: result.ok ? "Published from approval" : (result.error ?? "Publish failed"),
      text,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
    });
  }

  const outcome: SlotOutcome = {
    ...skeleton,
    poolSize: 1,
    validator,
    dedupe: checkWording(ledger, envelope.copy.x, "x"),
    usage: envelope.usage,
    platforms: outcomes,
  };

  const records = outcomes.map((o) => toRecord(base, outcome, o, envelope.model, null, provenance));
  return { outcome, records, ledger: appendRecords(ledger, records) };
}
