// =============================================================================
// ANALYTICS EVENT TAXONOMY
//
// Founder Directive Part 4: "Measure what users search for. Which questions
// remain unanswered. Which pages build trust. Which features increase return
// visits. Do not optimize only for clicks. Optimize for successful understanding."
//
// That instruction shapes this file more than any conversion funnel would. The
// events below are grouped by what they tell us:
//
//   UNDERSTANDING — did the reader get an answer? (source clicks, methodology
//                   opens, chart interaction, explainer reads)
//   UNANSWERED    — where did we fail them? (zero-result searches, empty states,
//                   "no feed for this state") — the most valuable signal we have,
//                   because it is a direct list of what to build next.
//   RETURN        — is this becoming a habit? (newsletter, follows, what-changed)
//   PROFESSIONAL  — separate from the public funnel, never mixed into it.
//
// PRIVACY
// No personal data is ever sent. Search terms are the one free-text field, and
// they are truncated and lowercased; a term is a question about immigration
// policy, not an identifier. This module never identifies a device, replays a
// session, or follows anyone between sites — the Directive and the privacy
// policy both forbid it. With no provider configured every call is a no-op.
//
// SOCIAL ARRIVALS
// A click from a social post lands with standard UTM parameters (see
// src/lib/share.ts). Plausible attributes the visit from those on its own; the
// `social_post_click` event below adds the STORY, so an editor can see which
// record a post actually moved readers to rather than only which network sent
// them. The story key is a public record's own identifier and the content type
// is one of a handful of fixed strings — nothing about the reader.
// =============================================================================

import { parseTracking, type ShareTracking } from "@/lib/share";

/** Everything the platform measures. Adding an event means adding it here. */
export type AnalyticsEvent =
  // --- UNDERSTANDING ---------------------------------------------------------
  /** Reader clicked through to the underlying government source. The single
   *  strongest signal that the trust layer is working. */
  | "source_link_click"
  /** Reader opened methodology, a provenance tooltip, or a limitations note. */
  | "methodology_open"
  /** Reader interacted with a chart (switched series, sector, or time frame). */
  | "chart_interact"
  /** Reader expanded an FAQ or explainer. */
  | "explainer_open"
  /** Reader downloaded a CSV — they intend to do their own analysis. */
  | "data_export"

  // --- UNANSWERED (what to build next) ---------------------------------------
  /** A search that returned nothing. A direct list of missing coverage. */
  | "search_no_results"
  /** A search that returned something. Tells us what people come here for. */
  | "search_results"
  /** Reader hit a real coverage gap we disclose, e.g. a state with no WARN feed. */
  | "coverage_gap_shown"

  /** A contextual "related" link was followed — related sponsors, a linked
   *  policy change, a sibling entity. Distinct from a nav or search click: it
   *  measures whether the links we DERIVE from the data actually move readers
   *  onward, which is the only way to tell a useful related-links block from
   *  decoration. */
  | "related_link_click"

  // --- RETURN ----------------------------------------------------------------
  | "newsletter_signup_started"
  | "newsletter_signup_submitted"
  | "what_changed_view"
  | "topic_view"
  | "entity_follow"

  // --- ARRIVAL AND SHARING ---------------------------------------------------
  /** A reader arrived from one of the platform's own social posts. Fired once
   *  per story per browser session, with the network and the story key. */
  | "social_post_click"
  /** A reader pressed a share button. Which surface, and which story if any. */
  | "share_click"

  // --- PROFESSIONAL (kept separate from the public funnel) --------------------
  | "intelligence_page_view"
  | "sample_report_view"
  | "briefing_request_submitted"

  // --- COMMERCIAL (resources page only) --------------------------------------
  | "partner_click";

/** Non-identifying context. Values must be short, low-cardinality, non-personal. */
export type EventProps = Record<string, string | number | boolean | undefined>;

interface AnalyticsWindow {
  gtag?: (...args: unknown[]) => void;
  plausible?: (event: string, opts?: { props?: EventProps }) => void;
}

/** Human-readable names for Plausible's goal list. */
const PLAUSIBLE_NAME: Record<AnalyticsEvent, string> = {
  source_link_click: "Source Link Click",
  methodology_open: "Methodology Open",
  chart_interact: "Chart Interact",
  explainer_open: "Explainer Open",
  data_export: "Data Export",
  search_no_results: "Search — No Results",
  search_results: "Search — Results",
  coverage_gap_shown: "Coverage Gap Shown",
  related_link_click: "Related Link Click",
  newsletter_signup_started: "Newsletter Signup Started",
  newsletter_signup_submitted: "Newsletter Signup Submitted",
  what_changed_view: "What Changed View",
  topic_view: "Topic View",
  entity_follow: "Entity Follow",
  social_post_click: "Social Post Click",
  share_click: "Share Click",
  intelligence_page_view: "Intelligence Page View",
  sample_report_view: "Sample Report View",
  briefing_request_submitted: "Briefing Request Submitted",
  partner_click: "Partner Click",
};

/**
 * Normalize a free-text search term before it leaves the browser.
 *
 * Lowercased, collapsed, truncated, and stripped of anything that looks like a
 * contact detail. A query like "does amazon sponsor h1b" is a question about
 * policy and is exactly what the Directive asks us to measure; a query someone
 * accidentally pastes an email or number into is not, and must not be recorded.
 */
