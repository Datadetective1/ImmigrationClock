// =============================================================================
// READER VALUE — "would a real person stop scrolling for this?"
//
// THE QUESTION THIS FILE ASKS, BEFORE ANY MODEL IS CALLED
// ------------------------------------------------------
//     Would a real immigrant, applicant, international student, worker,
//     employer, attorney or family member stop scrolling because this could
//     affect their status, money, eligibility, deadline, work, travel or plans?
//
// Everything else in the selection stack answers a different question, and each
// of them answers it well:
//
//   ranking.ts     how CONSEQUENTIAL is this document?  (breadth, obligation,
//                  magnitude, authority — a property of the instrument)
//   categories.ts  what KIND of thing is it?            (development, deadline,
//                  proposed, data, explainer, methodology)
//   rotation.ts    have we said this recently?          (repetition)
//
// None of them asks whether a human being has a reason to care. That gap is how
// a page about our own methodology and a rule that changes a filing fee could
// end up separated by a rotation index, and it is why the feed could publish
// something like:
//
//     "USCIS Policy Manual update on investigations and examinations for
//      naturalization eligibility."
//
// — accurate, grounded, correctly ranked, and shaped like a database row.
//
// WHY THIS IS DETERMINISTIC CODE AND NOT A PROMPT
// -----------------------------------------------
// Two reasons, and the second is the one that pays for the file:
//
//   1. It has to be auditable. A slot that stayed silent has to be explainable
//      six weeks later from the ledger, and "the model judged it uninteresting"
//      is not an explanation.
//   2. IT HAS TO RUN BEFORE THE ENGINE. This is the cost control. A candidate
//      that fails the reader-value floor never reaches an API call, so raising
//      the editorial bar LOWERS spend instead of raising it. Every gate that
//      could have been a prompt instruction and is a function instead is one
//      more decision made for free.
//
// WHAT IT MAY READ
// ----------------
// Only the closed world — the same archive fields, asset descriptions and
// computed data points that facts.ts hands the copy engine. Nothing here reaches
// for outside knowledge, so a signal it reports is always something the fact set
// can support in the finished post.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import type { KeyDate } from "@/lib/key-dates";
import type { StandingAsset } from "./links";
import type { AssetInsight } from "./asset-facts";
import type { Angle, FactSet, SubjectKind } from "./types";

// -----------------------------------------------------------------------------
// THE SIGNALS
// -----------------------------------------------------------------------------

/**
 * The fourteen ways a change can reach into someone's life.
 *
 * Deliberately named after the CONSEQUENCE rather than after the vocabulary that
 * detects it. "financial_impact" is the thing a reader feels; `/\bfees?\b/` is
 * merely one of the ways a federal document says it. Keeping those apart is what
 * stops this file drifting back into keyword strength — the exact failure
 * ranking.ts was built to remove.
 */
export type ImpactSignal =
  /** Money changes hands, or the amount changes. */
  | "financial_impact"
  /** A date someone has to act by, or a window that opens or closes. */
  | "deadline"
  /** Who qualifies, or stops qualifying. */
  | "eligibility"
  /** Permission to work — and the events that end it. */
  | "work_authorization"
  /** Whether a visa number, a category or a slot is available at all. */
  | "visa_availability"
  /** Becoming a citizen. */
  | "naturalization"
  /** What has to be filed, on which form, with what evidence. */
  | "filing_requirements"
  /** What an employer or sponsor must now do. */
  | "employer_obligations"
  /** How long a case takes, or how it is decided. */
  | "processing_change"
  /** Removal, detention, arrest, penalty. */
  | "enforcement_consequence"
  /** Getting in, getting back in, or being kept out. */
  | "travel_consequence"
  /** A court changing a rule that was in force. */
  | "court_ruling"
  /** A fee movement large enough to be the story on its own. */
  | "large_fee_change"
  /** The facts name a concrete population this reaches. */
  | "affected_group";

/**
 * The ways a candidate can be technically publishable and not worth publishing.
 *
 * Every one of these describes content whose subject is US rather than the
 * reader: how we classify a figure, what a page contains, that a form's edition
 * date moved. They are penalties rather than vetoes because the same page can
 * carry a real finding on a different day — what is being scored is TODAY's
 * offer, not the page's permanent worth.
 */
export type LowValueSignal =
  /** Explaining how ImmigrationClock derives, labels or verifies its data. */
  | "methodology"
  /** Describing an ImmigrationClock product behaviour rather than the world. */
  | "product_documentation"
  /** A scheduled data drop with no change in it. */
  | "routine_dataset_refresh"
  /** A table of contents for a page, with no finding in it. */
  | "generic_description"
  /**
   * The resource holds no reported figure today.
   *
   * Split out from `generic_description` because they are different failures
   * that happened to share a penalty: a page can be squarely about H-1B
   * sponsorship and still have nothing measured to say this week. Collapsing the
   * two made the ledger's explanation useless — "generic description" on the
   * H-1B employer directory reads as an error, when the real answer is "no
   * figure survived the reported-only test today".
   */
  | "no_reported_figure"
  /** Paperwork about paperwork: collections, corrections, comment extensions. */
  | "minor_procedural";

/** Human wording, for the ledger, the simulator and the preview. */
export const IMPACT_LABEL: Record<ImpactSignal, string> = {
  financial_impact: "money",
  deadline: "deadline",
  eligibility: "eligibility",
  work_authorization: "work authorization",
  visa_availability: "visa availability",
  naturalization: "naturalization",
  filing_requirements: "filing requirements",
  employer_obligations: "employer obligations",
  processing_change: "processing",
  enforcement_consequence: "enforcement",
  travel_consequence: "travel",
  court_ruling: "court ruling",
  large_fee_change: "large fee change",
  affected_group: "named population",
};

export const LOW_VALUE_LABEL: Record<LowValueSignal, string> = {
  methodology: "methodology / about ImmigrationClock",
  product_documentation: "product documentation",
  routine_dataset_refresh: "routine dataset refresh",
  generic_description: "generic description, no finding",
  no_reported_figure: "no reported figure today",
  minor_procedural: "minor procedural notice",
};

