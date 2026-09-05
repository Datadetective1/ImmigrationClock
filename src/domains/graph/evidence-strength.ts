// =============================================================================
// WHERE DOES THIS EVIDENCE SIT, AND WHAT KIND OF SENTENCE IS IT?
//
// WHY A FOUR-LEVEL MODEL WAS NOT ENOUGH
// -------------------------------------
// Classification strength started as "title beats summary beats body", which is
// a statement about POSITION. Position is a good proxy and it is not the thing
// that matters. What matters is what the sentence is DOING:
//
//   "This final rule revises Form I-129 to add a new certification."
//   "The commenter noted that Form I-129 was revised in 2011."
//
// Both sit in the body. The first is the document acting; the second is the
// document reporting. Treating them alike forced a choice between two bad
// options — mark all body evidence weak and lose 82 of the 121 documents that
// are genuinely about a form, or mark it all strong and watch precision fall.
// Measured, the second option cost 13 points of holdout precision on country
// classification for 3 points of recall.
//
// THE HIERARCHY
// -------------
// Strongest first. Each is a claim about the sentence, not about where it sits.
//
//   operative_language   The document acting on the value. "This rule revises",
//                        "USCIS is adjusting", "petitioners must file".
//   explicit_scope       The document stating its own coverage. "This part
//                        applies to", "is limited to", "covers".
//   designation          A formal designation or enumeration. "nationals of",
//                        "the following countries are designated".
//   structured_source    A structured field the publisher supplied. Not text.
//   title                The document's own title names it.
//   summary              The published abstract names it.
//   body_scope_sentence  Scope-shaped body language that is not clearly the
//                        document's own act. Real, and not enough on its own.
//   contextual_mention   Background, commentary, an example.
//   historical_mention   Past-tense, dated, or about a prior rule.
//   citation_reference   Inside a citation, an instrument title, a footnote.
//   unrelated_mention    A different sense of the token entirely.
//
// WHAT COUNTS AS STRONG
// ---------------------
// The first six. Everything below body_scope_sentence is weak, and
// body_scope_sentence itself is weak — it is the honest middle, and the
// measurement that put it there is recorded above.
//
// A KEYWORD IS NOT EVIDENCE. Nothing in this file promotes a value because it
// appeared. Every promotion requires the sentence to be doing something, and
// the sentence is quoted so the promotion can be argued with.
// =============================================================================

