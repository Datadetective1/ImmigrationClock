// =============================================================================
// CONTENT TYPES — what KIND of thing ImmigrationClock publishes
//
// THE CHANGE OF IDENTITY THIS FILE MAKES
// --------------------------------------
// The first design of this publisher was a news-alert bot with two side pools.
// Every post was a government document restated, so on a day with no qualifying
// document the account had nothing to say, and on a day with one it said it in
// the one shape the prompt knew. Read back from the ledger, the feed was a
// database summarising itself.
//
// An immigration intelligence publication has more than one thing to say. It
// reports a change; it explains what changed in plain English; it says why the
// change matters; it surfaces what its own data shows; it teaches a distinction
// people get wrong; and it tells readers about tools it holds. Six legitimate
// kinds of post, each with its own facts, its own shape and its own place in the
// cadence — and the editorial job is choosing among them, not filling a slot.
//
// WHAT THIS DOES NOT CHANGE
// -------------------------
// The trust layer. Every content type is built from a closed fact set that
// deterministic code assembled from data the repository already holds, and every
// post is validated against it. A model never decides a fact. It decides how to
// say one.
// =============================================================================

export type ContentType =
  /** A. A fresh, material official change: a rule, a court order, a policy reversal. */
  | "breaking_change"
  /** B. A recent development explained in plain English: what changed, what we are watching. */
  | "what_changed"
  /** C. A verified development and its defensible practical significance. */
  | "why_it_matters"
  /** A rule's effective date is approaching: what starts, what stays true until then. */
  | "effective_date"
  /** A recurring calendar window: registration, lottery, fiscal year. */
  | "key_date"
  /** D. A factual observation from ImmigrationClock's own datasets. */
  | "data_signal"
  /** E. Evergreen, source-backed explanation of a distinction readers get wrong. */
  | "explainer"
  /** F. A verified capability of ImmigrationClock itself. */
  | "data_discovery";

export const CONTENT_TYPES: ContentType[] = [
  "breaking_change",
  "what_changed",
  "why_it_matters",
  "effective_date",
  "key_date",
  "data_signal",
  "explainer",
  "data_discovery",
];

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  breaking_change: "Breaking / material change",
  what_changed: "What changed",
  why_it_matters: "Why it matters",
  effective_date: "Effective date ahead",
  key_date: "Key date",
  data_signal: "Data signal",
  explainer: "ImmigrationClock explains",
  data_discovery: "Data discovery",
};

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as string[]).includes(value);
}

// -----------------------------------------------------------------------------
// TIERS — where each type sits in the cadence
//
// The cadence policy (cadence.ts) does not reason about eight types. It reasons
// about three tiers, and the tier answers one question: does this post need a
// reason beyond "it is useful" to go out today?
//
//   news        No. A material change publishes in the first window it is found,
//               and a second distinct one may follow the same day.
//   follow_up   Only as the day's first or second post. It is real information
//               with a date on it, but it is not what happened today.
//   evergreen   Only when the day has otherwise been quiet. This is the tier
//               that turns "nothing happened in government today" into a useful
//               explainer or data signal instead of silence — and it is the tier
//               most in need of a ceiling, because a feed that reaches for it
//               daily stops looking like a publication and starts looking like a
//               content calendar.
// -----------------------------------------------------------------------------

export type CadenceTier = "news" | "follow_up" | "evergreen";

export const TIER_FOR_TYPE: Record<ContentType, CadenceTier> = {
  breaking_change: "news",
  what_changed: "news",
  why_it_matters: "follow_up",
  effective_date: "follow_up",
  key_date: "follow_up",
  data_signal: "evergreen",
  explainer: "evergreen",
  data_discovery: "evergreen",
};

export const TIER_RANK: Record<CadenceTier, number> = { news: 0, follow_up: 1, evergreen: 2 };

// -----------------------------------------------------------------------------
// COOLDOWNS — how soon the same record may carry the same type again
//
// Days. A development supports a breaking post once, then a what-changed and a
// why-it-matters as it ages — those are three different things to say, and the
// subject cooldown in dedupe.ts spaces them. Evergreen records recur, slowly: an
// explainer is as true in three months as today, and no sooner.
// -----------------------------------------------------------------------------

export const TYPE_COOLDOWN_DAYS: Record<ContentType, number> = {
  breaking_change: Infinity,
  what_changed: Infinity,
  why_it_matters: Infinity,
  effective_date: 30,
  key_date: 300,
  data_signal: 45,
  explainer: 120,
  data_discovery: 90,
};

/** How old a development may be and still take each treatment. Days since publication. */
export const TYPE_MAX_AGE_DAYS: Partial<Record<ContentType, number>> = {
  breaking_change: 2,
  what_changed: 10,
  why_it_matters: 21,
};

// -----------------------------------------------------------------------------
// STRUCTURES — the shapes a post may take
//
// THE REPETITION PROBLEM, NAMED. Twenty-two published posts, and nine of them
// open "[Subject]: [agency] [verb] …". Not because the model is dull, but because
// it was handed one instruction ("name the subject first, then the timing") and
// it followed it. A prompt that specifies one shape gets one shape.
//
// So the shapes are enumerated, each content type is offered the ones that fit
// its facts, the model chooses and REPORTS which it used, and the ledger records
// it — which is what lets the next call be told "you have used this shape twice
// running; take a different one if the facts allow". Chosen, never rotated: a
// structure is right or wrong for a set of facts, and the rotation only ever
// breaks ties.
// -----------------------------------------------------------------------------