/**
 * WEIGHTS — how far each consequence reaches into a life.
 *
 * Ordered by the honest answer to "what would make you stop scrolling", not by
 * how often the signal fires. Money, eligibility and work authorization sit at
 * the top because losing any of them changes where someone lives; a filing
 * requirement is real and recoverable, so it sits lower.
 *
 * The scale is 0–100 and the sum is capped there, so no candidate can win by
 * accumulating five weak signals. A candidate that genuinely fires five families
 * is a rule that touches money, work, eligibility, timing and employers at once,
 * and the cap costs it nothing it needed.
 */
export const IMPACT_WEIGHT: Record<ImpactSignal, number> = {
  financial_impact: 24,
  eligibility: 20,
  work_authorization: 20,
  court_ruling: 20,
  deadline: 18,
  visa_availability: 18,
  naturalization: 18,
  enforcement_consequence: 18,
  travel_consequence: 16,
  processing_change: 14,
  filing_requirements: 12,
  employer_obligations: 12,
  large_fee_change: 12,
  affected_group: 10,
};

/**
 * PENALTIES — for weaknesses that DEMOTE.
 *
 * A subtraction is the right instrument when the weakness is a matter of degree:
 * a scheduled refresh of a dataset that also carries a real finding is worth
 * less than the finding alone, not worth nothing.
 */
export const LOW_VALUE_PENALTY: Partial<Record<LowValueSignal, number>> = {
  routine_dataset_refresh: 30,
  generic_description: 20,
  no_reported_figure: 20,
};

/**
 * CEILINGS — for weaknesses that DISQUALIFY, however the rest of the text reads.
 *
 * A SUBTRACTION WAS THE WRONG INSTRUMENT HERE, AND A REAL ARCHIVE ITEM PROVED IT:
 *
 *     "Agency Information Collection Activities; Reinstatement, With Change, of
 *      a Previously Approved Collection for Which Approval Has Expired: Public
 *      Charge Bond"
 *
 * scored 61/100 under a flat −35. It is a request for OMB to renew a form, and
 * it reached 61 by accumulating four unrelated signals out of its own boilerplate
 * — "public charge" (eligibility), "bond" (money), "expired" (a deadline), a
 * named population. Every one of those matched a real word and not one of them
 * describes anything happening to anybody.
 *
 * That is the failure mode of any additive model: enough weak evidence
 * out-votes one decisive fact. So the decisive facts stop voting and start
 * deciding. A document whose GENRE is paperwork about paperwork cannot lead,
 * whatever nouns appear in it, and a page whose SUBJECT is ImmigrationClock
 * cannot lead, whatever it mentions.
 *
 * The ceilings sit below READER_VALUE_FLOOR by construction, so both are vetoes
 * rather than heavy demotions — which is what they were always meant to be, and
 * what −35 and −60 only approximated.
 */
export const LOW_VALUE_CEILING: Partial<Record<LowValueSignal, number>> = {
  methodology: 0,
  product_documentation: 0,
  minor_procedural: 20,
};

// -----------------------------------------------------------------------------
// THE THRESHOLDS
// -----------------------------------------------------------------------------

/**
 * Below this, nothing publishes — the slot stays silent.
 *
 * THIS IS THE COST CONTROL AS WELL AS THE QUALITY BAR. A candidate rejected here
 * never reaches the copy engine, so the stricter this gets the cheaper the system
 * runs. That alignment is deliberate and worth preserving: any future quality
 * gate should be added on this side of the API call, not as another instruction
 * in the prompt.
 *
 * Calibrated against the real catalogue rather than chosen round. At 30:
 *
 *   PASSES   key dates (76) · H-1B employer data (54) · the work-visa hub (54) ·
 *            border encounters (44) · WARN layoffs (42) · F-1 issuance (40)
 *   FAILS    the methodology page (0) · the source registry (0) · the follow
 *            page (0) · the change-feed description (0) · the policy timeline (0)
 *
 * Every failure in that list is a page whose post could only have described
 * ImmigrationClock or a page's contents. That is the intended cut.
 */
export const READER_VALUE_FLOOR = 30;

/**
 * What a FRESH item must score to hold the top category band.
 *
 * The rule this enforces is "newest is not automatically best". Before it,
 * `fresh === true` was sufficient for the `development` tier — 70,000 points —
 * so a routine notice published this morning outranked, by two whole bands, a
 * fee rule from last week that changes what somebody pays. Freshness is now
 * necessary and not sufficient: a new item earns the top band by being both new
 * AND consequential, and a new item that is merely new falls through to the same
 * ladder an archive item is judged on (deadline → actionable → explainer), where
 * it competes on what it actually does.
 *
 * Sized above the floor, not at it: clearing "worth publishing at all" is a much
 * lower bar than "leads the day".
 */
export const DEVELOPMENT_READER_VALUE_FLOOR = 45;

/**
 * Reader value's contribution to a candidate's score, per point.
 *
 * SIZED TO SETTLE TWO ARGUMENTS AND STAY OUT OF A THIRD.
 *
 * It must WIN against recency. The news pool's recency decay tops out at 750
 * (5 days × 150), so a reader-value gap of 16 points overturns any age
 * difference the pool can produce. A consequential item from Monday therefore
 * beats a trivial one from this morning — which is the whole of requirement 4.
 *
 * It must WIN against a single breadth step. One step is 1000, so a 20-point
 * reader-value gap outranks it. Breadth answers "how many people does the
 * document mention"; reader value answers "does it do anything to them". When
 * those disagree by 20 points, the second question is the better one.
 *
 * It must LOSE to a tier. This is the constraint that fixes the number. Every
 * within-tier merit has to sum to less than TIER_STEP (10,000) or the category
 * ladder becomes a suggestion:
 *
 *     ranking model, absolute maximum        3,373
 *     reader value, absolute maximum (×50)   5,000
 *     ------------------------------------ -------
 *     total within-tier merit                8,373   <  10,000  ✓
 *
 * Standing candidates do not carry this merit at all — see readerValueMerit() in
 * select.ts for why — so their budget is smaller still: a key date's urgency
 * figure tops out at 3,120 and an asset's rotation index at 15.
 *
 * ONE THING THIS BOUND DOES NOT COVER, and it is worth saying because the
 * numbers invite the mistake: it bounds the merit WITHIN a tier. It says nothing
 * about an item MOVING BETWEEN tiers, which is a much larger jump and happens
 * for reasons that have nothing to do with reader value — an event crossing the
 * five-day news boundary falls out of `development` and into whichever archive
 * band its own data earns, which is tens of thousands of points. That is the
 * pool design working as intended, not the recency gradient; the gradient itself
 * is bounded at 750 and only ever operates inside the news pool.
 */