export const EVIDENCE_KINDS = [
  "operative_language",
  "explicit_scope",
  "designation",
  "structured_source",
  "title",
  "summary",
  "body_scope_sentence",
  "contextual_mention",
  "historical_mention",
  "citation_reference",
  "unrelated_mention",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Kinds a consumer may act on without reading the quote first. */
export const STRONG_EVIDENCE: readonly EvidenceKind[] = [
  "operative_language",
  "explicit_scope",
  "designation",
  "structured_source",
  "title",
  "summary",
];

export function isStrongEvidence(kind: EvidenceKind | undefined): boolean {
  return STRONG_EVIDENCE.includes(kind as EvidenceKind);
}

const RANK: Record<EvidenceKind, number> = {
  operative_language: 0,
  explicit_scope: 1,
  designation: 2,
  structured_source: 3,
  title: 4,
  summary: 5,
  body_scope_sentence: 6,
  contextual_mention: 7,
  historical_mention: 8,
  citation_reference: 9,
  unrelated_mention: 10,
};

/**
 * How good a piece of evidence is, lower being better.
 *
 * Exported so a caller choosing BETWEEN candidate passages ranks them by the
 * same model that grades the one it picks. Choosing the first match and then
 * grading it is how a fee rule came to be judged on a sentence about a
 * different visa class.
 */
export function evidenceRank(kind: EvidenceKind): number {
  return RANK[kind];
}

export function strongerEvidence(a: EvidenceKind, b: EvidenceKind): EvidenceKind {
  return RANK[a] <= RANK[b] ? a : b;
}

// -----------------------------------------------------------------------------
// DISQUALIFIERS — tested first, because they beat everything else
// -----------------------------------------------------------------------------

/**
 * The sentence is a citation or the title of an instrument being cited.
 *
 * Federal rules cite each other constantly, and a citation's furniture is
 * recognisable: a Federal Register or Public Law reference, a parenthetical
 * date, an instrument noun. This has to be tested before every scope cue,
 * because citations are FULL of scope cues — that is what they are citing.
 */
const CITATION = [
  /\b\d{1,3}\s?FR\s?\d{3,}/i,
  /\bPub\.?\s?L\.?\s?(?:No\.?\s?)?\d{1,3}-\d{1,4}/i,
  /\b\d{1,3}\s?Stat\.?\s?\d{2,}/i,
  /\(\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s*(?:19|20)\d{2}\s*\)/i,
  /\bagreement between\b/i,
  /\bmemorandum of (?:understanding|agreement)\b/i,
  /\bsee,? e\.?g\.?\b|\bsupra\b|\bibid\b|\bid\.\s/i,
  /\bcodified at\b/i,
];

/**
 * The sentence is talking about the past, or about someone else's words.
 *
 * Comment-response sections are the largest single source of this in Federal
 * Register text: a rule quotes a commenter, answers them, and every sentence in
 * the exchange looks operative while describing something the rule is not doing.
 */
const HISTORICAL = [
  /\bwas (?:enacted|published|issued|promulgated|revised|amended)\b/i,
  /\bin the context of\b/i,
  /\bhistorically\b/i,
  /\bpreviously\b[^.]{0,60}\b(?:amended|required|allowed|provided)\b/i,
  /\bunder (?:the )?(?:prior|former|previous) (?:rule|regulation|policy|version)\b/i,
  /\bfor comparison\b/i,
  /\b(?:a|the|one|several|some) commenters?\b/i,
  /\bcomment(?:er|ers)? (?:noted|stated|requested|suggested|asked|remarked)\b/i,
  /\bfor (?:their|the|his|her|your) comments?\b/i,
  /\bin response to (?:the |these )?comments?\b/i,
  // An agency answering an assertion is answering a comment, whatever noun the
  // sentence uses. "DHS disagrees with the assertion the U.S. does not have a
  // compelling interest ..." was being graded as L-1 scope.
  /\b(?:DHS|USCIS|CBP|ICE|EOIR|the (?:Department|agency|Service))\s+(?:disagrees|agrees|acknowledges|declines|recognizes)\b/i,
  /\bResponse:\s/,
  /\bin (?:19|20)\d{2}\b[^.]{0,40}\b(?:the (?:Department|agency|Service)|USCIS|DHS)\b/i,
  /\bas (?:described|discussed|noted|set forth|provided) in\b/i,
];

// -----------------------------------------------------------------------------
// PROMOTERS — what makes a body sentence worth as much as a title
// -----------------------------------------------------------------------------

/**
 * The document acting: this rule, this notice, this agency, doing something.
 *
 * Deliberately requires BOTH an actor and an action. "revising" alone appears
 * in background prose constantly; "the Department is revising" does not.
 */
const OPERATIVE_ACTOR =
  /\b(?:this (?:final |interim (?:final )?|proposed |direct final )?rule|this (?:document|notice|action|rulemaking)|the (?:Department|Secretary|Agency|Service|Attorney General)|USCIS|DHS|CBP|ICE|EOIR|the Department of (?:Homeland Security|State|Labor|Justice))\b/i;

const OPERATIVE_ACTION =
  /\b(?:is|are|will be|hereby)?\s*(?:amend(?:s|ing)?|revis(?:es|ing)|establish(?:es|ing)|requir(?:es|ing)|remov(?:es|ing)|add(?:s|ing)|adjust(?:s|ing)|increas(?:es|ing)|decreas(?:es|ing)|updat(?:es|ing)|rescind(?:s|ing)|terminat(?:es|ing)|extend(?:s|ing)|designat(?:es|ing)|implement(?:s|ing)|announc(?:es|ing)|clarif(?:ies|ying)|discontinu(?:es|ing)|replac(?:es|ing)|reinstat(?:es|ing))\b/i;

/** A directive imposed on a reader. Also the document acting. */
const DIRECTIVE =
  /\b(?:must|shall|is required to|are required to|may not|will be required to)\b/i;

/** The document stating the reach of its own provisions. */
const EXPLICIT_SCOPE = [
  /\bthis (?:part|section|rule|subpart|chapter) applies to\b/i,
  /\bapplies only to\b/i,
  /\bis limited to\b/i,
  /\bshall apply to\b/i,
  /\bthe requirements? of this (?:part|section|rule) (?:apply|applies)\b/i,
  /\bcovered (?:by this rule|under this part)\b/i,
  /\bfor purposes of this (?:part|section|rule)\b/i,
];

/** A formal designation or enumeration of who — or what — is covered. */
const DESIGNATION = [
  /\bnationals? of\b/i,
  /\bcitizens? of\b/i,
  /\bthe following (?:countries|categories|classifications|forms)\b/i,
  /\bis (?:hereby )?designated\b/i,
  /\bdesignated countries\b/i,
  /\beligible (?:aliens|applicants|beneficiaries) (?:are|include)\b/i,

  // AN ENUMERATION OF AFFECTED COLLECTIONS.
  //
  // Fee rules and Paperwork Reduction Act notices publish the list of forms
  // they touch under a heading that says so, in a shape that is standard across
  // DHS, USCIS, ICE and DOJ:
  //
  //   "Programs Affected, OMB Control Numbers  OMB No. 1615-0052--Form N-400,
  //    Application for Naturalization  OMB No. 1615-0013--Form I-131, ..."
  //
  // Every form in such a list is a form the document affects — that is what the
  // heading declares and what the PRA requires it to declare. Reading those as
  // passing mentions was the largest remaining source of missed forms.
  /\b(?:programs?|forms?|collections?|information collections?)\s+affected\b/i,
  /\bOMB\s+(?:No\.?|Control\s+(?:No\.?|Number))\s*:?\s*\d{4}-\d{4}\s*[-–—]{1,2}\s*Form\b/i,
];

export interface EvidenceInput {
  /** The passage the classification was drawn from. */
  passage: string;
  /** True when the passage IS the document's title. */
  isTitle?: boolean;
  /** True when the passage IS the published abstract. */
  isSummary?: boolean;
  /** True when the publisher supplied this in a structured field. */
  fromStructuredField?: boolean;
}

/**
 * What kind of evidence is this?
 *
 * ORDER IS THE ARGUMENT. Disqualifiers first, because a citation containing
 * "nationals of" is a citation. Then position, because a title needs no further
 * proof. Then what the sentence is doing.
 */
export function evidenceKindOf(input: EvidenceInput): EvidenceKind {
  const { passage, isTitle, isSummary, fromStructuredField } = input;

  if (fromStructuredField) return "structured_source";

  // A title is the document's own statement of subject, and titles are never
  // citations of anything — except when they are, which is why the citation
  // test still runs on them first.
  if (CITATION.some((re) => re.test(passage))) return "citation_reference";
  if (isTitle) return "title";
  if (HISTORICAL.some((re) => re.test(passage))) return "historical_mention";
  if (isSummary) return "summary";

  if (OPERATIVE_ACTOR.test(passage) && (OPERATIVE_ACTION.test(passage) || DIRECTIVE.test(passage))) {
    return "operative_language";
  }
  if (EXPLICIT_SCOPE.some((re) => re.test(passage))) return "explicit_scope";
  if (DESIGNATION.some((re) => re.test(passage))) return "designation";

  // Scope-shaped but not clearly the document's own act. Kept and labelled
  // rather than promoted or discarded.
  if (/\bapplies to\b|\baliens? who\b|\bpersons? who\b|\bbeneficiar(?:y|ies)\b/i.test(passage)) {
    return "body_scope_sentence";
  }

  return "contextual_mention";
}

/** Confidence that follows from the kind. Never invented separately. */
export function confidenceForEvidence(kind: EvidenceKind): number {
  switch (kind) {
    case "operative_language":
    case "structured_source":
    case "title":
      return 1;
    case "explicit_scope":
    case "designation":
    case "summary":
      return 0.9;
    case "body_scope_sentence":
      return 0.6;
    default:
      return 0.4;
  }
}

// -----------------------------------------------------------------------------
// EXCLUSION — the document saying it does NOT reach something
// -----------------------------------------------------------------------------

/**
 * Phrases in which a document disclaims reach.
 *
 * This is the most damaging thing the classifier can get wrong, and until now
 * nothing looked for it. Every other failure mode produces a match that is
 * merely weak — a footnote, a citation, an aside. An exclusion produces a match
 * that is BACKWARDS. "This rule does not apply to the adjudication of H-1B
 * nonimmigrant visa petitions" was being read as evidence that the rule applies
 * to H-1B, at derived_high_confidence, and sold to a subscriber monitoring
 * H-1B as a change affecting them.
 *
 * Three real examples from the corpus, all previously graded strong:
 *   "this rule does not apply to the adjudication of H-1B ... petitions"
 *   "The H-1B cap-gap provisions are not changing due to this rulemaking"
 *   "The rule does not apply to DACA recipients"
 */
const EXCLUSION = [
  /\b(?:do|does|shall|will|would|did)\s+not\s+(?:apply|affect|change|alter|extend|pertain|reach|cover)\b/i,
  /\b(?:is|are|was|were)\s+not\s+(?:changing|changed|affected|altered|covered|included|eligible|required|subject)\b/i,
  /\b(?:is|are)\s+unaffected\b/i,
  /\bno\s+changes?\s+(?:are\s+being\s+made\s+)?to\b/i,
  /\bnot\s+applicable\s+to\b/i,
  /\bexcluded\s+from\b/i,
  /\bother\s+than\b/i,
  /\bexcept\s+(?:for|that|as\s+provided)\b/i,
  /\bnothing\s+in\s+this\s+(?:rule|part|section|notice)\b/i,
];

/**
 * How far from the matched term an exclusion still governs it.
 *
 * Whole-passage matching was tried first and demoted real classifications: a
 * 400-character span that excludes one programme while designating another
 * would lose both. The window is generous enough to span "does not apply to the
 * adjudication of H-1B nonimmigrant visa petitions" and tight enough that an
 * unrelated clause in the same span does not reach across.
 */
const EXCLUSION_WINDOW = 140;

/**
 * Does this passage EXCLUDE the matched term rather than cover it?
 *
 * Proximity is required in both directions, because a document disclaims reach
 * both ways round: "does not apply to X" puts the negation first, "X is not
 * changing" puts it second.
 */
export function excludesScope(passage: string, matches: (text: string) => boolean): boolean {
  if (!passage) return false;
  const flat = passage.replace(/\s+/g, " ");

  // AN EXCLUSION GOVERNS ITS OWN SENTENCE, and stops at the full stop.
  //
  // Without this bound the window reads straight across a sentence boundary:
  // "The rule does not apply to DACA recipients. Separately, this rule applies
  // to petitioners filing H-1B petitions" would have excluded H-1B as well as
  // DACA, turning a precision fix into a recall bug. A regression test holds
  // both halves of that sentence pair.
  for (const sentence of flat.split(/(?<=[.;])\s+/)) {
    for (const re of EXCLUSION) {
      const global = new RegExp(re.source, "gi");
      for (let m = global.exec(sentence); m !== null; m = global.exec(sentence)) {
        const from = Math.max(0, m.index - EXCLUSION_WINDOW);
        const to = Math.min(sentence.length, m.index + m[0].length + EXCLUSION_WINDOW);
        // The window either side of the negation, clipped to the sentence. If
        // the term we classified sits inside it, the document disclaimed it.
        if (matches(sentence.slice(from, to))) return true;
      }
    }
  }
  return false;
}
