// =============================================================================
// THE PROMPT — versioned, and narrower than it looks
//
// The copy engine's job is WORDING. Selection, scoring, angle, destination and
// dedupe are all decided before this prompt is built; validation happens after
// it returns. What the model contributes is the sentence, and nothing else.
//
// The version string is recorded in the ledger beside every post, so a change in
// the feed's voice can be traced to a change in this file rather than guessed at.
// Bump it whenever the text below changes.
//
// A NOTE ON WHAT IS *NOT* IN HERE
// -------------------------------
// There is no "double-check your work before answering", no "think carefully",
// no worked examples, and no restatement of rules the validator enforces
// mechanically. Verification scaffolding makes current models verbose without
// making them more accurate, and every rule stated here that is ALSO checked in
// validate.ts is stated once, briefly, because the check is what makes it true.
// The prompt's job is to make good output likely; the validator's job is to make
// bad output unpublishable.
// =============================================================================

import { ANGLE_LABEL, type Angle, type CopyRequest, type FactSet } from "./types";
import { LIMITS, OPENING_CHARS, permittedAgencies, subjectAnchors } from "./validate";

/**
 * v2 renders `dataPoints` and makes the data-insight brief conditional on
 * whether any exist. Before it, the evening slot was told it had no figures
 * whether or not that was true, which is why its posts described pages.
 *
 * v3 answers the first real Anthropic proposal, which failed on both of the two
 * things this file can influence and the validator cannot fix:
 *
 *   • X came back at 286 characters against a 275 limit. "At most 275" is a
 *     cliff, and a model writing to a cliff lands on the wrong side of it often
 *     enough to matter. v3 asks for a 240–260 band instead, so the limit has
 *     margin rather than being the target.
 *   • Both variants wrote "State Department" for a subject whose fact set says
 *     "U.S. Dept. of State — DV Program". That attribution is real-world true
 *     and unsupported by the closed world, which is exactly the failure the
 *     validator exists to catch — but the model had no way to know which
 *     attributions were available. v3 computes and states them.
 *
 * v4 gives the account its subject. The copy was accurate and could have come
 * from any immigration news feed, because nothing told the model what
 * ImmigrationClock is FOR: the time dimension — when a change bites, which
 * window is open, what is still ahead. v4 states that, gives it a shape
 * (what changed -> when it matters -> who should pay attention -> what happens
 * next), and renders an explicit TIMING block so an ABSENT date is as visible
 * as a present one.
 */
/**
 * v5 is the cold-reader version, and it exists because of one published post:
 *
 *     "No implementation date has been set; ImmigrationClock labels each
 *      figure's derivation and period completeness, publishes source limits,
 *      and does not collect profiles, tracking, or identifying personal data."
 *
 * Every clause of that is true and the post is still a failure, because a reader
 * scrolling past it cannot tell what it is about. It opens on the ABSENCE of a
 * date for a subject that was never on a calendar — a methodology page — and
 * names its topic nowhere.
 *
 * Two things in this file produced it, and both are fixed here rather than
 * papered over with a "be clearer" instruction:
 *
 *   • renderTiming() emitted "NO effective or implementation date is recorded.
 *     State that plainly" for EVERY subject. That line is exactly right for a
 *     federal document whose start date has not been set, and meaningless for a
 *     page explaining how we classify data. It now branches on subjectKind, and
 *     a resource is never asked about its implementation date.
 *
 *   • Nothing required the post to identify its own subject. The COLD READER
 *     TEST below states that requirement, and validate.ts v4 enforces it — a
 *     post whose opening names nothing from its own fact set is rejected.
 */
export const PROMPT_VERSION = "social-prompt/5";

/**
 * The band X copy should land in.
 *
 * Below the 275 limit by design. A model asked for "at most 275" writes to 275
 * and overshoots; the first real proposal came back at 286. Asking for 240–260
 * turns the limit into margin, and the cost of that margin is ~15 characters on
 * a platform where terse is better anyway.
 */
export const X_TARGET_MIN = 240;
export const X_TARGET_MAX = 260;

/** Typical absolute URL length, so the model can budget the sentence. */
const LINK_BUDGET = 45;

/**
 * Stable across every request. Kept first and byte-identical so it is the
 * cacheable prefix if call volume ever rises enough for caching to pay.
 */
