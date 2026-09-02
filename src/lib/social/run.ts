// =============================================================================
// THE RUNNER — one window, end to end
//
// Pure with respect to the outside world: the archive, the ledger, the queue,
// the clock, the engine and the publishers all arrive as arguments. That is
// what lets the simulation and the production script execute exactly the same
// code path, which in turn is what makes the simulation worth reading.
//
// THE ORDER OF THE GATES IS THE COST CONTROL
// ------------------------------------------
// Window, cadence, selection, subject eligibility and cooldowns all run BEFORE
// the copy engine. A run with nothing to say never makes an API call, so the
// quality bar and the budget are the same mechanism. Only wording similarity
// has to run after generation, because wording does not exist until then — and
// even that is skipped when the queue already holds validated copy.
//
// PLATFORMS ARE INDEPENDENT ALL THE WAY DOWN — AND ONLY REAL ONES COUNT
// ----------------------------------------------------------------------
// Eligibility, validation, wording and publication are evaluated per platform.
// One call to the engine produces both variants, but from that point on X's
// outcome never depends on LinkedIn's.
//
// The first design got one thing about this wrong, expensively. It asked
// "is this subject available on ANY platform?" and LinkedIn — never configured,
// so with no history — always answered yes. Seventeen X windows over three
// weeks were spent generating copy for a subject that was on cooldown on X and
// "available" only on a platform that could not post; the ledger recorded them
// as "This subject and angle are not available on x", the engine billed $0.77,
// and the window was consumed while an eligible candidate sat unpicked. Now
// eligibility is evaluated over the platforms this run will actually publish
// to. A platform with no credential cannot make a subject eligible.
// =============================================================================

import { createHash } from "node:crypto";
import type { IndexedEvent } from "@/lib/event-index";
import { candidatesFor } from "./select";
import {
  bannedOpeningLines,
  checkOpeningVariety,
  checkSameDayVariety,
  checkStructureVariety,
  checkSubject,
  checkWording,
} from "./dedupe";
import { applyRotation, buildMemory, type RotationResult } from "./rotation";
import { isRepairable, isRepairableResult, validatePost, type FailureCode } from "./validate";
import { VALIDATOR_VERSION } from "./validate";
import { PROMPT_VERSION } from "./prompt";
import { chicagoParts, SLOT_BY_ID } from "./slots";
import { checkApproval, type ApprovalEnvelope } from "./approval";
import { decideCadence, type CadenceDecision } from "./cadence";
import {
  EMPTY_QUEUE,
  markPublished,
  markReady,
  markRejected,
  markScheduled,
  readyCopy,
  refreshQueue,
  type EditorialQueue,
} from "./queue";
import { EngineConfigurationError } from "./providers/openai";
import {
  appendRecords,
  hasPostedInSlot,
  recentOpenings,
  recentStructures,
  type PostLedger,
  type PostRecord,
} from "./ledger";
import type { Publisher } from "./platforms/types";
import type { Structure } from "./content-types";
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

/**
 * One repair, never a loop. Two strikes and the window stays silent.
 *
 * The second attempt is a REPAIR rather than a regeneration, and it is only
 * spent when the first attempt failed for mechanical reasons — see
 * isRepairableResult(). A post whose figures are ungrounded or which describes
 * a proposal as law does not get a second call: asking a model to re-say
 * something so that it passes a trust check is asking it to negotiate with the
 * trust layer, and the honest outcome is silence.
 */
export const MAX_GENERATION_ATTEMPTS = 2;

/**
 * The publishing switch, as an exact string match and nothing looser.
 *
 * "TRUE", "1", "yes" and an accidental " true" all mean disabled, because every
 * one of those is more likely to be a mistake than an intention.
 */
export function isPublishingEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.SOCIAL_POST_ENABLED === "true";
}

/** How many recent openings are shown to the engine as a variety nudge. */
const OPENINGS_SHOWN = 12;

/** How many recent shapes are shown to the engine. */
const STRUCTURES_SHOWN = 6;

