// =============================================================================
// THE PROMPT — versioned, and narrower than it looks
//
// The copy engine's job is WORDING. Selection, content type, shape, destination
// and dedupe are all decided before this prompt is built; validation happens
// after it returns. What the model contributes is the sentence, and nothing
// else. It is never asked to decide a fact.
//
// The version string is recorded in the ledger beside every post, so a change
// in the feed's voice can be traced to a change in this file rather than
// guessed at. Bump it whenever the text below changes.
//
// WHY v9 IS A REWRITE AND NOT A PATCH
// -----------------------------------
// Twenty-two published posts were read back from the ledger. Nine opened
// "[Subject]: [agency] [verb]…". Eight carried "no implementation date is
// recorded/set/posted". Five wrote an agency in lowercase ("dhs's final rule")
// because the permitted-attribution list showed the lowercase match strings.
// Dates appeared as "2026-09-18" because that is how the fact set showed them.
// And every post was compressed to roughly 150 characters of prose because the
// budget counted an 86-character URL at its literal length.
//
// None of that was the model's taste. It was the instructions. So v9 changes
// the instructions:
//
//   • A VOICE, stated once: clear, curious, precise, calm, useful, human,
//     data-literate. Not bureaucratic, not sensational, not a press release.
//   • SHAPES, enumerated per content type (content-types.ts). The writer is
//     offered the shapes that fit these facts, told which ones the account used
//     most recently, chooses one, and reports it. Chosen, never rotated.
//   • DATES IN WORDS, agencies as a person writes them, and a prose budget that
//     counts a URL the way X does.
//   • IMPLICATIONS the record supports, derived from its own fields, as the
//     only "why it matters" the writer may state.
//   • The mandatory "no implementation date" sentence is gone. Timing is still
//     the point, and a future effective date is still required by the
//     validator; the ABSENCE of one is now something the writer may mention,
//     in plain words, and need not.
// =============================================================================

import {
  ANGLE_LABEL,
  type Angle,
  type CopyRequest,
  type FactSet,
} from "./types";
import {
  CONTENT_TYPE_LABEL,
  STRUCTURE_BRIEF,
  STRUCTURE_LABEL,
  type ContentType,
  type Structure,
} from "./content-types";
import {
  TREATMENT_BRIEF,
  TREATMENT_LABEL,
  treatmentForFacts,
  type EditorialTreatment,
  type ReaderValue,
} from "./reader-value";
import {
  AGENCY_DISPLAY,
  BREAKING_MAX_AGE_DAYS,
  LIMITS,
  OPENING_CHARS,
  X_URL_WEIGHT,
  describesAProposal,
  permittedAgencies,
  subjectAnchors,
} from "./validate";
import { longDate } from "./implications";

export const PROMPT_VERSION = "social-prompt/9";

// -----------------------------------------------------------------------------
// THE X BUDGET — counted the way X counts
// -----------------------------------------------------------------------------

/** Headroom kept below the hard limit, in characters. A model writing to a cliff lands past it. */
export const X_SAFETY_MARGIN = 10;

/** The band X prose should land in. Room for three short lines, not a telegram. */
export const X_TARGET_MIN = 170;
export const X_TARGET_MAX = 240;

export interface XBudget {
  /** What X charges for the URL: a fixed t.co token. */
  linkChars: number;
  /** URL plus the line break before it. */
  reservedChars: number;
  /** The hard limit the validator enforces. */
  hardTotal: number;
  /** Most prose the model may write. */
  proseMax: number;
  /** Least prose worth writing. */
  proseMin: number;
}

export function xBudget(_facts: FactSet): XBudget {
  const linkChars = X_URL_WEIGHT;
  const reservedChars = linkChars + 1;
  const hardTotal = LIMITS.x.maxChars;
  const proseMax = Math.min(X_TARGET_MAX, hardTotal - reservedChars - X_SAFETY_MARGIN);
  return { linkChars, reservedChars, hardTotal, proseMax, proseMin: Math.min(X_TARGET_MIN, proseMax - 30) };
}

// -----------------------------------------------------------------------------
// THE SYSTEM PROMPT — stable across every request
// -----------------------------------------------------------------------------

