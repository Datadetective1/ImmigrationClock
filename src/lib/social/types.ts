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
// which can end the run, and only the last one publishes:
//
//   window → cadence → candidates → queue → score → dedupe → LLM → validate → post
//
// Every gate's refusal is a first-class, named outcome (see SkipReason), not an
// error and not a silent return. A run that produces nothing is the system
// working.
//
// WHAT CHANGED IN THE SECOND DESIGN
// ---------------------------------
// The first design had three exact-hour slots, each with its own pool, and one
// shape of post. Measured on the live account it produced a database summarising
// itself, at a falling rate, because a slot that fired an hour late was dropped
// and a slot whose pool was dry stayed silent. The second design has three
// WINDOWS a run may land in, eight CONTENT TYPES drawn from one ranked queue, a
// CADENCE policy that targets roughly one useful post a day, and sixteen SHAPES
// a post may take. The trust layer — the closed fact set and the validator — is
// unchanged.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import type { VisualSpec } from "./visuals";
import type { TopicFamily } from "./rotation";
import type { ContentCategory } from "./categories";
import type { EditorialTreatment, ReaderValue } from "./reader-value";
import type { CadenceTier, ContentType, Structure } from "./content-types";

// -----------------------------------------------------------------------------
// WINDOWS
// -----------------------------------------------------------------------------

/**
 * Three windows a day. A run may land anywhere inside one and still count.
 *
 * The ids are kept from the first design (morning, afternoon, evening) so the
 * ledger's history stays readable, but the meaning changed: a window is a span
 * of local hours, not an hour. See slots.ts for why that had to happen.
 */
export type SlotId = "morning" | "afternoon" | "evening";

export interface SlotDef {
  id: SlotId;
  /** First local hour of the window (America/Chicago). Kept for compatibility. */
  hour: number;
  /** Inclusive local hours the window spans. */
  hours: [number, number];
  /** What this window is FOR, for humans reading the ledger and the preview. */
  purpose: string;
  /** The nominal pool recorded on a skip, when no candidate was chosen. */
  pool: PoolId;
}

/**
 * Where a candidate came from. Recorded in the ledger as part of a row's
 * identity, and read by the URL cooldown (news is exempt from cooldowns other
 * pools caused).
 */
export type PoolId =
  /** A qualifying official development from the last ten days. */
  | "news"
  /** The archive: effective dates ahead, why-it-matters on an older change. */
  | "knowledge"
  /** Recurring dates. */
  | "standing"
  /** Explainers, data signals and product discovery — the evergreen tier. */
  | "editorial";

// -----------------------------------------------------------------------------
// SUBJECTS AND ANGLES
// -----------------------------------------------------------------------------

/**
 * What a post is ABOUT, as a stable identity.
 *
 *   "event:<id>"       a recorded change
 *   "keydate:<id>"     a recurring date
 *   "explainer:<slug>" an evergreen explainer
 *   "signal:<slug>"    a data signal
 *   "discovery:<slug>" a product capability
 *   "asset:<id>"       a standing page (first design; retained for history)
 */
export type SubjectId = string;

/**
 * The editorial TREATMENT of a subject — one per content type, plus the
 * first design's finer-grained treatments of an archive event, which the
 * dedupe layer still keys on. Uniqueness is (subject, angle, platform) plus a
 * cooldown, so the same development can carry a breaking post, a what-changed
 * and a why-it-matters over its life, and never the same one twice.
 */
export type Angle =
  /** It just happened and it changes something. */
  | "breaking_change"
  /** A recent development explained in plain English. */
  | "what_changed"
  /** A verified development and its defensible significance. */
  | "why_it_matters"
  /** What the document actually obliges someone to do, pay or file. */
  | "what_it_requires"
  /** Who this reaches, concretely. */
  | "who_is_affected"
  /** What the rule was before, and what it is now. */
  | "what_changed_from_previous"
  /** It takes effect on a date that is coming. */
  | "effective_date_reminder"
  /** A filing window or deadline is closing. */
  | "deadline_approaching"
  /** A window is coming, but not yet. */
  | "preparation_window"
  /** Where this sits in a sequence we have been tracking. */
  | "historical_context"
  /** A figure from our own datasets that says something. */
  | "data_insight"
  /** Evergreen explanation of a distinction. */
  | "explainer"
  /** A verified capability of ImmigrationClock. */
  | "data_discovery";

export const ALL_ANGLES: Angle[] = [
  "breaking_change",
  "what_changed",
  "why_it_matters",
  "what_it_requires",
  "who_is_affected",
  "what_changed_from_previous",
  "effective_date_reminder",
  "deadline_approaching",
  "preparation_window",
  "historical_context",
  "data_insight",
  "explainer",
  "data_discovery",
];

