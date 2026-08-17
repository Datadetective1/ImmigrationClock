// =============================================================================
// VALIDATOR — the prompt asks, this enforces
//
// The governing rule of the whole trust layer:
//
//     Anything only the prompt enforces is not enforced.
//
// A system prompt is a request. It is followed most of the time, which is
// exactly what makes it dangerous as a safety mechanism: the failures are rare,
// plausible-looking, and land on an unattended publisher whose entire value is
// being believable about immigration policy. So every constraint that matters
// is restated here as a check over the generated string, and a post that fails
// any of them is not published.
//
// The checks are deliberately mechanical. None of them asks whether the copy is
// *good*; they ask whether it could be *false*. Taste is the model's job and
// the skip rate is the safety net.
//
// THE THREE THAT DO THE REAL WORK
// -------------------------------
//   • URLs must be exact members of the fact-set whitelist. Set membership, not
//     a regex over shapes — a plausible-looking wrong link is the single easiest
//     way to send a reader somewhere we did not vet.
//   • Every digit-run must already appear in the fact-set. This is what makes an
//     invented statistic unpublishable rather than merely discouraged, and it is
//     the check most likely to reject a technically-fine post. That trade is
//     correct: a skipped slot costs nothing.
//   • Any double-quoted span must appear verbatim in the source text. This is
//     what makes invented quotations impossible. Officials get misquoted by
//     paraphrase-in-quotes more than by fabrication, and both fail here.
//
// FALSE REJECTIONS ARE CHEAP; FALSE PUBLICATIONS ARE NOT
// ------------------------------------------------------
// Where a check could be tuned either way, it is tuned toward rejecting. The
// cost of a false rejection is one silent slot. The cost of a false publication
// is the reason the site exists.
// =============================================================================

import { digitRuns } from "./facts";
import type { FactSet, Platform, ValidationResult } from "./types";

/**
 * Recorded in the ledger beside every post, so a rule change is traceable.
 *
 * v2 admits `facts.dataPoints` to the grounding corpora. No check was relaxed:
 * the field carries figures deterministic code computed, and a numeral that is
 * not in the fact set is still unpublishable.
 *
 * v3 adds the INDIVIDUAL_CASE group. Nothing was relaxed here either — it is a
 * new refusal, for copy that implies this account knows something about the
 * reader's own filing.
 */
/**
 * v4 adds the COLD READER group, and it is the first group here that asks
 * whether a post is COMPREHENSIBLE rather than whether it could be false.
 *
 * That is a deliberate widening of this file's remit, forced by a post that
 * passed every check in v3 and should not have been published:
 *
 *     "No implementation date has been set; ImmigrationClock labels each
 *      figure's derivation and period completeness, publishes source limits,
 *      and does not collect profiles, tracking, or identifying personal data."
 *
 * Nothing in it is false. Every URL, figure and attribution was grounded. It is
 * still unpublishable, because a reader meeting this account for the first time
 * cannot tell what it is about — it opens on the absence of a date for a subject
 * it never names.
 *
 * "Could it be false" turned out not to be the whole of the trust question. A
 * feed of true sentences that a stranger cannot parse is not a reference source
 * either, so three mechanical checks now run on the opening: no orphan
 * construction, a subject named early, and — for anything with a real start date
 * — that date actually present.
 *
 * They stay mechanical. None of them asks whether the copy is good.
 */
/**
 * v5 adds the AGE-AWARE FRAMING group, because the news pool now retains an
 * item for five days rather than two. Retention is not permission: a rule from
 * Tuesday may be discussed on Friday, and may not claim to have landed on
 * Friday. The angle list withholds `breaking_change` past two days; this rejects
 * the wording independently, because "what it requires" is a legitimate angle
 * for a four-day-old rule and nothing about choosing it stops the sentence
 * starting "USCIS just announced".
 */
export const VALIDATOR_VERSION = "social-validator/5";

// -----------------------------------------------------------------------------
// PLATFORM SHAPE
// -----------------------------------------------------------------------------

export interface PlatformLimits {
  maxChars: number;
  minChars: number;
  maxLinks: number;
  maxHashtags: number;
  /** LinkedIn truncates here; the lede has to land above it. */
  foldChars: number | null;
}