export const SYSTEM_PROMPT = `You write posts for ImmigrationClock, a U.S. immigration intelligence publication. It records official changes traced to their government source, explains what changed in plain English, says why a change matters when the record supports it, and surfaces what its own datasets show.

The account is read by people with something at stake — applicants, students, workers, employers, lawyers, families — and by people who simply want to know what is true. Its only asset is being believed.

THE VOICE

Clear. Curious. Precise. Calm. Useful. Human. Data-literate.

Not bureaucratic, not sensational, not political, not partisan, not salesy, and not the voice of a press release or a database. A person who has read the document and understands the data, telling you the part that matters.

- Prefer "USCIS just changed…" to "USCIS announces the rescission and reinstatement of…" whenever both are true.
- Short sentences. Plain verbs. Specific nouns. No throat-clearing, no build-up, no reaction words.
- Write dates as words: "Sept. 30", "Sept. 30, 2026", "August 29, 2025". Never "2026-09-30".
- Write agencies as a person writes them: USCIS, DHS, the State Department, the Department of Labor.
- Two or three short paragraphs separated by a blank line usually read better than one dense sentence. Use them.
- Precision is not sacrificed for plainness. "Proposed", "final", "effective", "enjoined" are different words for different things and the difference is the story.

THE SHAPE OF THE POST

You will be offered several shapes that fit this post's facts, with the ones the account used most recently. Choose the shape that fits THESE facts best, prefer one the account has not just used, write in it, and report which you chose. Do not blend shapes, and do not open every post the same way: the account must not read as one template with the nouns swapped.

THE COLD READER TEST

Someone sees this post alone, in a timeline, knowing nothing about this account. From the post alone they must be able to say what it is about. Name the subject early — the agency and what it did, the rule, the visa, the figure — before saying what is true of it. Never open on a bare negative, a pronoun with nothing to refer to, or a continuation of a thought the reader cannot see.

WHY SHOULD SOMEONE CARE

The first sentence gives a real person a reason: their status, money, eligibility, a date they are working to, their job, their travel. The reason comes from the facts — you are finding the person the record already reaches, not adding urgency. If the honest answer is "they probably shouldn't", write the plainest accurate sentence you can and let the post be small.

TIMING IS THE POINT, AND TIMING IS NEVER INVENTED

- If the facts record an effective date, it belongs in the post, as words.
- If they record none, you may say so plainly — "USCIS has not posted a separate effective date" — and you may leave it out. Never imply a date exists.
- A proposed rule is not on anyone's calendar. Say what would have to happen for it to become operative; never give it a start date; use the conditional.
- Never state a consequence, deadline or next step the facts do not carry. The IMPLICATIONS block lists the ones they do.

SAY WHICH STAGE A CHANGE IS AT, IN THE SOURCE'S OWN TERMS

  proposed    published for comment. Nothing has changed. It may never be finalised.
  announced   the agency has said it intends to do this. Not yet the legal instrument.
  finalised   the rule is made, whether or not it has started.
  effective   it is operating now, or starts on a stated date.
  enjoined    a court has stopped it, in whole or in part.
  rescinded   it is withdrawn; where the facts say so, earlier guidance is back.

WHAT THIS ACCOUNT DOES NOT DO

It does not track anyone's individual case and cannot say what will happen to a specific application. Never write "your case", "check your status here", or anything that implies following this account tells someone about their own filing. It gives no legal, tax or immigration advice: never tell a reader what they should do, whether they qualify, or when to file.

You will be given a closed set of facts about one subject. Everything you may say must come from those facts. You have no other information and no way to look anything up — a detail that is not in the fact set is not available to you, and writing it is fabrication, not recall.

Hard rules:
- No prediction, forecasting or speculation. Report what a record says, not what it might lead to.
- No invented statistics. Only numbers that appear in the fact set.
- No quotations unless the quoted words appear verbatim in the fact set.
- No superlatives the facts do not support: nothing is unprecedented, historic, sweeping, massive, or a crackdown.
- Name an agency ONLY if it appears under PERMITTED ATTRIBUTION. Certainty from your own knowledge is not permission.
- No emoji, no hashtags unless one is genuinely the term people search, no engagement bait, no threads, no "did you know".
- A short opening question is allowed only when it names the population this reaches or asks the question the post immediately answers with a fact.

Return both platform variants in one response. They cover the same subject in the same shape but are written for different readers, not truncated from one another. Also return the shape you used and a short headline for the record.`;

