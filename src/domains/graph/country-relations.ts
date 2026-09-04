// =============================================================================
// WHAT IS THIS COUNTRY DOING IN THIS DOCUMENT?
//
// THE PROBLEM WITH THE ANSWER WE HAD
// ----------------------------------
// Country classification was a boolean: the country was either found in a
// "designation sentence" or it was not. Measured against hand-labelled pairs it
// scored 74% precision, and the misses were not random. They were four
// recognisable shapes, and a boolean cannot tell them apart:
//
//   Guatemala, inside "Agreement Between the Government of the United States of
//   America and the Government of the Republic of Guatemala..., 90 FR 31670",
//   cited by a rule about appellate procedure. The sentence contains "Government
//   of", "Republic of" and "Nationals of" — three of the phrases that were
//   supposed to prove a country was being designated.
//
//   Canada, inside "I-185, Nonresident Alien Canadian Border Crossing Card--
//   Citizens of Canada or British subjects residing in Canada", in a rule about
//   alien registration generally. It literally says "Citizens of Canada".
//
//   Mexico, inside "Palm Boulevard and Mexico Boulevard near Brownsville,
//   Texas" — a street.
//
//   Canada and Mexico on a visa bond rule whose text says the affected
//   countries "will be announced on https://www.travel.state.gov".
//
// No amount of adding phrases to a list fixes those, because the phrases are
// already there. What is missing is the QUESTION being asked. "Does this
// sentence contain a designation phrase" is the wrong question. "What is this
// country's relationship to this document" is the right one.
//
// THE MODEL
// ---------
// Every country mention is assigned exactly one relation, and only three of
// them mean the document's own coverage is defined by that country:
//
//   SCOPE-BEARING
//     nationals_of      Coverage is defined by nationality or citizenship.
//     present_in        Coverage is defined by presence in, or travel from.
//     designated_list   The country is an item in an enumerated list of
//                       affected countries.
//
//   REAL, BUT NOT SCOPE
//     post_location       A consular post or embassy is located there. Useful
//                         to know, and not a statement about that country's
//                         nationals.
//     document_population The country describes who holds a document the rule
//                         merely lists.
//     agreement_party     The country is named inside the title of a cited
//                         agreement or rule.
//     contextual          History, comparison, statistics, background.
//
// A consumer filtering on countries gets the scope-bearing three. The rest are
// returned, labelled, under ?include=weak — because they are true observations
// about the document and hiding them would be its own kind of dishonesty.
//
// TWO SUPPRESSORS SIT ABOVE ALL OF THIS
// -------------------------------------
//   A GLOBAL RULE HAS NO COUNTRIES. When a document states universal
//   application — "all aliens", "regardless of nationality" — a country in an
//   example is not scope, and nothing weaker than an explicit designation is
//   allowed to become one.
//
//   DELEGATED SCOPE IS NOT OUR SCOPE. When a document says its country list
//   will be published elsewhere, the honest answer is the pointer, not a guess.
//   Classifying countries there contradicts the record's own scopeDefinedElsewhere.
//
// WHAT THIS FILE IS NOT
// ---------------------
// Not a list of exceptions for documents we happened to look at. Every rule
// below is a general shape — an instrument title, a form-and-population list,
// a geographic compound noun — and each was written because that shape occurs
// repeatedly in federal immigration text, not because one record needed it.
// =============================================================================

export const COUNTRY_RELATIONS = [
  "title_subject",
  "nationals_of",
  "present_in",
  "designated_list",
  "post_location",
  "document_population",
  "agreement_party",
  "contextual",
] as const;

export type CountryRelation = (typeof COUNTRY_RELATIONS)[number];

/** The relations that mean the document's own coverage is defined by the country. */
export const SCOPE_RELATIONS: readonly CountryRelation[] = [
  "title_subject",
  "nationals_of",
  "present_in",
  "designated_list",
];

export function isScopeRelation(relation: CountryRelation | undefined): boolean {
  return SCOPE_RELATIONS.includes(relation as CountryRelation);
}