export interface RunOptions {
  slot: SlotDef;
  events: IndexedEvent[];
  ledger: PostLedger;
  engine: CopyEngine;
  /** Absent for a platform means "not configured" — that platform skips. */
  publishers: Partial<Record<Platform, Publisher>>;
  /** The instant this run represents. Everything date-derived comes from here. */
  now: Date;
  /** False (the default) means generate and validate everything, publish nothing. */
  live: boolean;
  /**
   * The editorial queue, when the caller keeps one. Optional so a test that
   * only cares about one gate does not have to construct it; a run without a
   * queue behaves as the first design did, generating fresh copy every time.
   */
  queue?: EditorialQueue;
  /**
   * The platforms a DRY RUN evaluates. Live runs derive this from the
   * configured publishers; a dry run has none, so it would otherwise evaluate
   * both platforms and let LinkedIn's empty history make a subject eligible
   * that X could not post — the exact ghost the live path no longer has. The
   * simulator passes ["x"], which is what production is.
   */
  platforms?: Platform[];
}

export interface RunResult {
  outcome: SlotOutcome;
  records: PostRecord[];
  ledger: PostLedger;
  /** The queue after this run. Unchanged when none was supplied. */
  queue: EditorialQueue;
}

/** A zero-cost usage row for copy that came from the queue rather than a call. */
function storedUsage(model: string): EngineUsage {
  return { model, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningTokens: 0, totalTokens: 0, costUsd: 0 };
}