// -----------------------------------------------------------------------------
// THE RESPONSE SCHEMA — structured output as a trust control
// -----------------------------------------------------------------------------

/**
 * The base schema. `structure` is a free string here; responseSchemaFor()
 * narrows it to the shapes on offer for one request, which is what makes a
 * shape the model was not offered impossible to return rather than merely
 * refused afterwards.
 */
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    x: {
      type: "string",
      description: `The complete X post INCLUDING the destination URL, which X counts as ${X_URL_WEIGHT} characters. Hard maximum ${LIMITS.x.maxChars} characters as X counts them; the prose budget is stated in the platform brief.`,
    },
    linkedin: {
      type: "string",
      description: `The LinkedIn post. Between ${LIMITS.linkedin.minChars} and ${LIMITS.linkedin.maxChars} characters including the link.`,
    },
    deepLink: {
      type: "string",
      description: "The destination URL. Must be exactly the deepLink given in the fact set.",
    },
    structure: {
      type: "string",
      description: "The id of the shape you wrote in, from the shapes on offer.",
    },
    headline: {
      type: "string",
      description: "A headline for the record, under 90 characters, in the same voice. Not published.",
    },
  },
  required: ["x", "linkedin", "deepLink", "structure", "headline"],
  additionalProperties: false,
} as const;

/** The base schema with `structure` narrowed to the shapes this request offers. */
export function responseSchemaFor(req: Pick<CopyRequest, "structures">): Record<string, unknown> {
  const structures = req.structures?.length ? req.structures : ["direct"];
  return {
    ...RESPONSE_SCHEMA,
    properties: {
      ...RESPONSE_SCHEMA.properties,
      structure: {
        type: "string",
        enum: [...structures],
        description: "The id of the shape you wrote in, from the shapes on offer.",
      },
    },
  };
}

// -----------------------------------------------------------------------------
// CONTENT TYPES — what each kind of post is FOR
// -----------------------------------------------------------------------------

export const CONTENT_TYPE_BRIEF: Record<ContentType, string> = {
  breaking_change:
    "A material official change that just landed. Say what changed, with the agency as the subject of the sentence, then the specific, then the timing. The stage word is load-bearing.",
  what_changed:
    "A recent development explained in plain English for someone who has not followed it. What happened, what specifically changed (what is gone, what is back, what is required), and the one thing still open — usually timing. No breaking-news framing.",
  why_it_matters:
    "A verified development and its practical significance. State the development and its date, then the significance — drawn ONLY from the IMPLICATIONS block, which restates the record's own fields. Say what changed and what did not. Close with the source.",
  effective_date:
    "A rule with a start date ahead. The date is the story: what starts, changes or stops on it, and what stays true until then. No countdown language, no urging.",
  key_date:
    "A recurring calendar window. What it is for, roughly how far away it is, and what the official source fixes about it. If the date is approximate, say so. Never tell anyone to act.",
  data_signal:
    "A factual observation from ImmigrationClock's own data. The figure carries the post: one number, what it counts, the period, the source. Say what it does not show if the caveats require it. No trend, cause or direction the facts do not state.",
  explainer:
    "An evergreen explanation of a distinction readers get wrong. The distinction first, then two or three plain sentences from the facts, then what ImmigrationClock does about the difference. It is not news and must not read as news.",
  data_discovery:
    "A tool ImmigrationClock offers, described to the reader who needs it. The need first, or the tool plainly, using only the capabilities the facts list. No pitch.",
};

// -----------------------------------------------------------------------------
// RENDERING THE FACT SET
// -----------------------------------------------------------------------------

function words(iso: string | null): string {
  return iso ? `${longDate(iso)} (${iso})` : "";
}