/**
 * Strongest first. When a country appears many times in one document, the
 * strongest relation any of its mentions supports is the one recorded — a rule
 * that designates Yemen in its operative text and also cites a 2019 Yemen
 * notice is a rule about Yemen.
 */
const RELATION_RANK: Record<CountryRelation, number> = {
  title_subject: 0,
  nationals_of: 1,
  designated_list: 2,
  present_in: 3,
  post_location: 4,
  document_population: 5,
  agreement_party: 6,
  contextual: 7,
};

export function strongerRelation(a: CountryRelation, b: CountryRelation): CountryRelation {
  return RELATION_RANK[a] <= RELATION_RANK[b] ? a : b;
}

// -----------------------------------------------------------------------------
// SPAN-LEVEL SHAPES — what kind of sentence is this?
// -----------------------------------------------------------------------------

/**
 * The span is the title of an instrument being cited, not a statement of scope.
 *
 * Federal immigration rules cite each other constantly, and the titles they
 * cite are full of country names and of the exact phrases that otherwise mean
 * designation ("Government of", "Nationals of"). A citation is recognisable by
 * its furniture: an instrument noun, a Federal Register or Public Law cite, a
 * parenthetical date.
 */
const INSTRUMENT_TITLE = [
  /\bagreement between\b/i,
  /\bmemorandum of (?:understanding|agreement)\b/i,
  /\bbilateral agreement\b/i,
  /\btreaty (?:between|with)\b/i,
  /\bconvention (?:between|on)\b/i,
  /\bprotocol (?:between|to)\b/i,
  // A NAMED agreement, where the parties are the name. "United
  // States-Mexico-Canada Agreement" contains two countries and is one noun; a
  // policy alert about TN professionals under it is about the visa category,
  // not about Mexico. Also catches "North American Free Trade Agreement" and
  // "U.S.-Korea Free Trade Agreement".
  /\b(?:[A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*[-–])+[A-Z][A-Za-z.]*\s+(?:Free Trade\s+)?Agreement\b/,
  /\bfree trade agreement\b/i,
];

const CITATION_FURNITURE = [
  /\b\d{1,3}\s?FR\s?\d{3,}/i, // 90 FR 31670
  /\bPub\.?\s?L\.?\s?(?:No\.?\s?)?\d{1,3}-\d{1,4}/i, // Pub. L. 117-31
  /\b\d{1,3}\s?Stat\.?\s?\d{2,}/i,
  /\(\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},\s*(?:19|20)\d{2}\s*\)/i,
  /\b8\s?U\.?S\.?C\.?\s?\d+/i,
  /\b8\s?CFR\s?\d+/i,
];

function looksLikeCitation(span: string): boolean {
  return (
    INSTRUMENT_TITLE.some((re) => re.test(span)) || CITATION_FURNITURE.some((re) => re.test(span))
  );
}

/**
 * The span enumerates documents and who holds them, rather than stating who the
 * rule covers.
 *
 * "I-185, Nonresident Alien Canadian Border Crossing Card-- Citizens of Canada"
 * is an inventory entry. The rule is about registration; Canada is the
 * population of one listed card. The recognisable shape is a form identifier
 * followed by a document name and a dash, which is how agencies write these
 * lists.
 */
const DOCUMENT_LIST_ITEM =
  /(?:^|[\s>•])(?:Form\s+)?(?:I|N|G|DS|ETA|AR)-\d{1,4}[A-Z]?\s*[,:]\s*[A-Z][^.]{0,90}?(?:--|—|–|—)/;

/**
 * A US post LOCATED IN the country — not any sentence containing "embassy".
 *
 * Checked on the words immediately before the country name, for a reason found
 * the hard way. A span-level cue read "DHS thanks the Embassy of the Federated
 * States of Micronesia for their comment" — a comment-response paragraph
 * thanking a FOREIGN mission — as a US consular post in Micronesia, and
 * outranked the correct reading of that sentence as background.
 *
 * "Embassy IN Lagos" is a place. "Embassy OF Micronesia" is a commenter.
 */
