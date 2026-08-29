// =============================================================================
// CONTENT CATEGORY — what KIND of thing this is, and how much that is worth
//
// THE FAILURE THIS EXISTS TO FIX
// ------------------------------
// The evening slot published this:
//
//     "No implementation date has been set; ImmigrationClock labels each
//      figure's derivation and period completeness, publishes source limits,
//      and does not collect profiles, tracking, or identifying personal data."
//
// It won its slot with a score of 1015 against fourteen other candidates. That
// number looks like a judgement and is not one. The evening pool was fifteen
// standing pages scoring 1001 to 1015, and the formula was:
//
//     score = 1000 + (poolSize - rotationPosition)
//
// — a rotation INDEX wearing a score's clothes. The methodology page did not win
// because it was worth saying; it won because the calendar put it at the head of
// the rotation that day. Every page in the catalogue was worth exactly the same,
// so the tie-break decided the editorial question, and "what ImmigrationClock is"
// outranked every fact ImmigrationClock holds.
//
// THE RULE NOW
// ------------
// A candidate's KIND decides its band, and its merits decide its place within
// the band. Tier weights are spaced an order of magnitude wider than the ranking
// model's whole range (breadth 1000 × ~4, plus obligation/magnitude/authority/
// recency: about 4,450 at the absolute maximum), so no accumulation of intrinsic
// score can lift a product page past a real development, and no rotation index
// can decide anything except an ordering among peers.
//
// That is the point. Repetition penalties and rotation are the right instruments
// for choosing between comparable things, and the wrong instrument for deciding
// whether a page about our own methodology outranks a rule that changes what
// someone has to file.
// =============================================================================

import type { StandingAsset } from "./links";
import { DEVELOPMENT_READER_VALUE_FLOOR } from "./reader-value";

/**
 * The seven kinds of thing this account publishes, in priority order.
 *
 * Ordered as the editorial brief orders them: what changed, then when it bites,
 * then what it obliges, then what is merely proposed, then what our own data
 * shows, then durable explanation, then — last, and deliberately last — us.
 */
export type ContentCategory =
  /** A new qualifying official development: rule, decision, executive action. */
  | "development"
  /** A date that is coming: a filing window, a deadline, an effective date. */
  | "deadline"
  /** An active rule that obliges someone to do, pay or prove something. */
  | "actionable"
  /** A PROPOSED rule. Real news, but nothing is on anyone's calendar yet. */
  | "proposed"
  /** A figure from ImmigrationClock's own datasets. */
  | "data_insight"
  /** Durable explanation: what a category is, how a process works. */
  | "explainer"
  /** ImmigrationClock itself — methodology, sources, product, credibility. */
  | "methodology";

export const CONTENT_CATEGORIES: ContentCategory[] = [
  "development",
  "deadline",
  "actionable",
  "proposed",
  "data_insight",
  "explainer",
  "methodology",
];

/**
 * One tier step.
 *
 * Larger than the ranking model's entire range on purpose: a tier gap must not
 * be crossable by accumulating intrinsic score, or the ladder is a suggestion.
 * The only thing sized to cross one deliberately is the same-day mix penalty
 * below, which is exactly one step — see MIX_PENALTY.
 */
export const TIER_STEP = 10_000;

export const CATEGORY_TIER: Record<ContentCategory, number> = {
  development: 7 * TIER_STEP,
  deadline: 6 * TIER_STEP,
  actionable: 5 * TIER_STEP,
  proposed: 4 * TIER_STEP,
  data_insight: 3 * TIER_STEP,
  explainer: 2 * TIER_STEP,
  methodology: 1 * TIER_STEP,
};

/** Human wording for logs, the ledger and the simulator. */
export const CATEGORY_LABEL: Record<ContentCategory, string> = {
  development: "Immigration development",
  deadline: "Deadline / effective date",
  actionable: "Actionable change",
  proposed: "Proposed rule",
  data_insight: "ImmigrationClock data",
  explainer: "Explainer",
  methodology: "Methodology / product",
};