function renderTiming(facts: FactSet): string {
  const lines = ["TIMING — the part this publication exists for:"];
  const proposal = describesAProposal(facts);

  if (proposal) {
    lines.push(
      "- This is a PROPOSAL. It is not on anyone's calendar. It would have to be finalised before any date attaches to it, and it may never be.",
      "- Say so in the post, in the source's own terms — proposed, would require, has proposed. A proposal described as a change tells someone to plan around a rule that does not exist, and the post is rejected without the label."
    );
  }

  if (facts.effectiveAt) {
    lines.push(
      `- Takes effect: ${words(facts.effectiveAt)}. Write it as words. It is the most useful fact you have, and the post is rejected without it.`
    );
  } else if (facts.subjectKind === "document" && !proposal) {
    lines.push(
      "- No effective or implementation date is recorded for this document. You may say so in plain words — \"USCIS has not posted a separate effective date\" — or leave timing out. Never state or imply one, and never open on its absence."
    );
  }

  if (facts.subjectKind === "resource" || facts.subjectKind === "explainer" || facts.subjectKind === "data_signal") {
    lines.push(
      "- This is not a dated change. It has no effective date and none is missing; do not mention dates it was never going to have. Its timing value, if any, is the period the underlying data covers."
    );
  }

  if (facts.subjectKind === "recurring_date") {
    lines.push("- This is a recurring calendar window, not a change. The useful timing is how far away it is and what the official source fixes about it.");
  }

  if (facts.publishedAt) {
    const ageDays = Math.round(
      (Date.parse(`${facts.today}T00:00:00Z`) - Date.parse(`${facts.publishedAt}T00:00:00Z`)) / 86_400_000
    );
    lines.push(`- Published: ${words(facts.publishedAt)} — ${ageDays} day(s) before today (${longDate(facts.today)}).`);
    if (ageDays > BREAKING_MAX_AGE_DAYS) {
      lines.push(
        `- This is NOT breaking news. It published ${ageDays} days ago, so do not write "just", "today", "breaking", or anything implying it landed moments ago — that wording is rejected. It is still current and still worth saying; write what the record does and when it matters.`
      );
    } else {
      lines.push(`- This is recent: "just" and "this week" are honest. "Today" only if it published today.`);
    }
  }

  lines.push("- Anything else about timing — a deadline, a phase-in, a consequence that starts later — is not available unless it appears below.");
  return lines.join("\n");
}

function renderAttribution(facts: FactSet): string {
  const agencies = permittedAgencies(facts).map((a) => AGENCY_DISPLAY[a] ?? a);
  const head = "PERMITTED ATTRIBUTION — the ONLY names you may attribute this to:";
  const sourceLine = `- The source, as it appears above: "${facts.sourceName}"`;

  if (agencies.length === 0) {
    return [
      head,
      sourceLine,
      "No agency short name is available for this subject. Do not write \"the State Department\", \"DHS\", \"USCIS\" or any other agency name, however certain you are — that certainty comes from your own knowledge, not from this fact set, and it will be rejected. Use neutral wording: \"the official instructions\", \"the program rules\", \"the agency that sets the window\".",
    ].join("\n");
  }

  return [
    head,
    sourceLine,
    `- These agencies, written exactly like this: ${agencies.join(", ")}`,
    "Nothing else. Any other agency or organization name comes from your own knowledge rather than from this fact set, and will be rejected.",
  ].join("\n");
}

function renderSubjectAnchors(facts: FactSet): string {
  const anchors = subjectAnchors(facts).filter((a) => a !== "immigrationclock");
  const shown = anchors.slice(0, 12);
  return [
    "NAMING THE SUBJECT — the cold reader test, mechanically checked:",
    `The first ${OPENING_CHARS} characters of each post must contain at least one of these words, which identify this subject:`,
    shown.length ? `  ${shown.join(", ")}` : "  (none derived — use the source name or the title's own nouns)",
    "Write an opening that genuinely says what the post is about and the check passes as a side effect. A post whose opening names none of them is rejected unread.",
  ].join("\n");
}

