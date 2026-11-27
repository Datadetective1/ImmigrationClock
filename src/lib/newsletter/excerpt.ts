// =============================================================================
// EXCERPTS — how a government summary fits on a phone without being rewritten
//
// The newsletter quotes official text verbatim and never paraphrases it. That
// rule stays. What changes is HOW MUCH of the quote a card carries: the first
// issue printed every summary in full, so one Department of Labor rule ran to
// a 170-word paragraph and pushed everything below it off the screen.
//
// An excerpt here is a run of WHOLE SENTENCES from the start of the summary,
// copied character for character. Only when the very first sentence is itself
// longer than the budget is it cut, at a word boundary, and marked with an
// ellipsis, which is the ordinary convention for a shortened quote. The full
// text is always one tap away on the official document.
// =============================================================================

/**
 * Abbreviations that end in a period but do not end a sentence. Checked
 * against the word immediately before a candidate boundary.
 */
const NOT_A_SENTENCE_END =
  /^(?:(?:[A-Z]\.)+[A-Z]?|[A-Z]|Dec|Decs|No|Nos|Inc|Corp|Co|Ltd|v|vs|Mr|Mrs|Ms|Dr|Jr|Sr|St|Sec|Secs|Pub|Stat|Fed|Reg|Regs|Ct|Cir|App|Supp|al|e\.g|i\.e|etc|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov)$/;

/** Split into sentences without breaking "U.S.", "8 C.F.R. §" or "I&N Dec. 714". */
export function sentences(text: string): string[] {
  const out: string[] = [];
  const s = text.replace(/\s+/g, " ").trim();
  let start = 0;
  const re = /[.!?]["”’)]?\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const end = m.index + m[0].length;
    const next = s.charAt(end);
    // A sentence must be followed by a capital letter or an opening quote.
    if (!/[A-Z"“‘(]/.test(next)) continue;
    const before = s.slice(start, m.index + 1);
    const lastWord = before.split(" ").pop()!.replace(/[.!?]$/, "");
    if (NOT_A_SENTENCE_END.test(lastWord)) continue;
    out.push(s.slice(start, end).trim());
    start = end;
  }
  const rest = s.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

export interface Excerpt {
  /** Verbatim text from the start of the summary. */
  text: string;
  /** True when anything at all was left out. */
  shortened: boolean;
}

/**
 * The opening of a summary, at most `budget` characters, in whole sentences.
 *
 * Always returns at least something: when the first sentence alone exceeds the
 * budget it is cut at the last space before the limit and ends in "…".
 */
export function excerpt(summary: string, budget = 260): Excerpt {
  const all = summary.replace(/\s+/g, " ").trim();
  if (all.length <= budget) return { text: all, shortened: false };

  const parts = sentences(all);
  let text = "";
  for (const p of parts) {
    const next = text ? `${text} ${p}` : p;
    if (next.length > budget) break;
    text = next;
  }
  if (text) return { text, shortened: text.length < all.length };

  // The first sentence is longer than the whole budget: cut at a word.
  const cut = all.slice(0, budget);
  const at = cut.lastIndexOf(" ");
  return { text: `${(at > budget * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:]$/, "")}…`, shortened: true };
}

/**
 * "Policy alert: X" is how USCIS titles an alert; the card's kicker already
 * names USCIS. Same rule the site's story pages use (src/lib/stories.ts).
 */
export function headline(title: string): string {
  return title.replace(/^Policy alert:\s*/i, "").trim() || title;
}

/**
 * Short agency names for the card kicker. A reader scanning a phone screen
 * recognises "USCIS" faster than "U.S. Citizenship and Immigration Services".
 * Unknown agencies fall through unchanged.
 */
const AGENCY_SHORT: Record<string, string> = {
  "U.S. Citizenship and Immigration Services": "USCIS",
  "Executive Office for Immigration Review": "Immigration courts (EOIR)",
  "U.S. Department of Labor": "Department of Labor",
  "Department of Homeland Security": "DHS",
  "U.S. Department of Homeland Security": "DHS",
  "U.S. Customs and Border Protection": "CBP",
  "U.S. Immigration and Customs Enforcement": "ICE",
  "U.S. Department of State": "State Department",
  "Department of State": "State Department",
};

export function agencyShort(agency: string): string {
  return AGENCY_SHORT[agency] ?? agency;
}
