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
  /** Which pool supplies its candidates. */
  pool: PoolId;
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
  /** Ordering score. See score.ts — positional weights, not a learned model. */
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
export interface FactSet {
  subjectId: SubjectId;
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
  /** USD, computed from the model's published rates. */
  costUsd: number;
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
  /** Present on a regeneration: exactly why the first attempt was rejected. */
  validatorFeedback?: string[];
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
  deepLink: string | null;
  /** Candidates considered before one was chosen. For auditing selection. */
  poolSize: number;
  validator: ValidationResult | null;
  dedupe: DedupeResult | null;
  usage: EngineUsage | null;
  platforms: PlatformOutcome[];
}

export interface ValidationResult {
  ok: boolean;
  /** Empty when ok. Each string is a specific, actionable failure. */
  failures: string[];
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