export async function runSlot(opts: RunOptions): Promise<RunResult> {
  const { slot, events, ledger, engine, publishers, now, live } = opts;
  const parts = chicagoParts(now);
  const today = parts.date;
  let queue = opts.queue ?? EMPTY_QUEUE;

  const base = {
    localDate: today,
    localTime: parts.time,
    runAtUtc: now.toISOString(),
    slot: slot.id,
    pool: slot.pool,
  };

  // ---- the platforms this run can actually publish to ------------------------
  //
  // In a dry run every platform is exercised, so copy for both is generated and
  // validated. Live, only a platform with a credential counts — see the header.
  const targets: Platform[] = live
    ? PLATFORMS.filter((p) => Boolean(publishers[p]))
    : (opts.platforms?.filter((p) => PLATFORMS.includes(p)) ?? PLATFORMS);
  if (targets.length === 0) {
    return finish(opts, queue, emptyOutcome(base, slot, 0), "SKIPPED_CREDENTIAL_EXPIRED",
      "No platform has a usable credential configured; nothing can publish.");
  }

  // ---- gate 0: has this window already published today? ---------------------
  //
  // First, and before selection, so a re-run of an already-successful workflow
  // costs nothing and can publish nothing. With hourly crons this is also what
  // makes a window safe: two firings inside the same window produce one post.
  const alreadyPosted = targets.filter((p) => hasPostedInSlot(ledger, today, slot.id, p));
  if (alreadyPosted.length === targets.length) {
    return finish(
      opts,
      queue,
      emptyOutcome(base, slot, 0),
      "SKIPPED_DUPLICATE",
      `The ${slot.id} window already published on ${alreadyPosted.join(" and ")} for ${today}. ` +
        `This is a later firing in the same window; nothing further will be posted.`
    );
  }

  // ---- gate 0.5: the cadence policy ------------------------------------------
  const reference: Platform = targets.includes("x") ? "x" : targets[0];
  const cadence = decideCadence({ ledger, platform: reference, slot, localDate: today, now });
  if (cadence.blocked) {
    return finish(opts, queue, { ...emptyOutcome(base, slot, 0), cadenceExplain: cadence.explain }, "SKIPPED_CADENCE", cadence.explain);
  }

  // ---- gate 1: is there anything at all? ------------------------------------
  const candidates = candidatesFor(events, today);
  if (opts.queue) queue = refreshQueue(queue, candidates, now, today, hashFacts).queue;

  if (candidates.length === 0) {
    return finish(
      opts,
      queue,
      { ...emptyOutcome(base, slot, 0), cadenceExplain: cadence.explain },
      "SKIPPED_NO_QUALIFYING_CONTENT",
      `No candidate cleared the quality bar for ${today}`
    );
  }

  const inTier = candidates.filter((c) => cadence.allowedTiers.includes(c.tier));
  if (inTier.length === 0) {
    // The queue remembers what the morning could not take: the best evergreen
    // candidate is marked for the afternoon, so a reader of the queue can see
    // why the window was quiet and what will fill the day.
    const deferred = candidates.find((c) => c.tier === "evergreen");
    if (opts.queue && deferred && slot.id === "morning") {
      queue = markScheduled(queue, deferred, "afternoon", "morning is news-only; evergreen waits for the afternoon", now);
    }
    return finish(
      opts,
      queue,
      { ...emptyOutcome(base, slot, candidates.length), cadenceExplain: cadence.explain },
      "SKIPPED_CADENCE",
      `${candidates.length} candidate(s) considered, none in a tier this window may publish. ${cadence.explain}`
    );
  }

  // ---- gate 2: subject eligibility, per TARGET platform ----------------------
  const chosen = chooseCandidate(inTier, ledger, now, today, targets, reference);
  if (!chosen) {
    const why = firstRejection(inTier, ledger, now, reference);
    return finish(
      opts,
      queue,
      { ...emptyOutcome(base, slot, candidates.length), cadenceExplain: cadence.explain },
      why.includes("cooldown") ? "SKIPPED_COOLDOWN" : "SKIPPED_DUPLICATE",
      why
    );
  }

  const { candidate, angle } = chosen;
  const eligible = chosen.eligible.filter((p) => !alreadyPosted.includes(p));
  const fh = factsHash(candidate);
  const recent = recentStructures(ledger, reference, STRUCTURES_SHOWN) as Structure[];

  const partial = (extra: Partial<SlotOutcome> = {}): SlotOutcome => ({
    ...emptyOutcome(base, slot, candidates.length),
    subjectId: candidate.subjectId,
    subjectLabel: candidate.label,
    angle,
    contentType: candidate.contentType,
    tier: candidate.tier,
    storyKey: candidate.storyKey,
    shareUrl: candidate.facts.shareUrl ?? candidate.facts.deepLink,
    score: candidate.score,
    scoreExplain: candidate.scoreExplain,
    readerValue: candidate.readerValue.score,
    readerValueExplain: candidate.readerValue.reason,
    treatment: candidate.treatment,
    topicKey: candidate.topicKey,
    topicFamily: candidate.topicFamily,
    category: candidate.category,
    adjustedScore: chosen.rotation.adjustedScore,
    rotationExplain: chosen.rotation.explain,
    cadenceExplain: cadence.explain,
    deepLink: candidate.deepLink,
    ...extra,
  });

  // ---- gate 3: copy — from the queue if it is there, else generated ---------
  let copy: GeneratedCopy | null = null;
  let usage: EngineUsage | null = null;
  let validation: Record<Platform, ValidationResult> | null = null;
  let feedback: string[] = [];
  let previousCopy: { x: string; linkedin: string } | undefined;
  const attempts: EngineAttempt[] = [];

  // Only the platforms we would actually publish to have to pass.
  const relevant = eligible.filter((p) => publishers[p] || !live);

  const stored = opts.queue ? readyCopy(queue, candidate, fh) : null;
  if (stored) {
    const storedCopy: GeneratedCopy = {
      x: stored.x,
      linkedin: stored.linkedin,
      deepLink: candidate.facts.deepLink,
      structure: stored.structure ?? undefined,
    };
    const v = validateBothFor(storedCopy, candidate);
    const problems = problemsFor(storedCopy, v, relevant, ledger, candidate);
    if (problems.all.length === 0) {
      copy = storedCopy;
      usage = storedUsage("queue:ready");
      validation = v;
    }
    // A stored copy that no longer passes is simply regenerated below — its
    // facts hash matched, so the fault is in the history around it (a shape
    // used twice since, an opening that became over-used), not in the facts.
  }

  for (let attempt = 1; !copy && attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    let generated;
    const startedAt = Date.now();
    try {
      generated = await engine.generate({
        facts: candidate.facts,
        slot,
        angle,
        contentType: candidate.contentType,
        structures: candidate.structures,
        recentStructures: recent,
        treatment: candidate.treatment,
        readerValue: candidate.readerValue,
        avoidOpenings: recentOpenings(ledger, reference, OPENINGS_SHOWN),
        bannedOpenings: bannedOpeningLines(ledger, relevant.length ? relevant : targets),
        validatorFeedback: attempt > 1 ? feedback : undefined,
        previousCopy: attempt > 1 ? previousCopy : undefined,
      });
    } catch (err) {
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
        queue,
        partial({ attempts }),
        err instanceof EngineConfigurationError ? "SKIPPED_ENGINE_MISCONFIGURED" : "SKIPPED_ENGINE_UNAVAILABLE",
        err instanceof EngineConfigurationError
          ? `Copy engine misconfigured: ${err.message}`
          : `Copy engine failed: ${(err as Error).message}`
      );
    }

    const v = validateBothFor(generated.copy, candidate);
    const problems = problemsFor(generated.copy, v, relevant, ledger, candidate);

    attempts.push({
      slot: slot.id,
      attempt,
      model: generated.usage.model,
      ok: problems.all.length === 0,
      error: null,
      durationMs: Date.now() - startedAt,
      inputTokens: generated.usage.inputTokens,
      cachedInputTokens: generated.usage.cachedInputTokens,
      outputTokens: generated.usage.outputTokens,
      reasoningTokens: generated.usage.reasoningTokens,
      totalTokens: generated.usage.totalTokens,
      costUsd: generated.usage.costUsd,
      validation: problems.all.length === 0 ? "pass" : problems.all.join("; ").slice(0, 400),
    });

    if (problems.all.length === 0) {
      copy = generated.copy;
      usage = generated.usage;
      validation = v;
      break;
    }

    feedback = problems.all;

    // ---- is a repair justified? -----------------------------------------------
    //
    // Only when EVERY failing platform failed for mechanical reasons. One
    // semantic failure means the post says something it should not, and making
    // it shorter would not make that untrue. A stale opening or a stale shape
    // is mechanical by construction: the facts are right and the frame is wrong.
    const repairable = problems.failing.every((p) => isRepairableResult(v[p]));
    if (!repairable) {
      const semantic = problems.failing.flatMap((p) =>
        v[p].codes.filter((c) => !isRepairable(c as FailureCode)).map((c) => `[${p}] ${c}`)
      );
      if (opts.queue) queue = markRejected(queue, candidate, `validation: ${semantic.join(", ")}`, now);
      return finish(
        opts,
        queue,
        partial({ validator: mergeValidation(v, relevant), usage: generated.usage, attempts }),
        "SKIPPED_VALIDATION_FAILED",
        `Not repairable (${semantic.join(", ")}) — ${feedback.join("; ")}`
      );
    }

    previousCopy = { x: generated.copy.x, linkedin: generated.copy.linkedin };

    if (attempt === MAX_GENERATION_ATTEMPTS) {
      const onlyVariety = problems.failing.length === 0;
      return finish(
        opts,
        queue,
        partial({ validator: mergeValidation(v, relevant), usage: generated.usage, attempts }),
        // A run that only ever failed on WORDING is a duplicate, not a
        // validation failure: a SKIPPED_VALIDATION_FAILED row stands the
        // treatment down for days, which is right for copy the validator will
        // reject again and wrong for a frame the model happened to repeat.
        onlyVariety ? "SKIPPED_DUPLICATE" : "SKIPPED_VALIDATION_FAILED",
        feedback.join("; ")
      );
    }
  }

  if (!copy || !usage || !validation) {
    return finish(opts, queue, partial({ attempts }), "SKIPPED_ENGINE_UNAVAILABLE", "Copy engine produced nothing");
  }

  const structure = copy.structure ?? null;
  if (opts.queue) queue = markReady(queue, candidate, copy, fh, now);

  // ---- gate 5: wording, then publish, per platform ---------------------------
  const outcomes: PlatformOutcome[] = [];
  let dedupeResult = null;

  for (const platform of PLATFORMS) {
    const text = copy[platform];

    if (!targets.includes(platform)) {
      outcomes.push(skip(platform, "SKIPPED_CREDENTIAL_EXPIRED", `No usable ${platform} credential is configured`, text));
      continue;
    }

    if (!eligible.includes(platform)) {
      outcomes.push(
        skip(
          platform,
          "SKIPPED_DUPLICATE",
          alreadyPosted.includes(platform)
            ? `${platform} already published in the ${slot.id} window today — later firing, not re-posted`
            : `This subject and treatment are not available on ${platform}`,
          null
        )
      );
      continue;
    }

    if (!validation[platform].ok) {
      outcomes.push(skip(platform, "SKIPPED_VALIDATION_FAILED", validation[platform].failures.join("; "), text));
      continue;
    }

    const wording = checkWording(ledger, text, platform);
    if (platform === reference) dedupeResult = wording;
    if (!wording.ok) {
      outcomes.push(skip(platform, "SKIPPED_DUPLICATE", wording.reason, text));
      continue;
    }

    if (!live) {
      outcomes.push(skip(platform, "DRY_RUN", "Dry run — validated and withheld", text));
      continue;
    }

    const publisher = publishers[platform];
    if (!publisher) {
      outcomes.push(skip(platform, "SKIPPED_CREDENTIAL_EXPIRED", `No usable ${platform} credential is configured`, text));
      continue;
    }

    const result = await publisher.publish(text);
    outcomes.push({
      platform,
      decision: result.ok ? "POSTED" : result.credentialProblem ? "SKIPPED_CREDENTIAL_EXPIRED" : "SKIPPED_PUBLISH_FAILED",
      reason: result.ok ? "Published" : (result.error ?? "Publish failed"),
      text,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
    });
    if (result.ok && opts.queue) {
      queue = markPublished(queue, candidate, { platform, externalUrl: result.externalUrl }, now);
    }
  }

  const outcome: SlotOutcome = partial({
    structure,
    validator: mergeValidation(validation, eligible),
    dedupe: dedupeResult,
    usage,
    attempts,
    platforms: outcomes,
  });

  const records = outcomes.map((o) => toRecord(base, outcome, o, engine.id, candidate, null));
  return { outcome, records, ledger: appendRecords(ledger, records), queue };
}

