// =============================================================================
// DEDUPE — repetition is a wording problem AND a treatment problem
//
// The first design of this module banned a subject forever once it had been
// posted, keyed on subject and platform. That is wrong, and wrong in a way that
// actively degrades the feed: the H-1B and L-1 biometric fee rule is worth a
// post when it lands, a second when its effective date approaches, and a third
// explaining who actually pays it. Those are three different things to say, not
// one thing said three times. A permanent ban throws away two of them.
//
// So uniqueness is modelled as:
//
//     subject  ×  editorial angle  ×  platform  ×  cooldown
//
// and the thing the naive rule was really trying to prevent — the feed sounding
// like it is repeating itself — is caught directly, by comparing the actual
// wording, in checkWording() below.
//
// TWO GATES, DELIBERATELY SPLIT
// -----------------------------
// checkSubject() runs BEFORE the copy engine and is pure bookkeeping: it costs
// nothing and rejects most repetition without an API call. checkWording() runs
// AFTER generation, because you cannot compare wording that does not exist yet.
// Keeping them separate is what makes the expensive gate the rare one.
//
// COOLDOWNS DIFFER BY WHAT KIND OF THING THE SUBJECT IS
// ----------------------------------------------------
// An event is a moment: its news value expires, so a given treatment of it is
// spent once used. A standing asset is a permanent resource and a key date
// recurs every year — pointing at either again months later is normal
// behaviour, not repetition. Treating all three the same would either burn
// through the standing pool in three weeks or let a breaking story recycle
// forever.
// =============================================================================

import type { Angle, Platform, PoolId } from "./types";
import type { DedupeResult } from "./types";
import {
  hasTreatment,
  lastPostForSubject,
  lastPostForUrl,
  publishedPosts,
  recentTexts,
  recentValidationFailure,
  treatmentCount,
  type PostLedger,
} from "./ledger";

/** Subject kinds, derived from the id prefix. */
export type SubjectKind = "event" | "keydate" | "asset";

export function subjectKind(subjectId: string): SubjectKind {
  if (subjectId.startsWith("keydate:")) return "keydate";
  if (subjectId.startsWith("asset:")) return "asset";
  return "event";
}

interface CooldownPolicy {
  /**
   * Days before the SAME angle on the same subject may run again.
   * `Infinity` means never — correct for events, whose moment does not return.
   */
  treatmentCooldownDays: number;
  /** Days before the subject may appear again under ANY angle. */
  subjectCooldownDays: number;
  /** Distinct angles a subject may ever receive. `Infinity` for durable subjects. */
  maxTreatments: number;
}

export const COOLDOWNS: Record<SubjectKind, CooldownPolicy> = {
  // A news event: each angle is spent once, angles must be spaced two weeks
  // apart so a story cannot be milked, and four treatments is the ceiling.
  event: { treatmentCooldownDays: Infinity, subjectCooldownDays: 14, maxTreatments: 4 },
  // An annual deadline. It genuinely comes round again.
  keydate: { treatmentCooldownDays: 300, subjectCooldownDays: 21, maxTreatments: Infinity },
  // A permanent page. Re-surfacing it a few months later is useful, not lazy.
  asset: { treatmentCooldownDays: 120, subjectCooldownDays: 21, maxTreatments: Infinity },
};

/** Days before the same destination URL may be linked again on a platform. */
export const URL_COOLDOWN_DAYS = 7;

/**
 * Days a treatment stands down after the validator rejected it twice.
 *
 * Short on purpose. The usual cause is transient — a generation that ran long,
 * or a figure the model reached for that was not in the fact set — and the next
 * attempt would probably succeed. What this prevents is the pathological case
 * where the failure is structural and the slot retries it daily forever.
 */
export const VALIDATION_COOLDOWN_DAYS = 5;

/** How many recent posts the wording check compares against. */
export const WORDING_HISTORY = 60;

/**
 * Jaccard similarity above which two posts are "the same post".
 *
 * 0.55 was chosen against the real archive: genuinely different treatments of
 * one rule land around 0.25–0.40 because they share the subject's proper nouns
 * but little else, while a regeneration of the same angle lands above 0.7. The
 * gap is wide enough that the threshold is not delicate.
 */
export const SIMILARITY_LIMIT = 0.55;

function daysBetween(aIso: string, bIso: string): number {
  return Math.abs(Date.parse(bIso) - Date.parse(aIso)) / 86_400_000;
}

// -----------------------------------------------------------------------------
// GATE 1 — bookkeeping, before any generation
// -----------------------------------------------------------------------------

export interface SubjectCheck {
  ok: boolean;
  reason: string;
  /** Angles still available for this subject on this platform. */
  availableAngles: Angle[];
}

/**
 * May we post about this subject, on this platform, today — and if so, under
 * which angles?
 *
 * Returns the surviving angles rather than a bare yes/no so the caller can pick
 * the best remaining treatment instead of giving up because its first choice
 * was taken.
 */
