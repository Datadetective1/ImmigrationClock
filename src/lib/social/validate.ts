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
export const VALIDATOR_VERSION = "social-validator/3";

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
  }

  // --- effective dates must be real ------------------------------------------
  if (!facts.effectiveAt) {
    checked.push("no-invented-effective-date");
    if (/\b(takes|taking) effect (on|from)\b/i.test(trimmed)) {
      failures.push("States an effective date, but the archive records none for this item");
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