/** Human wording for logs and the ledger. */
export const ANGLE_LABEL: Record<Angle, string> = {
  breaking_change: "Breaking change",
  what_changed: "What changed",
  why_it_matters: "Why it matters",
  what_it_requires: "What it requires",
  who_is_affected: "Who is affected",
  what_changed_from_previous: "What changed from the previous rule",
  effective_date_reminder: "Effective-date reminder",
  deadline_approaching: "Deadline approaching",
  preparation_window: "Window ahead",
  historical_context: "Historical context",
  data_insight: "Data insight",
  explainer: "Explainer",
  data_discovery: "Data discovery",
};

/** The one angle each content type publishes under. */
export const ANGLE_FOR_TYPE: Record<ContentType, Angle> = {
  breaking_change: "breaking_change",
  what_changed: "what_changed",
  why_it_matters: "why_it_matters",
  effective_date: "effective_date_reminder",
  key_date: "deadline_approaching",
  data_signal: "data_insight",
  explainer: "explainer",
  data_discovery: "data_discovery",
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
  /** What KIND of post this is. Decides the cadence tier and the shapes on offer. */
  contentType: ContentType;
  /** The cadence tier, derived from the content type. */
  tier: CadenceTier;
  /** The shapes the copy engine may choose between for this candidate. */
  structures: Structure[];
  /** One-line identity for logs. Never sent to a platform as-is. */
  label: string;
  /** What KIND of thing this is for the category ladder. See categories.ts. */
  category: ContentCategory;
  /** Ordering score: the category's tier plus the candidate's own merits. */
  score: number;
  /** Every factor, so a selection can be explained in the ledger. */
  scoreExplain: string;
  /** Would a real person stop scrolling? 0-100 plus the signals. See reader-value.ts. */
  readerValue: ReaderValue;
  /** The first design's editorial shape, kept for the ledger and the prompt. */
  treatment: EditorialTreatment;
  /** The angles this candidate genuinely supports. The first is the one used. */
  supportedAngles: Angle[];
  /** What this post is broadly ABOUT, for same-day variety. */
  topicKey: string;
  /** The coarse section of immigration this belongs to. See rotation.ts. */
  topicFamily: TopicFamily;
  /** Does this candidate have something genuinely new to say? */
  hasNewInformation: boolean;
  /**
   * The ImmigrationClock page this post sends people to, as a SITE-RELATIVE
   * canonical path. The ledger, the URL cooldown and the rotation memory key on
   * this; the absolute, tracked URL the post must actually contain is
   * `facts.deepLink`.
   */
  deepLink: string;
  /** A short public identifier for the record, for analytics: "change:abc123". */
  storyKey: string;
  /** The government document behind it, when there is one. */
  sourceUrl: string | null;
  /** The event, when the candidate came from the archive. */
  event: IndexedEvent | null;
  /** Everything the copy engine is allowed to know. Built by facts.ts. */
  facts: FactSet;
  /** The branded card this post would carry, or null. See visuals.ts. */
  visual: VisualSpec | null;
}

/**
 * THE CLOSED WORLD.
 *
 * The copy engine has no web access, no retrieval and no tools. This object is
 * the entirety of what it knows about the subject. If a fact is not in here, no
 * amount of prompting can make the model produce it truthfully — and validate.ts
 * checks the output back against exactly these fields, so producing it
 * untruthfully fails closed.
 */
export type SubjectKind =
  /** A government document: a rule, decision, notice, executive action. */
  | "document"
  /** A recurring calendar event: a filing window, a lottery, a deadline. */
  | "recurring_date"
  /** A durable ImmigrationClock page: a dataset, a hub, a tool. */
  | "resource"
  /** An evergreen, source-backed explanation. */
  | "explainer"
  /** A figure computed from ImmigrationClock's own data. */
  | "data_signal";

export interface FactSet {
  subjectId: SubjectId;
  /** What sort of thing this is. Timing language depends on it. */
  subjectKind: SubjectKind;
  /** What kind of post is being written from these facts. Absent on fact sets built before content types. */
  contentType?: ContentType;
  /** The Chicago-local date this fact set was built for. */
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
   * Finished statements of fact computed from our own data, or written from a
   * cited source for an explainer. The model may state these; it may never
   * compute one.
   */
  dataPoints: string[];
  /**
   * Implications DERIVED from the record's own fields — what a rescission does,
   * when a final rule bites, what a proposal is not. Each one restates a field.
   * The model may state these and nothing beyond them; the validator grounds
   * copy against this list as it does against dataPoints.
   */
  implications?: string[];
  /** Every URL the post is permitted to contain. Exact-match whitelist. */
  allowedUrls: string[];
  /** The one URL the post SHOULD use — absolute, with attribution parameters. */
  deepLink: string;
  /** The clean canonical URL of the record, for humans and cards. Defaults to the deep link. */
  shareUrl?: string;
  /** Numbers the post may state, as they appear in the source. */
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
  /** Which of the offered shapes the writer used. Recorded, and refused if stale. */
  structure?: string;
  /** A short headline for the queue and the ledger. Not published. */
  headline?: string;
}

