// =============================================================================
// SOCIAL — the shared contract
//
// The governing rule for this whole domain, from which everything else follows:
//
//   ImmigrationClock never posts because the clock says it is time to post. It
//   posts because it has something useful, factual, timely or genuinely
//   interesting to tell someone. The schedule creates opportunities; the
//   content earns publication.
//
// Read structurally, that means the pipeline is a series of gates, each of
// which can end the slot, and only the last one publishes:
//
//   window → pool → candidate → score → angle → dedupe → LLM → validate → post
//
// Every gate's refusal is a first-class, named outcome (see SkipReason), not an
// error and not a silent return. A slot that produces nothing is the system
// working.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import type { VisualSpec } from "./visuals";
import type { TopicFamily } from "./rotation";
import type { ContentCategory } from "./categories";

// -----------------------------------------------------------------------------
// SLOTS
// -----------------------------------------------------------------------------

/**
 * Three slots a day, each drawing on a DIFFERENT pool.
 *
 * This is the load-bearing decision of the whole design. The archive yields
 * roughly six qualifying official developments in a week; three news posts a
 * day would need twenty-one. A design where every slot competes for the same
 * news pool must either skip almost everything or repeat itself within days.
 *
 * So the slots are not three chances at the same job. They are three different
 * jobs, and only the first one is news.
 */
export type SlotId = "morning" | "afternoon" | "evening";

export interface SlotDef {
  id: SlotId;
  /** Local hour in America/Chicago. The workflow gates on this. */
  hour: number;
  /** What this slot is FOR. Shown to the copy engine verbatim. */
  purpose: string;
  /** Which pool supplies its candidates. Recorded in the ledger as the slot's identity. */
  pool: PoolId;
  /**
   * Pools this slot may ALSO draw on when they carry something material.
   *
   * The original design gave each slot one pool and no overlap, on the reasoning
   * that three slots competing for one thin news pool would either skip
   * everything or repeat itself. That reasoning is still right about the MORNING
   * slot's job, and it had one consequence nobody intended: a qualifying
   * immigration development could never win the afternoon or evening slot, at
   * any score, because it was not in the pool at all. A methodology page beat
   * fourteen other pages on a rotation index while real developments sat in an
   * archive the slot could not see.
   *
   * So the later slots keep their own pool as their PRIMARY job and may reach
   * for news when news exists. The dedupe layer is what makes this safe rather
   * than repetitive: a subject that published this morning is inside its 7-day
   * block by the evening, and same-day topic variety blocks the rest.
   */
  fallbackPools: PoolId[];
  /** Editorial angles this slot may use. Enforced, not merely suggested. */
  angles: Angle[];
}

/** Where candidates come from. One pool per slot. */
export type PoolId =
  /** Genuinely new qualifying official developments. Often empty. */
  | "news"
  /** The historical archive: active rules, effective dates, obligations. */
  | "knowledge"
  /** Durable assets: key dates, H-1B data, WARN, timelines, maps, hubs. */
  | "standing";

// -----------------------------------------------------------------------------
// SUBJECTS AND ANGLES
// -----------------------------------------------------------------------------

/**
 * What a post is ABOUT, as a stable identity.
 *
 * Not an event id, because two of the three pools do not draw on events. A key
 * date and a data page are subjects in exactly the same sense: a durable thing
 * we can say something true about, whose reuse we need to track.
 */
export type SubjectId = string; // "event:<id>" | "keydate:<id>" | "asset:<id>"

/**
 * The editorial TREATMENT of a subject.
 *
 * The first cut of this system keyed dedupe on subject alone and banned a
 * subject forever once posted. That is wrong, and expensively so: the H-1B fee
 * rule is legitimately worth a post when it lands, a second when its effective
 * date approaches, and a third explaining who actually pays it. Those are three
 * different things to say, not one thing said three times.
 *
 * Uniqueness is therefore (subject, angle, platform) plus a cooldown — and the
 * wording check in dedupe.ts catches the case where two angles produce the same
 * sentence anyway, which is the failure the naive rule was really aiming at.
 */
