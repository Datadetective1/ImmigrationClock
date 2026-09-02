// =============================================================================
// TEXT FITTING FOR CARDS — the only overflow control Satori offers is not to
// overflow
//
// Satori has no line clamp, so a headline is capped by CHARACTER COUNT and its
// size is stepped down by length; that is the only way to guarantee the longest
// permitted headline fits in four lines on a 630px canvas. Pure, so the spec
// builders can apply the same cap the renderer does and a test can assert it
// without rendering anything.
// =============================================================================

/** Longest headline a card will carry. Four lines at the smallest step. */
export const HEADLINE_MAX_CHARS = 150;

/**
 * Collapse whitespace and cut at a word boundary with an ellipsis.
 *
 * A cut that lands after "of" or "and" leaves a stranded function word on its
 * own line ("Notice of…"), so trailing function words and punctuation are
 * dropped before the ellipsis goes on.
 */
export function fitText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const boundary = cut.lastIndexOf(" ");
  const base = boundary > max * 0.6 ? cut.slice(0, boundary) : cut;
  return `${base
    .replace(/(\s+(?:of|the|a|an|and|or|for|to|in|on|at|by|with|from))+$/i, "")
    .replace(/[\s,;:.—–-]+$/, "")}…`;
}

/** Stepped down by length so the longest permitted headline still fits in four lines. */
export function headlineFontSize(headline: string): number {
  const n = headline.length;
  if (n <= 60) return 64;
  if (n <= 110) return 54;
  return 46;
}
