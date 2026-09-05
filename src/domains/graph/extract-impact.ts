// =============================================================================
// IMPACT EXTRACTION — building "Who is affected?" from a document
//
// Shared by every adapter, so a Federal Register rule, a court decision, and a
// USCIS policy alert all answer the question the same way.
//
// The extractor's job is narrow and deliberately unambitious: find what the
// document ITSELF says about scope, quote it, and stop. It does not reason about
// immigration law, does not fill gaps, and does not guess at implications. When
// a document does not state its scope, the correct output is "we could not
// determine this from the document" — not a plausible-looking list.
//
// See impact.ts for why that restraint is the whole design.
// =============================================================================

import type { EntityId } from "./entities";
import { entityId, VISA_CATEGORIES } from "./entities";
import { countriesFor } from "./countries";
import { richText } from "./text";
import { confidenceFor, gradeClassification } from "./classification";
import { formsFor } from "./forms";
import { processesFor } from "./processes";
import {
  EMPTY_IMPACT,
  type ActionRequired,
  type EventImpact,
  type ImpactCompleteness,
  type ImpactedEntity,
} from "./impact";

export interface ImpactSourceText {
  title: string;
  /** The document's abstract or summary. */
  abstract?: string | null;
  /** Full body text when available — richer extraction, same rules. */
  body?: string | null;
  /** Agencies already established as explicit links by the adapter. */
  agencyIds?: EntityId[];
  /** Effective date, when the document states one. */
  effectiveAt?: string | null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split into quotable spans.
 *
 * Real sentence segmentation is unreliable on government text — footnote markers
 * ("\3\\"), citations, and abbreviations all defeat a boundary regex, which in
 * live testing produced single "sentences" thousands of characters long. Rather
 * than chase perfect segmentation, spans are hard-capped: an over-long span is
 * chunked, so an evidence quote always stays close to the phrase it supports.
 */
const MAX_SPAN = 400;

function sentences(text: string): string[] {
  const rough = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.;:])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const span of rough) {
    if (span.length <= MAX_SPAN) {
      out.push(span);
      continue;
    }
    // Chunk on WORD boundaries. A fixed-width slice cuts mid-word and produces
    // an evidence quote that begins "quired from certain..." — presented to the
    // reader as verbatim source text when the source never said it. On a
    // platform whose entire claim is that quotes are real, a mangled quote is
    // worse than no quote.
    out.push(...chunkOnWords(span, MAX_SPAN));
  }
  return out.filter(Boolean);
}

/**
 * Split a long span into <= max-length pieces without breaking a word.
 *
 * Every chunk after the first BEGINS MID-SENTENCE, and every chunk before the
 * last ENDS mid-sentence. Those chunks are quoted to the reader verbatim, so an
 * unmarked one presents "jurisdictions) when the agency is required to publish"
 * as though the document opened a sentence that way. It did not.
 *
 * Marking the cut with an ellipsis is the same convention windowAround() already
 * uses, and it keeps the quote honest: still verbatim, now visibly a fragment.
 * Found by running the full 859-event backfill through the evidence-integrity
 * test, which the 190-event store had never given enough material to trip.
 */
function chunkOnWords(span: string, max: number): string[] {
  const words = span.split(" ");
  const chunks: string[] = [];
  let current = "";
  for (const w of words) {
    if (current && current.length + 1 + w.length > max) {
      chunks.push(current);
      current = w;
    } else {
      current = current ? `${current} ${w}` : w;
    }
  }
  if (current) chunks.push(current);

  const trimmed = chunks.map((c) => c.trim()).filter(Boolean);
  return trimmed.map((c, i) => {
    const opensMidSentence = i > 0;
    const endsMidSentence = i < trimmed.length - 1;
    return `${opensMidSentence ? "…" : ""}${c}${endsMidSentence ? "…" : ""}`;
  });
}

/**
 * Pull the passage immediately around a phrase.
 *
 * More reliable than quoting a whole span: the reader gets the text that
 * actually contains the claim, trimmed to word boundaries so it reads cleanly.
 */
