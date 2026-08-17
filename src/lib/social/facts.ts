// =============================================================================
// FACT SETS — the closed world
//
// The copy engine has no web access, no retrieval and no tools. Everything it
// knows about a subject is built here, deterministically, from data the
// repository already holds and has already validated.
//
// This is the first and most important hallucination control, and it is
// structural rather than instructional: a model cannot fabricate a statistic
// about an agency it was never told about. The prompt asks for restraint; this
// file is what makes restraint the only option.
//
// FIGURES ARE EXTRACTED, NOT DESCRIBED
// ------------------------------------
// `figures` is the set of numerals the source itself used. validate.ts pulls
// every numeral out of the generated copy and requires each one to be in this
// set. That single check is what makes an invented statistic — the most
// damaging and most plausible-looking failure mode for a data publication —
// impossible to publish rather than merely discouraged.
//
// It follows that this extractor must be GENEROUS about what counts as a figure
// present in the source and STRICT about nothing else: a missed figure causes a
// false rejection (a skipped slot, which is safe), while a figure invented
// downstream causes a false publication (which is not). The asymmetry is
// deliberate.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import type { KeyDate } from "@/lib/key-dates";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { ENTITY_BY_ID } from "@/domains/graph/entities";
import { COUNTRY_BY_SLUG } from "@/domains/graph/countries";
import { absolute, type StandingAsset } from "./links";
import { assetInsights } from "./asset-facts";
import type { FactSet } from "./types";

/**
 * Every numeral-bearing token in a piece of source text.
 *
 * Captures bare numbers, numbers with separators, decimals, percentages,
 * currency, and the numeric part of alphanumerics like "H-1B" or "2026-16231",
 * because the validator compares normalized digit-runs and must not reject copy
 * for saying "H-1B" when the source said "H-1B".
 */
export function extractFigures(text: string): string[] {
  const found = new Set<string>();
  const re = /\$?\d[\d,.]*%?/g;
  for (const m of text.matchAll(re)) {
    // Trailing punctuation belongs to the sentence, not the figure. Left in, the
    // prompt shows the model a list like "$755., 246," — which reads as noise
    // and invites it to reproduce the stray character.
    const cleaned = m[0].replace(/[.,]+$/, "");
    if (/\d/.test(cleaned)) found.add(cleaned);
  }
  return [...found].sort();
}

