// =============================================================================
// SCORING — reuse the newsletter's ranking model, don't reinvent it
//
// src/lib/newsletter/ranking.ts already answers "how consequential is this
// change?" with a positional-weight model whose factors strictly dominate one
// another: breadth, then obligation, then magnitude, then authority, then
// recency as a tie-break only. It was built to stop keyword strength deciding
// editorial priority, and it is tested.
//
// Social publishing asks the same question, so it uses the same model. The only
// work here is an adapter: rankingFactors() takes an ImmigrationEvent, the
// browser-side index carries the slimmer IndexedEvent, and the one field the
// model reads that the index does not carry — impact.countries — is derivable
// from entityIds.
//
// Two consequences worth being explicit about, because both are the point:
//   • an improvement to the newsletter's ranking improves social selection too
//   • the two surfaces can never disagree about which change matters more
//
// The thresholds below are the only social-specific judgement, and they are
// deliberately high. The system is designed to skip.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import type { ImmigrationEvent } from "@/domains/graph/events";
import { rankingFactors, explain as explainRanking } from "@/lib/newsletter/ranking";

/**
 * Present an IndexedEvent as the subset of ImmigrationEvent the ranking model
 * reads. The cast is safe because rankingFactors touches only these fields —
 * and tests/social-score asserts that stays true.
 */
function asRankable(e: IndexedEvent): ImmigrationEvent {
  const countries = (e.entityIds ?? [])
    .filter((id) => id.startsWith("country:"))
    .map((id) => id.slice("country:".length));

  return {
    id: e.id,
    title: e.title,
    summary: e.summary,
    severity: e.severity,
    classification: e.classification,
    publishedAt: e.publishedAt,
    effectiveAt: e.effectiveAt,
    sourceKey: e.sourceKey,
    sourceUrl: e.sourceUrl,
    // The ranking model reads only `impact.countries.length`, to tell
    // country-scoped rules (genuinely narrow) from category-scoped ones (often
    // very wide). The other facets are left empty rather than fabricated: this
    // is a projection of the index for ranking, not a claim about impact, and
    // nothing renders it.
    impact: countries.length
      ? {
          countries: countries.map((slug) => ({
            entityId: `country:${slug}`,
            basis: "matched" as const,
            confidence: 0.8,
          })),
          visaCategories: [],
          agencies: [],
          employers: [],
          universities: [],
          states: [],
          completeness: "partial" as const,
        }
      : undefined,
    entities: [],
    lastVerifiedAt: e.publishedAt,
    reviewStatus: "auto",
  } as ImmigrationEvent;
}

export interface ScoredEvent {
  event: IndexedEvent;
  score: number;
  explain: string;
}

/**
 * Score an event for social publishing.
 *
 * `from`/`to` bound the recency tie-break. They are passed explicitly rather
 * than read from a clock so a simulation and a production run of the same day
 * produce identical numbers.
 */
export function scoreEvent(e: IndexedEvent, from: string, to: string): ScoredEvent {
  const rankable = asRankable(e);
  const f = rankingFactors(rankable, from, to);
  return { event: e, score: f.score, explain: explainRanking(rankable, from, to) };
}

/**
 * How much of an obligation this document changes, 0-3, straight from the
 * newsletter's ranking model.
 *
 * Exposed so the `what_it_requires` angle can be EARNED rather than guessed.
 * The alternative — scanning the title for "fee" or "must" — is the keyword
 * strength the ranking model was built to stop deciding editorial questions.
 */
export function obligationLevel(e: IndexedEvent): number {
  return rankingFactors(asRankable(e), e.publishedAt, e.publishedAt).obligation;
}

export function scoreEvents(events: IndexedEvent[], from: string, to: string): ScoredEvent[] {
  return events
    .map((e) => scoreEvent(e, from, to))
    .sort((a, b) => b.score - a.score || a.event.id.localeCompare(b.event.id));
}

/**
 * PUBLICATION THRESHOLDS.
 *
 * Expressed against the ranking model's own weights so they mean something
 * structural rather than being magic numbers:
 *
 *   breadth=1000  obligation=100  magnitude=20  authority=4  recency=1
 *
 * NEWS (2100) — breadth 2 plus at least one obligation step. In plain terms:
 * it must reach more than a named sub-population AND change something someone
 * has to do, pay or qualify for. A routine notice about a form's edition date
 * clears neither and is silently never posted.
 *
 * KNOWLEDGE (2000) — breadth 2, no obligation floor. The afternoon slot is
 * explanatory, so a broadly-scoped item is worth explaining even when it does
 * not itself impose an obligation.
 */
export const NEWS_SCORE_FLOOR = 2100;
export const KNOWLEDGE_SCORE_FLOOR = 2000;

/**
 * Severities the system will never post about, whatever they score.
 *
 * Routine means "scheduled release or administrative update" — form edition
 * dates, information-collection notices, technical amendments. Posting those is
 * exactly the filler the governing principle forbids.
 */
export function isPostableSeverity(e: IndexedEvent): boolean {
  return e.severity === "major" || e.severity === "notable";
}

/**
 * Classifications that describe a real change rather than an administrative
 * housekeeping act. `announcement` is included because USCIS newsroom items are
 * often the first public statement of a substantive policy shift, but it must
 * still clear the severity and score gates above.
 */
const SUBSTANTIVE_CLASSIFICATIONS = new Set([
  "final_rule",
  "proposed_rule",
  "executive_action",
  "court_decision",
  "legislative_action",
  "updated_information",
  "announcement",
  "new_information",
]);

export function isSubstantive(e: IndexedEvent): boolean {
  return SUBSTANTIVE_CLASSIFICATIONS.has(e.classification);
}