function windowAround(text: string, phrase: string, radius = 180): string | null {
  const flat = text.replace(/\s+/g, " ");
  const idx = flat.toLowerCase().indexOf(phrase.toLowerCase());
  if (idx === -1) return null;
  let start = Math.max(0, idx - radius);
  let end = Math.min(flat.length, idx + phrase.length + radius);
  if (start > 0) {
    const sp = flat.indexOf(" ", start);
    if (sp !== -1 && sp < idx) start = sp + 1;
  }
  if (end < flat.length) {
    const sp = flat.lastIndexOf(" ", end);
    if (sp > idx + phrase.length) end = sp;
  }
  return `${start > 0 ? "…" : ""}${flat.slice(start, end).trim()}${end < flat.length ? "…" : ""}`;
}

/** Trim to a length without cutting a word in half. */
function clip(s: string, max = 320): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd();
  // The span may already carry a chunk marker; one ellipsis says everything two
  // would.
  return body.endsWith("…") ? body : `${body}…`;
}

/**
 * Visa-category matchers.
 *
 * Built from the seed visa entities. Short codes ("TN", "J1") are excluded here
 * for the same reason they are excluded from general entity resolution: in a
 * scope claim, a false positive tells someone a rule covers their visa when it
 * does not.
 */
const HYPHENATED_CODE = /^[a-z]{1,2}-\d/i; // "H-1B", "B-2", "EB-3"

const VISA_MATCHERS = VISA_CATEGORIES.flatMap((v) => {
  // Hyphenated codes are how documents actually refer to these ("(B-1/B-2)"),
  // and the hyphen makes them unambiguous where a bare "B2" would not be. Other
  // surfaces still need four characters to be worth matching.
  const surfaces = [v.name, ...(v.aliases ?? [])].filter(
    (s) => s.length >= 4 || HYPHENATED_CODE.test(s)
  );
  return surfaces.map((surface) => ({
    entityId: v.id,
    surface,
    re: new RegExp(`(?<![a-z0-9])${escapeRe(surface.toLowerCase())}(?![a-z0-9])`, "i"),
  }));
}).sort((a, b) => b.surface.length - a.surface.length);

/**
 * Phrases indicating the document is defining WHO it applies to, rather than
 * merely mentioning something in passing. A country named inside one of these
 * sentences is stated scope; a country named in background discussion is not.
 */
const SCOPE_PHRASES = [
  // Formulaic openings that define who a rule reaches. Drawn from the actual
  // language of published rules, not guessed at — e.g. the Visa Bond Program
  // rule opens "An alien applying for a visa as a temporary visitor…".
  "an alien applying",
  "aliens applying",
  "applying for a visa",
  "applying for",
  "aliens who",
  "individuals who",
  "persons who",
  "temporary visitor",
  "applies to",
  "apply to",
  "applicable to",
  "shall apply",
  "covered by this",
  "subject to this",
  "affected by this",
  "eligible for",
  "ineligible",
  "nationals of",
  "citizens of",
  "designated countries",
  "listed countries",
  "the following countries",
  "for nationals",
  "beneficiaries of",
  "applicants for",
  "holders of",
];

/**
 * Phrases indicating the document is stating a REQUIREMENT on affected people.
 * Used to locate the "what should they do next" quote.
 */
const REQUIREMENT_PHRASES = [
  "will be required to",
  "shall be required to",
  "must be",
  "must submit",
  "must provide",
  "must file",
  "are required to",
  "is required to",
  "may be required to",
  "required to post",
  "required to pay",
  "must comply",
  "no later than",
  "must obtain",
];

/**
 * Phrases indicating the document publishes a CLOSED list. Only these justify
 * `completeness: "exhaustive"`.
 */
const CLOSED_LIST_PHRASES = [
  "the following countries",
  "the countries listed below",
  "listed in the table below",
  "the complete list",
  "in its entirety",
];

function isScopeSentence(sentence: string): boolean {
  const l = sentence.toLowerCase();
  return SCOPE_PHRASES.some((p) => l.includes(p));
}

/**
 * Country classification lives in countries.ts, not here.
 *
 * This module used to carry its own designation-phrase filter and build country
 * entries inline. It produced entries with no `method`, which the default public
 * view silently discards — see the Countries section of extractImpact(). The
 * rule that replaced it is countriesFor(), which grades a country by where its
 * evidence sits and records the relation it holds to the document.
 */

/**
 * Phrases showing the document delegates its scope to a list maintained
 * elsewhere. When one of these is present and no country is named inline, the
 * honest answer is "the list lives over there", not "no one is affected".
 */
