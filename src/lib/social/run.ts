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
import { applyRotation, buildMemory, type RotationResult } from "./rotation";
import { validatePost } from "./validate";
import { VALIDATOR_VERSION } from "./validate";
import { PROMPT_VERSION } from "./prompt";
import { chicagoParts, SLOT_BY_ID } from "./slots";
import { checkApproval, type ApprovalEnvelope } from "./approval";
import { EngineConfigurationError } from "./providers/openai";
import { appendRecords, recentOpenings, type PostLedger, type PostRecord } from "./ledger";
import type { Publisher } from "./platforms/types";
import type {
  Angle,
  Candidate,
  CopyEngine,
  EngineAttempt,
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

  // EVERY attempt, kept. A regeneration bills a second time, and the previous
  // code overwrote `usage` — so a slot that retried spent twice and reported
  // once. Spend you cannot see is spend you cannot control.
  const attempts: EngineAttempt[] = [];

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    let generated;
    const startedAt = Date.now();
    try {
      generated = await engine.generate({
        facts: candidate.facts,
        slot,
        angle,
        avoidOpenings: recentOpenings(ledger, "x", OPENINGS_SHOWN),
        validatorFeedback: attempt > 1 ? feedback : undefined,
      });
    } catch (err) {
      // A failed call is still a call, and an exhausted token budget is still
      // billed — EngineConfigurationError carries the usage so the real spend
      // survives the exception.
      const billed = err instanceof EngineConfigurationError ? err.usage : null;
      attempts.push({
        slot: slot.id,
        attempt,
        model: billed?.model ?? engine.id,
        ok: false,
        error: (err as Error).message.slice(0, 400),
        durationMs: Date.now() - startedAt,
        inputTokens: billed?.inputTokens ?? 0,
        cachedInputTokens: billed?.cachedInputTokens ?? 0,
        outputTokens: billed?.outputTokens ?? 0,
        reasoningTokens: billed?.reasoningTokens ?? 0,
        totalTokens: billed?.totalTokens ?? null,
        costUsd: billed?.costUsd ?? 0,
        validation: null,
      });
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
          attempts,
        },
        // A misconfiguration is not an outage. Recording both as
        // ENGINE_UNAVAILABLE is how a token cap that burns a billed reasoning
        // pass every slot hides inside what looks like transient flakiness.
        err instanceof EngineConfigurationError
          ? "SKIPPED_ENGINE_MISCONFIGURED"
          : "SKIPPED_ENGINE_UNAVAILABLE",
        err instanceof EngineConfigurationError
          ? `Copy engine misconfigured: ${err.message}`
          : `Copy engine failed: ${(err as Error).message}`
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

    attempts.push({
      slot: slot.id,
      attempt,
      model: generated.usage.model,
      ok: failing.length === 0,
      error: null,
      durationMs: Date.now() - startedAt,
      inputTokens: generated.usage.inputTokens,
      cachedInputTokens: generated.usage.cachedInputTokens,
      outputTokens: generated.usage.outputTokens,
      reasoningTokens: generated.usage.reasoningTokens,
      totalTokens: generated.usage.totalTokens,
      costUsd: generated.usage.costUsd,
      validation:
        failing.length === 0
          ? "pass"
          : failing.flatMap((p) => validation![p].failures.map((f) => `[${p}] ${f}`)).join("; ").slice(0, 400),
    });

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
          attempts,
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
    topicFamily: candidate.topicFamily,
    adjustedScore: chosen.rotation.adjustedScore,
    rotationExplain: chosen.rotation.explain,
    deepLink: candidate.deepLink,
    validator: mergeValidation(validation, eligible),
    dedupe: dedupeResult,
    // `usage` stays the winning attempt, for backward compatibility with the
    // ledger's per-post columns. `attempts` is the truth about spend.
    usage,
    attempts,
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
  /** Why this one won: base score, penalties applied, adjusted total. */
  rotation: RotationResult;
}

/** A candidate rejected before it could compete, and the reason. */
export interface RotationRejection {
  subjectId: string;
  label: string;
  topicFamily: string;
  baseScore: number;
  reason: string;
}

