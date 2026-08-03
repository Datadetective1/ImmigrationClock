// =============================================================================
// KNOWLEDGE GRAPH — EVENTS (the spine)
//
// Founder Directive Part 4 specifies the event contract exactly:
//   stable identifier · source agency · published date · effective date ·
//   data-through date · classification · severity · summary · related entities ·
//   original source URL · last verification timestamp
//
// This module implements that contract, and nothing here is specific to any one
// source. The Federal Register is one adapter among sixteen named in the
// long-term architecture; USCIS newsroom, the Visa Bulletin, Executive Orders,
// Presidential Proclamations, federal courts, Congress, PERM, state agencies and
// the rest all produce the SAME `ImmigrationEvent` shape. That is what makes a
// connected knowledge graph possible instead of sixteen parallel feeds.
//
// "Events become the foundation for pages, timelines, alerts, newsletters, APIs,
//  and AI." — Directive Part 4. Every one of those consumers reads this type.
// =============================================================================

import type { EntityId } from "./entities";
import { validateImpact, type EventImpact } from "./impact";
import type { Provenance } from "@/lib/types";

/**
 * What KIND of change this is. Directive Part 3 requires the platform to
 * distinguish these, because they mean very different things to a reader:
 * a corrected figure is not the same as a new one, and a proposed rule is not
 * a rule.
 */
export type EventClassification =
  /** Information published for the first time. */
  | "new_information"
  /** A previously published item updated in place. */
  | "updated_information"
  /** The publisher corrected something they got wrong. */
  | "correction"
  /** Historical values revised — the past changed, not the present. */
  | "historical_revision"
  /** An agency announcement with no dataset attached. */
  | "announcement"
  /** A scheduled statistical release. */
  | "data_release"
  /** A proposed rule open for comment. NOT yet in force. */
  | "proposed_rule"
  /** A final rule with an effective date. */
  | "final_rule"
  /** Executive Order, Presidential Proclamation, or memorandum. */
  | "executive_action"
  /** A court decision affecting immigration administration. */
  | "court_decision"
  /** Introduced, advanced, or enacted legislation. */
  | "legislative_action"
  /** A deadline, filing window, or lottery date. */
  | "deadline";

/**
 * How much this matters. Deliberately coarse: a finer scale invites false
 * precision, and the Directive warns against manufacturing importance.
 *
 * Severity is assigned by explicit, auditable RULES per adapter — never by a
 * model, and never by engagement. See docs/change-detection-methodology.md.
 */
export type EventSeverity =
  /** Changes who can do what. Rules in force, EOs, court decisions. */
  | "major"
  /** Meaningful movement or a proposal that would change things if finalised. */
  | "notable"
  /** Scheduled releases and routine updates. */
  | "routine";

export const SEVERITY_ORDER: Record<EventSeverity, number> = {
  major: 0,
  notable: 1,
  routine: 2,
};

/** How an entity relates to an event. Typed, so the graph has real edges. */
export type EventRelation =
  /** The event is issued by this entity (an agency). */
  | "issued_by"
  /** The event directly changes this entity's rules or status. */
  | "affects"
  /** The event references this entity without changing it. */
  | "mentions"
  /** The event supersedes or amends this entity (a rule, EO, or policy). */
  | "amends"
  /** The event is filed under this topic. */
  | "categorized_as";

export interface EventEntityLink {
  entityId: EntityId;
  relation: EventRelation;
  /**
   * How the link was established. `explicit` means the source itself named the
   * entity in a structured field. `matched` means we resolved it from text.
   * Never collapse these: an explicit link is a fact from the publisher, a
   * matched link is our inference and can be wrong.
   */
  basis: "explicit" | "matched";
  /** 0–1. Only meaningful for `matched`; always 1 for `explicit`. */
  confidence: number;
}

/**
 * A single immigration event. The atomic unit of the platform.
 *
 * Every field that could mislead if conflated is separate. In particular the
 * FOUR dates are genuinely different questions:
 *   publishedAt   — when the source published it
 *   effectiveAt   — when it takes/took legal effect (often later, sometimes null)
 *   dataThrough   — the last period the underlying data covers (statistical only)
 *   lastVerifiedAt— when we last confirmed the source URL still resolves
 */
