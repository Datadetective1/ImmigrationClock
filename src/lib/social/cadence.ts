// =============================================================================
// CADENCE — one post a day, earned, and a narrow exception for breaking news
//
// THE TARGET, STATED (since 2026-10-08)
// -------------------------------------
//   Normal days           one post: the most useful verified development
//   Quiet days            one evergreen post — an explainer or a data insight —
//                         only if the account holds one worth publishing, and
//                         at most MAX_EVERGREEN_PER_7_DAYS a week
//   Nothing worth saying  nothing. The daily window never lowers a bar to fill.
//   Breaking days         one more post, at most, for a MAJOR development
//                         published today or yesterday that the daily post did
//                         not cover. See isBreakingCandidate().
//
// Before this, the account had three windows a day and up to three posts. That
// made it read like a feed; the point is a daily source people trust. Every X
// post also spends prepaid API credit, so a post that does not earn its place
// costs twice.
//
// WHY TIERS
// ---------
//   news        may publish in the daily window, and — if it is breaking-grade
//               — in the breaking window. Always preferred over the other two
//               tiers in the daily window (see run.ts).
//   follow_up   may publish in the daily window when no news is eligible, at
//               most MAX_FOLLOW_UPS_PER_7_DAYS a week. Real information with a
//               date on it, but not what happened today.
//   evergreen   may publish in the daily window only when nothing timelier is
//               eligible, at most MAX_EVERGREEN_PER_7_DAYS a week, so a quiet
//               week still leaves days with nothing.
//
// Every number below is a ceiling on how much, never a floor on how little.
// Nothing here can promote a candidate, invent one, or lower a quality gate.
// =============================================================================

import type { CadenceTier } from "./content-types";
import { TIER_FOR_TYPE, isContentType } from "./content-types";
import { postsOnLocalDate, publishedPosts, type PostLedger, type PostRecord } from "./ledger";
import type { Candidate, Platform, SlotDef } from "./types";

/** The normal day: one post. */
export const MAX_DAILY_POSTS = 1;

/** Breaking-news posts per day, on top of the daily post. One, and rarely. */
export const MAX_BREAKING_POSTS_PER_DAY = 1;

/** The absolute ceiling on one platform in one Chicago day. */
export const MAX_POSTS_PER_DAY = MAX_DAILY_POSTS + MAX_BREAKING_POSTS_PER_DAY;

/** Hours between two posts on one platform. Two posts an hour apart read as a burst. */
export const MIN_SPACING_HOURS = 3;

/**
 * Follow-ups per rolling seven days. Without this, a week with no news is a
 * week of why-it-matters posts on ageing changes, because a follow-up always
 * outranks an explainer on the category ladder.
 */
export const MAX_FOLLOW_UPS_PER_7_DAYS = 3;

/**
 * Evergreen posts per rolling seven days. Five, not seven: a week with no news
 * should still leave two days with nothing, so the feed never becomes a
 * metronome of explainers.
 */
export const MAX_EVERGREEN_PER_7_DAYS = 5;

/**
 * How recent a development must be to justify a breaking post: published today
 * or yesterday (Chicago). Yesterday because the Federal Register and the
 * agencies publish after our previous day's window may have closed.
 */
export const BREAKING_MAX_AGE_DAYS = 1;

/**
 * Is this candidate worth a SECOND post today?
 *
 * Deliberately narrow, and deliberately mechanical: the selector's own
 * "breaking_change" type (which already applied the ranking and reader-value
 * floors), on a record the archive ranks MAJOR, published today or yesterday.
 * Notable notices, follow-ups, explainers and data insights never qualify,
 * however well they score.
 */