// Weighted, because a generic phrase like "list of countries" appears in
// historical background as readily as in an operative delegation. The evidence
// quote we show the reader has to be the sentence that actually delegates, so
// stronger phrases win. Live testing caught this: an unweighted match quoted a
// sentence about a legislative effort from 2000.
const DELEGATED_SCOPE_PHRASES: [phrase: string, weight: number][] = [
  ["countries with high overstay rates", 10],
  ["as determined by the secretary", 9],
  ["as designated by the secretary", 9],
  ["countries subject to a visa bond requirement", 9],
  ["published on the department's website", 8],
  ["identified by the department", 7],
  ["in a separate notice", 6],
  ["subsequent notice", 6],
  ["will be announced", 5],
  ["countries subject to", 4],
];

function findDelegatedScope(allSentences: string[]): { evidence: string; note: string } | undefined {
  let best: { sentence: string; weight: number; phrase: string } | null = null;
  for (const sentence of allSentences) {
    const l = sentence.toLowerCase();
    for (const [phrase, weight] of DELEGATED_SCOPE_PHRASES) {
      if (!l.includes(phrase)) continue;
      if (!best || weight > best.weight) best = { sentence, weight, phrase };
    }
  }
  // A weak signal alone is not evidence of delegation; require a real one.
  if (!best || best.weight < 6) return undefined;
  // Quote the passage around the delegating phrase itself, not whatever span it
  // happened to land in.
  const hit = windowAround(best.sentence, best.phrase) ?? best.sentence;
  return {
    evidence: clip(hit, 400),
    note:
      "This document sets the rule but leaves the specific list of who it covers to a separate government determination. " +
      "The list is not in this document, so we do not show one here — check the issuing agency's own published list.",
  };
}

/**
 * Extract who is affected, using only what the document says.
 *
 * Every returned entity is `stated` with a verbatim evidence quote, or is not
 * returned at all. There is deliberately no `inferred` path here yet: adding one
 * requires a review workflow, because an inferred scope claim is exactly the
 * kind of assertion that should not ship unreviewed.
 */