export function sanitizeSearchTerm(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  // Anything resembling an email or a long unbroken digit string is dropped
  // wholesale rather than partially redacted. An A-number ("A123456789") is
  // caught here.
  if (/@|\d{6,}/.test(t)) return null;
  // …and so is a digit run broken up by separators, which the rule above misses:
  // "415-555-1234", "(415) 555 1234", "123-45-6789". On an immigration site the
  // SSN shape matters more than the phone shape, and both slip past \d{6,}.
  //
  // Deliberately NOT a plain digit count. Form numbers are how people search
  // here — "i-130 i-485 i-765" is nine digits and a completely ordinary query.
  // Requiring the digits to sit in ONE separator-joined run keeps those, because
  // the letters between them break the run.
  const run = t.match(/\d[\d\s().+-]{5,}\d/);
  if (run && run[0].replace(/\D/g, "").length >= 7) return null;
  return t.slice(0, 60);
}

/**
 * Record an event. No-ops when no provider is loaded, so calling this is always
 * safe and never needs a guard at the call site.
 */
export function track(event: AnalyticsEvent, props: EventProps = {}): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as AnalyticsWindow;
  // Drop undefined values so providers don't record empty dimensions.
  const clean: EventProps = {};
  for (const [k, v] of Object.entries(props)) if (v !== undefined) clean[k] = v;
  try {
    w.plausible?.(PLAUSIBLE_NAME[event], Object.keys(clean).length ? { props: clean } : undefined);
    w.gtag?.("event", event, clean);
  } catch {
    /* provider not ready — measurement must never break a page */
  }
}

/**
 * Where a reader went when they clicked through to a government source. Tracked
 * by agency rather than full URL: we want to know which agencies people verify
 * against, not to build a per-user clickstream.
 */
export function trackSourceClick(sourceKey: string, surface: string): void {
  track("source_link_click", { source: sourceKey, surface });
}

/** A search, split by whether we could answer it. */
export function trackSearch(rawTerm: string, resultCount: number): void {
  const term = sanitizeSearchTerm(rawTerm);
  if (!term) return;
  if (resultCount > 0) {
    track("search_results", { term, results: resultCount });
  } else {
    // The highest-value event on the platform: a question we could not answer.
    track("search_no_results", { term });
  }
}

/** A disclosed coverage gap was shown to a reader (e.g. a state with no feed). */
export function trackCoverageGap(dataset: string, scope: string): void {
  track("coverage_gap_shown", { dataset, scope });
}

/**
 * A derived "related" link was followed.
 *
 * `surface` names the block (e.g. "related-sponsors"), `relation` names WHY the
 * link was offered (e.g. "volume", "state"). Both are short fixed strings from
 * our own vocabulary, never anything the reader typed.
 */
export function trackRelatedClick(surface: string, relation: string): void {
  track("related_link_click", { surface, relation });
}

// -----------------------------------------------------------------------------
// SOCIAL ARRIVALS AND SHARES
// -----------------------------------------------------------------------------

/** A reader landed from one of our own posts. `path` is the page, not the full URL. */
export function trackSocialArrival(t: ShareTracking, path: string): void {
  track("social_post_click", {
    platform: t.platform,
    content_type: t.contentType,
    story: t.story,
    path: path.slice(0, 120),
  });
}

/**
 * A share button was pressed. `surface` names the block ("change", "explainer",
 * "signal", "page"); `story` is the record's public key when there is one.
 */
export function trackShare(surface: string, story?: string): void {
  track("share_click", { surface, story });
}

/** A story page was opened. Same event as the feed, with `entry: "story"`. */
export function trackStoryView(story: string, category: string): void {
  track("what_changed_view", { entry: "story", story, category });
}

/** Prefix of the per-story session key that keeps an arrival from double-firing. */
export const SOCIAL_ARRIVAL_PREFIX = "ic-social-arrival:";

/** The slice of Storage the arrival guard needs. sessionStorage satisfies it. */
export interface OnceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Decide whether an arrival should be recorded, and claim it if so.
 *
 * Pure apart from the store, so the once-per-story rule is testable without a
 * browser: given the landing URL's query string and a store, it returns the
 * tracking to fire or null. Null means one of three things — no social
 * attribution on the URL, the store already holds this story for the session,
 * or the store is unavailable and cannot promise "once", in which case the
 * event is still fired (an arrival counted twice is a smaller error than an
 * arrival never counted, and a browser with no sessionStorage is rare).
 *
 * The query string is READ, never rewritten: Plausible reads the utm_*
 * parameters itself, so stripping them would break the attribution this event
 * exists to extend.
 */
export function claimSocialArrival(search: string, store: OnceStore | null): ShareTracking | null {
  const t = parseTracking(search);
  if (!t) return null;
  if (!store) return t;
  const key = `${SOCIAL_ARRIVAL_PREFIX}${t.story || `${t.platform}:${t.contentType}`}`;
  try {
    if (store.getItem(key)) return null;
    store.setItem(key, "1");
  } catch {
    /* storage blocked — fire anyway, see above */
  }
  return t;
}