// -----------------------------------------------------------------------------
// THE MIX
// -----------------------------------------------------------------------------

/**
 * The five buckets the content mix is expressed in, coarser than the categories.
 *
 * A proposed rule is still news to a reader; an obligation that starts in three
 * weeks is still an alert. The tiers decide what wins a single slot; the buckets
 * decide what a WEEK looks like.
 */
export type MixBucket = "news" | "alerts" | "data" | "evergreen" | "product";

export function mixBucketFor(category: ContentCategory): MixBucket {
  switch (category) {
    case "development":
    case "proposed":
      return "news";
    case "deadline":
    case "actionable":
      return "alerts";
    case "data_insight":
      return "data";
    case "explainer":
      return "evergreen";
    case "methodology":
      return "product";
  }
}

/**
 * Target share of published posts, per bucket.
 *
 * TARGETS, NOT QUOTAS, and the difference is enforced structurally rather than
 * promised in a comment: nothing here can promote a candidate, invent one, or
 * lower a quality gate to reach a percentage. The only instrument is a penalty
 * on a bucket that is ALREADY over its share, which can move a slot to the next
 * qualifying thing and can never manufacture something to move it to. A week
 * with no qualifying news is a week of alerts, data and explainers, and that is
 * the system working rather than a shortfall to correct.
 */
export const MIX_TARGET: Record<MixBucket, number> = {
  news: 0.5,
  alerts: 0.2,
  data: 0.15,
  evergreen: 0.1,
  product: 0.05,
};

/**
 * The penalty for a bucket that has already had its turn today: exactly one
 * tier step.
 *
 * Sized deliberately. It does not exclude the bucket — it moves it down one
 * band, so a second development competes with the deadline tier on its intrinsic
 * merits rather than on its category. A genuinely major second development still
 * wins; a routine one yields to a deadline or a data point. That is the daily
 * shape the mix describes (roughly one news, one alert, one other) expressed as
 * arithmetic instead of a quota.
 */
/**
 * WHAT ONE TIER STEP BUYS, MEASURED RATHER THAN ASSUMED.
 *
 * The penalty below is one TIER_STEP, on the reasoning that it moves a bucket
 * down one band. That is true of the BASE, and not quite true of the total,
 * because the bands are not equally furnished: over the real archive an event's
 * merit runs 2,950–8,225 while a standing asset's runs 1–9. So a development
 * demoted by a full step lands around 63,800 and the best key-date deadline the
 * catalogue ever produces is 63,119 — the demoted development still wins.
 *
 * That is the intended editorial answer (a real development outranks a
 * countdown), but it means the same-day penalty makes a second development
 * COMPETE with the deadline tier rather than yield to it, and it never reaches
 * the datasets three bands down at all.
 *
 * The case it was written for is now handled a level up, which is why this is a
 * note and not a change: a second development that ought to yield is usually one
 * with little reader value, and such an item no longer reaches the `development`
 * tier — categoryForEvent() sends it down the archive ladder instead. The mix
 * penalty is left doing the narrower job it can actually do.
 */
export const MIX_PENALTY = {
  /** The bucket already published today. One tier step. */
  sameDayBucket: TIER_STEP,
  /**
   * The bucket is running over its target share across the window. One tier
   * step, not half of one.
   *
   * Half a step was the first attempt and it did nothing, which a 14-day
   * selection simulation showed plainly: the datasets ran at 46% against a 15%
   * target, took the penalty, and still outranked every explainer because the
   * gap between those two bands is a whole step. A penalty too small to cross a
   * band is not a weaker penalty — it is no penalty at all, and it would have
   * sat in the code looking like a working mix control.
   */
  weekOvershoot: TIER_STEP,
} as const;

/** How far back the mix is measured. Long enough for a share to mean something. */
export const MIX_WINDOW_DAYS = 14;