export function extractImpact(src: ImpactSourceText): EventImpact {
  // Normalize BEFORE extracting. Federal Register raw text carries its own
  // markup — "<bullet>" and inline anchors — and USCIS bodies carry HTML. An
  // evidence quote is supposed to be what the document says, so leaking
  // "<a href=...>" into a quoted passage breaks the one promise this module
  // makes. Doing it here rather than per-adapter means no future source can
  // forget.
  const text = richText([src.title, src.abstract ?? "", src.body ?? ""].filter(Boolean).join(" "));
  if (!text.trim()) return { ...EMPTY_IMPACT };

  const allSentences = sentences(text);
  const scopeSentences = allSentences.filter(isScopeSentence);

  // ---- Countries -----------------------------------------------------------
  //
  // Delegated to countriesFor(), which is the ONLY country classifier. This
  // used to be its own implementation: designation sentences in, entries out,
  // every one of them carrying confidence 1 and NO `method`.
  //
  // That last omission was the whole defect. isStrong() rejects an undefined
  // method, and the default public view shows only strong classifications, so
  // every country this path produced was invisible the moment it was stored.
  // Nothing failed and nothing warned — the offline pass happened to rewrite
  // the same records with a real grade, and no document in the refetch window
  // designated a country, so the two never visibly disagreed.
  //
  // A producer and a consumer that disagree about the schema is not a bug in
  // either one; it is a missing contract. The contract now lives in
  // countries.ts and both callers use it.
  const countries: ImpactedEntity[] = countriesFor(
    src.title,
    src.abstract ?? "",
    src.body ?? ""
  );

  // ---- Visa categories -----------------------------------------------------
  //
  // REWRITTEN AFTER MEASURING. The previous rule was "a visa counts only inside
  // a scope sentence", applied to the whole body. Hand-labelling the H-1B
  // corpus showed it failing in both directions at once:
  //
  //   • It dropped ten USCIS records whose TITLE names the visa — "USCIS
  //     Reaches Fiscal Year 2027 H-1B Cap" contains no "applies to", because
  //     headlines do not talk that way. Recall 47%.
  //   • It accepted an H-2A wage rule as H-1B because a sentence deep in the
  //     body says a statutory provision "was enacted in the context of the
  //     H-1B ... classification, and also applies to the PERM immigrant visa
  //     program". "applies to" made a footnote look like scope. Precision 82%.
  //
  // So the title and the abstract are read first and directly — they are the
  // document's own statement of subject — and the body still requires a scope
  // sentence but is now graded, so a citation or a historical aside is marked
  // weak rather than sold as certain. See classification.ts.
  const visaCategories: ImpactedEntity[] = [];
  const seenVisa = new Set<EntityId>();
  const titleText = richText(src.title);
  const summaryText = richText(src.abstract ?? "");

  for (const m of VISA_MATCHERS) {
    if (seenVisa.has(m.entityId)) continue;

    // Where does this visa appear, and in what kind of sentence?
    const inTitle = m.re.test(titleText);
    const inSummary = m.re.test(summaryText);
    // A MEASURED NEGATIVE RESULT, RECORDED SO IT IS NOT RETRIED BLIND.
    //
    // First-match-wins looks like the defect that cost this codebase its TPS
    // country designations and scored a fee rule's forms against a table of
    // contents, so ranking candidate sentences by the shared evidence model was
    // the obvious next move. Measured on the ingest path it made things worse:
    // H-1B precision fell 95% -> 90% (a second false positive) and recall did
    // not move, because the record it was meant to rescue — "Adjustment to
    // Premium Processing Fees" — has no better sentence to find. Its only H-1B
    // passage is fee-table prose that reads as contextual however it is ranked.
    //
    // Reverted rather than kept. The span rule stays first-match.
    const bodyScopeSentence = inTitle || inSummary
      ? null
      : allSentences.find((sentence) => m.re.test(sentence) && isScopeSentence(sentence));

    if (!inTitle && !inSummary && !bodyScopeSentence) continue;

    // A QUOTE MUST CONTAIN THE THING IT IS A QUOTE FOR.
    //
    // A span runs to 400 characters and clip() trims at 320, so when the visa
    // was named in the last eighty the stored quote did not contain it at all.
    // One record claimed H-1B on the strength of a quote about 8 CFR 214.2(j),
    // which is J-1. A reader checking that quote finds nothing — worse than a
    // missing classification, because it is one that cannot be checked.
    //
    // Only the quote is re-centred, and only when the plain clip actually lost
    // the term. Grading still reads the whole sentence. Centring the window
    // BEFORE grading was tried and measured: it strips the operative context
    // that earns a strong grade, and cost two true positives for no precision
    // (H-1B recall 95% -> 89%). countries.ts calls this property
    // selfSupporting; the visa branch simply never had it.
    const bodySpan = bodyScopeSentence as string;
    const plainClip = inTitle || inSummary ? "" : clip(bodySpan);
    const evidence = inTitle
      ? clip(titleText)
      : inSummary
        ? clip(windowAround(summaryText, m.surface) ?? summaryText)
        : m.re.test(plainClip)
          ? plainClip
          : clip(windowAround(bodySpan, m.surface) ?? bodySpan);

    const method = gradeClassification({
      title: titleText,
      summary: summaryText,
      // The whole sentence, not the stored quote: the quote may have been
      // re-centred on the term and lost the words that establish the grade.
      evidence: inTitle || inSummary ? evidence : bodySpan,
      matches: (text) => m.re.test(text),
    });

    seenVisa.add(m.entityId);
    visaCategories.push({
      entityId: m.entityId,
      basis: "stated",
      evidence,
      method,
      confidence: confidenceFor(method),
    });
  }

  // ---- Forms and processes -------------------------------------------------
  //
  // FORMS READ THE BODY. The old rule here was that they must not, because the
  // archive did not retain document bodies and evidence nobody can re-read is
  // worse than evidence that is merely incomplete. That reasoning was sound and
  // is now obsolete: the source-text store retains the body, and every form
  // classification drawn from one carries the quote plus the content hash of
  // the document it was cut from.
  //
  // Leaving the call at title+abstract after the store landed had a measured
  // cost. The published forms recall of 58% was earned by the offline
  // re-extraction pass, which does pass a body; this path, which is the one
  // that actually runs on every deploy, scored 31% on the same ground truth.
  // Every newly ingested document was getting the weaker classifier while the
  // API advertised the stronger one's number.
  //
  // PROCESSES STILL DO NOT read the body: processesFor has never taken one, and
  // giving it one is a change to a measured dimension, not a bug fix.
  const forms: ImpactedEntity[] = formsFor(
    titleText,
    summaryText,
    richText(src.body ?? "")
  ).map((f) => ({
    entityId: f.entityId as EntityId,
    basis: "stated" as const,
    evidence: f.evidence,
    method: f.method as never,
    confidence: f.confidence,
  }));

  const processes: ImpactedEntity[] = processesFor(titleText, summaryText).map((p) => ({
    entityId: p.entityId as EntityId,
    basis: "stated" as const,
    evidence: p.evidence,
    method: p.method as never,
    confidence: p.confidence,
  }));

  // ---- Agencies ------------------------------------------------------------
  // The adapter already established these as explicit links from structured
  // metadata, so they are `derived`: an agency that issues a rule is necessarily
  // implementing it. No text evidence is needed for a structural fact.
  const agencies: ImpactedEntity[] = (src.agencyIds ?? []).map((id) => ({
    entityId: id,
    basis: "derived" as const,
    confidence: 0.99,
  }));

  // ---- What should they do next -------------------------------------------
  const actionRequired = extractActionRequired(allSentences, src.effectiveAt);

  // ---- Completeness --------------------------------------------------------
  const lower = text.toLowerCase();
  let completeness: ImpactCompleteness = "unspecified";
  if (countries.length > 0 || visaCategories.length > 0) {
    const declaresClosedList = CLOSED_LIST_PHRASES.some((p) => lower.includes(p));
    // Even a closed-list phrase only earns `partial` when the list lives in a
    // table we did not parse. We reserve `exhaustive` for cases where the whole
    // list is in the text we actually read — which, from abstracts alone, is
    // rare. Claiming completeness we have not verified is the failure mode here.
    completeness = declaresClosedList && src.body ? "exhaustive" : "partial";
  }

  const delegated = countries.length === 0 ? findDelegatedScope(allSentences) : undefined;

  const impact: EventImpact = {
    countries,
    visaCategories,
    forms,
    processes,
    agencies,
    employers: [],
    universities: [],
    states: [],
    completeness,
    actionRequired,
    scopeDefinedElsewhere: delegated,
  };

  if (
    countries.length === 0 &&
    visaCategories.length === 0 &&
    forms.length === 0 &&
    processes.length === 0 &&
    agencies.length === 0
  ) {
    impact.undetermined =
      "This document does not state in structured terms who is affected. Read the original for scope.";
  } else if (countries.length === 0 && visaCategories.length === 0 && !delegated) {
    impact.undetermined =
      "The document does not name specific countries or visa categories in its scope language. Read the original to confirm whether it applies to a particular case.";
  }

  return impact;
}