export const READER_VALUE_WEIGHT = 50;

/**
 * A dollar figure at or above this makes the fee itself the story.
 *
 * Four digits, because that is where an immigration fee stops being a line item
 * and starts being a reason to change plans. Three-digit fees are common and
 * already caught by `financial_impact`; this is the extra weight that lets a
 * $100,000 H-1B surcharge outrank an ordinary fee adjustment without anyone
 * hand-tuning a story.
 */
export const LARGE_FEE_THRESHOLD = 1000;

// -----------------------------------------------------------------------------
// THE VOCABULARY
//
// Patterns, not words, on the same principle as validate.ts: what is being
// detected is a CONSEQUENCE, and a word only stands in for one when its
// construction says so. `/\bcap\b/` is visa availability; "capture" is not.
// -----------------------------------------------------------------------------

const PATTERNS: Record<Exclude<ImpactSignal, "court_ruling" | "large_fee_change" | "affected_group">, RegExp[]> = {
  financial_impact: [
    /\bfees?\b/,
    /\bfee schedule\b/,
    /\bsurcharge\b/,
    /\bbonds?\b/,
    /\bcosts?\b/,
    /\bcharges?\b/,
    /\bpayments?\b/,
    /\bcivil penalt(y|ies)\b/,
    /\bfines?\b/,
    /\binflation adjustment\b/,
    /\$\s?\d/,
  ],
  deadline: [
    /\bdeadlines?\b/,
    /\bfiling (window|period|season)\b/,
    /\bregistration (window|period)\b/,
    /\bcut-?off\b/,
    /\bexpir(e|es|ed|ation)\b/,
    /\bsunsets?\b/,
    /\blast day\b/,
    /\bno later than\b/,
    /\bon or after\b/,
    /\bmust be (filed|received|submitted|postmarked)\b/,
    /\b(applications?|petitions?|filings?|editions?) .{0,40}\b(rejected|accepted) (on|starting|beginning|from)\b/,
    /\bwill be rejected\b/,
    /\bwindows?\b/,
    // An extension moves a date that already existed, which is the definition of
    // a timing change and the commonest shape a TPS or work-permit notice takes.
    /\bextension of\b/,
    /\bautomatically extend(s|ed|ing)?\b/,
    /\bcontinuation of\b/,
    /\bexpiration date\b/,
  ],
  eligibility: [
    /\beligibilit(y|ies)\b/,
    /\bineligib/,
    /\beligible\b/,
    /\b(in)?admissibilit(y|ies)\b/,
    /\binadmissible\b/,
    /\bqualif(y|ies|ied|ying|ication)\b/,
    /\bpublic charge\b/,
    /\bgrounds? of (inadmissibility|removability|ineligibility)\b/,
    /\bwaivers?\b/,
    /\bbars? to\b/,
    /\bdisqualif/,
    /\bterminat(e|es|ed|ion|ing)\b/,
    /\brevok(e|es|ed|ing|ation)\b/,
    /\brescind(s|ed|ing)?\b|\brescission\b/,
    // THE STATUSES THAT ARE GRANTED AND WITHDRAWN, BOTH DIRECTIONS.
    //
    // Without these the model was systematically one-sided on the largest
    // populations in the archive: of 42 Temporary Protected Status events, all
    // 31 terminations cleared the floor — on the single word "terminate" — and
    // only 2 of 9 extensions and vacaturs did. An account that reports every TPS
    // termination and no TPS extension is not being cautious, it is being
    // partial, and it would have been partial in one direction on the subject
    // where the stakes are highest.
    /\btemporary protected status\b/,
    /\btps\b/,
    /\bdeferred enforced departure\b/,
    /\bdeferred action\b/,
    /\bdaca\b/,
    /\bhumanitarian parole\b/,
    /\b(re)?designat(e|es|ed|ion|ing)\b/,
    /\bvacatur\b/,
    /\bwithholding of removal\b/,
    /\basylum\b/,
    /\basylees?\b/,
    /\brefugees?\b/,
  ],
  work_authorization: [
    /\bwork(ing)? authoriz/,
    /\bemployment authoriz/,
    /\bemployment-based\b/,
    /\bwork permits?\b/,
    /\bpractical training\b/,
    /\bh-?1b\b/,
    /\bl-?1[ab]?\b/,
    /\bo-?1\b/,
    /\btn visas?\b/,
    /\bopt\b/,
    /\bstem opt\b/,
    /\bead\b/,
    /\blabor certification\b/,
    /\bperm\b/,
    /\bwork visas?\b/,
    // A layoff is the commonest way work authorization actually ends: an H-1B
    // worker's status is tied to the job, so a WARN notice is a status event
    // whatever the labour-law framing says.
    /\blayoffs?\b/,
    /\bwarn act\b/,
    /\bmass layoffs?\b/,
    /\bplant closing\b/,
    /\breduction in force\b/,
  ],
  visa_availability: [
    /\bvisa bulletin\b/,
    /\bpriority dates?\b/,
    /\bnumerical limitations?\b/,
    /\bcaps?\b/,
    /\bquotas?\b/,
    /\bretrogress/,
    /\bdiversity visa\b/,
    /\bgreen cards?\b/,
    /\bpermanent residen(ce|t|ts|cy)\b/,
    /\badjustment of status\b/,
    /\bimmigrant visas?\b/,
    /\bper-?country\b/,
    /\bfamily-based\b/,
    /\bannual limit\b/,
    /\brefugee admissions\b/,
    /\badmissions ceiling\b/,
    /\bvisa waiver\b/,
  ],
  naturalization: [
    /\bnaturaliz/,
    /\bcitizenship\b/,
    /\bn-?400\b/,
    /\bcivics test\b/,
    /\boath of allegiance\b/,
  ],
  filing_requirements: [
    /\bforms? [a-z]{1,2}-\d{1,4}\b/,
    // USCIS form numbers, which are the most concrete filing signal there is.
    // Restricted to the prefixes USCIS actually uses for forms so a visa
    // designation ("L-1", "O-1") is not read as a form.
    /\b(i|n|g|ar)-\d{1,4}\b/,
    /\bfiling (requirements?|procedures?|instructions?)\b/,
    /\bnew edition\b/,
    /\bedition dates?\b/,
    /\bsignature requirements?\b/,
    /\bsupporting (evidence|documentation)\b/,
    /\brequests? for (additional )?evidence\b/,
    /\bnotices? of intent to deny\b/,
    /\bevidentiary standards?\b/,
    /\bbenefit requests?\b/,
    /\bdocumentation requirements?\b/,
    /\bmust (submit|include|provide|file)\b/,
    // Both were real gaps: "Alien Registration Form and Evidence of
    // Registration" and "Office of the Chief Administrative Hearing Officer
    // Electronic Filing" are major final rules that impose a filing obligation
    // and scored zero, because nothing in the vocabulary covered the two most
    // basic filing acts there are.
    /\balien registration\b/,
    /\bregistration requirements?\b/,
    /\bevidence of registration\b/,
    /\belectronic filing\b/,
    /\be-?filing\b/,
  ],
  employer_obligations: [
    /\bemployers?\b/,
    /\bsponsor(s|ship|ing|ed)?\b/,
    /\bpetitioners?\b/,
    /\bi-?9\b/,
    /\be-?verify\b/,
    /\blabor condition applications?\b/,
    /\bprevailing wage\b/,
    /\bwages?\b/,
    /\bworkforce\b/,
    /\battestations?\b/,
    /\bemployees?\b/,
  ],
  processing_change: [
    /\bprocessing times?\b/,
    /\bprocessing delays?\b/,
    /\bpremium processing\b/,
    /\badjudicat(e|es|ed|ion|ions|ing)\b/,
    /\bbacklogs?\b/,
    /\binterviews?\b/,
    /\bapprovals?\b/,
    /\bdenials?\b/,
    /\bapproval rates?\b/,
    /\bexpedit(e|ed|ing)\b/,
    /\bbiometrics?\b/,
    /\breferrals?\b/,
    /\bdiscretion\b/,
    /\bscreening\b/,
    /\bvetting\b/,
    /\bappellate\b/,
    /\bmotions? to reopen\b/,
  ],
  enforcement_consequence: [
    /\benforcement\b/,
    /\bremovals?\b/,
    /\bdeportation\b/,
    /\bdetention\b/,
    /\bdetained\b/,
    /\barrests?\b/,
    /\bexpedited removal\b/,
    /\bimmigration and customs enforcement\b/,
    /\bcustody\b/,
    /\bpenalt(y|ies)\b/,
    /\bviolations?\b/,
    // The agency names are gone from this list on purpose — impactCorpus()
    // strips them, and "CBP published a notice" was never an enforcement
    // consequence. What replaces them are the ACTS.
    /\bborder patrol\b/,
    /\bapprehensions?\b/,
    /\bremoval proceedings\b/,
    /\bdeportable\b/,
  ],
  travel_consequence: [
    /\btravel\b/,
    /\bports? of entry\b/,
    /\bre-?entry\b/,
    /\bvisa issuance\b/,
    /\bconsular\b/,
    /\bconsulates?\b/,
    /\badmission\b/,
    /\bborders?\b/,
    /\bparole\b/,
    /\bsuspension of entry\b/,
    /\bpassports?\b/,
    /\bencounters?\b/,
    /\bentry-?exit\b/,
    /\bperiod of admission\b/,
    /\bextension of stay\b/,
  ],
};

