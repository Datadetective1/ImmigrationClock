// =============================================================================
// NEWSLETTER — the shapes everything else agrees on
//
// One data model serves every edition the product will ever send. A weekly
// digest, a daily digest, a breaking alert, an H-1B-only issue in Spanish and a
// country-specific issue for India are the SAME Issue rendered from the SAME
// template — they differ only in the Segment that produced them.
//
// That is the whole architectural bet: selection is a filter, localization is a
// lookup, and rendering is a pure function. Adding an edition type never means
// touching the renderer, and adding a language never means touching either.
// =============================================================================

/**
 * Languages the CHROME is translated into.
 *
 * A deliberate limit, stated here because it is the most consequential
 * localization decision in this system: the words around the news are
 * translated; THE NEWS IS NOT.
 *
 * Every event title and summary in this product is quoted from a U.S.
 * government publication written in English. Machine-translating them would
 * manufacture a claim no agency made, in a domain where a mistranslated
 * "may" versus "must" changes what someone believes about their own status.
 * The platform's rule is that AI may never invent facts, and a translated quote
 * is an invented quote. So source text is passed through verbatim and the
 * template says so, in the reader's own language.
 */
export type Locale = "en" | "es" | "fr" | "ar";

export const LOCALES: Locale[] = ["en", "es", "fr", "ar"];
export const DEFAULT_LOCALE: Locale = "en";

/** Right-to-left scripts need `dir` and mirrored padding, not a new template. */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar"]);

export function isRtl(locale: Locale): boolean {
  return RTL_LOCALES.has(locale);
}

/**
 * How often an edition goes out. Drives the selection window and nothing else,
 * which is why a daily digest costs a config line rather than a new pipeline.
 */
export type Cadence = "weekly" | "daily" | "monthly" | "breaking";

export const CADENCE_WINDOW_DAYS: Record<Cadence, number> = {
  daily: 1,
  weekly: 7,
  monthly: 31,
  // Breaking alerts look back far enough to catch anything a scheduled run
  // missed; deduplication against already-sent ids is what stops repeats, not
  // the window. See `excludeIds` in SelectOptions.
  breaking: 3,
};

/**
 * WHO an edition is for.
 *
 * A segment is the only thing that varies between editions. `audienceId` is the
 * Resend audience or segment the broadcast targets; everything above it decides
 * what goes IN the broadcast.
 */
export interface Segment {
  /** Stable key used in archive paths and logs, e.g. "weekly-es". */
  id: string;
  locale: Locale;
  cadence: Cadence;
  /**
   * Restrict to events touching these entity ids (e.g. "visa:h-1b",
   * "country:india"). Empty or absent means everything.
   *
   * This is the hook for the personalized editions: a subscriber who chose
   * "H-1B" and "India" resolves to a segment carrying both, and selection does
   * the rest without the renderer knowing personalization exists.
   */
  entityIds?: string[];
  /** Only include events at or above this importance. */
  minSeverity?: "major" | "notable" | "routine";
  /** The Resend audience/segment id this edition is broadcast to. */
  audienceId?: string;
}

/** One story in an issue. Flattened from an ImmigrationEvent at selection time. */
export interface IssueItem {
  id: string;
  title: string;
  summary: string;
  /** Present only when the event carries one; never invented. */
  whyItMatters?: string;
  agency: string;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string;
  severity: "major" | "notable" | "routine";
  classification: string;
  /** True when the document is scheduled but not yet published. */
  scheduled: boolean;
  /** True for proposals — must never read as being in force. */
  notInForce: boolean;
}

/** A counted fact about the window. Rendered only when the count is non-zero. */
export interface IssueStat {
  /** Key into the locale's `stats` map — never a pre-translated label. */
  key: string;
  value: number;
}

/**
 * A topic we watch closely enough to report its SILENCE.
 *
 * "No changes to DACA this week" is only publishable if we would actually have
 * detected a change — so a watch entry must name an entity that exists in the
 * resolution vocabulary. Claiming quiet on something we do not monitor is a
 * false negative, and on this subject a false "nothing changed" is worse than
 * saying nothing at all: people act on reassurance.
 */
export interface WatchTopic {
  /** Entity ids that would carry a change to this topic. */
  entityIds: string[];
  /** Key into the locale's `watchlist` map. */
  key: string;
}

/** An upcoming date, carried forward from the site's key-dates register. */
export interface UpcomingDate {
  title: string;
  detail: string;
  /** ISO date when there is a fixed one; absent for recurring cadences. */
  date?: string;
  /** e.g. "Monthly" — shown instead of a date. */
  cadence?: string;
  sourceName: string;
  sourceUrl: string;
}

/** One of the rotating resource links. `key` indexes the locale's explore map. */
export interface ResourceLink {
  key: string;
  href: string;
}

/**
 * Stories grouped ahead of the general feed because the subscriber asked for
 * them. Absent on a general edition.
 */
export interface LeadGroup {
  /** The entity that earned the group its place, e.g. "visa:h-1b". */
  entityId: string;
  /** Display label, already resolved — the renderer does not look entities up. */
  label: string;
  items: IssueItem[];
}

/** Everything one edition needs, before it knows what language it speaks. */
export interface Issue {
  /** Stable id: "<segment>-<isoDate>", used for archive paths and idempotency. */
  id: string;
  segment: Segment;
  /** Inclusive window covered by this edition. */
  from: string;
  to: string;
  /** Date the edition is published. */
  issuedAt: string;
  /** General feed. Excludes anything already shown in `lead`. */
  items: IssueItem[];
  /**
   * Personalized stories, rendered BEFORE `items`. Populated only when the
   * segment names entities — which is how "Top H-1B Changes" leads an H-1B
   * subscriber's issue without a second template or a second code path.
   */
  lead?: LeadGroup;
  stats: IssueStat[];
  /**
   * Stat keys that came back ZERO and are worth saying so about.
   * "No Executive Orders this week" is reassurance a reader cannot get from a
   * list that simply omits them, which is why zeros are carried explicitly
   * rather than filtered out with the rest.
   */
  absentStats: string[];
  /** Topics we monitor that recorded NOTHING this window. */
  unchanged: WatchTopic[];
  /** The next few official dates, so an issue looks forward as well as back. */
  upcoming: UpcomingDate[];
  /** Three of six, rotated by issue date so the footer is never stale. */
  resources: ResourceLink[];
  /** Whole minutes, from the word count of the rendered issue. */
  readingMinutes: number;
  /** Total events in the window before the per-issue item cap. */
  totalInWindow: number;
}
