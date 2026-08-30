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
// =============================================================================

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
  // Anything resembling an email, phone number, or long digit string is dropped
  // wholesale rather than partially redacted.
  if (/@|\d{6,}/.test(t)) return null;
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