export function checkSubject(
  ledger: PostLedger,
  subjectId: string,
  candidateAngles: Angle[],
  platform: Platform,
  deepLink: string,
  now: Date,
  /** The pool this candidate came from. Governs how the URL cooldown applies. */
  pool: PoolId = "knowledge"
): SubjectCheck {
  const kind = subjectKind(subjectId);
  const policy = COOLDOWNS[kind];
  const nowIso = now.toISOString();

  // The destination is shared across subjects — two different events can both
  // resolve to /h1b/top-sponsors — so this check is about the reader's
  // experience of the feed, not about the subject.
  //
  // NEWS IS EXEMPT FROM COOLDOWNS CAUSED BY OTHER POOLS.
  //
  // Found in the seven-day simulation: a genuinely new final rule on H-1B and
  // L-1 fees was suppressed because the evening slot had linked
  // /h1b/top-sponsors five days earlier as a standing data post. That is exactly
  // backwards — new official developments are the rarest and most valuable thing
  // this account publishes, and deferring one because a reference page was
  // surfaced last week is a priority inversion, not a repetition guard.
  //
  // News still cools down against OTHER NEWS, so two consecutive breaking posts
  // cannot both land on the same page.
  const urlLedger =
    pool === "news"
      ? { ...ledger, posts: ledger.posts.filter((p) => p.pool === "news") }
      : ledger;

  const urlPost = lastPostForUrl(urlLedger, deepLink, platform);
  if (urlPost && daysBetween(urlPost.runAtUtc, nowIso) < URL_COOLDOWN_DAYS) {
    return {
      ok: false,
      reason: `URL cooldown: ${deepLink} was linked ${Math.round(
        daysBetween(urlPost.runAtUtc, nowIso)
      )} days ago (limit ${URL_COOLDOWN_DAYS})`,
      availableAngles: [],
    };
  }

  const last = lastPostForSubject(ledger, subjectId, platform);
  if (last && daysBetween(last.runAtUtc, nowIso) < policy.subjectCooldownDays) {
    return {
      ok: false,
      reason: `Subject cooldown: last posted ${Math.round(
        daysBetween(last.runAtUtc, nowIso)
      )} days ago (limit ${policy.subjectCooldownDays} for ${kind})`,
      availableAngles: [],
    };
  }

  if (treatmentCount(ledger, subjectId, platform) >= policy.maxTreatments) {
    return {
      ok: false,
      reason: `Treatment cap: ${policy.maxTreatments} angles already used for this ${kind}`,
      availableAngles: [],
    };
  }

  const available = candidateAngles.filter((angle) => {
    // A treatment the validator recently rejected stands down, so one
    // unpublishable candidate cannot occupy a slot every day forever.
    if (
      recentValidationFailure(ledger, subjectId, angle, platform, nowIso, VALIDATION_COOLDOWN_DAYS)
    ) {
      return false;
    }
    const prior = hasTreatment(ledger, subjectId, angle, platform);
    if (!prior) return true;
    if (policy.treatmentCooldownDays === Infinity) return false;
    return daysBetween(prior.runAtUtc, nowIso) >= policy.treatmentCooldownDays;
  });

  if (available.length === 0) {
    return {
      ok: false,
      reason: "Every supported angle for this subject has already been used",
      availableAngles: [],
    };
  }

  return { ok: true, reason: "eligible", availableAngles: available };
}

// -----------------------------------------------------------------------------
// GATE 2 — wording, after generation
// -----------------------------------------------------------------------------

/**
 * Normalize before comparing.
 *
 * URLs and digits are stripped: every post about the same subject links to the
 * same page and quotes the same dates, and leaving those in would make two
 * genuinely different treatments look similar for reasons that have nothing to
 * do with how they read.
 */
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#\w+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word trigrams. Word-level, not character-level: it is phrasing we care about. */
export function trigrams(text: string): Set<string> {
  const words = normalizeForComparison(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length < 3) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

/** Does this wording read like something we have already published? */
export function checkWording(
  ledger: PostLedger,
  text: string,
  platform: Platform
): DedupeResult {
  const history = recentTexts(ledger, platform, WORDING_HISTORY);
  let max = 0;
  let nearest: string | null = null;

  for (const prior of history) {
    const s = similarity(text, prior);
    if (s > max) {
      max = s;
      nearest = prior;
    }
  }

  if (max >= SIMILARITY_LIMIT) {
    return {
      ok: false,
      reason: `Too similar to a recent post (${max.toFixed(2)} ≥ ${SIMILARITY_LIMIT})`,
      maxSimilarity: max,
      nearest,
    };
  }
  return { ok: true, reason: "distinct", maxSimilarity: max, nearest };
}

/** Every subject published in the window, for the simulation's repetition report. */
export function subjectsPostedSince(ledger: PostLedger, sinceIso: string): string[] {
  return publishedPosts(ledger)
    .filter((p) => p.runAtUtc >= sinceIso)
    .map((p) => p.subjectId ?? "")
    .filter(Boolean);
}