export const LIMITS: Record<Platform, PlatformLimits> = {
  // 275, not 280: X counts a link as a fixed-width t.co token whose length has
  // changed before. The five characters are insurance against a silent truncation
  // that would cut the link off the end of the post.
  x: { maxChars: 275, minChars: 60, maxLinks: 1, maxHashtags: 1, foldChars: null },
  linkedin: { maxChars: 1300, minChars: 300, maxLinks: 1, maxHashtags: 3, foldChars: 140 },
};

// -----------------------------------------------------------------------------
// BANNED CONSTRUCTIONS
//
// Each pattern targets a CONSTRUCTION, not a word. Banning bare "will" would
// reject "the rule takes effect on 9 September", which is a fact; banning "will
// likely" rejects a prediction. The distinction is the whole point, and getting
// it wrong in the permissive direction is how an information source starts
// sounding like a commentator.
// -----------------------------------------------------------------------------

const SPECULATION: [RegExp, string][] = [
  [/\bwill likely\b/i, "prediction"],
  [/\blikely to\b/i, "prediction"],
  [/\b(is|are|was|were) expected to\b/i, "prediction"],
  [/\bexpect(s|ed)? (a|an|the|to see)\b/i, "prediction"],
  [/\bcould (mean|lead|result|affect|force|push|trigger)\b/i, "speculation"],
  [/\bmay signal\b/i, "speculation"],
  [/\bsignals? (that|a|an|the)\b/i, "speculation"],
  [/\bsuggests? (that|a|an|the)\b/i, "speculation"],
  [/\bwe (expect|anticipate|predict|believe|think)\b/i, "opinion"],
  [/\bin our view\b/i, "opinion"],
  [/\bappears? to be\b/i, "hedged speculation"],
  [/\bseems? to\b/i, "hedged speculation"],
  [/\bprobably\b/i, "speculation"],
  [/\bpaves? the way\b/i, "speculation"],
  [/\bsets? the stage\b/i, "speculation"],
];