// -----------------------------------------------------------------------------
// COPY PROBLEMS — validation plus the two variety checks, in one place
// -----------------------------------------------------------------------------

function validateBothFor(copy: GeneratedCopy, candidate: Candidate): Record<Platform, ValidationResult> {
  return {
    x: validatePost(copy.x, "x", candidate.facts),
    linkedin: validatePost(copy.linkedin, "linkedin", candidate.facts),
  };
}

/**
 * Everything wrong with a piece of copy, on the platforms that matter.
 *
 * `failing` lists platforms whose VALIDATOR failed — the ones whose codes decide
 * whether a repair is justified. `all` adds the variety failures, which are
 * mechanical by construction and never on their own make a repair unjustified.
 */
function problemsFor(
  copy: GeneratedCopy,
  validation: Record<Platform, ValidationResult>,
  relevant: Platform[],
  ledger: PostLedger,
  candidate: Candidate
): { failing: Platform[]; all: string[] } {
  const failing = relevant.filter((p) => !validation[p].ok);
  const all = failing.flatMap((p) => validation[p].failures.map((f) => `[${p}] ${f}`));

  if (copy.structure && !candidate.structures.includes(copy.structure as Structure)) {
    all.push(
      `[both] Structure "${copy.structure}" is not one of the shapes on offer (${candidate.structures.join(", ")}). Report one of those.`
    );
  }

  for (const p of relevant) {
    const opening = checkOpeningVariety(ledger, copy[p], p);
    if (!opening.ok) all.push(`[${p}] ${opening.reason}`);
    const shape = checkStructureVariety(ledger, copy.structure, p);
    if (!shape.ok) all.push(`[${p}] ${shape.reason}`);
  }

  return { failing, all };
}

