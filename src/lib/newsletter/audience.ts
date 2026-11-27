// =============================================================================
// WHO A DOCUMENT IS ABOUT — one plain line per story, never advice
//
// A reader skimming the weekly email needs to know in one glance whether a
// story concerns them. Government titles rarely say: "Board of Immigration
// Appeals precedent: 30 I&N Dec. 249 (BIA 2026)" names a citation, not a
// population.
//
// This is NOT an interpretation of what the document means for anyone's case.
// It names the population the document's own text names, by matching that text
// against a fixed list of patterns, in the same spirit as ranking.ts: no model,
// no editorial judgement about a specific story, same input, same output. When
// nothing matches, the line is simply left out. First match wins, so the more
// specific patterns come first.
// =============================================================================

export interface AudienceRule {
  /** Key into the locale's `audience` map. */
  key: string;
  re: RegExp;
}

export const AUDIENCE_RULES: AudienceRule[] = [
  { key: "sij", re: /special immigrant juvenile|\bSIJ\b/i },
  { key: "medicalExam", re: /\bI-693\b|immigration medical exam/i },
  { key: "h1b", re: /\bH-1B\b/ },
  { key: "seasonal", re: /\bH-2[AB]\b/ },
  { key: "students", re: /\b[FJM]-1\b|\bOPT\b|international students?|exchange visitors?/i },
  { key: "daca", re: /\bDACA\b|deferred action for childhood arrivals/i },
  { key: "tps", re: /temporary protected status|\bTPS\b/i },
  { key: "asylum", re: /\basylum\b|\brefugees?\b/i },
  { key: "employmentGreenCard", re: /employment-based|\bEB-[1-5]\b|\bI-140\b|alien workers?/i },
  { key: "family", re: /family-based|\bI-130\b|immediate relatives?/i },
  { key: "naturalization", re: /naturali[sz]ation|\bN-400\b|citizenship test/i },
  { key: "visaBulletin", re: /visa bulletin|priority dates?/i },
  { key: "fees", re: /fee schedule|filing fees?/i },
  { key: "immigrationCourt", re: /board of immigration appeals|immigration judges?|removal proceedings/i },
  { key: "labor", re: /independent contractor|fair labor standards act/i },
];

/** The audience key for a document, or undefined when no rule names one. */
export function audienceFor(title: string, summary: string): string | undefined {
  const text = `${title} ${summary}`;
  return AUDIENCE_RULES.find((r) => r.re.test(text))?.key;
}