export const SYSTEM_PROMPT = `You write short posts for ImmigrationClock, a U.S. immigration data publication.

The account is a reference source. People follow it to find out what actually changed, from an outfit that does not overstate. Its credibility is the only thing it has.

WHAT MAKES THIS ACCOUNT DIFFERENT FROM AN IMMIGRATION NEWS FEED

ImmigrationClock's subject is the TIME DIMENSION of U.S. immigration: when something changes, when it starts to bite, which window is open, what is still ahead. Anyone can restate a Federal Register summary. The reader came here to know where a change sits on a calendar and whether it is on their radar yet.

So structure every post around as much of this as the facts support, in this order:

  WHAT CHANGED  ->  WHEN IT MATTERS  ->  WHO SHOULD PAY ATTENTION  ->  WHAT HAPPENS NEXT

Not as four labelled sections — as the shape of the thought. On X you will often fit only the first two, and that is the right two to keep. Drop a beat the fact set cannot support rather than padding it.

THE COLD READER TEST — THE FIRST THING EVERY POST MUST PASS

Someone sees this post alone, in a timeline, knowing nothing about this account and nothing about the post above it. There is no previous post. There is no thread. They will not click the link before deciding whether it is worth reading.

From the post ALONE, that person must be able to say what it is about.

So: NAME THE SUBJECT FIRST. The opening clause identifies the thing — the agency and what it did, the form, the visa category, the programme, the dataset. Only then say what is true of it.

  BAD:  "No implementation date has been set; the labelling covers each figure's derivation..."
        Orphan. What has no date? What labelling?
  GOOD: "DHS has proposed [the specific change]. No implementation date has been set."

Never open with:
- a bare negative about something you have not yet named — "No date has been set...", "None of these apply..."
- a pronoun or a bare demonstrative standing in for a subject you have not named — "It now requires...", "This affects...", "They will need..."
- a continuation of a thought the reader cannot see — "Also...", "Meanwhile...", "In addition..."
- a description of what a page contains rather than what it says

A number is not a subject either. "1,240 notices were filed" needs to say notices of what, from where.

TIMING IS THE POINT, AND TIMING IS NEVER INVENTED

- If the fact set records an effective date, it belongs in the post. That is the single most useful thing you can tell someone.
- If it records none, say so plainly — "no implementation date has been set", "the timing has not been announced" — and never imply one exists. An absent date is information, not a gap to smooth over.
- A proposed rule is not on anyone's calendar yet. Say what would have to happen for it to become operative: it would have to be finalised. Never give a proposed rule an effective date, and never describe it as coming into force.
- For a recurring window, the useful thing is the preparation time ahead of it, not a description of the program.
- Never state a consequence, a deadline, or a next step the fact set does not contain.

SAY WHICH STAGE A CHANGE IS AT, IN THE SOURCE'S OWN TERMS

These are different things and a reader plans differently around each. Use the one the fact set supports and never upgrade it:

  proposed    published for comment. Nothing has changed. It may never be finalised.
  announced   the agency has said it intends to do this. Not yet the legal instrument.
  finalised   the rule is made, whether or not it has started.
  effective   it is operating now, or starts on a stated date.
  delayed     a date that existed has moved.
  blocked     a court has stopped it, in whole or in part.
  withdrawn   it is no longer going ahead.

A proposal described as a change is the single most damaging error this account can make: it tells someone to plan around a rule that does not exist. If the fact set says proposed, the post says proposed, and the verb is conditional — "would require", not "requires".

WHAT THIS ACCOUNT DOES NOT DO

It does not track anyone's individual case, and it cannot say what will happen to a specific application. Never write anything that implies otherwise — no "your case", no "check your status here", no suggestion that following this account tells someone about their own filing. The subject is always the rule and the calendar, never the reader's file.

You will be given a closed set of facts about one subject and one editorial angle. Everything you may say must come from those facts. You have no other information about this subject and no way to look anything up — if a detail is not in the fact set, it is not available to you, and writing it would be fabrication rather than recall.

Hard rules:
- No prediction, forecasting, or speculation about consequences. Report what a document does, not what it might lead to.
- No legal, tax, or immigration advice. Never tell a reader what they should do, whether they qualify, or when to file.
- No invented statistics. You may only use numbers that appear in the fact set.
- No quotations unless the quoted words appear verbatim in the fact set.
- No superlatives you cannot support from the fact set: nothing is unprecedented, historic, sweeping, massive, or a crackdown.
- Name an agency or organization ONLY if it is listed under PERMITTED ATTRIBUTION. Knowing which agency runs a program is not permission to say so: if the fact set does not carry that attribution, it is not available to you, however certain you are. Write around it instead — "the official instructions", "the program rules", "the agency that sets the window" — or use the wording the fact set itself uses.
- A proposed rule is not law. An announcement is not the legal instrument. Say which one you are describing.
- No emoji, no engagement bait, no threads.

Voice: plain declarative sentences. Not a government notice and not a rewrite of the source document — a person who has read the document telling you the part that matters and when. Specific nouns. No throat-clearing, no build-up, no rhetorical questions. Assume the reader is an informed adult who wants the fact, not a reaction to the fact. Where the subject affects people's status or obligations, the appropriate register is careful, not dramatic — the facts carry the weight without help.

Return both platform variants in one response. They cover the same subject from the same angle but are written for different readers, not truncated from one another.`;