export type Angle =
  /** It just happened and it changes something. */
  | "breaking_change"
  /**
   * What the document actually obliges someone to do, pay or file.
   *
   * The most useful thing this account can say, and the easiest to get wrong.
   * It states the REQUIREMENT as a property of the rule — "the rule requires a
   * $500 fee at filing" — never as an instruction to the reader. "You should
   * file" is legal advice and the validator rejects it; "the rule requires" is
   * a fact about a federal document. Earned only when the ranking model scores
   * a real obligation change, so the angle cannot be chosen and then padded.
   */
  | "what_it_requires"
  /** Who this reaches, concretely. */
  | "who_is_affected"
  /** What the rule was before, and what it is now. */
  | "what_changed_from_previous"
  /** It takes effect on a date that is coming. */
  | "effective_date_reminder"
  /** A filing window or deadline is closing. */
  | "deadline_approaching"
  /**
   * A window is coming, but not yet. What it is, when it opens, what the
   * official source says about it — stated as a fact about the calendar, not as
   * a prompt to act. Distinct from `deadline_approaching`, which is for a
   * window closing soon enough that the countdown itself is the news.
   */
  | "preparation_window"
  /** Where this sits in a sequence we have been tracking. */
  | "historical_context"
  /** A figure from our own datasets that says something. */
  | "data_insight";

export const ALL_ANGLES: Angle[] = [
  "breaking_change",
  "what_it_requires",
  "who_is_affected",
  "what_changed_from_previous",
  "effective_date_reminder",
  "deadline_approaching",
  "preparation_window",
  "historical_context",
  "data_insight",
];

/** Human wording for logs and the ledger. */
export const ANGLE_LABEL: Record<Angle, string> = {
  breaking_change: "Breaking change",
  what_it_requires: "What it requires",
  who_is_affected: "Who is affected",
  what_changed_from_previous: "What changed from the previous rule",
  effective_date_reminder: "Effective-date reminder",
  deadline_approaching: "Deadline approaching",
  preparation_window: "Window ahead",
  historical_context: "Historical context",
  data_insight: "Data insight",
};

// -----------------------------------------------------------------------------
// CANDIDATES
// -----------------------------------------------------------------------------

/**
 * A thing the system could post about, before any wording exists.
 *
 * Produced entirely by deterministic code from data we already hold. The copy
 * engine never sees anything that is not derived from one of these.
 */
export interface Candidate {
  subjectId: SubjectId;
  pool: PoolId;
  /** One-line identity for logs. Never sent to a platform as-is. */
  label: string;
  /**
   * What KIND of thing this is. Decides the band; `score` decides the place
   * within it. See categories.ts for why this had to stop being implicit.
   */
  category: ContentCategory;
  /**
   * Ordering score: the category's tier plus the candidate's own merits.
   *
   * The tier dominates by construction — see TIER_STEP. Before categories
   * existed this field carried a rotation index for standing candidates, which
   * meant a page about our own methodology and a page of enforcement data
   * differed by one point and the calendar broke the tie.
   */
  score: number;
  /** Every factor, so a selection can be explained in the ledger. */
  scoreExplain: string;
  /** The angles this candidate genuinely supports, given its own data. */
  supportedAngles: Angle[];
  /**
   * What this post is broadly ABOUT, coarser than the subject.
   *
   * Two different subjects can be the same story to a reader: an H-1B fee rule
   * in the morning and the H-1B sponsor directory in the evening are one topic
   * seen twice, however distinct their subject ids are. Same-day variety is
   * enforced on this key, not on the subject — see checkSameDayVariety().
   */
  topicKey: string;
  /** The coarse section of immigration this belongs to. See rotation.ts. */
  topicFamily: TopicFamily;
  /**
   * Does this candidate have something genuinely new to say?
   *
   * A fresh publication, a timing change, or an approaching milestone. After a
   * subject's 14-day heavy-penalty band this is what separates "worth saying
   * again" from "still in the index".
   */
  hasNewInformation: boolean;
  /** The ImmigrationClock page this post sends people to. */
  deepLink: string;
  /** The government document behind it, when there is one. */
  sourceUrl: string | null;
  /** The event, when the candidate came from the archive. */
  event: IndexedEvent | null;
  /** Everything the copy engine is allowed to know. Built by facts.ts. */
  facts: FactSet;
  /**
   * The branded card this post would carry, or null when prose is enough.
   *
   * Built in select.ts from the same records the fact set comes from, so it is
   * verified data rather than anything a model produced. Most candidates carry
   * null — see visuals.ts for why that is the design and not a gap.
   */
  visual: VisualSpec | null;
}

/**
 * THE CLOSED WORLD.
 *
 * The copy engine has no web access, no retrieval and no tools. This object is
 * the entirety of what it knows about the subject. If a fact is not in here, no
 * amount of prompting can make the model produce it truthfully — and validate.ts
 * checks the output back against exactly these fields, so producing it untruthfully
 * fails closed.
 */
/**
 * What SORT of subject this fact set describes.
 *
 * Load-bearing, and its absence is half of why the methodology post read the way
 * it did. The TIMING block told the model, unconditionally, that "NO effective
 * or implementation date is recorded — state that plainly", which is exactly
 * right for a federal document that has not been given a start date and is
 * meaningless for a page explaining how we classify data. A methodology page
 * cannot have an implementation date, so reporting that it lacks one is not a
 * fact about the world; it is a fact about the prompt.
 *
 * The published post opened on it: "No implementation date has been set; ..."
 */