const POST_LOCATION_BEFORE =
  /\b(?:embassy|embassies|consulate(?:s| general)?|consular (?:post|section|office)s?|mission)\s+(?:in|at)\s+(?:the\s+)?$/i;

/** An enumerated list of affected countries. */
const DESIGNATED_LIST_CUE = [
  /\bthe following countries\b/i,
  /\blist of (?:designated )?countries\b/i,
  /\bcountries designated\b/i,
  /\bdesignated countries\b/i,
  /\beach of the following\b/i,
  /\bcountries listed (?:in|below)\b/i,
];

// -----------------------------------------------------------------------------
// MENTION-LEVEL SHAPES — what is happening immediately around the name?
// -----------------------------------------------------------------------------

/**
 * A geographic compound noun: the country's name is part of a bigger place.
 *
 * "Mexico Boulevard", "Gulf of Mexico", "China Lake". General rather than a
 * per-country exception: any country name followed by a place-type noun, or
 * preceded by a geographic-feature construction, is part of another name.
 */
const PLACE_SUFFIX =
  // Border infrastructure belongs here as much as streets do. "Colombia
  // Solidarity Bridge" is a port of entry at Laredo, Texas, and reading it as
  // the Republic of Colombia put a Texas bridge authorisation into a Colombia
  // feed.
  /^\s+(?:Boulevard|Blvd|Street|St\.|Avenue|Ave|Road|Rd|Highway|Hwy|Drive|Lane|Way|Plaza|Square|Park|Beach|Bay|Lake|River|Creek|Valley|County|Township|Village|Bridge|Crossing|Port|Terminal|Gate|Station|Border Station|Port of Entry|City|Solidarity)\b/i;

const GEOGRAPHIC_FEATURE_PREFIX =
  /\b(?:Gulf|Bay|Sea|Strait|Straits|River|Basin|Peninsula|Desert|Lake|Bank|Coast|Border)\s+of\s*$/i;

/** Nationality or citizenship: the strongest possible scope statement. */
const NATIONALITY_BEFORE =
  /\b(?:nationals?|citizens?|subjects?|natives?|persons?|individuals?|beneficiaries)\s+(?:and\s+(?:nationals?|citizens?)\s+)?(?:of|from)\s+(?:the\s+)?$/i;

const NATIONALITY_AFTER = /^\s*(?:nationals?|citizens?|passport\s+holders?)\b/i;

const CHARGEABILITY = /\bchargeab(?:le|ility)\s+to\s*$/i;

/** Presence, residence, or travel. Scope defined by where a person is or has been. */
const PRESENCE_BEFORE =
  // "within" was here and has been removed. It attached to sentences like
  // "recruit U.S. scientists for high technology development programs within
  // China", which describes where a programme sits in a background paragraph
  // about a criminal case. Every remaining cue says something about a PERSON's
  // location or movement, which is what a scope rule is made of.
  /\b(?:present\s+in|physically\s+present\s+in|residing\s+in|resided\s+in|arriving\s+from|departing\s+from|travell?ing\s+(?:to|from)|admitted\s+(?:to|from)|removed\s+to|returned\s+to|returning\s+from|entering\s+from|last\s+habitually\s+resided\s+in|born\s+in)\s+(?:the\s+)?$/i;

export interface RelationInput {
  /** The sentence or span the country appears in. */
  span: string;
  /** Text immediately before the mention, within the span. */
  before: string;
  /** Text immediately after the mention, within the span. */
  after: string;
  /**
   * True when this span IS the document's title.
   *
   * A title is the document's own statement of what it is about, and titles do
   * not speak in scope grammar. "DHS Terminates Temporary Protected Status for
   * Yemen" names Yemen as its subject and contains no designation phrase at
   * all, so a cue-based reading scored it a bare mention and dropped it. This
   * is the identical failure that dropped ten USCIS records from the H-1B
   * classifier — headlines never say "applies to" — and it has the identical
   * fix.
   */
  inTitle?: boolean;
}