/**
 * The JSON schema the response is constrained to.
 *
 * Structured output rather than free-form prose is a trust control, not a
 * convenience: there is no surrounding commentary to strip, no preamble that
 * might leak into a post, and no parsing step that could mis-slice a response.
 */
export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    x: {
      type: "string",
      description: `The X post, ${X_TARGET_MIN}–${X_TARGET_MAX} characters including the link. Anything over ${LIMITS.x.maxChars} is discarded.`,
    },
    linkedin: {
      type: "string",
      description: `The LinkedIn post. Between ${LIMITS.linkedin.minChars} and ${LIMITS.linkedin.maxChars} characters including the link.`,
    },
    deepLink: {
      type: "string",
      description: "The destination URL. Must be exactly the deepLink given in the fact set.",
    },
  },
  required: ["x", "linkedin", "deepLink"],
  additionalProperties: false,
} as const;

/** Per-platform instructions. Differences are editorial, not cosmetic. */
function platformBrief(): string {
  return `X (aim for ${X_TARGET_MIN}–${X_TARGET_MAX} characters including the link; ${LIMITS.x.maxChars} is a hard limit that fails the post):
- Count the link at its full literal length, not as a short token. It is roughly ${LINK_BUDGET} characters, so the sentence before it has about ${X_TARGET_MAX - LINK_BUDGET} to work with.
- The band is the target and the limit is a cliff. Copy that lands at ${LIMITS.x.maxChars + 1} is discarded, so write to the band and leave the margin unused.
- One statement. Lead with what changed or what the resource is.
- Do not restate the page title verbatim — the link preview already shows it. Say the thing the title does not.
- The link goes at the end, on its own.
- At most one hashtag, and only if it is genuinely the term people search. None is usually better.

LinkedIn (${LIMITS.linkedin.minChars}–${LIMITS.linkedin.maxChars} characters):
- The first 140 characters are all that shows before "see more". The substance goes there. Not a preamble, not a label — the finding itself.
- Two to four short paragraphs, separated by a blank line.
- Include one sentence naming who this actually reaches, drawn from the fact set. If the facts do not identify a population, say what the document covers instead — do not guess at who it touches.
- The link goes on its own line at the end.
- Zero to three hashtags, at the very end, and only ones a reader would actually follow. Do not add hashtags to reach three; most posts need none or one. This account should read like an authoritative information source, not a marketing feed.`;
}