/** A court that changed a rule, rather than a court that merely spoke. */
const COURT_ACTION =
  /\b(vacat|enjoin|injunction|stay(ed|s)?\b|block(s|ed|ing)?\b|overturn|strike down|struck down|set aside|remand|reinstat|uphold|upheld|invalidat)/;

/**
 * Paperwork about paperwork.
 *
 * The single most common shape of a technically-qualifying, humanly-worthless
 * document. Every pattern here names a genre, not a topic: an information
 * collection notice about H-1B is still an information collection notice.
 */
const MINOR_PROCEDURAL = [
  /\b(agency )?information collection\b/,
  /\bpaperwork reduction act\b/,
  /\bproposed collection\b/,
  /\btechnical (amendment|correction)s?\b/,
  /\bcorrecting amendment\b/,
  /\bnotices? of (public )?meetings?\b/,
  /\bcomment period\b/,
  /\bextension of (the )?comment\b/,
  /\bprivacy act (of \d{4}|system of records|notice)\b/,
  /\bwithout change, of a currently approved\b/,
  /\b30-day notice\b/,
  /\b60-day notice\b/,
  // "Regulatory agenda", not bare "agenda", and no bare "meeting of the": the
  // loose forms matched "Yearly Meeting of the Religious Society of Friends v.
  // DHS", which is a litigant's name and not a genre. A genre pattern that
  // matches a party name is not a genre pattern.
  /\b(regulatory|unified) agenda\b/,
];

/** A scheduled data drop, which changes nothing about anyone's obligations. */
const ROUTINE_REFRESH = [
  /\bdata (release|update|refresh)\b/,
  /\bmonthly (update|release)\b/,
  /\bquarterly (update|release)\b/,
  /\bstatistics? (update|release)\b/,
];

/** Tags that mark a standing asset as being about us rather than about the world. */
const SELF_REFERENTIAL_TAGS = new Set(["methodology", "product", "privacy"]);

/**
 * Tags that mark a standing asset as covering a substantive domain.
 *
 * Used for the small resource base below. A page tagged `h1b` is about H-1B
 * whatever its sentences happen to match; a page tagged only `reference` or
 * `archive` is a container.
 */