export type Structure =
  /** Change first, then the specific, then the timing. Three short lines. */
  | "news"
  /** A plain statement of the new state of affairs, then the source. */
  | "direct"
  /** Opens by naming who this reaches, then the change. */
  | "address"
  /** The date leads: "Starting Sept. 30, …". */
  | "date_lede"
  /** Labelled: what changed / what ImmigrationClock is watching. */
  | "what_changed"
  /** Before and after, in two lines. */
  | "before_after"
  /** Labelled: the development, the date, why it matters. */
  | "why_it_matters"
  /** Context first — the rule as it stood — then the change. */
  | "context_first"
  /** The figure carries the post; one number, what it counts, the source. */
  | "data_figure"
  /** A question the post answers with the figure. */
  | "data_question"
  /** Two figures set against each other, without a causal claim. */
  | "data_compare"
  /** The distinction: "A is not B." then why. */
  | "distinction"
  /** Three or four short bullet lines. */
  | "list"
  /** A question a reader asks, answered plainly. */
  | "question_answer"
  /** "Looking for X? ImmigrationClock lets you …". */
  | "need_first"
  /** What the tool holds, stated plainly. */
  | "tool_plain";

export const STRUCTURE_LABEL: Record<Structure, string> = {
  news: "News",
  direct: "Direct",
  address: "Address the reader",
  date_lede: "Date first",
  what_changed: "What changed / what we are watching",
  before_after: "Before and after",
  why_it_matters: "Why it matters",
  context_first: "Context first",
  data_figure: "The figure",
  data_question: "Question, then the figure",
  data_compare: "Two figures, side by side",
  distinction: "The distinction",
  list: "Short list",
  question_answer: "Question and answer",
  need_first: "The need, then the tool",
  tool_plain: "The tool, plainly",
};

/**
 * What each shape asks of the writer. Rendered into the prompt for the shapes on
 * offer, so a structure the model is judged by is one it can read.
 */
export const STRUCTURE_BRIEF: Record<Structure, string> = {
  news: "Line one: the change, in one plain sentence with the agency as its subject. Line two: the specific — what is gone, what is back, what is required. Line three: the timing, or that no separate date has been posted. Blank lines between them.",
  direct: "One plain declarative statement of the new state of affairs, followed by one sentence of specifics. Do not open on the document type; open on the fact. End by pointing at the source.",
  address: "Open by naming the people this reaches, as a short question or a noun phrase — then deliver the fact immediately. Use only populations the fact set names.",
  date_lede: "Open on the date: what starts, changes or stops on it. Then what remains true until then. The exact date, as words, must appear.",
  what_changed: "Sentence one says what happened in plain English. Then a line beginning \"What changed:\" with the specific. Then a line beginning \"What ImmigrationClock is watching:\" with the one open question the facts support — usually timing.",
  before_after: "Two short lines: how it stood before, and how it stands now. Only where the fact set describes both states. Then the timing.",
  why_it_matters: "Sentence one: the development. Sentence two: the date, or that there is none. Then a line beginning \"Why it matters:\" that states an implication the fact set directly supports — nothing beyond it. Close with the source.",
  context_first: "Open with the rule as it stood, in one sentence. Then the change. Then when it applies.",
  data_figure: "The figure and what it counts, in the first sentence. One number carries the post. Then the source and the period. Say what the figure does not show if the caveats require it.",
  data_question: "Open with the question a reader would actually ask, then answer it with the figure in the next sentence. The question must be one the figure answers.",
  data_compare: "Two figures from the fact set, set side by side in two short lines, with their periods. State no direction, cause or trend the facts do not state.",
  distinction: "Sentence one: A is not B. Then two or three short sentences on what each one is, drawn from the facts. Close with what ImmigrationClock does about the difference.",
  list: "One short opening sentence, then three or four bullet lines beginning with \"•\", each a single fact from the set. Close with one sentence.",
  question_answer: "Open with the question in the reader's own words. Answer it in two or three plain sentences from the facts.",
  need_first: "Open with the need — \"Looking for …?\" or \"Trying to find …?\" — then say exactly what ImmigrationClock lets a reader do, in the words the fact set uses. No claim the facts do not make.",
  tool_plain: "State what the tool holds and what a reader can do with it, plainly, with the figure the fact set gives. No superlatives, no pitch.",
};

export const STRUCTURES_FOR_TYPE: Record<ContentType, Structure[]> = {
  breaking_change: ["news", "direct", "address", "date_lede"],
  what_changed: ["what_changed", "direct", "before_after", "context_first"],
  why_it_matters: ["why_it_matters", "context_first", "direct"],
  effective_date: ["date_lede", "why_it_matters", "before_after"],
  key_date: ["date_lede", "direct", "question_answer"],
  data_signal: ["data_figure", "data_question", "data_compare"],
  explainer: ["distinction", "list", "question_answer"],
  data_discovery: ["need_first", "tool_plain", "question_answer"],
};

export const ALL_STRUCTURES: Structure[] = Object.keys(STRUCTURE_LABEL) as Structure[];

export function isStructure(value: string): value is Structure {
  return (ALL_STRUCTURES as string[]).includes(value);
}

/**
 * How many of the most recent posts a structure must not have opened, before it
 * is refused outright. Two in a row is a coincidence; three is a house style.
 */
export const STRUCTURE_REPEAT_LIMIT = 2;
