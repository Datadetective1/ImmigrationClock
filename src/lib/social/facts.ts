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
//
// FIVE KINDS OF SUBJECT, ONE SHAPE
// --------------------------------
// A recorded change, a recurring date, an explainer, a data signal and a tool
// all become the same FactSet, because the engine and the validator should not
// have to know which they are holding. What differs is where the sentences come
// from: an archive summary, a cited source, a computed figure, or a description
// of verified behaviour. `implications` is the one field that is derived rather
// than copied, and implications.ts explains why that is still restatement.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import type { KeyDate } from "@/lib/key-dates";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { ENTITY_BY_ID } from "@/domains/graph/entities";
import { COUNTRY_BY_SLUG } from "@/domains/graph/countries";
import type { Explainer } from "@/lib/editorial/explainers";
import type { DataSignal } from "@/lib/editorial/signals";
import type { Discovery } from "@/lib/editorial/discovery";
import { changePath, explainerPath, shortHash, signalPath, trackedUrl } from "@/lib/share";
import { absolute, type StandingAsset } from "./links";
import { assetInsights } from "./asset-facts";
import { implicationsFor } from "./implications";
import type { ContentType } from "./content-types";
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

/** The short public key a record is attributed by. Matches utm_content. */
export function storyKeyForEvent(event: { id: string }): string {
  return `change:${shortHash(event.id)}`;
}

/**
 * The URL a post must contain: the record's canonical address with the
 * attribution parameters Plausible reads. The clean address is also allowed,
 * so a repair that drops the parameters is a wrong-destination failure and
 * not a whitelist failure — but the deep link the prompt hands over is the
 * tracked one.
 */
function trackedFor(path: string, contentType: ContentType, storyKey: string): { deepLink: string; shareUrl: string } {
  const shareUrl = absolute(path);
  return {
    shareUrl,
    deepLink: trackedUrl(shareUrl, { platform: "x", contentType, story: storyKey }),
  };
}

// -----------------------------------------------------------------------------
// RECORDED CHANGES
// -----------------------------------------------------------------------------

export function buildEventFacts(
  event: IndexedEvent,
  /** Site-relative destination. The record's own page unless a caller says otherwise. */
  deepLink: string = changePath(event),
  today: string,
  contentType: ContentType = "breaking_change"
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

  const storyKey = storyKeyForEvent(event);
  const urls = trackedFor(deepLink, contentType, storyKey);
  const allowedUrls = [urls.deepLink, urls.shareUrl, event.sourceUrl].filter(Boolean);
  const implications = implicationsFor(event, today);

  return {
    subjectId: `event:${event.id}`,
    subjectKind: "document",
    contentType,
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
    implications,
    allowedUrls,
    deepLink: urls.deepLink,
    shareUrl: urls.shareUrl,
    // Figures come from the source text AND from the derived implications, so a
    // day count computed there ("29 days from today") is stateable.
    figures: extractFigures(`${event.title} ${event.summary} ${agency ?? ""} ${implications.join(" ")}`),
    notes,
  };
}

// -----------------------------------------------------------------------------
// RECURRING DATES
// -----------------------------------------------------------------------------

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
  const storyKey = `keydate:${kd.id}`;
  const urls = trackedFor("/key-dates", "key_date", storyKey);

  return {
    subjectId: `keydate:${kd.id}`,
    subjectKind: "recurring_date",
    contentType: "key_date",
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
    dataPoints: [],
    implications: [],
    allowedUrls: [urls.deepLink, urls.shareUrl, kd.sourceUrl],
    deepLink: urls.deepLink,
    shareUrl: urls.shareUrl,
    // The countdown is a real, checkable figure — it is computed here, so the
    // engine may state it. The exact date is NOT offered when the window is
    // approximate: handing over the digits of a date the agency has not
    // announced is an invitation to publish it as confirmed.
    figures: [
      ...extractFigures(body),
      String(daysAway),
      ...(kd.approx ? [] : extractFigures(dateLabel)),
    ],
    notes,
  };
}

// -----------------------------------------------------------------------------
// EXPLAINERS
// -----------------------------------------------------------------------------

export function buildExplainerFacts(e: Explainer, today: string): FactSet {
  const storyKey = `explainer:${e.slug}`;
  const urls = trackedFor(explainerPath(e.slug), "explainer", storyKey);
  const corpus = `${e.title} ${e.kicker} ${e.facts.join(" ")} ${e.whyItMatters}`;
  return {
    subjectId: `explainer:${e.slug}`,
    subjectKind: "explainer",
    contentType: "explainer",
    today,
    title: e.title,
    summary: e.kicker,
    // The source named is the one the facts were written from. The validator's
    // attribution check reads this and the facts, so an explainer written from
    // a USCIS page may say "USCIS" and one written from the U.S. Code may not.
    sourceName: e.sources.map((s) => s.name).join("; "),
    sourceKey: `explainer:${e.group}`,
    publishedAt: null,
    effectiveAt: null,
    classification: null,
    severity: null,
    entities: [],
    dataPoints: e.facts,
    implications: [e.whyItMatters],
    allowedUrls: [urls.deepLink, urls.shareUrl, ...e.sources.map((s) => s.url)],
    deepLink: urls.deepLink,
    shareUrl: urls.shareUrl,
    figures: extractFigures(corpus),
    notes: [
      "This is an evergreen explanation, not a news event. Do not describe it as new, as a change, or as having just happened.",
      "State only the facts listed. Nothing here is legal or tax advice, and the post must not tell a reader what to do.",
      "Every sentence was written from the cited source. Do not add a detail the facts do not carry, however familiar it seems.",
    ],
  };
}