const SUBSTANTIVE_TAGS = new Set([
  "h1b",
  "layoffs",
  "warn",
  "enforcement",
  "border",
  "students",
  "visas",
  "deadlines",
  "employers",
  "data",
  "map",
]);

/**
 * AGENCY NAMES ARE IDENTITY, NOT CONSEQUENCE — and leaving them in the corpus
 * was the worst defect this model shipped with.
 *
 * `/\bcitizenship\b/` is a naturalization signal worth 18 points. It also
 * appears in the words "U.S. Citizenship and Immigration Services", which is the
 * byline on most of the archive. Measured over the real index: the pattern
 * matched 175 of 525 events, and in 162 of them the ONLY occurrence was the
 * agency's own masthead. Nearly a third of the archive was being credited with
 * a citizenship consequence for saying who published it.
 *
 * The same bug, smaller, in three more places: "Immigration and Customs
 * Enforcement" scored as enforcement, "Customs and Border Protection" scored as
 * enforcement, and any USCIS byline scored as naturalization.
 *
 * So the corpus every pattern reads has the mastheads removed first. What
 * survives is what the document SAYS. An event genuinely about removals still
 * scores enforcement — from "removal", "detention", "arrest", the words that
 * describe the act — and an event whose only enforcement content is the name of
 * the agency that published it scores nothing, which is correct.
 *
 * Longest form first, so "u.s. citizenship and immigration services" is consumed
 * before the shorter alternations can bite into it.
 */
const AGENCY_MASTHEADS: RegExp[] = [
  /u\.?s\.? citizenship and immigration services/g,
  /citizenship and immigration services/g,
  /u\.?s\.? immigration and customs enforcement/g,
  /immigration and customs enforcement/g,
  /u\.?s\.? customs and border protection/g,
  /customs and border protection/g,
  /department of homeland security/g,
  /u\.?s\.? department of state/g,
  /department of state/g,
  /state department/g,
  /u\.?s\.? department of labor/g,
  /department of labor/g,
  /u\.?s\.? department of justice/g,
  /department of justice/g,
  /executive office for immigration review/g,
  /\buscis\b/g,
  /\bdhs\b/g,
  /\bcbp\b/g,
  /\bice\b/g,
  /\beoir\b/g,
  /\bdol\b/g,
  /\bdoj\b/g,
  /federal register/g,
  /immigrationclock/g,
];

/**
 * The text the impact patterns are allowed to read: lowercased, with agency
 * identity removed.
 *
 * One function so every entry point — events, key dates, assets — reads the same
 * corpus, and so a masthead added here cannot be forgotten in one of them.
 */
export function impactCorpus(...parts: (string | null | undefined)[]): string {
  let text = parts.filter(Boolean).join(" ").toLowerCase();
  for (const re of AGENCY_MASTHEADS) text = text.replace(re, " ");
  return text;
}

const anyMatch = (pats: RegExp[], text: string) => pats.some((re) => re.test(text));

// -----------------------------------------------------------------------------
// THE ASSESSMENT
// -----------------------------------------------------------------------------

export interface ReaderValue {
  /** 0–100. The whole question, as one number. */
  score: number;
  /** Which consequences fired, strongest first. */
  signals: ImpactSignal[];
  /** Which weaknesses fired. */
  lowValue: LowValueSignal[];
  /**
   * One sentence a human can read in a ledger six weeks later.
   *
   * Not generated prose: assembled from the labels above, so it can never
   * describe a signal that did not fire.
   */
  reason: string;
  /**
   * Statements the copy engine may use to build its hook, derived from the
   * signals and phrased as pointers rather than claims.
   *
   * These are NOT new facts. Each one says "the fact set's own language covers
   * X", which is true by construction because a pattern matched that language.
   * The model still has to find the specific words in the summary; nothing here
   * gives it permission to invent a consequence the source does not state.
   */
  hooks: string[];
}

/** Score, cap, penalise, apply ceilings, floor at zero. The whole arithmetic. */
function assemble(
  signals: ImpactSignal[],
  lowValue: LowValueSignal[],
  base: number
): ReaderValue {
  const ordered = [...new Set(signals)].sort(
    (a, b) => IMPACT_WEIGHT[b] - IMPACT_WEIGHT[a] || a.localeCompare(b)
  );
  const weaknesses = [...new Set(lowValue)];

  const gross = Math.min(
    100,
    base + ordered.reduce((n, s) => n + IMPACT_WEIGHT[s], 0)
  );
  const penalty = weaknesses.reduce((n, s) => n + (LOW_VALUE_PENALTY[s] ?? 0), 0);

  // Ceilings last, and they are absolute: a disqualifying weakness is not
  // something the rest of the document gets to argue with.
  const ceiling = weaknesses.reduce(
    (n, s) => Math.min(n, LOW_VALUE_CEILING[s] ?? 100),
    100
  );

  const score = Math.max(0, Math.min(ceiling, Math.min(100, gross - penalty)));

  return {
    score,
    signals: ordered,
    lowValue: [...new Set(lowValue)].sort(),
    reason: describe(score, ordered, [...new Set(lowValue)].sort()),
    hooks: ordered.map((s) => HOOK_BY_SIGNAL[s]),
  };
}

function describe(score: number, signals: ImpactSignal[], lowValue: LowValueSignal[]): string {
  const good = signals.length
    ? `touches ${signals.map((s) => IMPACT_LABEL[s]).join(", ")}`
    : "no reader-impact signal";
  const bad = lowValue.length
    ? `; weakened by ${lowValue.map((s) => LOW_VALUE_LABEL[s]).join(", ")}`
    : "";
  return `reader value ${score}/100 — ${good}${bad}`;
}

/**
 * What each signal gives the model to open on.
 *
 * Written as a question the post's first sentence should answer, because that is
 * the actual editorial instruction — "why should someone care" is not a tone, it
 * is a sentence with a subject in it.
 */