function skip(platform: Platform, decision: PlatformOutcome["decision"], reason: string, text: string | null): PlatformOutcome {
  return { platform, decision, reason, text, externalId: null, externalUrl: null };
}

// -----------------------------------------------------------------------------
// SELECTION AMONG CANDIDATES
// -----------------------------------------------------------------------------

interface Chosen {
  candidate: Candidate;
  angle: Angle;
  /** Platforms this subject and treatment may run on today. */
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
 * The best candidate that PRESERVES FEED DIVERSITY, with its treatment open on
 * at least one platform this run will publish to.
 *
 * Every candidate is re-ranked on `base score − repetition penalties` (see
 * rotation.ts) before the availability gates run. Penalties rather than
 * filters, so a genuinely major development can still outrank freshness.
 */
function chooseCandidate(
  candidates: Candidate[],
  ledger: PostLedger,
  now: Date,
  localDate: string,
  targets: Platform[],
  reference: Platform,
  rejections?: RotationRejection[]
): Chosen | null {
  const memories = new Map(targets.map((p) => [p, buildMemory(ledger, p, now, localDate)] as const));

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      rotation: applyRotation(
        {
          subjectId: candidate.subjectId,
          topicFamily: candidate.topicFamily,
          category: candidate.category,
          contentType: candidate.contentType,
          tier: candidate.tier,
          deepLink: candidate.deepLink,
          angle: candidate.supportedAngles[0],
          baseScore: candidate.score,
          hasNewInformation: candidate.hasNewInformation,
        },
        memories.get(reference)!
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
    const angle = candidate.supportedAngles[0];
    const eligible: Platform[] = [];

    for (const platform of targets) {
      if (!checkSameDayVariety(ledger, candidate.topicKey, localDate, platform).ok) continue;
      const check = checkSubject(
        ledger,
        candidate.subjectId,
        [angle],
        platform,
        candidate.deepLink,
        now,
        candidate.pool
      );
      if (check.ok && check.availableAngles.includes(angle)) eligible.push(platform);
    }

    if (eligible.length === 0) {
      rejections?.push({
        subjectId: candidate.subjectId,
        label: candidate.label,
        topicFamily: candidate.topicFamily,
        baseScore: candidate.score,
        reason: "same-day variety or subject/URL cooldown",
      });
      continue;
    }

    return { candidate, angle, eligible, rotation };
  }
  return null;
}

/**
 * Rank without running the pipeline. Used by the simulator and the rotation
 * report to say what the rotation layer did and what it turned away.
 */
export function explainRotation(
  candidates: Candidate[],
  ledger: PostLedger,
  now: Date,
  localDate: string,
  targets: Platform[] = PLATFORMS
): { chosen: Chosen | null; rejections: RotationRejection[] } {
  const rejections: RotationRejection[] = [];
  const reference: Platform = targets.includes("x") ? "x" : targets[0];
  const chosen = chooseCandidate(candidates, ledger, now, localDate, targets, reference, rejections);
  return { chosen, rejections };
}

/** One candidate's standing, after the rotation penalties. */
export interface RankedCandidate {
  candidate: Candidate;
  rotation: RotationResult;
}

/**
 * The whole field, ranked, plus the winner — for a preview that has to say what
 * LOST and why.
 */
export function explainSelection(
  candidates: Candidate[],
  ledger: PostLedger,
  now: Date,
  localDate: string,
  targets: Platform[] = PLATFORMS
): { chosen: Chosen | null; ranked: RankedCandidate[]; rejections: RotationRejection[]; cadence: CadenceDecision | null } {
  const { chosen, rejections } = explainRotation(candidates, ledger, now, localDate, targets);
  const reference: Platform = targets.includes("x") ? "x" : targets[0];
  const memory = buildMemory(ledger, reference, now, localDate);
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      rotation: applyRotation(
        {
          subjectId: candidate.subjectId,
          topicFamily: candidate.topicFamily,
          category: candidate.category,
          contentType: candidate.contentType,
          tier: candidate.tier,
          deepLink: candidate.deepLink,
          angle: candidate.supportedAngles[0],
          baseScore: candidate.score,
          hasNewInformation: candidate.hasNewInformation,
        },
        memory
      ),
    }))
    .sort(
      (a, b) =>
        b.rotation.adjustedScore - a.rotation.adjustedScore ||
        a.candidate.subjectId.localeCompare(b.candidate.subjectId)
    );
  return { chosen, ranked, rejections, cadence: null };
}

