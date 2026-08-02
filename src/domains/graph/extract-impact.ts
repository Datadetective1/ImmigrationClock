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
import { findCountriesInText } from "./countries";
import { richText } from "./text";
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

/** Split a long span into <= max-length pieces without breaking a word. */
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
  return chunks.map((c) => c.trim()).filter(Boolean);
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
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
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
 * Country extraction uses a MUCH tighter filter than visa extraction, and this
 * is the most important restriction in the module.
 *
 * A rule's full text runs to tens of thousands of words, and its regulatory
 * impact analysis, background section, and footnotes name other countries
 * constantly. Live testing proved the danger: the Visa Bond Program rule
 * discusses a DHS overstay report that mentions Canada and Mexico, and a
 * general scope filter happily concluded the rule covered Canadian and Mexican
 * travellers. It does not.
 *
 * Telling someone a rule affects them when it does not — or the reverse — is
 * the single worst thing this platform can do. So a country is only extracted
 * from a sentence that explicitly DESIGNATES countries. Background prose that
 * merely names a country never qualifies, and we accept missing real lists as
 * the price.
 */
const COUNTRY_DESIGNATION_PHRASES = [
  "nationals of",
  "citizens of",
  "country of nationality",
  "countries whose nationals",
  "designated countries",
  "designated country",
  "listed countries",
  "the following countries",
  "covered countries",
  "affected countries",
  "eligible countries",
  "ineligible countries",
  "country of chargeability",
  "applies to nationals",
  "shall apply to nationals",
];

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

function isCountryDesignationSentence(sentence: string): boolean {
  const l = sentence.toLowerCase();
  return COUNTRY_DESIGNATION_PHRASES.some((p) => l.includes(p));
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
  // Only from sentences that explicitly DESIGNATE countries. See the comment on
  // COUNTRY_DESIGNATION_PHRASES for why this is far stricter than visa matching.
  const countries: ImpactedEntity[] = [];
  const designationText = allSentences.filter(isCountryDesignationSentence).join(" ");
  for (const hit of findCountriesInText(designationText)) {
    countries.push({
      entityId: hit.entityId,
      basis: "stated",
      evidence: hit.evidence,
      confidence: 1,
    });
  }

  // ---- Visa categories -----------------------------------------------------
  const visaCategories: ImpactedEntity[] = [];
  const seenVisa = new Set<EntityId>();
  for (const sentence of allSentences) {
    const scoped = isScopeSentence(sentence);
    for (const m of VISA_MATCHERS) {
      if (seenVisa.has(m.entityId)) continue;
      if (!m.re.test(sentence)) continue;
      // A visa named anywhere in a rule about that visa is meaningful, but a
      // scope sentence is stronger evidence. Only scope sentences are `stated`.
      if (!scoped) continue;
      seenVisa.add(m.entityId);
      visaCategories.push({
        entityId: m.entityId,
        basis: "stated",
        evidence: clip(sentence),
        confidence: 1,
      });
    }
  }

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