const HOOK_BY_SIGNAL: Record<ImpactSignal, string> = {
  financial_impact:
    "Money: the fact set's own language covers a fee, cost, bond or penalty. Who pays it, and how much, is the thing a reader wants first.",
  deadline:
    "Timing: a date or window is in play. When it falls, and what changes on it, is the thing a reader wants first.",
  eligibility:
    "Eligibility: the fact set's own language covers who qualifies, who stops qualifying, or a ground of inadmissibility.",
  work_authorization:
    "Work: the fact set's own language covers permission to work, a work-visa category, or an event that ends employment.",
  visa_availability:
    "Visa availability: the fact set's own language covers numbers, caps, priority dates or a route to permanent residence.",
  naturalization:
    "Citizenship: the fact set's own language covers naturalization. Say what part of that process this touches.",
  filing_requirements:
    "Filing: the fact set's own language covers a form, an edition, a signature or an evidence requirement.",
  employer_obligations:
    "Employers: the fact set's own language covers what a sponsor, petitioner or employer has to do.",
  processing_change:
    "Processing: the fact set's own language covers how a case is decided, how long it takes, or how it is adjudicated.",
  enforcement_consequence:
    "Enforcement: the fact set's own language covers removal, detention, arrest or penalties.",
  travel_consequence:
    "Travel: the fact set's own language covers entry, admission, issuance or the border.",
  court_ruling:
    "A court changed something that was in force. Say what the court did to the rule — not what it might mean later.",
  large_fee_change:
    "The fee figure is large enough to be the story. Lead with the amount, exactly as the fact set states it.",
  affected_group:
    "The fact set names a concrete population. Say who, using only the categories, countries or visa types it names.",
};

// -----------------------------------------------------------------------------
// EVENTS
// -----------------------------------------------------------------------------

/**
 * The archive's own read of how much of a change this is, worth up to 20 points.
 *
 * Deliberately small. It exists so that a major final rule does not start from
 * zero merely because its title is terse, and it is capped low enough that it
 * can never carry a document over the floor on its own: severity and
 * classification say "this is a real instrument", not "a person is affected".
 * Everything above the base has to be earned from what the document DOES.
 */
function officialWeight(e: { severity: string | null; classification: string | null }): number {
  let n = 0;
  if (e.severity === "major") n += 12;
  else if (e.severity === "notable") n += 6;

  switch (e.classification) {
    case "final_rule":
    case "executive_action":
    case "court_decision":
      n += 8;
      break;
    case "updated_information":
    case "announcement":
    case "legislative_action":
    case "proposed_rule":
      n += 4;
      break;
    default:
      break;
  }
  return n;
}

/**
 * The largest dollar amount the text states, in dollars.
 *
 * READS THE MAGNITUDE WORD, because without it "$1.5 billion" parsed as 1.5 and
 * a four-figure fee outranked a ten-figure one. The bug was invisible in the
 * archive — nothing there is written that way today — and would have surfaced
 * the first time a rule described its cost the way large rules usually do.
 */
const MAGNITUDE: [RegExp, number][] = [
  [/^\s*(billion|bn)\b/i, 1_000_000_000],
  [/^\s*million\b/i, 1_000_000],
  [/^\s*thousand\b/i, 1_000],
];

export function largestDollarFigure(text: string): number {
  let max = 0;
  for (const m of text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const after = text.slice((m.index ?? 0) + m[0].length);
    const scale = MAGNITUDE.find(([re]) => re.test(after))?.[1] ?? 1;
    max = Math.max(max, n * scale);
  }
  return max;
}

/**
 * How much a reader would care about this archive event.
 *
 * `today` is passed rather than read from a clock so a simulation, a preview and
 * a production run of the same day produce the same number — the same discipline
 * the rest of this domain keeps.
 */
export function readerValueForEvent(e: IndexedEvent, today: string): ReaderValue {
  const text = impactCorpus(e.title, e.summary);
  const signals: ImpactSignal[] = [];
  const lowValue: LowValueSignal[] = [];

  for (const [signal, patterns] of Object.entries(PATTERNS)) {
    if (anyMatch(patterns, text)) signals.push(signal as ImpactSignal);
  }

  // A future effective date IS a deadline, whatever vocabulary the title used.
  // Structural signals beat regexes wherever the archive already holds the fact.
  if (e.effectiveAt && e.effectiveAt > today) {
    if (!signals.includes("deadline")) signals.push("deadline");
  }

  // A court ruling counts when it DID something to a rule. A decision that
  // merely decides a case between two parties changes nothing a reader plans
  // around, and this account does not report litigation as such.
  if (e.classification === "court_decision" && COURT_ACTION.test(text)) {
    signals.push("court_ruling");
  }

  if (largestDollarFigure(`${e.title} ${e.summary ?? ""}`) >= LARGE_FEE_THRESHOLD) {
    signals.push("large_fee_change");
  }

  // A concrete population, taken from the entity graph rather than from prose —
  // the same test anglesForArchiveEvent() uses to earn `who_is_affected`, so the
  // signal and the angle can never disagree about whether a population exists.
  const concrete = (e.entityIds ?? []).filter(
    (id) =>
      id.startsWith("visa:") ||
      id.startsWith("country:") ||
      (id.startsWith("topic:") && id !== "topic:policy-changes")
  );
  if (concrete.length > 0) signals.push("affected_group");

  if (anyMatch(MINOR_PROCEDURAL, text)) lowValue.push("minor_procedural");
  if (anyMatch(ROUTINE_REFRESH, text) || e.classification === "data_release") {
    lowValue.push("routine_dataset_refresh");
  }

  // NO `generic_description` PENALTY FOR A DOCUMENT, deliberately.
  //
  // For a resource that signal means something — a page with no reported figure
  // is offering a description of itself. For a document it means only "none of
  // our vocabulary matched", and subtracting 20 for that flattened every
  // unmatched document to exactly zero: officialWeight tops out at 20, so a
  // major final rule and a routine press release both landed on 0 and the ledger
  // could no longer tell them apart.
  //
  // It changed no decision either way — 20 is below the 30-point floor, so an
  // unmatched document was never publishable — which is the whole argument for
  // dropping it. A penalty that alters no outcome and destroys the only
  // information left in the score is pure loss.

  return assemble(signals, lowValue, officialWeight(e));
}

// -----------------------------------------------------------------------------
// KEY DATES
// -----------------------------------------------------------------------------