/**
 * Why nothing was chosen, in one line a person can act on.
 *
 * Reports the rotation layer's own rejections first — a subject inside its
 * seven-day block, a stale subject with nothing new — and only then the
 * cooldown checks, because the first design reported only the cooldown check
 * on the top-scoring candidate and once printed "eligible" as the reason a
 * window stayed silent.
 */
function firstRejection(candidates: Candidate[], ledger: PostLedger, now: Date, platform: Platform): string {
  const top = candidates[0];
  const localDate = chicagoParts(now).date;
  const { rejections } = explainRotation(candidates, ledger, now, localDate, [platform]);
  const shown = rejections.slice(0, 3).map((r) => `"${r.label.slice(0, 50)}": ${r.reason}`);
  if (shown.length) {
    return `${candidates.length} candidate(s) considered; none available on ${platform}. ${shown.join(" · ")}`;
  }
  const check = checkSubject(ledger, top.subjectId, top.supportedAngles, platform, top.deepLink, now, top.pool);
  return `${candidates.length} candidate(s) considered; none available on ${platform}. Top candidate "${top.label}": ${check.reason}`;
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
    contentType: null,
    tier: null,
    structure: null,
    storyKey: null,
    shareUrl: null,
    score: null,
    scoreExplain: null,
    topicKey: null,
    topicFamily: null,
    category: null,
    readerValue: null,
    readerValueExplain: null,
    treatment: null,
    adjustedScore: null,
    rotationExplain: null,
    deepLink: null,
    poolSize,
    cadenceExplain: null,
    validator: null,
    dedupe: null,
    usage: null,
    attempts: [],
    platforms: [],
  };
}