export type SubjectKind =
  /** A government document: a rule, decision, notice, executive action. */
  | "document"
  /** A recurring calendar event: a filing window, a lottery, a deadline. */
  | "recurring_date"
  /** A durable ImmigrationClock page: a dataset, a hub, a reference. */
  | "resource";

export interface FactSet {
  subjectId: SubjectId;
  /** What sort of thing this is. Timing language depends on it. */
  subjectKind: SubjectKind;
  /**
   * The Chicago-local date this fact set was built for.
   *
   * Carried so the validator can tell a future effective date from a past one
   * without being handed a second clock. Two clocks in one pipeline is how a
   * simulation and a production run start disagreeing.
   */
  today: string;
  /** Neutral title as published. Never rewritten by us. */
  title: string;
  /** The source's own summary, or our data description. */
  summary: string;
  /** e.g. "Federal Register", "USCIS". Attribution must match this. */
  sourceName: string;
  /** Machine key, for attribution checking. */
  sourceKey: string;
  publishedAt: string | null;
  effectiveAt: string | null;
  classification: string | null;
  severity: string | null;
  /** Entities the archive already linked. Used for "who is affected". */
  entities: string[];
  /**
   * Finished statements of fact computed from our own datasets.
   *
   * The difference between this and `summary` is who did the arithmetic. A
   * summary is the source's own prose; a data point is a sentence assembled by
   * deterministic code in asset-facts.ts from figures the repository holds — the
   * WARN notice count, the size of a USCIS export, the number of employers in
   * both. The model may state these; it may never compute one.
   *
   * Empty for most subjects. The evening slot is what this exists for: a page
   * has no "summary as published", and without this the only honest thing it
   * could say was what the page contains.
   */
  dataPoints: string[];
  /** Every URL the post is permitted to contain. Exact-match whitelist. */
  allowedUrls: string[];
  /** The one URL the post SHOULD use. Always in allowedUrls. */
  deepLink: string;
  /**
   * Numbers the post may state, as they appear in the source. Any numeral in
   * the generated copy that is not here (and is not a date or a year already
   * present) fails validation.
   */
  figures: string[];
  /** Free-text caveats that must not be contradicted. */
  notes: string[];
}

// -----------------------------------------------------------------------------
// GENERATED COPY
// -----------------------------------------------------------------------------

export type Platform = "x" | "linkedin";

export const PLATFORMS: Platform[] = ["x", "linkedin"];

/** What the copy engine returns. Shape is enforced by a strict JSON schema. */
export interface GeneratedCopy {
  x: string;
  linkedin: string;
  /** Must be one of facts.allowedUrls. Checked, not trusted. */
  deepLink: string;
}

export interface EngineUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * Input tokens served from the provider's prompt cache, billed at a discount.
   * A subset of `inputTokens`, not an addition. 0 when the provider does not
   * report it.
   */
  cachedInputTokens: number;
  /**
   * Reasoning tokens. A SUBSET of `outputTokens`, not an addition — the
   * Responses API counts them inside the output total, and they are billed at
   * the full output rate. 0 when the provider does not report them.
   */
  reasoningTokens: number;
  /** Provider-reported total, when it gives one. Null rather than derived. */
  totalTokens: number | null;
  /** USD, computed from the model's published rates. */
  costUsd: number;
}

/**
 * One API request, recorded whether it succeeded or not.
 *
 * The runner used to overwrite `usage` on every attempt, so a slot that
 * regenerated billed twice and reported once. Every attempt is kept here
 * instead: a discarded first attempt is real spend, and spend you cannot see is
 * spend you cannot control.
 */
export interface EngineAttempt {
  slot: SlotId;
  /** 1-based. Anything above 1 is a regeneration after a validator rejection. */
  attempt: number;
  model: string;
  ok: boolean;
  /** Why it failed, when it did. Never a credential. */
  error: string | null;
  /** Wall-clock duration of the request, milliseconds. */
  durationMs: number;

  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number | null;
  costUsd: number;

  /**
   * What the validator said about THIS attempt: "pass", a failure summary, or
   * null when the call threw and there was nothing to validate.
   */
  validation: string | null;
}

export interface EngineResult {
  copy: GeneratedCopy;
  usage: EngineUsage;
}

/**
 * The provider seam.
 *
 * One method, one implementation today (Anthropic / Claude Opus 5). The seam
 * exists so a model change is a config change, not an architecture change —
 * NOT so that a registry of providers can be maintained. Resist adding a
 * second abstraction layer here until there is a second real provider.
 */
