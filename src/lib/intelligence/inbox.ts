// =============================================================================
// THE INTELLIGENCE INBOX — "what changed that matters to my work?"
//
// WHY THIS AND NOT A FEED
// -----------------------
// The archive is a feed already, and a feed answers the wrong question. A
// professional does not want everything that happened; they want the handful of
// things that touch what they are responsible for, sorted by how soon they have
// to care, with the evidence attached so they can decide in thirty seconds
// rather than opening five government PDFs.
//
// So this sorts a set of changes into buckets a working person recognises:
//
//   needs_attention      matches something they follow AND takes effect soon or
//                        is major. The only bucket that should ever be a number
//                        on a badge.
//   effective_soon       has a stated effective date inside the horizon.
//   recently_changed     published recently.
//   potentially_relevant matched only on WEAK evidence — a citation, an aside.
//                        Surfaced deliberately, labelled as needing a read,
//                        because hiding a maybe is its own kind of lying.
//   reviewed             a person has approved it.
//   superseded           a later record amends it.
//
// EVERY ITEM CARRIES ITS OWN CASE. What changed, why it may matter, when it
// takes effect, the source, the evidence quote, the classification method, the
// limitations, the review status. A bucket assignment a reader cannot check is
// a bucket assignment they will stop trusting the first time it is wrong.
//
// WHAT THIS DOES NOT DO
// ---------------------
// It never decides anything about a person. "Needs attention" is a statement
// about a document's date and a user's own watchlist, not about anybody's case,
// eligibility or options. There is no scoring of individuals here and there
// will not be one.
// =============================================================================

import type { PublicChange } from "./change";
import { buildBrief, type ImpactBrief } from "./brief";

export const INBOX_BUCKETS = [
  "needs_attention",
  "effective_soon",
  "recently_changed",
  "potentially_relevant",
  "reviewed",
  "superseded",
] as const;

export type InboxBucket = (typeof INBOX_BUCKETS)[number];

export const BUCKET_LABEL: Record<InboxBucket, string> = {
  needs_attention: "Needs attention",
  effective_soon: "Effective soon",
  recently_changed: "Recently changed",
  potentially_relevant: "Potentially relevant",
  reviewed: "Reviewed",
  superseded: "Superseded",
};

export const BUCKET_MEANING: Record<InboxBucket, string> = {
  needs_attention:
    "Matches something you follow, and either takes effect within the horizon or is a major change.",
  effective_soon: "Has a stated effective date inside the horizon, whether or not you follow it.",
  recently_changed: "Published recently.",
  potentially_relevant:
    "Matched only on weak evidence — a citation, a footnote or an aside. Read the quote before acting on it.",
  reviewed: "A person has read this record against its source and approved it.",
  superseded: "A later record amends this one. Read the newer record first.",
};

export interface InboxItem {
  change: PublicChange;
  bucket: InboxBucket;
  /** The followed entity ids this change matched, if any. */
  matched: string[];
  /**
   * Days until the effective date. Negative when it has passed, null when the
   * document states none. Never guessed.
   */
  daysUntilEffective: number | null;
  /** The professional brief, so a reader never has to open another page first. */
  brief: ImpactBrief;
  /** Why this landed in this bucket, in one sentence a reader can check. */
  because: string;
}

export interface InboxOptions {
  /** Entity ids the user follows: "visa:h-1b", "country:india", "form:i-129". */
  follows: readonly string[];
  /** ISO date to reckon from. */
  today: string;
  /** How far ahead "soon" reaches. Days. */
  horizonDays?: number;
  /** How far back "recently" reaches. Days. */
  recentDays?: number;
}

export interface Inbox {
  buckets: { bucket: InboxBucket; label: string; meaning: string; items: InboxItem[] }[];
  /** Everything, in one list, in the order the buckets appear. */
  items: InboxItem[];
  /** What the reader is following, echoed back so an empty inbox is legible. */
  follows: string[];
  /** Counts, for a summary line. */
  counts: Record<InboxBucket, number>;
  /**
   * What this inbox cannot tell them. Printed with it, always — an inbox that
   * looks complete is the single most dangerous thing this product could ship.
   */
  limitations: string[];
}

const DAY = 86_400_000;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY);
}

/**
 * Which followed ids does this change match, on strong evidence?
 *
 * A follow is an entity id — "visa:h-1b", "country:india", "form:i-129",
 * "topic:enforcement", "agency:uscis", "employer:…". Matching is exact against
 * the dimensions the record carries, because a fuzzy match on a monitoring
 * product is a false alarm with extra steps.
 */
export function matchFollows(change: PublicChange, follows: readonly string[]): string[] {
  if (follows.length === 0) return [];
  const owned = new Set<string>();
  for (const v of change.visaCategories) owned.add(`visa:${v.id}`);
  for (const c of change.countries) owned.add(`country:${c.id}`);
  for (const f of change.forms) owned.add(`form:${f.id}`);
  for (const p of change.processes) owned.add(`process:${p.id}`);
  for (const t of change.topics) owned.add(`topic:${t}`);
  if (change.agency) owned.add(`agency:${change.agency}`);
  return follows.filter((f) => owned.has(f));
}