export interface EngineUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache. A subset of inputTokens. */
  cachedInputTokens: number;
  /** Reasoning tokens. A subset of outputTokens, billed at the output rate. */
  reasoningTokens: number;
  /** Provider-reported total, when it gives one. Null rather than derived. */
  totalTokens: number | null;
  /** USD, computed from the model's published rates. */
  costUsd: number;
}

/** One API request, recorded whether it succeeded or not. */
export interface EngineAttempt {
  slot: SlotId;
  /** 1-based. Anything above 1 is a repair after a rejection. */
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
  /** What the validator said about THIS attempt: "pass", a failure summary, or null. */
  validation: string | null;
}

export interface EngineResult {
  copy: GeneratedCopy;
  usage: EngineUsage;
}

/**
 * The provider seam. One method. The seam exists so a model change is a config
 * change, not an architecture change.
 */
export interface CopyEngine {
  /** Stable id recorded in the ledger, e.g. "openai:gpt-5". */
  readonly id: string;
  generate(req: CopyRequest): Promise<EngineResult>;
}

export interface CopyRequest {
  facts: FactSet;
  slot: SlotDef;
  angle: Angle;
  /** What kind of post this is. Defaults to the fact set's own content type. */
  contentType?: ContentType;
  /** The shapes the writer may choose between. Defaults to a plain "direct" shape. */
  structures?: Structure[];
  /** The shapes the account used most recently, newest first, so the writer can avoid a run. */
  recentStructures?: Structure[];
  /** The first design's editorial shape. Optional; the prompt derives one when absent. */
  treatment?: EditorialTreatment;
  /** Why a reader would care, derived deterministically from the fact set. */
  readerValue?: ReaderValue;
  /** Openings from recent posts. A nudge for variety; dedupe.ts is the guarantee. */
  avoidOpenings: string[];
  /** Opening constructions the account has leaned on, as an explicit refusal. */
  bannedOpenings?: string[];
  /** Present on a repair: exactly why the first attempt was rejected. */
  validatorFeedback?: string[];
  /** Present on a repair: the exact text that was rejected. */
  previousCopy?: { x: string; linkedin: string };
}

// -----------------------------------------------------------------------------
// OUTCOMES
// -----------------------------------------------------------------------------

/**
 * Why a run produced nothing.
 *
 * Every one of these is a normal, expected outcome that exits zero. The system
 * is designed to emit them often; a week with no skips would mean the quality
 * gates were not doing anything.
 */
export type SkipReason =
  | "SKIPPED_OUTSIDE_WINDOW"
  /** The cadence policy said no: daily maximum, spacing, or a tier this window does not take. */
  | "SKIPPED_CADENCE"
  | "SKIPPED_NO_QUALIFYING_CONTENT"
  | "SKIPPED_DUPLICATE"
  | "SKIPPED_COOLDOWN"
  | "SKIPPED_VALIDATION_FAILED"
  | "SKIPPED_ENGINE_UNAVAILABLE"
  /** The engine is reachable but misconfigured — a token cap too small, say. */
  | "SKIPPED_ENGINE_MISCONFIGURED"
  | "SKIPPED_CREDENTIAL_EXPIRED"
  | "SKIPPED_PUBLISH_FAILED"
  | "SKIPPED_NOT_ENABLED";

export type PostDecision = "POSTED" | "DRY_RUN" | SkipReason;

/** One platform's outcome within one run. */
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

/** Everything that happened in one run, in one window, on one day. */
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
  /** What kind of post this was. */
  contentType: string | null;
  /** The cadence tier it published under. */
  tier: string | null;
  /** The shape the writer chose. */
  structure: string | null;
  /** The record's short public key, for analytics. */
  storyKey: string | null;
  /** The clean canonical URL of the record. */
  shareUrl: string | null;
  score: number | null;
  scoreExplain: string | null;
  topicKey: string | null;
  topicFamily: string | null;
  category: ContentCategory | null;
  readerValue: number | null;
  readerValueExplain: string | null;
  treatment: EditorialTreatment | null;
  adjustedScore: number | null;
  rotationExplain: string | null;
  deepLink: string | null;
  /** Candidates considered before one was chosen. */
  poolSize: number;
  /** What the cadence policy decided, in words. */
  cadenceExplain: string | null;
  validator: ValidationResult | null;
  dedupe: DedupeResult | null;
  usage: EngineUsage | null;
  /** Every API request this run made, in order. Empty when none was needed. */
  attempts: EngineAttempt[];
  platforms: PlatformOutcome[];
}

export interface ValidationResult {
  ok: boolean;
  /** Empty when ok. Each string is a specific, actionable failure. */
  failures: string[];
  /** Machine-readable code per failure, parallel to `failures`. */
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