// -----------------------------------------------------------------------------
// DATA SIGNALS
// -----------------------------------------------------------------------------

export function buildSignalFacts(s: DataSignal, today: string): FactSet {
  const storyKey = `signal:${s.slug}`;
  const urls = trackedFor(signalPath(s.slug), "data_signal", storyKey);
  return {
    subjectId: `signal:${s.slug}`,
    subjectKind: "data_signal",
    contentType: "data_signal",
    today,
    title: s.title,
    summary: `${s.figure} — ${s.figureLabel}`,
    sourceName: s.sourceName,
    sourceKey: `signal:${s.group}`,
    publishedAt: null,
    effectiveAt: null,
    classification: null,
    severity: null,
    entities: [],
    dataPoints: s.points,
    implications: [],
    allowedUrls: [urls.deepLink, urls.shareUrl, absolute(s.explorePath), s.sourceUrl],
    deepLink: urls.deepLink,
    shareUrl: urls.shareUrl,
    // Extracted from the computed points and the figure, so every numeral the
    // engine is OFFERED is one deterministic code put there.
    figures: extractFigures(`${s.figure} ${s.figureLabel} ${s.points.join(" ")}`),
    notes: [
      `The figures are ${s.provenance === "reported" ? "reported by the source named" : "exact counts of ImmigrationClock's own records"}, for ${s.periodLabel}. State them as given; do not derive a new number — no shares, differences, averages or trends that are not written out above.`,
      ...s.caveats,
      "This is a data observation, not a news event. Do not describe it as new or as a change.",
    ],
  };
}

// -----------------------------------------------------------------------------
// DATA DISCOVERY
// -----------------------------------------------------------------------------

export function buildDiscoveryFacts(d: Discovery, today: string): FactSet {
  const storyKey = `discovery:${d.slug}`;
  const urls = trackedFor(d.path, "data_discovery", storyKey);
  return {
    subjectId: `discovery:${d.slug}`,
    subjectKind: "resource",
    contentType: "data_discovery",
    today,
    title: d.title,
    summary: d.need,
    sourceName: "ImmigrationClock",
    sourceKey: `discovery:${d.slug}`,
    publishedAt: null,
    effectiveAt: null,
    classification: null,
    severity: null,
    entities: [],
    dataPoints: d.facts,
    implications: [],
    allowedUrls: [urls.deepLink, urls.shareUrl],
    deepLink: urls.deepLink,
    shareUrl: urls.shareUrl,
    figures: extractFigures(`${d.need} ${d.facts.join(" ")}`),
    notes: [
      "This describes a tool ImmigrationClock offers. State only the capabilities listed; do not describe a feature the facts do not name.",
      ...d.caveats,
      "No sales language, no superlatives, no urgency. A reader who needs the tool will recognise the need.",
    ],
  };
}

// -----------------------------------------------------------------------------
// STANDING ASSETS — the first design's durable pages, retained for the archive
// -----------------------------------------------------------------------------

/**
 * A standing asset, with whatever its underlying data actually supports.
 *
 * Returns null when the asset has no grounded insight today — see
 * asset-facts.ts. No longer a selection pool: data signals and discovery posts
 * replaced it, with their own pages and cards. Kept so the ledger's history and
 * the asset-insight tests remain readable.
 */
export function buildAssetFacts(asset: StandingAsset, today: string): FactSet | null {
  const insight = assetInsights(asset.id, today);
  if (!insight) return null;

  const notes = [
    "This is an ImmigrationClock resource, not a news event. Lead with the finding, not with what the page contains.",
    ...insight.caveats,
  ];

  if (insight.numeric) {
    notes.push(
      "The figures above are the only ones you have, and they are already calculated. State them as given. Do not derive a new number from them — no shares, differences, averages, rates or comparisons that are not written out above."
    );
  }

  const storyKey = `asset:${asset.id}`;
  const urls = trackedFor(asset.path, "data_signal", storyKey);

  return {
    subjectId: `asset:${asset.id}`,
    subjectKind: "resource",
    contentType: "data_signal",
    today,
    title: asset.label,
    summary: asset.description,
    sourceName: insight.sourceName ?? "ImmigrationClock",
    sourceKey: `asset:${asset.id}`,
    publishedAt: null,
    effectiveAt: null,
    classification: null,
    severity: null,
    entities: [],
    dataPoints: insight.points,
    implications: [],
    allowedUrls: [urls.deepLink, urls.shareUrl],
    deepLink: urls.deepLink,
    shareUrl: urls.shareUrl,
    figures: insight.numeric ? extractFigures(insight.points.join(" ")) : [],
    notes,
  };
}