function mergeValidation(validation: Record<Platform, ValidationResult>, relevant: Platform[]): ValidationResult {
  const failures = relevant.flatMap((p) => validation[p].failures.map((f) => `[${p}] ${f}`));
  const codes = relevant.flatMap((p) => validation[p].codes);
  const checked = [...new Set(relevant.flatMap((p) => validation[p].checked))];
  return { ok: failures.length === 0, failures, codes, checked };
}

/** A skip: same record shape, written for every platform, so nothing is invisible. */
function finish(
  opts: RunOptions,
  queue: EditorialQueue,
  outcome: SlotOutcome,
  decision: PostRecord["decision"],
  reason: string
): RunResult {
  return finishWith(opts.ledger, queue, opts.engine.id, outcome, decision, reason, null);
}

/** The shared skip path, engine-agnostic so the approved path can use it too. */
function finishWith(
  ledger: PostLedger,
  queue: EditorialQueue,
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
  return { outcome: full, records, ledger: appendRecords(ledger, records), queue };
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
    category: outcome.category,
    readerValue: outcome.readerValue,
    readerValueExplain: outcome.readerValueExplain,
    treatment: outcome.treatment,
    contentType: outcome.contentType,
    tier: outcome.tier,
    structure: outcome.structure,
    storyKey: outcome.storyKey,
    shareUrl: outcome.shareUrl,
    cadenceExplain: outcome.cadenceExplain,
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

/** The same hash, over a bare fact set. Used by the approval gate and the queue. */
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
  queue?: EditorialQueue;
}