/**
 * The best candidate that PRESERVES FEED DIVERSITY, with the best angle open.
 *
 * The rule used to be "highest score, walking down the list until one is
 * available". That is a machine for repetition: an evergreen scores the same
 * every day, so it wins every day, and dedupe only stopped the same
 * subject×angle pair — not the same subject with a fresh angle, and not the same
 * topic wearing a different subject id.
 *
 * Now every candidate is re-ranked on `base score − repetition penalties` (see
 * rotation.ts) before the availability gates run. Penalties rather than filters,
 * so a genuinely major development can still outrank freshness — which is
 * correct, and is the "unless there is genuinely important new information"
 * escape hatch expressed as arithmetic rather than a special case.
 */
function chooseCandidate(
  candidates: Candidate[],
  ledger: PostLedger,
  now: Date,
  localDate: string,
  rejections?: RotationRejection[]
): Chosen | null {
  // One memory per platform, built once rather than per candidate.
  const memories = new Map(
    PLATFORMS.map((p) => [p, buildMemory(ledger, p, now, localDate)] as const)
  );

  // Rank on X's memory: it is the platform that publishes today, and ranking
  // per-platform would let the two feeds diverge into different stories.
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      rotation: applyRotation(
        {
          subjectId: candidate.subjectId,
          topicFamily: candidate.topicFamily,
          deepLink: candidate.deepLink,
          angle: candidate.supportedAngles[0],
          baseScore: candidate.score,
          hasNewInformation: candidate.hasNewInformation,
        },
        memories.get("x")!
      ),
    }))
    .filter((r) => {
      if (r.rotation.eligible) return true;
      rejections?.push({
        subjectId: r.candidate.subjectId,
        label: r.candidate.label,
        topicFamily: r.candidate.topicFamily,
        baseScore: r.candidate.score,
        reason: r.rotation.blockedBy ?? "rotation",
      });
      return false;
    })
    .sort(
      (a, b) =>
        b.rotation.adjustedScore - a.rotation.adjustedScore ||
        a.candidate.subjectId.localeCompare(b.candidate.subjectId)
    );

  for (const { candidate, rotation } of ranked) {
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

    if (perPlatform.size === 0) {
      rejections?.push({
        subjectId: candidate.subjectId,
        label: candidate.label,
        topicFamily: candidate.topicFamily,
        baseScore: candidate.score,
        reason: "same-day variety or subject/URL cooldown",
      });
      continue;
    }

    // Prefer an angle open on the most platforms; ties break on the candidate's
    // own preference order, which select.ts already sorted by how well the data
    // supports each treatment.
    for (const angle of candidate.supportedAngles) {
      const eligible = PLATFORMS.filter((p) => perPlatform.get(p)?.includes(angle));
      if (eligible.length > 0) return { candidate, angle, eligible, rotation };
    }
  }
  return null;
}

/**
 * Rank without running the pipeline. Used by the simulator to report what the
 * rotation layer did and, crucially, what it turned away.
 */
export function explainRotation(
  candidates: Candidate[],
  ledger: PostLedger,
  now: Date,
  localDate: string
): { chosen: Chosen | null; rejections: RotationRejection[] } {
  const rejections: RotationRejection[] = [];
  const chosen = chooseCandidate(candidates, ledger, now, localDate, rejections);
  return { chosen, rejections };
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
    topicFamily: null,
    adjustedScore: null,
    rotationExplain: null,
    deepLink: null,
    poolSize,
    validator: null,
    dedupe: null,
    usage: null,
    attempts: [],
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
    topicFamily: outcome.topicFamily,
    adjustedScore: outcome.adjustedScore,
    rotationExplain: outcome.rotationExplain,
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
    attempts: outcome.attempts.length ? outcome.attempts : null,
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
    topicFamily: null,
    adjustedScore: null,
    rotationExplain: null,
    deepLink: envelope.deepLink,
    poolSize: 0,
    validator: null,
    dedupe: null,
    usage: null,
    attempts: [],
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
    // The approved path makes no API call — the copy was generated when the
    // envelope was proposed, and billed then.
    attempts: [],
    platforms: outcomes,
  };

  const records = outcomes.map((o) => toRecord(base, outcome, o, envelope.model, null, provenance));
  return { outcome, records, ledger: appendRecords(ledger, records) };
}