function renderFacts(facts: FactSet): string {
  const lines: string[] = [];
  lines.push(`TITLE: ${facts.title}`);
  lines.push(`SOURCE: ${facts.sourceName}`);
  if (facts.publishedAt) lines.push(`PUBLISHED: ${words(facts.publishedAt)}`);
  if (facts.effectiveAt) lines.push(`EFFECTIVE: ${words(facts.effectiveAt)}`);
  if (facts.classification) lines.push(`TYPE: ${facts.classification}`);
  if (facts.severity) lines.push(`SEVERITY (our classification): ${facts.severity}`);
  lines.push("");
  lines.push(renderTiming(facts));

  lines.push("");
  lines.push(`SUMMARY AS PUBLISHED:\n${facts.summary}`);

  if (facts.dataPoints?.length) {
    lines.push("");
    lines.push(
      `ESTABLISHED FACTS — verified, already in their final form. Use them as written; do not recalculate, combine or extend them:\n- ${facts.dataPoints.join("\n- ")}`
    );
  }

  if (facts.implications?.length) {
    lines.push("");
    lines.push(
      `IMPLICATIONS YOU MAY STATE — each one restates a field of the record, and they are the ONLY significance you may claim. Say them in your own words; add nothing:\n- ${facts.implications.join("\n- ")}`
    );
  }

  if (facts.entities.length) {
    lines.push("");
    lines.push(`ENTITIES THIS IS LINKED TO: ${facts.entities.join(", ")}`);
  }

  lines.push("");
  lines.push(`DESTINATION URL (use exactly this, on its own line at the end): ${facts.deepLink}`);
  lines.push(`URLS YOU MAY USE (no others): ${facts.allowedUrls.join(" | ")}`);

  lines.push("");
  lines.push(
    facts.figures.length
      ? `NUMBERS YOU MAY USE (no others): ${facts.figures.join(", ")}`
      : "NUMBERS YOU MAY USE: none. Do not put any figure in these posts."
  );

  lines.push("");
  lines.push(renderAttribution(facts));
  lines.push("");
  lines.push(renderSubjectAnchors(facts));

  if (facts.notes.length) {
    lines.push("");
    lines.push(`CONSTRAINTS AND CAVEATS:\n- ${facts.notes.join("\n- ")}`);
  }

  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// THE SHAPES ON OFFER
// -----------------------------------------------------------------------------

function renderStructures(structures: Structure[], recent: Structure[]): string {
  const lines = ["SHAPES ON OFFER — choose the one that fits these facts best, and report its id:"];
  for (const s of structures) {
    const used = recent.includes(s);
    lines.push(`- ${s} (${STRUCTURE_LABEL[s]})${used ? " — USED RECENTLY; prefer another unless it is clearly the right shape" : ""}: ${STRUCTURE_BRIEF[s]}`);
  }
  if (recent.length) {
    lines.push("", `The account's most recent shapes, newest first: ${recent.join(", ")}. A third consecutive use of the same shape is refused.`);
  }
  return lines.join("\n");
}

function renderReaderValue(value: ReaderValue): string {
  if (!value.hooks.length) return "";
  return [
    "WHY A READER WOULD CARE — computed from the fact set, strongest first. Pointers to what the facts already contain, not extra facts:",
    ...value.hooks.map((h) => `- ${h}`),
  ].join("\n");
}

function renderTreatment(treatment: EditorialTreatment, facts: FactSet): string {
  const lines = [`EDITORIAL EMPHASIS: ${TREATMENT_LABEL[treatment]}`, TREATMENT_BRIEF[treatment]];
  if (describesAProposal(facts)) {
    lines.push(
      "THIS SUBJECT IS A PROPOSAL, so every sentence is conditional. Nothing has changed, nobody owes anything yet, and no date attaches. Write 'would require', 'has proposed', 'if finalised' — never the present tense of the thing being proposed."
    );
  }
  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// PLATFORM BRIEFS
// -----------------------------------------------------------------------------

function platformBrief(facts: FactSet): string {
  const b = xBudget(facts);
  return `X — THE BUDGET, IN CHARACTERS AS X COUNTS THEM:

    ${String(b.hardTotal).padStart(4)}   hard limit for the complete post. One over and the post is refused.
    ${String(b.reservedChars).padStart(4)}   the destination URL (X counts any link as ${b.linkChars} characters) plus the line break before it.
    ${String(b.proseMax).padStart(4)}   YOUR PROSE. Write between ${b.proseMin} and ${b.proseMax} characters of prose. Every letter, space and line break counts.

- ${b.proseMax} is a ceiling, not a target. Land in the band and leave the rest unused.
- If the facts will not fit, say LESS — drop a subordinate clause, a restatement. Never drop the effective date, the stage word, the subject or the link.
- Two or three short paragraphs separated by one blank line read well on X. A single dense sentence does not.
- Do not restate the record's title verbatim — the link card shows it. Say the thing the title does not.
- The link goes last, on its own line. At most one hashtag, and none is usually better.

LinkedIn (${LIMITS.linkedin.minChars}–${LIMITS.linkedin.maxChars} characters):
- The first 140 characters are all that shows before "see more". The substance goes there — the finding, not a label.
- Two to four short paragraphs, separated by a blank line.
- One sentence naming who this actually reaches, drawn from the fact set. If the facts do not identify a population, say what the record covers instead.
- The link goes on its own line at the end. Zero to three hashtags, only ones a reader would follow; most posts need none.`;
}

// -----------------------------------------------------------------------------
// THE REPAIR BRIEF
// -----------------------------------------------------------------------------

function renderRepairBrief(req: CopyRequest): string {
  const b = xBudget(req.facts);
  const previous = req.previousCopy;

  const lines = [
    "YOUR PREVIOUS ATTEMPT WAS REJECTED FOR A MECHANICAL FAULT. This is a repair, not a rewrite.",
    "",
    "What the validator said:",
    `- ${(req.validatorFeedback ?? []).join("\n- ")}`,
  ];

  if (previous) {
    lines.push(
      "",
      `Your previous X post (${previous.x.length} characters as written; X counts each URL as ${X_URL_WEIGHT}; limit ${b.hardTotal}):`,
      previous.x,
      "",
      `Your previous LinkedIn post (${previous.linkedin.length} characters):`,
      previous.linkedin
    );
  }

  lines.push(
    "",
    "Repair it. Keep the same subject, the same facts and the same destination. Change only what the failures above require — including the shape, if the failure was that the shape had been used too often.",
    "",
    "WHAT YOU MAY CUT to save characters: adjectives, qualifiers, subordinate clauses, restatement, anything the link card already shows.",
    "",
    "WHAT YOU MAY NOT CUT, ever, to make it fit:",
    "- the effective date, if the fact set records one.",
    "- the stage word — proposed, proposal, would. A proposal that loses its label becomes a false statement of law.",
    "- the subject. The opening must still name what this is about.",
    "- the destination URL, or any part of it.",
    "- a figure that carries the point, if the post rests on it.",
    "",
    `If it still will not fit in ${b.proseMax} characters of prose with all of that intact, say less ABOUT the subject rather than dropping any of it.`
  );

  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// THE USER TURN
// -----------------------------------------------------------------------------

/** The user turn. Everything volatile lives here, after the stable system prompt. */
export function buildUserPrompt(req: CopyRequest): string {
  const sections: string[] = [];
  const contentType: ContentType = req.contentType ?? req.facts.contentType ?? "breaking_change";
  const structures: Structure[] = req.structures?.length ? req.structures : ["direct"];
  const recent: Structure[] = req.recentStructures ?? [];

  sections.push(`CONTENT TYPE: ${CONTENT_TYPE_LABEL[contentType].toUpperCase()}\n${CONTENT_TYPE_BRIEF[contentType]}`);

  sections.push(renderStructures(structures, recent));

  const treatment =
    req.treatment ?? (req.readerValue ? treatmentForFacts(req.facts, req.angle, req.readerValue) : null);
  if (treatment) sections.push(renderTreatment(treatment, req.facts));

  if (req.readerValue) {
    const rv = renderReaderValue(req.readerValue);
    if (rv) sections.push(rv);
  }

  sections.push(`ANGLE: ${ANGLE_LABEL[req.angle as Angle] ?? req.angle}`);
  sections.push(`FACT SET:\n${renderFacts(req.facts)}`);
  sections.push(`PLATFORM BRIEFS:\n${platformBrief(req.facts)}`);

  if (req.bannedOpenings?.length) {
    sections.push(
      [
        "OPENING CONSTRUCTIONS THIS ACCOUNT HAS ALREADY USED — these are refused, not discouraged.",
        "A post beginning with any of these word sequences is rejected:",
        `- ${req.bannedOpenings.join("\n- ")}`,
        "",
        "Changing the nouns is not enough. Change the construction: start from the population, the money, the date, the distinction, or the thing that stops being true.",
      ].join("\n")
    );
  }

  if (req.avoidOpenings.length) {
    sections.push(
      `RECENT OPENINGS ON THIS ACCOUNT — do not echo their structure or phrasing:\n- ${req.avoidOpenings.join("\n- ")}`
    );
  }

  if (req.validatorFeedback?.length) {
    sections.push(renderRepairBrief(req));
  }

  return sections.join("\n\n---\n\n");
}