export function isBreakingCandidate(candidate: Candidate, today: string): boolean {
  const e = candidate.event;
  if (candidate.tier !== "news" || candidate.contentType !== "breaking_change" || !e) return false;
  if (e.severity !== "major") return false;
  const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${e.publishedAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
  return age >= 0 && age <= BREAKING_MAX_AGE_DAYS;
}

/**
 * The cheap twin of isBreakingCandidate(), for the workflow gate, which runs
 * before dependencies are installed and so cannot build candidates. True when
 * the archive holds ANY major record from today or yesterday that has not been
 * posted on this platform. A superset of what the run will accept: it may let
 * a firing through that then publishes nothing, never the reverse.
 */
export function mayHaveBreakingNews(
  events: { id: string; severity: string; publishedAt: string }[],
  ledger: PostLedger,
  platform: Platform,
  today: string
): boolean {
  const posted = new Set(publishedPosts(ledger).filter((p) => p.platform === platform).map((p) => p.subjectId));
  return events.some((e) => {
    if (e.severity !== "major") return false;
    const age = (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${e.publishedAt.slice(0, 10)}T00:00:00Z`)) / 86_400_000;
    return age >= 0 && age <= BREAKING_MAX_AGE_DAYS && !posted.has(`event:${e.id}`);
  });
}

/**
 * Did X refuse a post today because the prepaid balance is empty?
 *
 * HTTP 402 is not transient: every later attempt today would make another API
 * request and fail the same way. The gate reads this and stops the day's
 * remaining scheduled firings; a human who tops up the balance can dispatch
 * the workflow by hand, which skips the gate.
 */
export function creditsDepletedToday(ledger: PostLedger, localDate: string, platform: Platform): PostRecord | null {
  return (
    ledger.posts.find(
      (p) =>
        p.localDate === localDate &&
        p.platform === platform &&
        p.decision === "SKIPPED_PUBLISH_FAILED" &&
        /credits depleted|HTTP 402/i.test(p.reason ?? "")
    ) ?? null
  );
}

export interface CadenceDecision {
  /** Tiers a candidate may publish under in this run. Empty means nothing may. */
  allowedTiers: CadenceTier[];
  /** True when nothing may publish, whatever the queue holds. */
  blocked: boolean;
  /** True in the breaking window: only isBreakingCandidate() may publish. */
  breakingOnly: boolean;
  /** One sentence a human can read in the ledger. */
  explain: string;
  /** What the day looked like before this run. */
  postsToday: number;
  followUpsToday: number;
  evergreenLast7Days: number;
}

function tierOf(row: PostRecord): CadenceTier | null {
  if (row.contentType && isContentType(row.contentType)) return TIER_FOR_TYPE[row.contentType];
  return null;
}

/** Published rows in the last N days on one platform. */
function publishedSince(ledger: PostLedger, platform: Platform, sinceMs: number): PostRecord[] {
  return publishedPosts(ledger).filter(
    (p) => p.platform === platform && Date.parse(p.runAtUtc) >= sinceMs
  );
}

/**
 * What this run may publish.
 *
 * Reads only POSTED rows, so a dry run and a validator failure consume nothing.
 * Pure with respect to the clock: `now` is an argument, so a simulation and a
 * production run of the same instant agree.
 */
export function decideCadence(input: {
  ledger: PostLedger;
  platform: Platform;
  slot: SlotDef;
  localDate: string;
  now: Date;
}): CadenceDecision {
  const { ledger, platform, slot, localDate, now } = input;
  const today = postsOnLocalDate(ledger, localDate, platform);
  const postsToday = today.length;
  const followUpsToday = today.filter((r) => tierOf(r) === "follow_up").length;
  const breakingToday = today.filter((r) => r.slot === "breaking").length;
  const last7 = publishedSince(ledger, platform, now.getTime() - 7 * 86_400_000);
  const evergreenLast7Days = last7.filter((r) => tierOf(r) === "evergreen").length;
  const followUpsLast7Days = last7.filter((r) => tierOf(r) === "follow_up").length;

  const summary = `${postsToday} post(s) today, ${followUpsLast7Days} follow-ups and ${evergreenLast7Days} evergreen in 7d`;
  const blocked = (explain: string): CadenceDecision => ({
    allowedTiers: [],
    blocked: true,
    breakingOnly: slot.id === "breaking",
    explain: `${explain}; ${summary}`,
    postsToday,
    followUpsToday,
    evergreenLast7Days,
  });

  if (postsToday >= MAX_POSTS_PER_DAY) return blocked(`Daily maximum reached (${MAX_POSTS_PER_DAY})`);

  // The daily window: one post, whatever window put the day's first one out.
  if (slot.id === "daily" && postsToday >= MAX_DAILY_POSTS) return blocked("Today's post already went out");

  const lastAt = today.reduce((max, r) => Math.max(max, Date.parse(r.runAtUtc)), 0);
  if (lastAt > 0) {
    const hoursSince = (now.getTime() - lastAt) / 3_600_000;
    if (hoursSince < MIN_SPACING_HOURS) {
      return blocked(`Last post was ${hoursSince.toFixed(1)}h ago; minimum spacing is ${MIN_SPACING_HOURS}h`);
    }
  }

  if (slot.id === "breaking") {
    if (breakingToday >= MAX_BREAKING_POSTS_PER_DAY) {
      return blocked(`A breaking post already went out today (ceiling ${MAX_BREAKING_POSTS_PER_DAY})`);
    }
    return {
      allowedTiers: ["news"],
      blocked: false,
      breakingOnly: true,
      explain: `Breaking window: only a major development published today or yesterday may publish. ${summary}`,
      postsToday,
      followUpsToday,
      evergreenLast7Days,
    };
  }

  const allowed: CadenceTier[] = ["news"];
  const why: string[] = ["news may publish"];

  if (followUpsLast7Days < MAX_FOLLOW_UPS_PER_7_DAYS) {
    allowed.push("follow_up");
    why.push("a follow-up may publish if no news is eligible");
  } else {
    why.push(`follow-ups wait (${followUpsLast7Days} in the last 7 days, ceiling ${MAX_FOLLOW_UPS_PER_7_DAYS})`);
  }

  if (evergreenLast7Days < MAX_EVERGREEN_PER_7_DAYS) {
    allowed.push("evergreen");
    why.push("an explainer or data insight may publish if nothing timelier is eligible");
  } else {
    why.push(`evergreen waits (${evergreenLast7Days} in the last 7 days, ceiling ${MAX_EVERGREEN_PER_7_DAYS})`);
  }

  return {
    allowedTiers: allowed,
    blocked: false,
    breakingOnly: false,
    explain: `${why.join("; ")}. ${summary}`,
    postsToday,
    followUpsToday,
    evergreenLast7Days,
  };
}

/**
 * The candidates this run may choose from, in the order it should try them.
 *
 * Two groups. In the daily window, every eligible NEWS candidate is tried
 * before anything else, so a timely development is never displaced by an
 * explainer that rotation happened to favour; the rest follow on the category
 * ladder's own score. In the breaking window there is only the first group,
 * and only breaking-grade news is in it.
 */
export function eligibleGroups(candidates: Candidate[], cadence: CadenceDecision, today: string): Candidate[][] {
  if (cadence.blocked) return [];
  const allowed = candidates.filter((c) => cadence.allowedTiers.includes(c.tier));
  if (cadence.breakingOnly) {
    const breaking = allowed.filter((c) => isBreakingCandidate(c, today));
    return breaking.length ? [breaking] : [];
  }
  const news = allowed.filter((c) => c.tier === "news");
  const rest = allowed.filter((c) => c.tier !== "news");
  return [news, rest].filter((g) => g.length > 0);
}