/**
 * A recurring window is a deadline by construction, so it starts with the
 * deadline signal and earns the rest from what the window is FOR.
 *
 * These score high and are meant to. "A filing window opens in six weeks" is one
 * of the few things this account can say that is unambiguously useful to
 * somebody, and the milestone gate in rotation.ts is what stops that becoming a
 * daily countdown.
 */
export function readerValueForKeyDate(kd: KeyDate, daysAway: number): ReaderValue {
  const text = impactCorpus(kd.title, kd.detail);
  const signals: ImpactSignal[] = ["deadline"];

  for (const [signal, patterns] of Object.entries(PATTERNS)) {
    if (signal === "deadline") continue;
    if (anyMatch(patterns, text)) signals.push(signal as ImpactSignal);
  }

  switch (kd.category) {
    case "h1b":
      signals.push("work_authorization", "employer_obligations");
      break;
    case "green-card":
      signals.push("visa_availability");
      break;
    case "students":
      signals.push("work_authorization");
      break;
    case "tax":
      signals.push("filing_requirements");
      break;
    default:
      break;
  }

  // Proximity is worth real points: the same window is more useful to know about
  // at three weeks than at four months. Small, because a distant window is still
  // worth knowing about and this must not turn into manufactured urgency.
  const base = daysAway <= 45 ? 10 : daysAway <= 90 ? 5 : 0;

  return assemble(signals, [], base);
}

// -----------------------------------------------------------------------------
// STANDING ASSETS
// -----------------------------------------------------------------------------

/**
 * How much a reader would care about a durable page TODAY.
 *
 * Scored on the page's description plus the finished data points asset-facts.ts
 * computed for today, because those are what the post can actually contain. A
 * page whose insight is numeric is offering a fact about the world; a page whose
 * insight is not is, by that module's own account, offering "the methodological
 * point a reader gets wrong" — which is a fact about our data rather than about
 * anyone's life.
 *
 * That distinction is the `generic_description` penalty below, and it is the
 * single line that separates "WARN notices covered 41,000 employees last month"
 * from "the site labels each figure by how it was derived".
 */
export function readerValueForAsset(
  asset: StandingAsset,
  insight: AssetInsight | null
): ReaderValue {
  const tags = asset.tags ?? [];
  const text = impactCorpus(asset.label, asset.description, (insight?.points ?? []).join(" "));

  const signals: ImpactSignal[] = [];
  const lowValue: LowValueSignal[] = [];

  for (const [signal, patterns] of Object.entries(PATTERNS)) {
    if (anyMatch(patterns, text)) signals.push(signal as ImpactSignal);
  }

  // Pages about ImmigrationClock are scored on what they are, not on what their
  // prose happens to mention. The follow page names countries and visas; it is
  // still a page about a browser feature.
  if (tags.some((t) => SELF_REFERENTIAL_TAGS.has(t))) {
    lowValue.push(tags.includes("methodology") ? "methodology" : "product_documentation");
  }

  // No reported figure means the only honest post is a caveat about our own
  // data. Worth publishing occasionally; never worth leading with.
  if (!insight || !insight.numeric) lowValue.push("no_reported_figure");

  if (signals.length === 0) lowValue.push("generic_description");

  // A CONTAINER IS NOT A SUBJECT, and this is the rule that says so.
  //
  // The change feed passed on 36 points before this existed, earned entirely by
  // vocabulary in its own inventory: its data points list the feeds it ingests,
  // and that list contains "USCIS H-1B Employer Data Hub" and "CBP Nationwide
  // Encounters". Two impact signals fired off a table of contents.
  //
  // A page tagged only `archive` or `reference` is a way of finding things, not
  // a thing. What it holds may be enormously useful; a post ABOUT it is a
  // generic dataset description, which is the exact shape this account was
  // asked to stop publishing.
  const substantive = tags.some((t) => SUBSTANTIVE_TAGS.has(t));
  if (!substantive) lowValue.push("generic_description");

  // A REPORTED FIGURE IS ITSELF READER VALUE, and it is the one thing a durable
  // page can offer that a rule cannot. asset-facts.ts already draws exactly this
  // line — `numeric: true` means an agency published the number, or we can count
  // it exactly — so the base follows it rather than inventing a second test.
  const base = (substantive ? 10 : 0) + (insight?.numeric ? 8 : 0);

  return assemble(signals, lowValue, base);
}

// -----------------------------------------------------------------------------
// EDITORIAL TREATMENT
// -----------------------------------------------------------------------------

/**
 * The five shapes a post can take.
 *
 * Not a rotation and not a style menu. Each one is a different answer to "what is
 * the useful thing about this subject", and which answer applies is a property of
 * the facts — a subject with a date in play is a DEADLINE post whether or not the
 * feed used that shape yesterday. Rotating these mechanically is how a feed ends
 * up applying a countdown voice to a court decision.
 */
export type EditorialTreatment =
  /** Something changed and it matters. Lead with the change. */
  | "important_change"
  /** A concrete population, and what it now has to do, pay or prove. */
  | "what_this_means_for_you"
  /** A date is the story: when it falls and what happens on it. */
  | "deadline_date"
  /** A figure from our own data is the story. */
  | "data_insight"
  /** Durable explanation: what a thing is, or the distinction people get wrong. */
  | "context_explainer";

export const TREATMENT_LABEL: Record<EditorialTreatment, string> = {
  important_change: "IMPORTANT CHANGE",
  what_this_means_for_you: "WHAT THIS MEANS FOR YOU",
  deadline_date: "DEADLINE / DATE",
  data_insight: "DATA INSIGHT",
  context_explainer: "CONTEXT / EXPLAINER",
};

/**
 * The signals that mean a person has to do something differently. Used to tell
 * "here is who this reaches, and what it costs them" from "here is what this is".
 */
const CONSEQUENCE_SIGNALS: ImpactSignal[] = [
  "financial_impact",
  "eligibility",
  "work_authorization",
  "filing_requirements",
  "employer_obligations",
  "visa_availability",
  "naturalization",
  "enforcement_consequence",
  "travel_consequence",
  "large_fee_change",
];