export interface ImmigrationEvent {
  /**
   * Stable, deterministic id: `<sourceKey>:<sourceNativeId>`. Re-ingesting the
   * same document MUST produce the same id, or the change feed will report the
   * same event as new every time it runs.
   */
  id: string;

  /** Key into the canonical source registry (src/lib/sources.ts). */
  sourceKey: string;
  /** Entity id of the issuing agency, e.g. "agency:uscis". */
  issuingAgencyId?: EntityId;

  classification: EventClassification;
  severity: EventSeverity;

  /** One neutral sentence. No advocacy, no prediction, no advice. */
  title: string;
  /** 2–4 neutral sentences. Must be supportable by the source alone. */
  summary: string;
  /**
   * Why this matters, in plain English. Directive Part 3 requires it. Written
   * from the source's own content — never speculation about political intent.
   */
  whyItMatters?: string;
  /**
   * WHO IS AFFECTED — the platform's signature answer.
   *
   * Structured rather than prose, so it can drive entity pages, alerts, and
   * "does this affect me?" filtering. Distinguishes what the document STATES
   * from what we inferred, and carries a completeness flag so a partial list is
   * never presented as exhaustive. See src/domains/graph/impact.ts.
   */
  impact?: EventImpact;

  publishedAt: string; // ISO date
  /**
   * True when `publishedAt` is still in the future — the document is on public
   * inspection and scheduled to publish. The UI MUST word this as "scheduled for
   * publication on X", never "published X". Set by the adapter, enforced by
   * validateEvent().
   */
  scheduled?: boolean;
  effectiveAt?: string | null;
  dataThrough?: string | null;
  lastVerifiedAt: string;

  /** The original government document. Never a secondary report. */
  sourceUrl: string;
  /** Optional machine-readable form of the same document. */
  sourceDataUrl?: string;

  /** Typed edges into the graph. */
  entities: EventEntityLink[];

  /**
   * Classification of any FIGURE quoted in the summary. Absent when the event
   * carries no numbers.
   */
  provenance?: Provenance;

  /**
   * Human review gate. Directive Part 4 permits AI to draft summaries only AFTER
   * structured extraction, and Part 3 forbids auto-publishing generated
   * explainers. Anything with `reviewStatus: "draft"` is invisible to the public
   * site regardless of how it was produced.
   */
  reviewStatus: "auto" | "draft" | "approved";

  /** Free-text caveats that must render with the event. */
  limitations?: string[];
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;
}

/**
 * Is this document STILL awaiting publication?
 *
 * Derived, never read from the stored `scheduled` flag. The flag is an
 * ingest-time observation ("the Federal Register had this on public inspection
 * when we fetched it") and it does not expire on its own — so a card driven by
 * the flag goes on saying "scheduled for publication on 3 August" on the 4th,
 * the 5th, and forever.
 *
 * The only thing that decides this is whether the publication date has arrived,
 * so that is the only thing consulted. Callers pass `today` explicitly so a
 * server render and a test can both pin it.
 */
export function isScheduled(
  e: Pick<ImmigrationEvent, "publishedAt">,
  today = new Date().toISOString().slice(0, 10)
): boolean {
  return e.publishedAt > today;
}

/** Events safe to show publicly. `draft` never renders. */
export function publishableEvents(events: ImmigrationEvent[]): ImmigrationEvent[] {
  return events.filter((e) => e.reviewStatus !== "draft");
}