/**
 * Instructions about the RULEMAKING PROCESS, not about anyone's immigration
 * obligations.
 *
 * Nearly every Federal Register document contains "you must submit comments,
 * identified by the agency name and referencing this rule's RIN…". That matches
 * a requirement phrase and reads, under a heading that says "what the document
 * says may be required", as though an immigrant must do it. It is addressed to
 * commenters, and surfacing it as an obligation is both wrong and alarming.
 *
 * These sentences are skipped so the extractor keeps looking for a real
 * operative requirement, and reports none if there isn't one.
 */
function isProceduralBoilerplate(lower: string): boolean {
  return (
    /\bsubmit (written )?comments?\b/.test(lower) ||
    /\bcomments? must be (received|submitted|identified)\b/.test(lower) ||
    /\bregulatory identification number\b|\brin\b/.test(lower) ||
    /\bregulations\.gov\b/.test(lower) ||
    /\bfederal erulemaking portal\b/.test(lower) ||
    /\bdocket\b.*\bnumber\b/.test(lower) ||
    /\bpaperwork reduction act\b/.test(lower) ||
    /\bomb control number\b/.test(lower)
  );
}

/**
 * Find the document's own statement of what affected people may have to do.
 *
 * Returns a CONDITIONAL paraphrase plus the verbatim sentence. Never authored
 * guidance — see the advice guard in validateImpact(), which rejects anything
 * phrased as "you should" or "you must".
 */
function extractActionRequired(
  allSentences: string[],
  effectiveAt?: string | null
): ActionRequired | undefined {
  const hit = allSentences.find((s) => {
    const l = s.toLowerCase();
    if (!REQUIREMENT_PHRASES.some((p) => l.includes(p))) return false;
    return !isProceduralBoilerplate(l);
  });
  if (!hit) return undefined;

  return {
    // Framed as what the document states, so it cannot be read as our advice to
    // any individual.
    summary:
      "The document states a requirement for those it covers. The exact obligation, and whether it applies to a particular person, depends on the document's own terms — the relevant passage is quoted below.",
    evidence: clip(hit, 400),
    effectiveFrom: effectiveAt ?? null,
  };
}