export interface TreatmentInput {
  subjectKind: SubjectKind;
  angle: Angle;
  /** Whole days since publication. Null for subjects that were never published. */
  ageDays: number | null;
  /** True when the fact set carries an effective date still in the future. */
  hasFutureEffectiveDate: boolean;
  /** True when the fact set carries at least one quotable figure. */
  hasFigures: boolean;
  value: ReaderValue;
}

/**
 * Which treatment the FACTS support — in a fixed order, so the same subject on
 * the same day always gets the same shape.
 *
 * The order encodes one editorial judgement each, and they are worth stating
 * because the order is the whole design:
 *
 *   1. A resource with a real figure is a data post. Nothing else it could say
 *      beats the number it actually holds.
 *   2. A slot that asked for a countdown gets a countdown. `deadline_approaching`
 *      and `preparation_window` are angles that only exist because a date is
 *      near; overriding them would discard the reason the candidate was chosen.
 *   3. A fresh, consequential item is an IMPORTANT CHANGE even when it also
 *      carries a date. "This changed, and it starts on the 18th" is the strongest
 *      post this account has; demoting it to a date reminder because it has a
 *      date would bury the change under its own calendar entry.
 *   4. Otherwise a date in play is the story.
 *   5. Otherwise, a named population plus a real consequence is the "what this
 *      means for you" post.
 *   6. Otherwise it is explanation, which is an honest thing to be.
 */
export function treatmentFor(input: TreatmentInput): EditorialTreatment {
  const { subjectKind, angle, ageDays, hasFutureEffectiveDate, hasFigures, value } = input;

  if (subjectKind === "resource" && hasFigures) return "data_insight";
  if (angle === "data_insight") return hasFigures ? "data_insight" : "context_explainer";

  if (angle === "deadline_approaching" || angle === "preparation_window") return "deadline_date";

  const consequential = value.signals.some((s) => CONSEQUENCE_SIGNALS.includes(s));
  const fresh = ageDays !== null && ageDays <= FRESH_FOR_TREATMENT_DAYS;

  if (value.signals.includes("court_ruling")) return "important_change";
  if (fresh && consequential && value.score >= DEVELOPMENT_READER_VALUE_FLOOR) {
    return "important_change";
  }

  if (hasFutureEffectiveDate || subjectKind === "recurring_date") return "deadline_date";
  if (angle === "effective_date_reminder") return "deadline_date";

  if (value.signals.includes("affected_group") && consequential) {
    return "what_this_means_for_you";
  }
  if (angle === "what_it_requires" && consequential) return "what_this_means_for_you";

  return "context_explainer";
}

/**
 * How new an item has to be for IMPORTANT CHANGE to be honest.
 *
 * Matches BREAKING_MAX_AGE_DAYS in spirit and is defined here rather than
 * imported from validate.ts so this module stays free of that import. The
 * treatment is a framing hint; the validator's age-framing check remains the
 * thing that stops a five-day-old rule claiming to have just landed.
 */
export const FRESH_FOR_TREATMENT_DAYS = 2;

/**
 * The treatment brief handed to the copy engine.
 *
 * Each one says what the FIRST SENTENCE has to do, because that is the sentence
 * the whole brief is about. None of them asks for enthusiasm.
 */
export const TREATMENT_BRIEF: Record<EditorialTreatment, string> = {
  important_change:
    "Something changed and it reaches people. Sentence one names what changed and why a person would care — the money, the eligibility, the requirement, the status. Sentence two carries the timing: when it starts, or that no start date has been set. Do not open by naming the document type; open with the change.",
  what_this_means_for_you:
    "The facts name a population and something that population now has to do, pay or prove. Sentence one identifies that population plainly — 'Applying for U.S. citizenship?', 'H-1B employers', 'People adjusting status' — and then says what the document does to them. State it as a property of the rule, never as an instruction: 'the rule requires', not 'you must'. Use only the categories, countries or visa types the fact set names.",
  deadline_date:
    "A date is the story. Sentence one says what the date is for and roughly how far away it is; the exact date, as the fact set gives it, must appear. Say what changes on that date and what remains true until then. No countdown language for a window that is months out, and never tell anyone to act.",
  data_insight:
    "A figure this publication holds is the story. Sentence one is the figure and what it counts — not the page it lives on, and not what the page contains. One number carries a post; three read as a specification. Say what the figure does and does not show if the caveats require it.",
  context_explainer:
    "There is no change and no date here — the value is understanding. Sentence one names the thing and the distinction that actually matters about it, ideally the one a reader most often gets wrong. Do not describe a page's contents, and do not manufacture a consequence the facts do not carry.",
};

// -----------------------------------------------------------------------------
// THE FACT-SET VIEW
//
// A convenience for callers that hold a FactSet rather than the original record —
// the approval path and the preview script both do. Kept thin on purpose: the
// three functions above are the model, and this only decides which to call.
// -----------------------------------------------------------------------------

/** Whole days between publication and today, or null when nothing was published. */
export function ageInDays(facts: FactSet): number | null {
  if (!facts.publishedAt) return null;
  return Math.round(
    (Date.parse(`${facts.today}T00:00:00Z`) - Date.parse(`${facts.publishedAt}T00:00:00Z`)) /
      86_400_000
  );
}

/** Does this fact set carry an effective date that has not arrived yet? */
export function hasFutureEffectiveDate(facts: FactSet): boolean {
  return Boolean(facts.effectiveAt && facts.effectiveAt > facts.today);
}

/**
 * The treatment for a fact set under one angle.
 *
 * The angle is an input rather than a constant because a slot can narrow which
 * treatments a candidate is allowed to use — the evening slot never gets
 * `historical_context`, the morning slot never gets `data_insight` — and the
 * shape of the post has to follow the angle that actually survived, not the one
 * the candidate was built with.
 */
export function treatmentForFacts(
  facts: FactSet,
  angle: Angle,
  value: ReaderValue
): EditorialTreatment {
  return treatmentFor({
    subjectKind: facts.subjectKind,
    angle,
    ageDays: ageInDays(facts),
    hasFutureEffectiveDate: hasFutureEffectiveDate(facts),
    hasFigures: facts.figures.length > 0,
    value,
  });
}
