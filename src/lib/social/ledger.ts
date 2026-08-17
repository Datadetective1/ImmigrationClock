// =============================================================================
// POST LEDGER — append-only, committed, and the reason the system is auditable
//
// Modelled directly on src/lib/newsletter/send-ledger.ts, for the same reason:
// a JSON file in the repository, written by the job that publishes and pushed
// by the same workflow, is a durable record that does not depend on a remote
// API's semantics, on wall-clock timing, or on a query whose shape may change.
// Git history makes it immutable in the way that matters — you can see who
// changed it and when.
//
// IT RECORDS ATTEMPTS, NOT SUCCESSES
// ----------------------------------
// Every slot writes a record, including every skip. This is not bookkeeping
// pedantry. A system whose whole design is "skip unless the content earns
// publication" is one whose skips are the interesting data: they are how you
// tell "the archive was quiet this week" from "the selector broke in March and
// nobody noticed because the feed looked plausible".
//
// WHAT IS NEVER WRITTEN HERE
// --------------------------
// No credentials, no tokens, no raw authenticated responses. The platform
// identifiers recorded are public post ids.
// =============================================================================

import type {
  Angle,
  EngineAttempt,
  PlatformOutcome,
  PostDecision,
  Platform,
  PoolId,
  SlotId,
} from "./types";

/** The schema version. Bump only for a breaking shape change. */
export const LEDGER_VERSION = 1 as const;

export interface PostRecord {
  /** Chicago-local date — the day a reader would say this happened. */
  localDate: string;
  localTime: string;
  runAtUtc: string;
  slot: SlotId;
  pool: PoolId;
  platform: Platform;
  decision: PostDecision;
  /** Human-readable detail. Never a stack trace, never a credential. */
  reason: string;

  subjectId: string | null;
  subjectLabel: string | null;
  angle: Angle | null;
  score: number | null;

  /** Exactly what was published, byte for byte. Null on a skip. */
  text: string | null;
  deepLink: string | null;

  /** Platform's own id, so a post can be traced back from the timeline. */
  externalId: string | null;
  externalUrl: string | null;

  /** Provenance of the wording. */
  model: string | null;
  promptVersion: string | null;
  validatorVersion: string | null;
  /** Hash of the fact-set the copy was generated from. */
  factsHash: string | null;
  /**
   * The approval envelope this text was published from, when it came through the
   * exact-copy path. Null on the unattended path, where no human approved a
   * specific string.
   *
   * Also the single-use record: checkApproval() refuses an envelope whose id
   * already appears on a POSTED row, so an approval cannot be replayed.
   */
  approvalId: string | null;
  /** Who approved it, on the exact-copy path. Null otherwise. */
  approvedBy: string | null;
  /**
   * The coarse topic this post covered. Null on rows written before same-day
   * variety existed, which read as "unknown topic" and therefore block nothing.
   */
  topicKey: string | null;
  /**
   * The coarse family this post belonged to. Null on rows written before
   * rotation existed, which read as "unknown family" and so apply no fatigue.
   */
  topicFamily: string | null;
  /**
   * What KIND of content this was — see categories.ts.
   *
   * Null on rows written before categories existed. buildMemory() skips those
   * rather than guessing a bucket for them: an unknown category that defaulted
   * to any real bucket would let historical rows suppress a category they were
   * never actually about.
   */
  category: string | null;
  /** Base score minus repetition penalties — the number that won the slot. */
  adjustedScore: number | null;
  /** Which penalties applied. Free text, for auditing a selection later. */
  rotationExplain: string | null;

  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;

  /**
   * Every API request this slot made, including retries that were billed and
   * discarded.
   *
   * The columns above describe the WINNING attempt, which is what was
   * published. This is what it actually cost to get there. Both rows of a slot
   * carry the same array — aggregate by localDate+slot, never by summing rows,
   * or a two-platform slot doubles.
   */
  attempts: EngineAttempt[] | null;
}

/** Per-slot totals, computed from `attempts`. Never summed across rows. */
export interface SlotSpend {
  slot: SlotId;
  localDate: string;
  apiCalls: number;
  retries: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  costUsd: number;
  durationMs: number;
}

