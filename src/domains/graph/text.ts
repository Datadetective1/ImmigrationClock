// =============================================================================
// TEXT NORMALIZATION — shared by every markup-based adapter
//
// RSS feeds, Atom feeds, and scraped HTML pages all deliver the same problem:
// text wrapped in markup, entity-encoded, sometimes twice, sometimes inside
// CDATA. Every adapter needs the identical answer, so the logic lives here once
// rather than being copied per source.
//
// It is extracted into its own module for a specific reason. The ordering below
// was got wrong in the RSS parser, and the failure was silent: descriptions came
// back null, so the adapter reported "No summary was published" about documents
// that had one. A second adapter copying that code would have inherited the bug.
// Shared, tested, one implementation.
//
// THE ORDER IS THE WHOLE POINT
//   unwrap CDATA -> decode entities -> strip tags -> collapse whitespace
//
// Any other order produces wrong text:
//   • stripping before decoding destroys the CDATA markers and leaves "]]>"
//     stranded in the output, or eats the content entirely
//   • decoding after stripping re-creates tags from "&lt;p&gt;" that then never
//     get stripped, so markup leaks into a published summary
// =============================================================================

/** Remove CDATA wrappers, keeping their contents. */
export function unwrapCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/**
 * Decode the HTML entities that appear in government feeds and pages.
 *
 * `&amp;` is decoded LAST, deliberately. Decoding it first turns a
 * double-encoded "&amp;lt;p&amp;gt;" — an author writing ABOUT the characters —
 * into a live "<p>" tag, which the tag-stripper then deletes along with the
 * text the author actually wrote.
 */
export function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(Number(d)))
    .replace(/&amp;/gi, "&");
}

/** A malformed numeric entity must not throw and take down an ingestion run. */
function safeCodePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

export function collapse(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Plain fields: titles, links, ids, categories. No markup expected. */
export function plainText(s: string): string {
  return collapse(decodeEntities(unwrapCdata(s)));
}

/**
 * WHOLE-TERM MATCHING — the fix for a bug this codebase has now shipped three
 * times, in three different adapters, each time by writing `haystack.includes()`
 * against a keyword list:
 *
 *   "petition"  matched "Procedures for Submission of Petitions for Rulemaking",
 *               so a DOJ Administrative Procedure Act notice was ranked major
 *               and led /what-changed.
 *   "co."       would have matched inside "Colorado" when classifying a court
 *               party as an organization.
 *   "ice "      matched "Post Office Naming Act", making a post-office bill an
 *               immigration bill.
 *
 * A substring match on a short keyword is never safe against English. This does
 * the boundary check once so no future adapter has to remember.
 *
 * Boundaries are non-alphanumeric rather than \b, because the terms themselves
 * contain punctuation — "h-1b", "u.s.", "8 cfr" all have to match as written.
 */
export function containsTerm(haystack: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(haystack.toLowerCase());
}

/** True when any term matches as a whole term. */
export function containsAnyTerm(haystack: string, terms: string[]): boolean {
  const lower = haystack.toLowerCase();
  return terms.some((t) => containsTerm(lower, t));
}

/** Rich fields: descriptions, summaries, page bodies. May carry markup. */
export function richText(s: string): string {
  // Block-level tags become spaces rather than nothing, so "<p>a</p><p>b</p>"
  // does not run together into "ab".
  return collapse(decodeEntities(unwrapCdata(s)).replace(/<[^>]+>/g, " "));
}
