// =============================================================================
// ENTITY RESOLUTION — turning text mentions into graph edges
//
// Shared by every adapter, so the Federal Register, the courts, Congress, and
// USCIS all resolve "H-1B" or "India" to the SAME node. Without one resolver,
// each source builds its own island and the graph stops being a graph.
//
// THE GOVERNING TRADE-OFF
// -----------------------
// A wrong edge is worse than a missing one. If a reader opens the India page and
// finds a rule that merely used the word "Indian" in an unrelated sense, the
// platform has misinformed them — quietly, and at scale. So this resolver is
// deliberately conservative:
//
//   • whole-word / phrase matching only, never substring
//   • aliases shorter than three characters are ignored
//   • ambiguous short forms are excluded outright
//   • every match is `basis: "matched"` with a confidence below 1, and the UI
//     must present matched links differently from explicit ones
//
// Recall is the thing we are willing to lose. Precision is not.
// =============================================================================

import { ALIAS_INDEX, type EntityId } from "./entities";
import { findCountriesInText } from "./countries";

export interface EntityMention {
  entityId: EntityId;
  /** The surface form that matched, kept for auditability. */
  matchedText: string;
  confidence: number;
}

/**
 * Alias strings that are real names but too ambiguous to match in free text.
 *
 * "ICE" appears in ordinary prose; "TN" is a state abbreviation as often as a
 * visa; "asylum" is used in senses unrelated to the legal category. These are
 * still valid entity aliases for search and for explicit links — they are just
 * not safe to infer from a document's text.
 */
const AMBIGUOUS_ALIASES = new Set([
  "ice",
  "tn",
  "tn visa",
  "asylum",
  "asylee",
  "refugee status",
  "parole",
  "dos",
  "state department",
  "petition",
]);

/** Escape a string for safe use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pre-compiled matchers, longest alias first so "H-1B specialty occupation"
 * wins over "H-1B" and we do not double-count the same span.
 */
const MATCHERS: { re: RegExp; entityId: EntityId; alias: string }[] = (() => {
  const entries = [...ALIAS_INDEX.entries()]
    .filter(([alias]) => alias.length >= 3 && !AMBIGUOUS_ALIASES.has(alias))
    .sort((a, b) => b[0].length - a[0].length);

  return entries.map(([alias, id]) => ({
    // \b is unreliable around hyphens and dots ("H-1B", "U.S."), so word
    // boundaries are asserted explicitly as "not a letter or digit".
    re: new RegExp(`(?<![a-z0-9])${escapeRe(alias)}(?![a-z0-9])`, "i"),
    entityId: id,
    alias,
  }));
})();

/**
 * Find entities mentioned in a block of source text.
 *
 * Confidence reflects how specific the surface form is: a long, unambiguous
 * phrase ("Deferred Action for Childhood Arrivals") is a stronger signal than a
 * short code ("EB-2"), which can legitimately appear in unrelated contexts.
 */
export function resolveEntityMentions(text: string): EntityMention[] {
  if (!text?.trim()) return [];
  const haystack = text.toLowerCase();
  const found = new Map<EntityId, EntityMention>();

  for (const m of MATCHERS) {
    if (!m.re.test(haystack)) continue;
    // Keep the strongest (longest) surface form per entity.
    const existing = found.get(m.entityId);
    if (existing && existing.matchedText.length >= m.alias.length) continue;
    found.set(m.entityId, {
      entityId: m.entityId,
      matchedText: m.alias,
      confidence: confidenceFor(m.alias),
    });
  }

  // COUNTRIES.
  //
  // The alias index is built from SEED_ENTITIES, which does not contain the ~200
  // countries — those live in their own registry with their own matcher, because
  // country names carry ambiguities ("Georgia", "Jordan", "Chad") that need
  // sentence context rather than a flat alias list.
  //
  // For a long time nothing joined the two, and the cost was concrete: nineteen
  // TPS events naming Venezuela, Haiti, Syria, Somalia and others carried NO
  // country link, so "does anything affect Venezuelans?" returned nothing across
  // the entire archive.
  //
  // These are `mentions` edges at matched confidence — a deliberately weak,
  // clearly-labelled claim. The strict evidence path for "who is affected" is
  // impact.countries, which still requires a designation sentence and a verbatim
  // quote and is untouched by this. Saying a document MENTIONS a country and
  // saying it AFFECTS that country's nationals are different claims, and only
  // the first is being made here.
  for (const hit of findCountriesInText(text)) {
    if (found.has(hit.entityId)) continue;
    found.set(hit.entityId, {
      entityId: hit.entityId,
      matchedText: hit.surface,
      confidence: confidenceFor(hit.surface),
    });
  }

  return [...found.values()];
}

/**
 * Confidence by surface-form specificity. These thresholds are deliberately
 * conservative and are documented so a reader can audit them:
 *   ≥ 20 chars — a full formal name; very unlikely to be coincidental.
 *   ≥ 10 chars — a distinctive phrase.
 *   ≥  6 chars — a recognisable term.
 *   shorter    — a short code; usable, but flagged as weak.
 */
function confidenceFor(alias: string): number {
  if (alias.length >= 20) return 0.95;
  if (alias.length >= 10) return 0.85;
  if (alias.length >= 6) return 0.75;
  return 0.6;
}

/**
 * The floor below which a matched edge is not shown to the public.
 *
 * Weak matches are still recorded — they are useful for internal review and for
 * measuring resolver quality — but they must not surface as an asserted
 * relationship. The same rule the professional WARN × H-1B report will need.
 */
export const PUBLIC_CONFIDENCE_FLOOR = 0.75;

export function isPubliclyAssertable(confidence: number): boolean {
  return confidence >= PUBLIC_CONFIDENCE_FLOOR;
}