export interface CopyEngine {
  /** Stable id recorded in the ledger, e.g. "anthropic:claude-opus-5". */
  readonly id: string;
  generate(req: CopyRequest): Promise<EngineResult>;
}

export interface CopyRequest {
  facts: FactSet;
  slot: SlotDef;
  angle: Angle;
  /** Openings from recent posts. A nudge for variety; dedupe.ts is the guarantee. */
  avoidOpenings: string[];
  /** Present on a repair: exactly why the first attempt was rejected. */
  validatorFeedback?: string[];
  /**
   * Present on a repair: the exact text that was rejected.
   *
   * Without it the second attempt is a fresh post written in hope. "Too long by
   * 58 characters" is only actionable against the 333 characters that were too
   * long — and a repair that starts from the rejected text is far likelier to
   * preserve the facts, the stage and the date than one that starts from
   * nothing, which is the whole safety argument for repairing at all.
   */
  previousCopy?: { x: string; linkedin: string };
}

// -----------------------------------------------------------------------------
// OUTCOMES
// -----------------------------------------------------------------------------

/**
 * Why a slot produced nothing.
 *
 * Every one of these is a normal, expected outcome that exits zero. The system
 * is designed to emit them often; a week with no skips would mean the quality
 * gates were not doing anything.
 */
export type SkipReason =
  | "SKIPPED_OUTSIDE_WINDOW"
  | "SKIPPED_NO_QUALIFYING_CONTENT"
  | "SKIPPED_DUPLICATE"
  | "SKIPPED_COOLDOWN"
  | "SKIPPED_VALIDATION_FAILED"
  | "SKIPPED_ENGINE_UNAVAILABLE"
  /**
   * The engine is reachable but misconfigured — a token cap too small for the
   * model to finish, say. Separate from UNAVAILABLE because the two need
   * different responses: an outage is waited out, a bad cap never fixes itself,
   * and a misconfigured call is still BILLED. One of these in the ledger is a
   * bug report; a run of UNAVAILABLE is a weather report.
   */
  | "SKIPPED_ENGINE_MISCONFIGURED"
  | "SKIPPED_CREDENTIAL_EXPIRED"
  | "SKIPPED_PUBLISH_FAILED"
  | "SKIPPED_NOT_ENABLED";

export type PostDecision = "POSTED" | "DRY_RUN" | SkipReason;

/** One platform's outcome within one slot. */
export interface PlatformOutcome {
  platform: Platform;
  decision: PostDecision;
  reason: string;
  /** The exact text that was (or would be) published. */
  text: string | null;
  /** The platform's own id for the post, once it exists. */
  externalId: string | null;
  externalUrl: string | null;
}

/** Everything that happened in one slot, on one day. */
export interface SlotOutcome {
  /** ISO date in America/Chicago — the day a reader would say this posted. */
  localDate: string;
  localTime: string;
  runAtUtc: string;
  slot: SlotId;
  pool: PoolId;
  subjectId: SubjectId | null;
  subjectLabel: string | null;
  angle: Angle | null;
  score: number | null;
  scoreExplain: string | null;
  /** Coarse topic, recorded so same-day variety can be enforced tomorrow. */
  topicKey: string | null;
  /** Topic family, recorded so tomorrow's rotation can read this week's feed. */
  topicFamily: string | null;
  /** Content category, recorded so the mix can be measured over a fortnight. */
  category: ContentCategory | null;
  /** Base score minus the repetition penalties. What actually won the slot. */
  adjustedScore: number | null;
  /** Which penalties applied, so a selection can be explained later. */
  rotationExplain: string | null;
  deepLink: string | null;
  /** Candidates considered before one was chosen. For auditing selection. */
  poolSize: number;
  validator: ValidationResult | null;
  dedupe: DedupeResult | null;
  usage: EngineUsage | null;
  /** Every API request this slot made, in order. Empty when none was needed. */
  attempts: EngineAttempt[];
  platforms: PlatformOutcome[];
}

export interface ValidationResult {
  ok: boolean;
  /** Empty when ok. Each string is a specific, actionable failure. */
  failures: string[];
  /**
   * Machine-readable code per failure, parallel to `failures`.
   *
   * What lets the runner tell a container defect from a claim defect, and so
   * decide whether a second API call is justified at all. See FailureCode.
   */
  codes: string[];
  /** Checks that ran and passed, so the ledger records what was verified. */
  checked: string[];
}

export interface DedupeResult {
  ok: boolean;
  reason: string;
  /** 0–1 highest similarity against any recent post. */
  maxSimilarity: number;
  /** The post it most resembled, when there was one. */
  nearest: string | null;
}