const LEGAL_ADVICE: [RegExp, string][] = [
  [/\byou (should|must|need to|have to)\b/i, "instruction to the reader"],
  [/\byou (qualify|are eligible|may qualify|might qualify)\b/i, "eligibility determination"],
  [/\byour (case|petition|application) (will|would|should)\b/i, "case-specific advice"],
  [/\bmake sure (you|to)\b/i, "instruction to the reader"],
  [/\b(apply|file|submit|register) (now|today|before|immediately)\b/i, "call to action"],
  [/\bdon'?t miss\b/i, "call to action"],
  [/\bact (now|fast|quickly)\b/i, "call to action"],
  [/\bif you'?re affected,? (you|do|make)\b/i, "advice framing"],
];

/**
 * Claims that this account knows something about the reader's own file.
 *
 * ImmigrationClock tracks rules and calendars. It has never held a case record
 * and cannot say what will happen to a specific application, so copy implying
 * otherwise is not a tone problem — it is a false claim about what the product
 * is, made to people who are anxious and looking for exactly that.
 *
 * Narrow by construction. "Track" alone is fine and common ("we track WARN
 * notices"); what is banned is track-plus-a-personal-object. The legal-advice
 * group already catches "your case will…"; this catches the offer of a service
 * that does not exist.
 */
const INDIVIDUAL_CASE: [RegExp, string][] = [
  [/\btrack(ing|s)? your\b/i, "implies we track the reader's own case"],
  [/\b(check|monitor|follow) your (case|status|application|petition|filing)\b/i, "implies individual case tracking"],
  [/\byour (case|application|petition|filing) (status|outcome|result)\b/i, "implies individual case tracking"],
  [/\bwhat (this|it) means for your\b/i, "implies individual case analysis"],
  [/\bcase (status|outcome) (tracker|tracking|updates?)\b/i, "implies a case-tracking product"],
];

const UNSUPPORTED_SUPERLATIVE: [RegExp, string][] = [
  [/\bunprecedented\b/i, "unsupported superlative"],
  [/\bfirst time ever\b/i, "unsupported superlative"],
  [/\bnever before\b/i, "unsupported superlative"],
  [/\b(biggest|largest|smallest|worst|best) ever\b/i, "unsupported superlative"],
  [/\bhistoric\b/i, "editorializing"],
  [/\bsweeping\b/i, "editorializing"],
  [/\bmassive\b/i, "editorializing"],
  [/\bdramatic(ally)?\b/i, "editorializing"],
  [/\bshocking\b/i, "editorializing"],
  [/\bcrackdown\b/i, "editorializing"],
  [/\bbombshell\b/i, "editorializing"],
  [/\bgame.?chang(er|ing)\b/i, "editorializing"],
  [/\bmajor blow\b/i, "editorializing"],
];

const ENGAGEMENT_BAIT: [RegExp, string][] = [
  [/\bfollow (us|me)\b/i, "engagement bait"],
  [/\b(retweet|repost) (this|if)\b/i, "engagement bait"],
  [/\blike and share\b/i, "engagement bait"],
  [/\bwhat do you think\b/i, "engagement bait"],
  [/\bdrop a comment\b/i, "engagement bait"],
  [/\bthoughts\?/i, "engagement bait"],
  [/\ba thread\b/i, "format we do not publish"],
  [/\b\d+\/\d+\b(?!\s*(am|pm))/i, "thread numbering"],
];

/**
 * Emoji are banned outright.
 *
 * Not a style preference. The account's job is to be believed about federal
 * policy, and decorative emoji are the single clearest visual signal that a feed
 * is automated marketing rather than a reference source.
 */
const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

const ALL_BANNED = [
  ...SPECULATION,
  ...LEGAL_ADVICE,
  ...INDIVIDUAL_CASE,
  ...UNSUPPORTED_SUPERLATIVE,
  ...ENGAGEMENT_BAIT,
];

// -----------------------------------------------------------------------------
// THE COLD READER
//
// One question, asked mechanically: seeing ONLY this post, with no previous post
// and no click, can a stranger tell what it is about?
// -----------------------------------------------------------------------------

/**
 * How much of the post counts as "the opening".
 *
 * Generous on purpose. The requirement is that the subject arrives early, not
 * that it is the literal first word — "Under a rule published Tuesday, USCIS
 * will…" is a perfectly good opening that takes a clause to get there.
 */
export const OPENING_CHARS = 140;

/**
 * The oldest an item may be and still be framed as having just happened.
 *
 * The line between "this just published" and "this exists, and here is what it
 * does". The news pool reaches back five days; beyond this boundary select.ts
 * withdraws the `breaking_change` angle entirely, and the checks below reject
 * just-happened wording whatever angle was chosen. The angle list is the
 * request; this is the guarantee.
 *
 * Defined here rather than in select.ts because visuals.ts already imports this
 * module and select.ts imports visuals — putting it the other way round would
 * close an import cycle.
 */
export const BREAKING_MAX_AGE_DAYS = 2;

/**
 * Wording that asserts an item is brand new.
 *
 * Constructions, not words, on the same principle as everything else here. A
 * four-day-old rule may be discussed freely; what it may not do is claim to have
 * landed this morning. "This week" is deliberately absent — for a four-day-old
 * document that is simply true.
 */
const JUST_HAPPENED: [RegExp, string][] = [
  [/\bjust (published|announced|issued|released|took effect|changed|dropped)\b/i, "claims it just happened"],
  [/\b(published|announced|issued|released|filed) (today|this morning|this afternoon|tonight)\b/i, "dates it to today"],
  [/\b(today|this morning|this afternoon)[,:]/i, "opens on today"],
  [/\bas of today\b/i, "dates it to today"],
  [/\bbreaking\b/i, "breaking-news framing"],
  [/\b(moments|minutes|hours) ago\b/i, "claims it just happened"],
  [/\bnew today\b/i, "dates it to today"],
  [/\bhas just\b/i, "claims it just happened"],
];

/**
 * Constructions that cannot open a standalone post, because each of them refers
 * to something the reader has not been given.
 *
 * Patterns, not a blocklist of words. "This" is fine mid-sentence and fine as
 * "This rule, published Tuesday…" once a subject exists; what is banned is a
 * demonstrative or a bare negative arriving BEFORE any subject has been named.
 */
const ORPHAN_OPENINGS: [RegExp, string][] = [
  // The exact shape that published: a negative about an unnamed thing.
  [
    /^\s*(no|none|neither|nothing)\b(?![^.]*\b(rule|notice|petition|application|form|programme|program|window|filing|fee|visa|court|agency|department|uscis|dhs|cbp|ice|eoir|dol|irs)\b)/i,
    "opens on a bare negative before naming what it is about",
  ],
  // A demonstrative or pronoun followed by a VERB: "This affects…", "It now
  // requires…". The verb is what makes it an orphan — "This rule, published
  // Tuesday…" names a subject in the same breath and is fine. The trailing
  // `\w+(s|ed)` arm catches verbs not worth listing; it also catches "These
  // employers must…", which is an orphan for the same reason (which employers?).
  [
    /^\s*(it|they|these|those|this|that)\s+(is|are|was|were|will|would|now|also|has|have|had|does|do|can|may|must|affects?|applies|requires?|covers?|means?|changes?|adds?|expands?|introduces?|replaces?|removes?|raises?|sets?|starts?|begins?|takes?|brings?|\w+(?:s|ed))\b/i,
    "opens on a pronoun with nothing to refer back to",
  ],
  [/^\s*(also|meanwhile|additionally|in addition|furthermore|moreover|however|but|and|so)\b[,\s]/i, "opens as a continuation of a post the reader cannot see"],
  [/^\s*(here'?s|here is)\s+(what|how|why)\b/i, "opens on a tease rather than the subject"],
  [/^\s*(the page|this page|our page|the site|this resource|our data|the data)\b/i, "opens by describing a page rather than saying what it shows"],
];

/**
 * Words from the fact set that identify the subject.
 *
 * Drawn from the closed world and nowhere else, exactly like permittedAgencies()
 * — so the prompt can be told which anchors exist and the check can require one,
 * with no possibility of the two disagreeing about what counts.
 *
 * Short and generic words are dropped: "data", "notice" or "update" appearing in
 * an opening is not evidence that a subject was named.
 */
const ANCHOR_STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "into", "under", "upon",
  "certain", "other", "their", "when", "will", "would", "have", "has", "been",
  "data", "notice", "notices", "update", "updates", "information", "page",
  "report", "reports", "list", "new", "our", "its", "about", "more", "than",
  "each", "some", "any", "all", "not", "are", "was", "were", "does",
]);

export function subjectAnchors(facts: FactSet): string[] {
  const out = new Set<string>();

  for (const word of facts.title.split(/[^A-Za-z0-9\-]+/)) {
    const w = word.trim();
    if (w.length < 4) continue;
    if (ANCHOR_STOPWORDS.has(w.toLowerCase())) continue;
    out.add(w.toLowerCase());
  }

  // Entities and the source are subjects in their own right: a post that opens
  // "CBP encounters fell..." has named its subject even if the page is titled
  // "Border encounters".
  for (const entity of facts.entities) {
    for (const word of entity.split(/[^A-Za-z0-9\-]+/)) {
      if (word.length >= 4 && !ANCHOR_STOPWORDS.has(word.toLowerCase())) {
        out.add(word.toLowerCase());
      }
    }
  }
  for (const agency of permittedAgencies(facts)) out.add(agency.toLowerCase());

  // Visa and form designations are the strongest anchors this domain has, and
  // they are short enough to be dropped by the length rule above.
  const designations = `${facts.title} ${facts.summary} ${facts.entities.join(" ")}`.match(
    /\b([A-Z]{1,2}-?\d[A-Z]?|I-\d{2,3}|DS-\d{3,4}|EB-?\d|H-?1B|L-?1[AB]?|O-?1|F-?1|J-?1|K-?1|TN|OPT|DACA|TPS|DV)\b/g
  );
  for (const d of designations ?? []) out.add(d.toLowerCase());

  // ImmigrationClock is a legitimate subject for the small number of posts that
  // are genuinely about the publication itself.
  out.add("immigrationclock");

  return [...out];
}

/** Does the opening actually name something from the fact set? */
export function opensWithSubject(text: string, facts: FactSet): boolean {
  const opening = stripUrls(text).slice(0, OPENING_CHARS).toLowerCase();
  return subjectAnchors(facts).some((anchor) => opening.includes(anchor));
}

/**
 * Every way a post might legitimately write one date.
 *
 * Deliberately permissive about FORM and strict about PRESENCE: the check is
 * "did the reader get told when", not "did the model format it our way".
 */
export function mentionsDate(text: string, iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return false;

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const month = months[m - 1];
  const abbrev = month.slice(0, 3);
  // "Sept" is what people write, and it is the one month whose common short
  // form is four letters rather than three.
  const longAbbrev = month === "September" ? "sept" : abbrev.toLowerCase();
  const lower = text.toLowerCase();

  const forms = [
    iso,
    `${month} ${d}`.toLowerCase(),
    `${abbrev} ${d}`.toLowerCase(),
    `${abbrev}. ${d}`.toLowerCase(),
    `${longAbbrev} ${d}`,
    `${longAbbrev}. ${d}`,
    `${d} ${month}`.toLowerCase(),
    `${d} ${abbrev}`.toLowerCase(),
    `${m}/${d}/${y}`,
    `${m}/${d}`,
    `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`,
  ];

  return forms.some((f) => lower.includes(f));
}

// -----------------------------------------------------------------------------
// EXTRACTION HELPERS
// -----------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s)<>"']+/g;

export function extractUrls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:]+$/, ""));
}

