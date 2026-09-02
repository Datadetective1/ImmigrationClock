// =============================================================================
// CADENCE — how often, and what kind, without a quota
//
// THE TARGET, STATED
// ------------------
//   Normal days           about one useful post
//   Consequential days    two, occasionally three, when they are genuinely
//                         distinct developments
//   Quiet days            one evergreen post — an explainer, a data signal or
//                         a tool — if the account holds one worth publishing
//   Nothing worth saying  nothing
//
// This file is the policy that produces that shape, and it does it without a
// quota anywhere. Nothing here can promote a candidate, invent one, or lower a
// quality gate. It only answers, for one run in one window: which TIERS of
// content may publish right now, given what has already gone out today.
//
// WHY TIERS AND NOT TYPES
// -----------------------
// Eight content types would make this a matrix. Three tiers make it three
// sentences:
//
//   news        may publish in any window, up to the daily maximum, subject to
//               the spacing rule. A material change does not wait for a slot.
//   follow_up   may publish while the day has fewer than two posts, once a day.
//               Real information with a date on it, but not what happened today.
//   evergreen   may publish only when the day has been QUIET so far, only in
//               the afternoon or evening (so a morning development always gets
//               first refusal), and at most a handful of times a week. This is
//               the tier that turns "nothing happened in government today" into
//               a useful post — and the tier most in need of a ceiling, because
//               an account that reaches for it daily reads as a content
//               calendar, not a publication.
//
// Every number below is a ceiling on how much, never a floor on how little.
// =============================================================================

import type { CadenceTier } from "./content-types";
import { TIER_FOR_TYPE, isContentType } from "./content-types";
import { postsOnLocalDate, publishedPosts, type PostLedger, type PostRecord } from "./ledger";
import type { Platform, SlotDef, SlotId } from "./types";

/** Never more than this many posts on one platform in one Chicago day. */
export const MAX_POSTS_PER_DAY = 3;

/** Hours between two posts on one platform. Two posts an hour apart read as a burst. */
export const MIN_SPACING_HOURS = 3;

/** Follow-ups per day. One is context; two is a second feed. */
export const MAX_FOLLOW_UPS_PER_DAY = 1;

/**
 * Follow-ups per rolling seven days.
 *
 * Without this, a week with no news is a week of why-it-matters posts on
 * ageing changes, because a follow-up always outranks an explainer on the
 * category ladder. Three a week leaves the quiet days to the evergreen tier,
 * which is what a quiet day is for.
 */
export const MAX_FOLLOW_UPS_PER_7_DAYS = 3;

/** The windows in which an evergreen post may go out. Never the morning. */
export const EVERGREEN_WINDOWS: SlotId[] = ["afternoon", "evening"];

/**
 * Evergreen posts per rolling seven days.
 *
 * Five, not seven. A week with no news should still leave two days with
 * nothing, so the feed never becomes a metronome of explainers. This is the
 * one number in the file that expresses taste rather than mechanics, and it is
 * deliberately visible.
 */
export const MAX_EVERGREEN_PER_7_DAYS = 5;

export interface CadenceDecision {
  /** Tiers a candidate may publish under in this run. Empty means nothing may. */
  allowedTiers: CadenceTier[];
  /** True when nothing may publish, whatever the queue holds. */
  blocked: boolean;
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
  const last7 = publishedSince(ledger, platform, now.getTime() - 7 * 86_400_000);
  const evergreenLast7Days = last7.filter((r) => tierOf(r) === "evergreen").length;
  const followUpsLast7Days = last7.filter((r) => tierOf(r) === "follow_up").length;

  const summary = `${postsToday} post(s) today, ${followUpsToday} follow-up(s), ${followUpsLast7Days} follow-ups and ${evergreenLast7Days} evergreen in 7d`;

  if (postsToday >= MAX_POSTS_PER_DAY) {
    return {
      allowedTiers: [],
      blocked: true,
      explain: `Daily maximum reached (${MAX_POSTS_PER_DAY}); ${summary}`,
      postsToday,
      followUpsToday,
      evergreenLast7Days,
    };
  }

  const lastAt = today.reduce((max, r) => Math.max(max, Date.parse(r.runAtUtc)), 0);
  if (lastAt > 0) {
    const hoursSince = (now.getTime() - lastAt) / 3_600_000;
    if (hoursSince < MIN_SPACING_HOURS) {
      return {
        allowedTiers: [],
        blocked: true,
        explain: `Last post was ${hoursSince.toFixed(1)}h ago; minimum spacing is ${MIN_SPACING_HOURS}h. ${summary}`,
        postsToday,
        followUpsToday,
        evergreenLast7Days,
      };
    }
  }

  const allowed: CadenceTier[] = ["news"];
  const why: string[] = ["news may publish"];

  if (postsToday < 2 && followUpsToday < MAX_FOLLOW_UPS_PER_DAY && followUpsLast7Days < MAX_FOLLOW_UPS_PER_7_DAYS) {
    allowed.push("follow_up");
    why.push("a follow-up may publish");
  } else if (followUpsLast7Days >= MAX_FOLLOW_UPS_PER_7_DAYS) {
    why.push(`follow-ups wait (${followUpsLast7Days} in the last 7 days, ceiling ${MAX_FOLLOW_UPS_PER_7_DAYS})`);
  } else {
    why.push(
      postsToday >= 2 ? "follow-ups wait (two posts already)" : "follow-ups wait (one already today)"
    );
  }

  if (postsToday === 0 && EVERGREEN_WINDOWS.includes(slot.id) && evergreenLast7Days < MAX_EVERGREEN_PER_7_DAYS) {
    allowed.push("evergreen");
    why.push("the day is quiet, so an evergreen post may publish");
  } else if (postsToday > 0) {
    why.push("evergreen waits (the day is not quiet)");
  } else if (!EVERGREEN_WINDOWS.includes(slot.id)) {
    why.push("evergreen waits for the afternoon");
  } else {
    why.push(`evergreen waits (${evergreenLast7Days} in the last 7 days, ceiling ${MAX_EVERGREEN_PER_7_DAYS})`);
  }

  return {
    allowedTiers: allowed,
    blocked: false,
    explain: `${why.join("; ")}. ${summary}`,
    postsToday,
    followUpsToday,
    evergreenLast7Days,
  };
}