/**
 * How far over target a bucket must run before the weekly penalty applies.
 *
 * Slack, not precision. Three posts a day makes every share a coarse fraction,
 * and correcting a two-point overshoot would make the feed thrash between
 * buckets for arithmetic reasons a reader cannot see.
 */
export const MIX_TOLERANCE = 0.1;

/**
 * Is this bucket running far enough over its target to be penalised?
 *
 * Returns false while the window is too small to mean anything: with four posts
 * on the clock, one of them is 25% of the feed and no share is evidence of
 * anything.
 */
export function isOverTarget(
  bucket: MixBucket,
  counts: Record<MixBucket, number>,
  minimumSample = 6
): boolean {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < minimumSample) return false;
  const share = (counts[bucket] ?? 0) / total;
  return share > MIX_TARGET[bucket] + MIX_TOLERANCE;
}

// -----------------------------------------------------------------------------
// CLASSIFICATION
// -----------------------------------------------------------------------------

/**
 * Which category a STANDING ASSET belongs to, from its own tags.
 *
 * The three pages about ImmigrationClock itself — methodology, sources, and the
 * following page — land in the bottom tier together. They are allowed to post,
 * because an account that never explains how it knows things is also failing;
 * they are simply never allowed to displace something that happened.
 */
export function categoryForAsset(asset: StandingAsset): ContentCategory {
  const tags = asset.tags ?? [];
  if (tags.includes("methodology") || tags.includes("product") || tags.includes("privacy")) {
    return "methodology";
  }
  if (tags.includes("data")) return "data_insight";
  return "explainer";
}

/**
 * Which category an EVENT belongs to.
 *
 * `fresh` is what separates a development from an explainer: the same document
 * is news on the day it publishes and reference material a fortnight later, and
 * conflating those is how an archive item ends up presented as a change.
 *
 * A proposal is demoted even when it is fresh. It is real news and it is nothing
 * a reader can act on: nothing has changed, no date exists, and it may never
 * become operative. Ranking it below an active obligation is the editorial
 * position "we tell you what is true now" made mechanical.
 */
export function categoryForEvent(input: {
  classification: string | null;
  fresh: boolean;
  obligationLevel: number;
  hasUpcomingEffectiveDate: boolean;
  /**
   * How much a reader would actually care — 0-100, from reader-value.ts.
   *
   * NEWEST IS NOT AUTOMATICALLY BEST, AND THIS IS WHERE THAT IS ENFORCED.
   *
   * `fresh` used to be sufficient for the top band on its own, which made the
   * ladder partly an age ladder: a routine notice published this morning sat two
   * whole tiers — 20,000 points — above a fee rule from last week that changes
   * what somebody pays. No amount of merit could close that, because tier steps
   * are not crossable by merit, which is the property that makes them useful
   * everywhere else.
   *
   * So freshness is now necessary and not sufficient. A new item that reaches
   * people leads the day; a new item that reaches nobody falls through to the
   * SAME ladder an archive item is judged on and competes there on what it does.
   * It is not suppressed — it is simply no longer promoted for having a recent
   * date on it.
   *
   * OPTIONAL, and its absence means "not assessed". Callers that do not compute
   * reader value get the original freshness rule, so this is an addition to the
   * model rather than a silent change to every caller's behaviour.
   */
  readerValue?: number;
}): ContentCategory {
  if (input.classification === "proposed_rule") return "proposed";
  // Freshness before the effective date, deliberately. A rule that published
  // today AND starts on a known date is the strongest thing this account ever
  // has — "starting 15 September, X will be rejected" — and demoting it into the
  // deadline tier because it carries a date would rank it below the archive
  // items that merely resurface one. The date is not lost: it is required in the
  // copy by the validator's effective-date check.
  const consequentialEnough =
    input.readerValue === undefined || input.readerValue >= DEVELOPMENT_READER_VALUE_FLOOR;
  if (input.fresh && consequentialEnough) return "development";
  if (input.hasUpcomingEffectiveDate) return "deadline";
  if (input.obligationLevel >= 2) return "actionable";
  return "explainer";
}
