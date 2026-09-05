// =============================================================================
// HOW A CLASSIFICATION WAS ESTABLISHED, AND HOW MUCH TO TRUST IT
//
// WHAT WENT WRONG, MEASURED
// -------------------------
// Hand-labelling every record whose title or summary names H-1B produced 19
// genuinely H-1B-related records. The extractor returned 11 of them: 9 correct,
// 2 wrong. Precision 82%, recall 47%, F1 0.60. Two distinct bugs, and they pull
// in opposite directions:
//
//   RECALL. `extractImpact` only accepted a visa named inside a "scope
//   sentence" — one containing a phrase like "applies to" or "aliens who". A
//   USCIS headline does not talk that way. "USCIS Reaches Fiscal Year 2027 H-1B
//   Cap" names its subject in four words and was dropped, along with nine other
//   newsroom records whose TITLE is the clearest possible evidence.
//
//   PRECISION. The same scope test ran over the full rule body, where "applies
//   to" appears constantly in sentences about OTHER law. An H-2A wage rule was
//   classified visa:h-1b at confidence 1 because its body says the statutory
//   provision "was enacted in the context of the H-1B ... classification, and
//   also applies to the PERM immigrant visa program". That is a historical
//   aside about a statute, not a statement of this document's scope.
//
// THE MODEL
// ---------
// Where the evidence sits is the strongest available signal of what it means,
// and it costs nothing to record:
//
//   explicit_source         the TITLE names it. A document titled "H-1B Cap" is
//                           about H-1B; no further argument is needed.
//   structured_source       a structured field from the publisher said so.
//   derived_high_confidence the summary or abstract names it, or the body names
//                           it in a scope sentence with no historical markers.
//   derived_weak            body-only, in a sentence that reads as citation,
//                           history or comparison. Kept, never silently sold.
//
// WEAK IS KEPT, NOT DISCARDED. A weak match is often right — "Adjustment to
// Premium Processing Fees" genuinely affects H-1B filers even though its
// quoted evidence is about H-2B. Deleting it would trade a precision problem
// for a recall problem. It is labelled instead, and the API's default filter
// excludes it while `?include=weak` returns it.
//
// NOTHING HERE INVENTS A CLASSIFICATION. Every method requires the value to
// appear in the document. The model only decides how strong the appearance is.
// =============================================================================

import { evidenceKindOf, excludesScope, isStrongEvidence } from "./evidence-strength";

export const CLASSIFICATION_METHODS = [
  "explicit_source",
  "structured_source",
  "derived_high_confidence",
  "derived_weak",
] as const;
export type ClassificationMethod = (typeof CLASSIFICATION_METHODS)[number];

/** The methods a consumer should act on without reading the evidence first. */
export const STRONG_METHODS: readonly ClassificationMethod[] = [
  "explicit_source",
  "structured_source",
  "derived_high_confidence",
];

export function isStrong(method: string | undefined): boolean {
  return STRONG_METHODS.includes((method ?? "") as ClassificationMethod);
}

/**
 * Markers that a sentence is discussing law rather than stating this
 * document's own scope.
 *
 * Every one of these was read off a real false positive or its near neighbours
 * in the corpus, not imagined. A Federal Register citation ("76 FR 11686"), a
 * parenthetical year, "was enacted", "in the context of" — these are the
 * grammar of a footnote, and a footnote is not scope.
 */
const HISTORICAL_MARKERS: RegExp[] = [
  /\bwas enacted\b/i,
  /\bin the context of\b/i,
  /\bas (?:described|discussed|noted|set forth|provided) in\b/i,
  /\b\d{1,3}\s?FR\s?\d{3,}/i, // "76 FR 11686"
  /\(\s*(?:19|20)\d{2}\s*\)/, // "(Mar. 3, 2011)" style year parenthetical
  /\bnotice of proposed rulemaking\)/i,
  /\bsupra\b|\bibid\b|\bid\.\b/i,
  /\bcodified at\b/i,
  /\bpreviously\b.*\bamended\b/i,
  /\bunder (?:the )?prior (?:rule|regulation)\b/i,
  /\bfor comparison\b/i,
  /\bhistorically\b/i,
];

export function looksHistorical(sentence: string): boolean {
  return HISTORICAL_MARKERS.some((re) => re.test(sentence));
}

export interface GradeInput {
  /** The record's title. */
  title: string;
  /** The record's abstract or summary. */
  summary: string;
  /** The evidence quote the extractor stored, when there is one. */
  evidence?: string | null;
  /** True when the publisher supplied this in a structured field. */
  fromStructuredField?: boolean;
  /**
   * A matcher for the value, so the grader can ask "does the title name this?"
   * without knowing whether it is a visa, a form or a country.
   */
  matches: (text: string) => boolean;
}

/**
 * Decide how a classification was established.
 *
 * Order matters and reflects strength: a title match beats everything, because
 * a document's title is its own statement of subject.
 */
export function gradeClassification(input: GradeInput): ClassificationMethod {
  if (input.fromStructuredField) return "structured_source";
  if (input.matches(input.title)) return "explicit_source";
  if (input.matches(input.summary)) return "derived_high_confidence";

  // Body-only. The evidence quote is all we have, so it decides.
  const evidence = input.evidence ?? "";
  if (!evidence) return "derived_weak";

  // AN EXCLUSION IS NOT SCOPE. Checked first and separately from everything
  // else, because a passage that disclaims reach reads as perfectly operative
  // prose — actor, action, the term itself — and every other test here would
  // promote it. Measured on the corpus, this alone was three of the strong
  // false positives on the ingestion path, including "this rule does not apply
  // to the adjudication of H-1B nonimmigrant visa petitions" being served as an
  // H-1B change.
  if (excludesScope(evidence, input.matches)) return "derived_weak";

  // THE SHARED EVIDENCE MODEL DECIDES, not a private list.
  //
  // This branch used to read `looksHistorical(evidence) ? weak : strong`,
  // against HISTORICAL_MARKERS below — an older, weaker duplicate of the list
  // in evidence-strength.ts. It was missing every comment-response pattern, so
  // "A commenter said that USCIS has a history of adding fees" and "Some
  // commenters specifically recommended that DHS give priority" both graded
  // strong; and its date pattern only matched a bare "(2025)", so the footnote
  // "(last visited May 27, 2025). \229\ See Office of Performance and Quality"
  // graded strong too.
  //
  // Two implementations of one rule is the defect that produced the forms and
  // country failures as well. There is now one.
  //
  // body_scope_sentence stays strong: it is scope-shaped prose the document
  // wrote about itself, and demoting it costs real recall for no measured
  // precision. What is demoted is what the model already calls a citation, a
  // recycled history, or an aside.
  const kind = evidenceKindOf({ passage: evidence });
  return isStrongEvidence(kind) || kind === "body_scope_sentence"
    ? "derived_high_confidence"
    : "derived_weak";
}

/** Confidence that follows from the method. Never invented separately. */
export function confidenceFor(method: ClassificationMethod): number {
  switch (method) {
    case "explicit_source":
      return 1;
    case "structured_source":
      return 1;
    case "derived_high_confidence":
      return 0.9;
    case "derived_weak":
      return 0.5;
  }
}