/** Digit-runs only, for comparison. "1,500" and "1500" are the same figure. */
export function normalizeFigure(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/**
 * Remove thousands separators so "1,500" and "1500" are one number.
 *
 * Only commas BETWEEN digits are removed. Stripping every comma would merge
 * "in 2026, 500 people" into the single nonsense figure 2026500 — but that
 * phrase has a space after the comma, so the lookahead never fires.
 *
 * Without this, the validator rejects any copy whose separator style differs
 * from the source's. Federal Register summaries use separators; a model writing
 * naturally often does not. It is a false rejection rather than a false
 * publication, so it fails safe — but it fails constantly, and a check that
 * cries wolf on ordinary correct copy stops being useful.
 */
export function stripThousandsSeparators(text: string): string {
  return text.replace(/(?<=\d),(?=\d)/g, "");
}

/** Every distinct digit-run in a string. The unit the validator compares. */
export function digitRuns(text: string): string[] {
  return [...stripThousandsSeparators(text).matchAll(/\d+/g)].map((m) => m[0]);
}

function sourceDisplayName(sourceKey: string): string {
  return SOURCE_BY_KEY[sourceKey]?.name ?? sourceKey;
}

function issuingAgency(sourceKey: string): string | null {
  return SOURCE_BY_KEY[sourceKey]?.agency ?? null;
}

/** Readable names for the entities the archive linked to an event. */
export function describeEntities(entityIds: string[]): string[] {
  const out: string[] = [];
  for (const id of entityIds) {
    const seeded = ENTITY_BY_ID.get(id);
    if (seeded) {
      out.push(seeded.name);
      continue;
    }
    if (id.startsWith("country:")) {
      const c = COUNTRY_BY_SLUG.get(id.slice("country:".length));
      if (c) out.push(c.name);
      continue;
    }
    // policy: and court_case: ids are internal references with no display name
    // worth showing; omitting them is better than showing a slug.
  }
  return [...new Set(out)];
}

// -----------------------------------------------------------------------------

export function buildEventFacts(
  event: IndexedEvent,
  deepLink: string,
  today: string
): FactSet {
  const sourceName = sourceDisplayName(event.sourceKey);
  const agency = issuingAgency(event.sourceKey);
  const notes: string[] = [];

  // Caveats the copy must not contradict. These are the same limitations the
  // site renders beside the data, restated for the engine.
  const limitation = SOURCE_BY_KEY[event.sourceKey]?.limitations;
  if (limitation) notes.push(limitation);

  if (event.classification === "proposed_rule") {
    notes.push(
      "This is a PROPOSED rule. It is not in force, may never be finalized, and imposes no obligation on anyone today."
    );
  }
  if (event.classification === "court_decision") {
    notes.push(
      "This is a court decision. Describe what the court did; do not characterize what it will mean for future cases."
    );
  }
  if (!event.effectiveAt) {
    notes.push("The archive records no effective date for this item. Do not state or imply one.");
  }
  if (event.effectiveAt && event.effectiveAt > today) {
    notes.push(`This takes effect on ${event.effectiveAt}, which is in the future.`);
  }

  const allowedUrls = [absolute(deepLink), event.sourceUrl].filter(Boolean);

  return {
    subjectId: `event:${event.id}`,
    subjectKind: "document",
    today,
    title: event.title,
    summary: event.summary,
    sourceName,
    sourceKey: event.sourceKey,
    publishedAt: event.publishedAt,
    effectiveAt: event.effectiveAt,
    classification: event.classification,
    severity: event.severity,
    entities: describeEntities(event.entityIds ?? []),
    // An archive event speaks for itself; the summary IS the source's own prose.
    // Nothing is computed on top of it.
    dataPoints: [],
    allowedUrls,
    deepLink: absolute(deepLink),
    figures: extractFigures(`${event.title} ${event.summary} ${agency ?? ""}`),
    notes,
  };
}

export function buildKeyDateFacts(
  kd: KeyDate,
  daysAway: number,
  dateLabel: string,
  today: string
): FactSet {
  const notes = [
    "This is a recurring reference date, not a news event. Do not describe it as new or as a change.",
    "Nothing here is legal or tax advice.",
  ];
  if (kd.approx) {
    notes.push(
      "The exact window is set by the agency each year and this date is APPROXIMATE. Say so; do not state a precise date as if confirmed."
    );
  }

  const body = `${kd.title}. ${kd.detail}`;

  return {
    subjectId: `keydate:${kd.id}`,
    subjectKind: "recurring_date",
    today,
    title: kd.title,
    summary: kd.detail,
    sourceName: kd.sourceName,
    sourceKey: `keydate:${kd.category}`,
    publishedAt: null,
    effectiveAt: kd.approx ? null : dateLabel,
    classification: "deadline",
    severity: null,
    entities: [],
    // The countdown is the computed fact here, and it is stated in `figures`
    // beside the detail text rather than as a sentence of its own.
    dataPoints: [],
    allowedUrls: [absolute("/key-dates"), kd.sourceUrl],
    deepLink: absolute("/key-dates"),
    // The countdown is a real, checkable figure — it is computed here, so the
    // engine may state it.
    //
    // The exact date is NOT offered when the window is approximate. Handing over
    // the digits of a date the agency has not announced, alongside a note saying
    // it is approximate, is an invitation to publish "October 1" as if it were
    // confirmed — and the validator would allow it, because the digits were in
    // the fact set. Withholding them is what makes the caveat enforceable.
    figures: [
      ...extractFigures(body),
      String(daysAway),
      ...(kd.approx ? [] : extractFigures(dateLabel)),
    ],
    notes,
  };
}

/**
 * A standing asset, with whatever its underlying data actually supports.
 *
 * Returns null when the asset has no grounded insight today — see
 * asset-facts.ts. The caller must drop it rather than fall back to describing
 * the page, which is the failure this whole layer exists to fix.
 */
export function buildAssetFacts(asset: StandingAsset, today: string): FactSet | null {
  const insight = assetInsights(asset.id, today);
  if (!insight) return null;

  const notes = [
    "This is an ImmigrationClock resource, not a news event. Lead with the finding, not with what the page contains.",
    ...insight.caveats,
  ];

  if (insight.numeric) {
    // The figures are already computed and already attributed. What remains
    // possible — and is the realistic failure here rather than invention — is
    // arithmetic ON them: a share, a difference, a per-year average. Each of
    // those produces a numeral the validator has never seen, so it fails closed;
    // saying so here is what stops the model wasting the one regeneration it has.
    notes.push(
      "The figures above are the only ones you have, and they are already calculated. State them as given. Do not derive a new number from them — no shares, differences, averages, rates or comparisons that are not written out above."
    );
  }

  return {
    subjectId: `asset:${asset.id}`,
    subjectKind: "resource",
    today,
    title: asset.label,
    summary: asset.description,
    // Attribution follows the figures. When the numbers came from USCIS or CBP,
    // the post must be able to say so, and validate.ts checks agency mentions
    // against this field.
    sourceName: insight.sourceName ?? "ImmigrationClock",
    sourceKey: `asset:${asset.id}`,
    publishedAt: null,
    effectiveAt: null,
    classification: null,
    severity: null,
    entities: [],
    dataPoints: insight.points,
    allowedUrls: [absolute(asset.path)],
    deepLink: absolute(asset.path),
    // Extracted from the computed points, so every numeral the engine is
    // OFFERED is one deterministic code put there — and empty when the asset has
    // no measurement to offer.
    //
    // Deliberately not extracted from the description. "H-1B" and "F-1" put a 1
    // in any description that names a visa, and a non-numeric asset that
    // advertises "NUMBERS YOU MAY USE: 1" is inviting the model to find a use
    // for it. The validator is unaffected: it grounds digits against the whole
    // fact set including the summary, so copy may still write "H-1B".
    figures: insight.numeric ? extractFigures(insight.points.join(" ")) : [],
    notes,
  };
}