/**
 * Spend per slot, deduplicated across platform rows.
 *
 * A slot writes one row per platform and both carry the same `attempts`, so the
 * obvious `posts.reduce(...)` double-counts. Keying on localDate+slot is the
 * only safe aggregation, and it is why this lives here rather than being
 * open-coded in the reporter.
 */
export function spendBySlot(ledger: PostLedger): SlotSpend[] {
  const seen = new Map<string, SlotSpend>();

  for (const p of ledger.posts) {
    const key = `${p.localDate}::${p.slot}`;
    if (seen.has(key) || !p.attempts?.length) continue;

    const a = p.attempts;
    seen.set(key, {
      slot: p.slot,
      localDate: p.localDate,
      apiCalls: a.length,
      // Anything past the first call is a regeneration after a rejection.
      retries: Math.max(0, a.length - 1),
      inputTokens: a.reduce((n, x) => n + x.inputTokens, 0),
      cachedInputTokens: a.reduce((n, x) => n + x.cachedInputTokens, 0),
      outputTokens: a.reduce((n, x) => n + x.outputTokens, 0),
      reasoningTokens: a.reduce((n, x) => n + x.reasoningTokens, 0),
      costUsd: a.reduce((n, x) => n + x.costUsd, 0),
      durationMs: a.reduce((n, x) => n + x.durationMs, 0),
    });
  }

  return [...seen.values()].sort(
    (x, y) => x.localDate.localeCompare(y.localDate) || x.slot.localeCompare(y.slot)
  );
}

export interface PostLedger {
  version: typeof LEDGER_VERSION;
  posts: PostRecord[];
}

export const EMPTY_POST_LEDGER: PostLedger = { version: LEDGER_VERSION, posts: [] };

/**
 * Parse, tolerating a missing file but NOT a corrupt one.
 *
 * A corrupt ledger returning "empty" would silently unlock every subject the
 * ledger was protecting and let the system re-post its entire history. The
 * caller gets null and refuses to run. Same rule, same reasoning, as the
 * newsletter send ledger.
 */
export function parsePostLedger(raw: string | null): PostLedger | null {
  if (raw === null) return EMPTY_POST_LEDGER;
  const text = raw.trim();
  if (text === "") return EMPTY_POST_LEDGER;
  try {
    const parsed = JSON.parse(text) as Partial<PostLedger>;
    if (parsed.version !== LEDGER_VERSION || !Array.isArray(parsed.posts)) return null;
    for (const p of parsed.posts) {
      if (
        typeof p?.localDate !== "string" ||
        typeof p?.platform !== "string" ||
        typeof p?.decision !== "string"
      ) {
        return null;
      }
    }
    return { version: LEDGER_VERSION, posts: parsed.posts as PostRecord[] };
  } catch {
    return null;
  }
}

/** Stable on disk: chronological, so a diff shows only what was appended. */
export function serializePostLedger(ledger: PostLedger): string {
  const posts = [...ledger.posts].sort(
    (a, b) =>
      a.runAtUtc.localeCompare(b.runAtUtc) ||
      a.slot.localeCompare(b.slot) ||
      a.platform.localeCompare(b.platform)
  );
  return `${JSON.stringify({ version: LEDGER_VERSION, posts }, null, 2)}\n`;
}

export function appendRecords(ledger: PostLedger, records: PostRecord[]): PostLedger {
  return { version: LEDGER_VERSION, posts: [...ledger.posts, ...records] };
}

// -----------------------------------------------------------------------------
// QUERIES — everything dedupe.ts needs to ask
//
// All of these consider ONLY records that actually published. A skip is history
// worth keeping but it did not consume a treatment, and treating it as if it had
// would let a single validator failure permanently burn a subject/angle pair.
// -----------------------------------------------------------------------------

export function publishedPosts(ledger: PostLedger): PostRecord[] {
  return ledger.posts.filter((p) => p.decision === "POSTED");
}

/** Has this exact treatment — subject, angle, platform — already gone out? */
export function hasTreatment(
  ledger: PostLedger,
  subjectId: string,
  angle: Angle,
  platform: Platform
): PostRecord | null {
  return (
    publishedPosts(ledger).find(
      (p) => p.subjectId === subjectId && p.angle === angle && p.platform === platform
    ) ?? null
  );
}