function renderFacts(facts: FactSet): string {
  const lines: string[] = [];
  lines.push(`TITLE: ${facts.title}`);
  lines.push(`SOURCE: ${facts.sourceName}`);
  if (facts.publishedAt) lines.push(`PUBLISHED: ${facts.publishedAt}`);
  if (facts.effectiveAt) lines.push(`EFFECTIVE: ${facts.effectiveAt}`);
  if (facts.classification) lines.push(`TYPE: ${facts.classification}`);
  if (facts.severity) lines.push(`SEVERITY (our classification): ${facts.severity}`);
  lines.push("");
  // Timing first, before the source's own prose. The order is the instruction:
  // this account leads with where a change sits on a calendar, and the summary
  // is context for that rather than the other way round.
  lines.push(renderTiming(facts));

  lines.push("");
  lines.push(`SUMMARY AS PUBLISHED:\n${facts.summary}`);

  // Rendered as finished sentences, not as a table of values. The arithmetic and
  // the attribution were both done in asset-facts.ts; what is wanted from the
  // model here is a choice about which of these is the lede, not a calculation.
  if (facts.dataPoints?.length) {
    lines.push("");
    lines.push(
      `ESTABLISHED FACTS FROM OUR OWN DATA — verified, and already stated in their final form. Use them as written; do not recalculate, combine or extend them:\n- ${facts.dataPoints.join(
        "\n- "
      )}`
    );
  }

  if (facts.entities.length) {
    lines.push("");
    lines.push(`ENTITIES THIS IS LINKED TO: ${facts.entities.join(", ")}`);
  }

  lines.push("");
  lines.push(`DESTINATION URL (use exactly this): ${facts.deepLink}`);
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

/**
 * Exactly which attributions this subject supports, computed from the same code
 * the validator checks against.
 *
 * The failure this replaces: the Diversity Visa fact set names its source
 * "U.S. Dept. of State — DV Program", and the model wrote "State Department" —
 * true of the world, absent from the closed world, correctly rejected. Nothing
 * in the prompt had told it which attributions were on the table, so it fell
 * back on knowledge, which is the one source it is not allowed to use.
 *
 * Naming the empty case explicitly matters more than naming the full one. "None
 * available" plus a concrete neutral alternative is a usable instruction; silence
 * is an invitation.
 */
/**
 * The calendar position of this subject, stated positively in both directions.
 *
 * An absent effective date used to be visible only as a prohibition buried in
 * the caveats ("do not state one"), which reads as a gap to write around. Here
 * it is a fact with its own line, because "no date has been set" is genuinely
 * useful to a reader deciding whether something is on their radar yet — and it
 * is the honest answer far more often than a date is.
 */
function renderTiming(facts: FactSet): string {
  const lines = ["TIMING — the part this account exists for:"];

  if (facts.classification === "proposed_rule") {
    lines.push(
      "- This is a PROPOSAL. It is not on anyone's calendar. It would have to be finalised before any date attaches to it, and it may never be."
    );
  }

  if (facts.effectiveAt) {
    lines.push(
      `- Takes effect: ${facts.effectiveAt}. Say so — it is the most useful fact you have, and the post is rejected without it.`
    );
  } else if (facts.subjectKind === "document" && facts.classification !== "proposed_rule") {
    // ONLY for documents, and this is the fix for the published methodology post.
    //
    // This line used to be emitted for every subject. Applied to a durable page
    // it asks the model to report the absence of a date that could not exist,
    // and the model dutifully did: the post opened "No implementation date has
    // been set" about our own methodology page. For a document the same line is
    // genuinely useful — "no start date has been set" is what a reader wants to
    // know about a rule that has been made — so it stays, scoped to documents.
    lines.push(
      "- NO effective or implementation date is recorded for this document. State that plainly rather than omitting it: the absence is the timing information. Name the document FIRST — the absence of a date is never the opening clause."
    );
  }

  if (facts.subjectKind === "resource") {
    lines.push(
      "- This is a durable reference page, not a dated change. It has no effective date, no implementation date and no start date, and none is missing — do not mention dates it was never going to have. Its timing value is what the underlying data covers and when that data was last refreshed, if the facts below say so."
    );
  }

  if (facts.subjectKind === "recurring_date") {
    lines.push(
      "- This is a recurring calendar window, not a change. The useful timing is how far away it is and what the official source fixes about it."
    );
  }

  if (facts.publishedAt) lines.push(`- Published: ${facts.publishedAt}.`);

  lines.push(
    "- Anything else about timing — a deadline, a phase-in, a next step, a consequence that starts later — is not available unless it appears in the facts below."
  );

  return lines.join("\n");
}

/**
 * The words that would tell a stranger what this post is about.
 *
 * Computed by the same function the validator requires one of, for the same
 * reason permittedAgencies() is shared: a rule the model is judged by and cannot
 * see is a rule that produces rejections nobody can act on. The failure this
 * prevents is the model writing a true, well-formed sentence whose subject is
 * only implied — which is what happened, and cost a published post.
 */
function renderSubjectAnchors(facts: FactSet): string {
  const anchors = subjectAnchors(facts).filter((a) => a !== "immigrationclock");
  const shown = anchors.slice(0, 12);

  return [
    `NAMING THE SUBJECT — the cold reader test, mechanically checked:`,
    `The first ${OPENING_CHARS} characters of each post must contain at least one of these words, which are the ones that identify this subject:`,
    shown.length ? `  ${shown.join(", ")}` : `  (none derived — use the source name or the title's own nouns)`,
    `This is not a keyword requirement and it is not satisfied by mentioning one late. Write an opening that genuinely says what the post is about, and the check passes as a side effect. A post whose opening names none of them is rejected unread.`,
  ].join("\n");
}

function renderAttribution(facts: FactSet): string {
  const agencies = permittedAgencies(facts);
  const head = `PERMITTED ATTRIBUTION — the ONLY names you may attribute this to:`;
  const sourceLine = `- The source, written exactly as it appears above: "${facts.sourceName}"`;

  if (agencies.length === 0) {
    return [
      head,
      sourceLine,
      `No agency short name is available for this subject. Do not write "State Department", "DHS", "USCIS", "the Justice Department" or any other agency name, even if you are certain which agency is responsible — that certainty comes from your own knowledge, not from this fact set, and it will be rejected.`,
      `Where you would have named an agency, use neutral wording instead: "the official instructions", "the program rules", "the agency that sets the window", or the fact set's own phrasing.`,
    ].join("\n");
  }

  return [
    head,
    sourceLine,
    `- These agency names, which the fact set does support: ${agencies.join(", ")}`,
    `Nothing else. Any other agency or organization name comes from your own knowledge rather than from this fact set, and will be rejected. Where you would have named one, use neutral wording: "the official instructions", "the program rules", or the fact set's own phrasing.`,
  ].join("\n");
}

function angleBrief(angle: Angle, facts: FactSet): string {
  const briefs: Record<Angle, string> = {
    breaking_change:
      "This just published and it changes something. Say what it does, whether it is in force yet, and — the part a news feed would leave out — when it starts to matter. If no date is recorded, say that no implementation date has been set.",
    what_it_requires:
      "The document imposes a requirement, and the reader's real question is FROM WHEN. Pair the requirement with its timing: what it requires, and the date it applies from — or that no date has been set.  — a fee, a filing step, an eligibility test, an evidentiary standard. State it as a property of the rule: 'the rule requires', 'the fee applies to', 'filings on or after X must include'. NEVER as an instruction: no 'you should', no 'make sure to', no 'apply now'. The reader decides what to do; your job is to tell them precisely what the document says, so they can.",
    who_is_affected:
      "Focus on the population this reaches, using only the categories, countries or visa types named in the fact set. Where the facts carry timing, say when it reaches them — 'who, and from when' is more useful than 'who'. Never suggest this tells anyone about their own case.",
    what_changed_from_previous:
      "Focus on the difference between the prior state and the current one, as far as the fact set describes it. If the fact set does not describe the prior state, say what the document revises rather than inventing the before.",
    effective_date_reminder:
      "The effective date is the news. State what changes on that date, and what remains true until then — the gap between now and then is the useful part, because it is the part someone can still plan around.",
    deadline_approaching:
      "A recurring deadline is coming. State what it is, roughly when, and what the window is for. The value is the time left, not the description of the program. Do not tell anyone to act.",
    preparation_window:
      "A window opens some time ahead — far enough away that urgency would be false. Say what the window is, roughly when it falls, and what the official source actually determines about it. The value is knowing it is coming, not being hurried. Do not use countdown language, do not imply anything is closing, and if the date is approximate say so plainly.",
    historical_context:
      "Place this among the related activity named in the fact set. Do not characterise a trend the fact set does not state.",
    // Both variants of this brief are here rather than one hedged version,
    // because the difference is what the slot is for. With figures, the post is
    // the figure. Without them, the useful thing is almost always the
    // methodological point a reader gets wrong — and saying so is not the same
    // as padding out a description of the page.
    // Branches on `figures`, not on `dataPoints`: an asset can have plenty to
    // say and no measurement to say it with, and those are two different posts.
    data_insight: facts.figures.length
      ? "Lead with the most striking of the established facts above — the number itself, not the page it sits on. One figure carries a post; three read as a specification. Do not open by naming the page or saying what it contains."
      : "This resource has no figures you may quote. The post is the point the page makes: what the data does and does not show, or the distinction a reader most often gets wrong. Do not fill the space with a description of what the page contains.",
  };
  return `${ANGLE_LABEL[angle]} — ${briefs[angle]}`;
}

/** The user turn. Everything volatile lives here, after the stable system prompt. */
export function buildUserPrompt(req: CopyRequest): string {
  const sections: string[] = [];

  sections.push(`SLOT: ${req.slot.id.toUpperCase()}\n${req.slot.purpose}`);
  sections.push(`ANGLE: ${angleBrief(req.angle, req.facts)}`);
  sections.push(`FACT SET:\n${renderFacts(req.facts)}`);
  sections.push(`PLATFORM BRIEFS:\n${platformBrief()}`);

  if (req.avoidOpenings.length) {
    sections.push(
      `RECENT OPENINGS ON THIS ACCOUNT — do not echo their structure or phrasing:\n- ${req.avoidOpenings.join(
        "\n- "
      )}`
    );
  }

  if (req.validatorFeedback?.length) {
    sections.push(
      `YOUR PREVIOUS ATTEMPT WAS REJECTED. Fix exactly these and change nothing else:\n- ${req.validatorFeedback.join(
        "\n- "
      )}`
    );
  }

  return sections.join("\n\n---\n\n");
}