/**
 * Publish the exact text a human approved, or publish nothing.
 *
 * NOTE THE SIGNATURE: there is no CopyEngine. Generation is not merely skipped
 * on this path, it is unreachable — nothing here can call a model, so the text
 * that ships is necessarily the text that was read.
 */
export async function runApproved(opts: RunApprovedOptions): Promise<RunResult> {
  const { envelope, events, ledger, publishers, now, live } = opts;
  const queue = opts.queue ?? EMPTY_QUEUE;
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
    contentType: envelope.contentType ?? null,
    tier: null,
    structure: envelope.copy.structure ?? null,
    storyKey: null,
    shareUrl: null,
    score: envelope.score,
    scoreExplain: envelope.scoreExplain,
    topicKey: null,
    topicFamily: null,
    category: null,
    readerValue: null,
    readerValueExplain: null,
    treatment: null,
    adjustedScore: null,
    rotationExplain: null,
    deepLink: envelope.deepLink,
    poolSize: 0,
    cadenceExplain: null,
    validator: null,
    dedupe: null,
    usage: null,
    attempts: [],
    platforms: [],
  };

  const provenance: RecordProvenance | null = envelope.approval
    ? { approvalId: envelope.id, approvedBy: envelope.approval.approvedBy, factsHash: envelope.factsHash }
    : null;

  if (!slot) {
    return finishWith(ledger, queue, envelope.model, skeleton, "SKIPPED_VALIDATION_FAILED", `Unknown slot "${envelope.slot}"`, provenance);
  }

  const check = checkApproval({ envelope, events, ledger, now, hashFacts });

  const validator: ValidationResult = { ok: check.ok, failures: check.failures, codes: [], checked: check.checked };

  if (!check.ok || !check.candidate) {
    return finishWith(
      ledger,
      queue,
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
      outcomes.push(skip(platform, "SKIPPED_NOT_ENABLED", `${platform} was not approved in this envelope`, null));
      continue;
    }
    if (!check.eligible.includes(platform)) {
      outcomes.push(
        skip(
          platform,
          "SKIPPED_VALIDATION_FAILED",
          check.failures.filter((f) => f.startsWith(`[${platform}]`)).join("; ") || "Failed re-checking at publication time",
          text
        )
      );
      continue;
    }
    if (!live) {
      outcomes.push(skip(platform, "DRY_RUN", "Approved and re-checked, but publishing is not enabled", text));
      continue;
    }
    const publisher = publishers[platform];
    if (!publisher) {
      outcomes.push(skip(platform, "SKIPPED_CREDENTIAL_EXPIRED", `No usable ${platform} credential is configured`, text));
      continue;
    }
    const result = await publisher.publish(text);
    outcomes.push({
      platform,
      decision: result.ok ? "POSTED" : result.credentialProblem ? "SKIPPED_CREDENTIAL_EXPIRED" : "SKIPPED_PUBLISH_FAILED",
      reason: result.ok ? "Published from approval" : (result.error ?? "Publish failed"),
      text,
      externalId: result.externalId,
      externalUrl: result.externalUrl,
    });
  }

  const candidate = check.candidate;
  const outcome: SlotOutcome = {
    ...skeleton,
    contentType: candidate.contentType,
    tier: candidate.tier,
    storyKey: candidate.storyKey,
    shareUrl: candidate.facts.shareUrl ?? candidate.facts.deepLink,
    topicKey: candidate.topicKey,
    topicFamily: candidate.topicFamily,
    category: candidate.category,
    readerValue: candidate.readerValue.score,
    readerValueExplain: candidate.readerValue.reason,
    treatment: candidate.treatment,
    poolSize: 1,
    validator,
    dedupe: checkWording(ledger, envelope.copy.x, "x"),
    usage: envelope.usage,
    attempts: [],
    platforms: outcomes,
  };

  const records = outcomes.map((o) => toRecord(base, outcome, o, envelope.model, null, provenance));
  return { outcome, records, ledger: appendRecords(ledger, records), queue };
}