/** The most recent published post about a subject on a platform. */
export function lastPostForSubject(
  ledger: PostLedger,
  subjectId: string,
  platform: Platform
): PostRecord | null {
  const matches = publishedPosts(ledger)
    .filter((p) => p.subjectId === subjectId && p.platform === platform)
    .sort((a, b) => b.runAtUtc.localeCompare(a.runAtUtc));
  return matches[0] ?? null;
}

/** How many distinct treatments a subject has already had on a platform. */
export function treatmentCount(
  ledger: PostLedger,
  subjectId: string,
  platform: Platform
): number {
  const angles = new Set(
    publishedPosts(ledger)
      .filter((p) => p.subjectId === subjectId && p.platform === platform)
      .map((p) => p.angle)
  );
  return angles.size;
}

/** The most recent published post pointing at a URL, on a platform. */
export function lastPostForUrl(
  ledger: PostLedger,
  deepLink: string,
  platform: Platform
): PostRecord | null {
  const matches = publishedPosts(ledger)
    .filter((p) => p.deepLink === deepLink && p.platform === platform)
    .sort((a, b) => b.runAtUtc.localeCompare(a.runAtUtc));
  return matches[0] ?? null;
}

/**
 * Did this exact treatment recently fail validation on this platform?
 *
 * Without this, a candidate the validator will always reject — a title too long
 * to fit X once the link is counted, say — is re-chosen every single day,
 * because a failed slot consumes nothing and the candidate is still the
 * highest-scoring one tomorrow. The slot then produces nothing indefinitely and
 * the logs show the same failure forever.
 *
 * Recording the failure and standing the treatment down for a few days lets the
 * slot move to the next candidate without spending a second generation attempt
 * today, and lets the subject come back once the archive around it has changed.
 */
export function recentValidationFailure(
  ledger: PostLedger,
  subjectId: string,
  angle: Angle,
  platform: Platform,
  nowIso: string,
  withinDays: number
): PostRecord | null {
  return (
    ledger.posts.find(
      (p) =>
        p.decision === "SKIPPED_VALIDATION_FAILED" &&
        p.subjectId === subjectId &&
        p.angle === angle &&
        p.platform === platform &&
        Math.abs(Date.parse(nowIso) - Date.parse(p.runAtUtc)) / 86_400_000 < withinDays
    ) ?? null
  );
}

/** Everything published on one Chicago day, on one platform. */
export function postsOnLocalDate(
  ledger: PostLedger,
  localDate: string,
  platform: Platform
): PostRecord[] {
  return publishedPosts(ledger).filter(
    (p) => p.localDate === localDate && p.platform === platform
  );
}

/**
 * Has this exact slot already published on this platform today?
 *
 * THE RERUN GUARD. Every other duplicate protection is about editorial
 * repetition over days — subject cooldowns, topic fatigue, wording similarity.
 * None of them stops the narrower and more embarrassing case: someone clicks
 * "Re-run jobs" on a workflow that already posted, or a run is retried after a
 * transient failure that happened AFTER the platform accepted the post.
 *
 * Keyed on the Chicago local date and the slot, because that is the unit a
 * reader experiences — "the 9am post" — and it is stable across a re-run that
 * starts at a different minute.
 */
export function hasPostedInSlot(
  ledger: PostLedger,
  localDate: string,
  slot: SlotId,
  platform: Platform
): PostRecord | null {
  return (
    publishedPosts(ledger).find(
      (p) => p.localDate === localDate && p.slot === slot && p.platform === platform
    ) ?? null
  );
}

/** Recent published wording on a platform, newest first. */
export function recentTexts(ledger: PostLedger, platform: Platform, limit: number): string[] {
  return publishedPosts(ledger)
    .filter((p) => p.platform === platform && p.text)
    .sort((a, b) => b.runAtUtc.localeCompare(a.runAtUtc))
    .slice(0, limit)
    .map((p) => p.text as string);
}

/** Opening fragments of recent posts — a variety nudge for the copy engine. */
export function recentOpenings(ledger: PostLedger, platform: Platform, limit: number): string[] {
  return recentTexts(ledger, platform, limit).map((t) => t.split(/(?<=[.!?])\s/)[0].slice(0, 90));
}