export function stripUrls(text: string): string {
  return text.replace(URL_RE, " ");
}

export function extractHashtags(text: string): string[] {
  return text.match(/#[A-Za-z][A-Za-z0-9_]*/g) ?? [];
}

/** Double-quoted spans only. Apostrophes make single quotes unusable here. */
export function extractQuotations(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/"([^"]{2,})"/g)) out.push(m[1].trim());
  for (const m of text.matchAll(/“([^”]{2,})”/g)) out.push(m[1].trim());
  return out;
}

/** Leading zeros removed, so "09" and "9" are the same number. */
function normalizeRun(run: string): string {
  const stripped = run.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

/**
 * Agency names the validator polices.
 *
 * Exported so prompt.ts can tell the model which of these are actually
 * available for a given subject, rather than leaving it to guess and be
 * rejected. One list, one regex, one corpus — the prompt and the check cannot
 * disagree about what "attributable" means because they read the same code.
 */
export const ATTRIBUTABLE_AGENCIES = [
  "uscis",
  "dhs",
  "cbp",
  "ice",
  "state department",
  "department of state",
  "department of labor",
  "dol",
  "eoir",
  "justice department",
  "department of justice",
  "federal register",
  "supreme court",
  "congress",
  "irs",
] as const;

function agencyPattern(agency: string): RegExp {
  return new RegExp(`\\b${agency.replace(/\s+/g, "\\s+")}\\b`, "i");
}

/** The text an attribution must be supported by. */
export function attributionCorpus(facts: FactSet): string {
  return `${facts.title} ${facts.summary} ${facts.sourceName} ${facts.entities.join(" ")} ${(
    facts.dataPoints ?? []
  ).join(" ")} ${facts.notes.join(" ")}`.toLowerCase();
}

/**
 * Which agency names this fact set actually supports.
 *
 * Often empty, and that is the interesting case. The Diversity Visa key date
 * carries the source name "U.S. Dept. of State — DV Program", which contains no
 * form of "State Department" or "Department of State" — so copy that writes
 * either is rejected, correctly, as an attribution the source does not make.
 * A model with general knowledge will supply that attribution every time unless
 * it is told, specifically, that it is not available here.
 */
export function permittedAgencies(facts: FactSet): string[] {
  const corpus = attributionCorpus(facts);
  return ATTRIBUTABLE_AGENCIES.filter((a) => agencyPattern(a).test(corpus));
}

/** Every number the fact-set makes available, as normalized digit-runs. */
export function allowedDigitRuns(facts: FactSet): Set<string> {
  const corpus = [
    facts.title,
    facts.summary,
    facts.sourceName,
    facts.publishedAt ?? "",
    facts.effectiveAt ?? "",
    ...facts.figures,
    ...facts.entities,
    ...(facts.dataPoints ?? []),
    ...facts.notes,
  ].join(" ");
  return new Set(digitRuns(corpus).map(normalizeRun));
}

// -----------------------------------------------------------------------------
// THE VALIDATOR
// -----------------------------------------------------------------------------

export function validatePost(
  text: string,
  platform: Platform,
  facts: FactSet
): ValidationResult {
  const failures: string[] = [];
  const checked: string[] = [];
  const limits = LIMITS[platform];

  // --- shape -----------------------------------------------------------------
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, failures: ["Empty post"], checked: [] };
  }

  checked.push("length");
  if (trimmed.length > limits.maxChars) {
    failures.push(`Too long for ${platform}: ${trimmed.length} chars (max ${limits.maxChars})`);
  }
  if (trimmed.length < limits.minChars) {
    failures.push(`Too short for ${platform}: ${trimmed.length} chars (min ${limits.minChars})`);
  }

  // --- URLs: exact whitelist -------------------------------------------------
  checked.push("url-whitelist");
  const urls = extractUrls(trimmed);
  const allowed = new Set(facts.allowedUrls);
  for (const u of urls) {
    if (!allowed.has(u)) {
      failures.push(`URL not in the permitted set: ${u}`);
    }
  }
  if (urls.length > limits.maxLinks) {
    failures.push(`Too many links: ${urls.length} (max ${limits.maxLinks})`);
  }
  if (urls.length === 0) {
    failures.push("No link — every post must send the reader to a specific page");
  } else if (!urls.includes(facts.deepLink)) {
    failures.push(`Post does not link to its destination (${facts.deepLink})`);
  }

  // --- numbers: nothing invented --------------------------------------------
  checked.push("figure-grounding");
  const permitted = allowedDigitRuns(facts);
  const used = digitRuns(stripUrls(trimmed)).map(normalizeRun);
  for (const run of used) {
    if (!permitted.has(run)) {
      failures.push(
        `Figure "${run}" does not appear in the source material — it cannot be verified`
      );
    }
  }

  // --- quotations: verbatim or not at all ------------------------------------
  checked.push("quotation-grounding");
  const corpus =
    `${facts.title} ${facts.summary} ${(facts.dataPoints ?? []).join(" ")} ${facts.notes.join(" ")}`.toLowerCase();
  for (const q of extractQuotations(trimmed)) {
    if (!corpus.includes(q.toLowerCase())) {
      failures.push(`Quotation is not verbatim in the source: "${q}"`);
    }
  }

  // --- attribution -----------------------------------------------------------
  checked.push("attribution");
  const corpusForAttribution = attributionCorpus(facts);
  for (const agency of ATTRIBUTABLE_AGENCIES) {
    const re = agencyPattern(agency);
    if (re.test(trimmed) && !re.test(corpusForAttribution)) {
      failures.push(
        `Attributes this to "${agency}", which does not appear in the source material`
      );
    }
  }

  // --- banned constructions --------------------------------------------------
  checked.push("banned-constructions");
  for (const [re, label] of ALL_BANNED) {
    const m = trimmed.match(re);
    if (m) failures.push(`Contains ${label}: "${m[0]}"`);
  }

  checked.push("no-emoji");
  const emoji = trimmed.match(EMOJI);
  if (emoji) failures.push(`Contains an emoji (${emoji[0]}) — this account does not use them`);

  // --- the cold reader test --------------------------------------------------
  //
  // Runs on both platforms. LinkedIn's fold makes its opening if anything more
  // load-bearing than X's, and the failure being guarded against — a post whose
  // subject is never named — is identical on either.
  checked.push("cold-reader-opening");
  const withoutUrls = stripUrls(trimmed).trim();
  for (const [re, label] of ORPHAN_OPENINGS) {
    if (re.test(withoutUrls)) {
      failures.push(
        `Cold reader test: ${label}. Someone seeing only this post cannot tell what it is about — name the subject first.`
      );
      break; // One diagnosis is enough; listing five ways to say "orphan" is noise.
    }
  }

  checked.push("cold-reader-subject");
  if (!opensWithSubject(trimmed, facts)) {
    failures.push(
      `Cold reader test: the first ${OPENING_CHARS} characters name nothing from the fact set ` +
        `(expected one of: ${subjectAnchors(facts).slice(0, 8).join(", ")}). ` +
        `A post that never names its subject is unreadable on its own.`
    );
  }

  // --- age-aware framing -----------------------------------------------------
  //
  // The news pool retains an item for five days. Retaining it is not permission
  // to present it as having just landed, and the angle list alone cannot enforce
  // that: `what_it_requires` is a perfectly legitimate treatment of a four-day
  // -old rule, and nothing about that angle stops a sentence beginning "USCIS
  // just announced". So the wording is checked directly, against the one clock
  // the fact set carries.
  if (facts.publishedAt && facts.today) {
    const ageDays = Math.round(
      (Date.parse(`${facts.today}T00:00:00Z`) - Date.parse(`${facts.publishedAt}T00:00:00Z`)) /
        86_400_000
    );
    if (ageDays > BREAKING_MAX_AGE_DAYS) {
      checked.push("age-aware-framing");
      for (const [re, label] of JUST_HAPPENED) {
        const m = trimmed.match(re);
        if (m) {
          failures.push(
            `Published ${ageDays} days ago but the post ${label}: "${m[0]}". ` +
              `Say what the document does, not that it just happened.`
          );
        }
      }
    }
  }

  // --- proposed rules must not sound like law --------------------------------
  if (facts.classification === "proposed_rule") {
    checked.push("proposed-rule-framing");
    if (!/\bproposed?\b/i.test(trimmed)) {
      failures.push(
        "This is a proposed rule but the post never says so — a reader would take it as being in force"
      );
    }
    if (/\b(takes|took|comes into|is now in) effect\b/i.test(trimmed)) {
      failures.push("Describes a proposed rule as being in effect");
    }
    // A PROPOSAL STATED IN THE PRESENT TENSE IS A FALSE STATEMENT OF LAW.
    //
    // The word "proposed" appearing somewhere in the post is not enough: "USCIS
    // proposed a rule. Filings now require a $500 fee" contains it and still
    // tells a reader to pay a fee that does not exist. These catch the clauses
    // that assert the proposal's contents as current or scheduled fact.
    const ASSERTED_AS_FACT: [RegExp, string][] = [
      [/\b(now|will) (require|requires|cost|costs|apply|applies|need|needs)\b/i, "states a proposal as settled"],
      [/\bstarting\s+(on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|\d)/i, "gives a proposal a start date"],
      [/\bbeginning\s+(on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|\d)/i, "gives a proposal a start date"],
      [/\beffective\s+(january|february|march|april|may|june|july|august|september|october|november|december|\d)/i, "gives a proposal an effective date"],
      [/\bas of\s+(january|february|march|april|may|june|july|august|september|october|november|december|\d)/i, "gives a proposal a start date"],
      [/\b(applicants|petitioners|employers|filers) (must|now)\b/i, "states a proposal as a current obligation"],
      [/\bis (a )?(new )?(requirement|rule|law)\b/i, "describes a proposal as an existing rule"],
    ];
    for (const [re, label] of ASSERTED_AS_FACT) {
      const m = trimmed.match(re);
      if (m) failures.push(`Proposed rule ${label}: "${m[0]}" — nothing has changed yet`);
    }
  }

  // --- effective dates must be real, and must survive ------------------------
  if (!facts.effectiveAt) {
    checked.push("no-invented-effective-date");
    // "take" as well as "takes": "filings take effect on…" asserts a date just
    // as firmly as "the rule takes effect on…", and only the second was caught.
    if (/\b(takes?|taking) effect (on|from)\b/i.test(trimmed)) {
      failures.push("States an effective date, but the archive records none for this item");
    }
  } else if (facts.effectiveAt > facts.today && facts.classification !== "proposed_rule") {
    // THE DATE IS THE POINT. A post about a change that starts on a known future
    // date, which does not tell the reader that date, has dropped the single
    // most useful fact it was given — the one thing this account exists to
    // carry. Only enforced for FUTURE dates: a rule that took effect last year
    // is history, and repeating its date is not what makes that post useful.
    checked.push("effective-date-preserved");
    if (!mentionsDate(trimmed, facts.effectiveAt)) {
      failures.push(
        `Drops the effective date (${facts.effectiveAt}), which is in the future and is the most useful fact in the set`
      );
    }
  }

  // --- hashtags --------------------------------------------------------------
  checked.push("hashtags");
  const tags = extractHashtags(trimmed);
  if (tags.length > limits.maxHashtags) {
    failures.push(`Too many hashtags: ${tags.length} (max ${limits.maxHashtags})`);
  }

  // --- platform shape --------------------------------------------------------
  if (platform === "linkedin" && limits.foldChars) {
    checked.push("linkedin-fold");
    const fold = trimmed.slice(0, limits.foldChars);
    if (URL_RE.test(fold)) {
      // Reset lastIndex — URL_RE is global and .test() is stateful.
      URL_RE.lastIndex = 0;
      failures.push("Link appears above the LinkedIn fold, where it costs the lede its space");
    }
    URL_RE.lastIndex = 0;
    if (fold.trim().length < 80) {
      failures.push("Nothing substantial above the LinkedIn fold");
    }
  }

  if (platform === "x") {
    checked.push("x-shape");
    if (/\n{3,}/.test(trimmed)) failures.push("Excessive line breaks for X");
  }

  return { ok: failures.length === 0, failures, checked };
}

/** Validate both platforms' copy at once. Used by the runner and the preflight. */
export function validateBoth(
  copy: { x: string; linkedin: string },
  facts: FactSet
): Record<Platform, ValidationResult> {
  return {
    x: validatePost(copy.x, "x", facts),
    linkedin: validatePost(copy.linkedin, "linkedin", facts),
  };
}