/**
 * Decide what a single country mention is doing.
 *
 * Returns null when the mention is part of another proper noun and should not
 * be treated as a country reference at all.
 *
 * ORDER IS THE ARGUMENT. The specific, disqualifying shapes are tested before
 * the designation cues, because the whole failure this replaces was a
 * designation cue firing inside a citation that happened to contain one.
 */
export function relationFor(input: RelationInput): CountryRelation | null {
  const { span, before, after } = input;

  // Part of a larger geographic name. Not a country reference.
  if (PLACE_SUFFIX.test(after)) return null;
  if (GEOGRAPHIC_FEATURE_PREFIX.test(before)) return null;

  // A citation or an instrument title. Never scope, whatever phrases it holds.
  // Tested BEFORE the title rule, because a document whose own title cites an
  // agreement — "Agreement Between the United States and Guatemala..." — is
  // naming a party, not declaring a subject.
  if (looksLikeCitation(span)) return "agreement_party";

  // The document's own title names it. Nothing further needs to be shown.
  if (input.inTitle) return "title_subject";

  // An inventory of documents and who holds them.
  if (DOCUMENT_LIST_ITEM.test(span)) return "document_population";

  // A US post located in the country.
  if (POST_LOCATION_BEFORE.test(before)) return "post_location";

  // An enumerated list of affected countries.
  if (DESIGNATED_LIST_CUE.some((re) => re.test(span))) return "designated_list";

  // Nationality, then presence. Both must sit next to the name, not merely
  // somewhere in the sentence — that looseness is what let a citation pass.
  if (NATIONALITY_BEFORE.test(before) || NATIONALITY_AFTER.test(after) || CHARGEABILITY.test(before)) {
    return "nationals_of";
  }
  if (PRESENCE_BEFORE.test(before)) return "present_in";

  return "contextual";
}

// -----------------------------------------------------------------------------
// DOCUMENT-LEVEL SUPPRESSORS
// -----------------------------------------------------------------------------

/**
 * The document says it applies to everyone.
 *
 * A country appearing in an example inside a universal rule is not scope, and
 * a monitoring product that says otherwise is telling a Canadian subscriber
 * that a global fee schedule is about Canada.
 */
const GLOBAL_SCOPE_PHRASES = [
  /\ball aliens\b/i,
  /\bany alien\b/i,
  /\ball applicants\b/i,
  /\ball petitioners\b/i,
  /\ball benefit requests\b/i,
  /\ball nonimmigrants\b/i,
  /\bregardless of (?:nationality|country of origin|citizenship)\b/i,
  /\bwithout regard to (?:nationality|country)\b/i,
  /\bevery (?:applicant|petitioner|alien)\b/i,
];

export function statesGlobalScope(text: string): boolean {
  return GLOBAL_SCOPE_PHRASES.some((re) => re.test(text));
}

/**
 * The document defers its country list to somewhere else.
 *
 * The honest answer is the pointer the record already carries in
 * `scopeDefinedElsewhere`. Emitting countries beside it contradicts it.
 */
const DELEGATED_SCOPE_PHRASES = [
  // Every pattern must be ABOUT A COUNTRY LIST. An earlier version matched
  // "will be published in the Federal Register", which appears on nearly every
  // rule, and suppressed the country scope of four Temporary Protected Status
  // terminations that name their country in the title.
  /\bcountries (?:subject to|covered by|affected by)[^.]{0,80}\bwill be (?:announced|published|listed|identified|determined)\b/i,
  /\blist of (?:the )?(?:designated |affected |covered )?countries[^.]{0,80}\b(?:will be|is to be|shall be) (?:announced|published|maintained|identified)\b/i,
  /\b(?:designated |affected |covered )?countries[^.]{0,40}\bwill be (?:announced|published) on\b/i,
];

export function delegatesCountryScope(text: string): boolean {
  return DELEGATED_SCOPE_PHRASES.some((re) => re.test(text));
}