/**
 * Which followed ids match only on WEAK evidence?
 *
 * Computed from the weak view of the same record, minus whatever already
 * matched strongly. These are the maybes, and they get their own bucket rather
 * than being mixed in or dropped.
 */
export function matchWeakFollows(
  strongChange: PublicChange,
  weakChange: PublicChange,
  follows: readonly string[]
): string[] {
  const strong = new Set(matchFollows(strongChange, follows));
  return matchFollows(weakChange, follows).filter((f) => !strong.has(f));
}

export interface InboxInput {
  /** The record as the API returns it by default: strong classifications only. */
  strong: PublicChange;
  /** The same record including weak classifications. Optional. */
  weak?: PublicChange;
}

/**
 * Sort changes into the buckets, most urgent first.
 *
 * A change lands in exactly one bucket. The order below is the priority order:
 * a superseded record is superseded even if it takes effect tomorrow, and a
 * followed record that takes effect next week outranks one that merely
 * published yesterday.
 */
export function buildInbox(inputs: readonly InboxInput[], options: InboxOptions): Inbox {
  const { follows, today } = options;
  const horizon = options.horizonDays ?? 30;
  const recent = options.recentDays ?? 14;

  const items: InboxItem[] = [];

  for (const input of inputs) {
    const change = input.strong;
    const matched = matchFollows(change, follows);
    const weakMatched = input.weak ? matchWeakFollows(change, input.weak, follows) : [];
    const days = change.effectiveDate ? daysBetween(today, change.effectiveDate) : null;
    const publishedDaysAgo = daysBetween(change.publishedDate, today);

    const effectiveSoon = days !== null && days >= 0 && days <= horizon;
    const isFollowed = matched.length > 0;

    let bucket: InboxBucket;
    let because: string;

    if (change.status === "superseded") {
      bucket = "superseded";
      because = `A later record amends this one (${change.amendedBy.length} amendment${
        change.amendedBy.length === 1 ? "" : "s"
      }).`;
    } else if (change.verification === "approved") {
      bucket = "reviewed";
      because = "A person has read this record against its source and approved it.";
    } else if (isFollowed && (effectiveSoon || change.severity === "major")) {
      bucket = "needs_attention";
      because = effectiveSoon
        ? `Matches ${matched.join(", ")} and takes effect in ${days} day${days === 1 ? "" : "s"}.`
        : `Matches ${matched.join(", ")} and is recorded as a major change.`;
    } else if (effectiveSoon) {
      bucket = "effective_soon";
      because = `Takes effect in ${days} day${days === 1 ? "" : "s"} (${change.effectiveDate}).`;
    } else if (weakMatched.length > 0) {
      bucket = "potentially_relevant";
      because =
        `Matches ${weakMatched.join(", ")} only on weak evidence — a citation, a footnote or an ` +
        `aside. Read the quote before acting on it.`;
    } else if (publishedDaysAgo >= 0 && publishedDaysAgo <= recent) {
      bucket = "recently_changed";
      because = `Published ${publishedDaysAgo === 0 ? "today" : `${publishedDaysAgo} day${publishedDaysAgo === 1 ? "" : "s"} ago`}.`;
    } else if (isFollowed) {
      bucket = "recently_changed";
      because = `Matches ${matched.join(", ")}.`;
    } else {
      continue; // Not in the inbox at all. An inbox is a filter, not the archive.
    }

    items.push({
      change,
      bucket,
      matched: matched.length > 0 ? matched : weakMatched,
      daysUntilEffective: days,
      brief: buildBrief(change),
      because,
    });
  }

  // Within a bucket: soonest effective date first, then newest.
  const order = (a: InboxItem, b: InboxItem) => {
    const ad = a.daysUntilEffective;
    const bd = b.daysUntilEffective;
    if (ad !== null && bd !== null && ad !== bd) return ad - bd;
    if (ad !== null && bd === null) return -1;
    if (ad === null && bd !== null) return 1;
    return b.change.publishedDate.localeCompare(a.change.publishedDate);
  };

  const counts = Object.fromEntries(INBOX_BUCKETS.map((b) => [b, 0])) as Record<InboxBucket, number>;
  for (const i of items) counts[i.bucket]++;

  const buckets = INBOX_BUCKETS.map((bucket) => ({
    bucket,
    label: BUCKET_LABEL[bucket],
    meaning: BUCKET_MEANING[bucket],
    items: items.filter((i) => i.bucket === bucket).sort(order),
  })).filter((b) => b.items.length > 0);

  return {
    buckets,
    items: buckets.flatMap((b) => b.items),
    follows: [...follows],
    counts,
    limitations: [
      "This inbox is a filter over recorded changes, not a complete picture of U.S. immigration. " +
        "A change is here only if one of our sources published it and our classifier found the " +
        "dimension you follow in the document's own words.",
      "Classification precision is measured per dimension and published at /api/v1; recall is not " +
        "high enough on any dimension for this to be treated as exhaustive. An empty bucket means " +
        "nothing matched, never that nothing happened.",
      "This is information about published government material. It is not legal advice, and it " +
        "makes no determination about any person or case.",
    ],
  };
}