/** Newest first, breaking ties by severity so a major item leads its day. */
export function sortEvents(events: ImmigrationEvent[]): ImmigrationEvent[] {
  return [...events].sort((a, b) => {
    if (a.publishedAt !== b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    return SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  });
}

/** Every event touching an entity, in any relation. */
export function eventsForEntity(events: ImmigrationEvent[], id: EntityId): ImmigrationEvent[] {
  return sortEvents(events.filter((e) => e.entities.some((l) => l.entityId === id)));
}

/**
 * Events an entity page should lead with: those the event actually CHANGES,
 * rather than merely mentions. Prevents a country page filling up with rules
 * that named it once in a footnote.
 */
export function primaryEventsForEntity(
  events: ImmigrationEvent[],
  id: EntityId
): ImmigrationEvent[] {
  return sortEvents(
    events.filter((e) =>
      e.entities.some(
        (l) =>
          l.entityId === id &&
          (l.relation === "affects" || l.relation === "issued_by" || l.relation === "amends")
      )
    )
  );
}

/** Deduplicate by id, keeping the first occurrence. Adapters can overlap. */
export function dedupeEvents(events: ImmigrationEvent[]): ImmigrationEvent[] {
  const seen = new Set<string>();
  const out: ImmigrationEvent[] = [];
  for (const e of events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

/**
 * Structural validation. Runs at build time, not render time: a malformed event
 * must fail the build rather than reach a reader.
 *
 * These checks encode the Directive's non-negotiables — a traceable source, a
 * real date, and no unsupported claim slipping through as a "summary".
 */
export function validateEvent(e: ImmigrationEvent): string[] {
  const errors: string[] = [];
  const iso = /^\d{4}-\d{2}-\d{2}$/;

  if (!e.id.includes(":")) errors.push(`${e.id}: id must be "<sourceKey>:<nativeId>"`);
  if (!e.sourceKey) errors.push(`${e.id}: missing sourceKey`);
  if (!/^https?:\/\//.test(e.sourceUrl)) errors.push(`${e.id}: sourceUrl must be an absolute URL`);
  if (!iso.test(e.publishedAt)) errors.push(`${e.id}: publishedAt must be ISO yyyy-mm-dd`);
  if (e.effectiveAt && !iso.test(e.effectiveAt)) errors.push(`${e.id}: effectiveAt must be ISO`);
  if (!iso.test(e.lastVerifiedAt)) errors.push(`${e.id}: lastVerifiedAt must be ISO`);
  if (!e.title.trim()) errors.push(`${e.id}: missing title`);
  if (!e.summary.trim()) errors.push(`${e.id}: missing summary`);

  const today = new Date().toISOString().slice(0, 10);
  // A future publication date is legitimate for some sources — the Federal
  // Register places documents on public inspection days before their official
  // publication date. That is real, citable information and should not be
  // discarded. What it must NOT do is render as if already published, so the
  // event has to declare itself scheduled rather than quietly carrying a future
  // date. Anything beyond a short window is a data error, not a schedule.
  if (e.publishedAt > today) {
    if (!e.scheduled) {
      errors.push(`${e.id}: publishedAt is in the future but the event is not marked scheduled`);
    }
    if (daysBetween(today, e.publishedAt) > 30) {
      errors.push(`${e.id}: publishedAt is more than 30 days in the future`);
    }
  }
  // NOT an error: `scheduled` records what the SOURCE said at ingest — that the
  // document was on public inspection ahead of its publication date. That
  // observation stays true forever; what changes is the calendar. A document
  // ingested on the 2nd for publication on the 3rd would otherwise turn the
  // whole store invalid overnight, which is the passage of time being reported
  // as data corruption.
  //
  // Whether an event is scheduled RIGHT NOW is a question about today, so it is
  // derived at read time by isScheduled() rather than trusted from the flag.
  if (e.lastVerifiedAt > today) errors.push(`${e.id}: lastVerifiedAt is in the future`);

  if (e.impact) errors.push(...validateImpact(e.impact, e.id));

  for (const l of e.entities) {
    if (!l.entityId.includes(":")) errors.push(`${e.id}: malformed entity id "${l.entityId}"`);
    if (l.confidence < 0 || l.confidence > 1) errors.push(`${e.id}: confidence out of range`);
    if (l.basis === "explicit" && l.confidence !== 1) {
      errors.push(`${e.id}: an explicit link must have confidence 1`);
    }
  }

  // A proposed rule is not in force. Giving one an effective date would tell a
  // reader something false about their obligations.
  if (e.classification === "proposed_rule" && e.effectiveAt) {
    errors.push(`${e.id}: a proposed_rule must not carry an effectiveAt`);
  }
  return errors;
}
