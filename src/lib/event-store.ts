// =============================================================================
// EVENT STORE — the app's read path into the knowledge graph
//
// Reads src/lib/generated/events.json, built by scripts/build-events.ts from
// every source adapter. This is the single module the site reads events through:
// "What Changed", entity pages, timelines, alerts, the newsletter, and any
// future API all consume the same store, so they can never disagree about what
// happened.
//
// Nothing here fetches. The store is generated at build time and committed, in
// the same shape as the WARN and employer snapshots, which keeps the site a
// static export and keeps a source outage from taking pages down.
// =============================================================================

import store from "./generated/events.json";
import {
  publishableEvents,
  sortEvents,
  eventsForEntity,
  primaryEventsForEntity,
  type EventClassification,
  type EventSeverity,
  type ImmigrationEvent,
} from "@/domains/graph/events";
import type { EntityId } from "@/domains/graph/entities";

interface EventStoreFile {
  generatedAt: string;
  since: string;
  events: ImmigrationEvent[];
  adapters: {
    key: string;
    name: string;
    status: string;
    lastRunAt: string | null;
    ok: boolean;
    eventCount: number;
    warnings: string[];
  }[];
  counts: {
    total: number;
    bySeverity: Record<string, number>;
    byClassification: Record<string, number>;
  };
}

const FILE = store as unknown as EventStoreFile;

/** Every event, drafts excluded, newest first. */
export const EVENTS: ImmigrationEvent[] = sortEvents(
  publishableEvents((FILE.events ?? []) as ImmigrationEvent[])
);

export const EVENT_STORE_META = {
  generatedAt: FILE.generatedAt,
  since: FILE.since,
  counts: FILE.counts,
  adapters: FILE.adapters ?? [],
};

/**
 * Adapters whose most recent run failed.
 *
 * Surfaced on the status page rather than swallowed: if a source stopped
 * reporting, a reader looking at a quiet feed deserves to know the feed is
 * quiet because we lost the source, not because nothing happened.
 */
export function failedAdapters() {
  return EVENT_STORE_META.adapters.filter((a) => !a.ok);
}

/** Events published on or after a date. */
export function eventsSince(isoDate: string): ImmigrationEvent[] {
  return EVENTS.filter((e) => e.publishedAt >= isoDate);
}

/** The most recent N events. */
export function recentEvents(limit = 20): ImmigrationEvent[] {
  return EVENTS.slice(0, limit);
}

/**
 * Events that actually represent change, for the "What Changed" surface.
 *
 * Routine paperwork notices are real documents and stay in the store, in search,
 * and on entity pages — but they must not lead a feed whose promise is "here is
 * what changed". Manufacturing importance is exactly what the Directive warns
 * against; so is burying a rule under fifty information-collection notices.
 */
export function significantEvents(limit = 20): ImmigrationEvent[] {
  return EVENTS.filter((e) => e.severity !== "routine").slice(0, limit);
}

export function eventsBySeverity(severity: EventSeverity): ImmigrationEvent[] {
  return EVENTS.filter((e) => e.severity === severity);
}

export function eventsByClassification(c: EventClassification): ImmigrationEvent[] {
  return EVENTS.filter((e) => e.classification === c);
}

/** Every event touching an entity, in any relation. */
export function eventsForEntityId(id: EntityId): ImmigrationEvent[] {
  return eventsForEntity(EVENTS, id);
}

/** Events that CHANGE an entity, rather than merely mentioning it. */
export function primaryEventsForEntityId(id: EntityId): ImmigrationEvent[] {
  return primaryEventsForEntity(EVENTS, id);
}

/**
 * Events whose stated impact names an entity — the "does this affect me?" query.
 *
 * Distinct from `eventsForEntityId`: a rule can MENTION India in passing without
 * affecting Indian nationals. Only stated impact answers the question a reader
 * is actually asking.
 */
export function eventsAffecting(id: EntityId): ImmigrationEvent[] {
  return EVENTS.filter((e) => {
    const im = e.impact;
    if (!im) return false;
    return [...im.countries, ...im.visaCategories, ...im.states, ...im.employers, ...im.universities].some(
      (x) => x.entityId === id && x.basis === "stated"
    );
  });
}

/** Events grouped by publication date, newest day first. For the daily feed. */
export function eventsByDay(limit = 7): { date: string; events: ImmigrationEvent[] }[] {
  const days = new Map<string, ImmigrationEvent[]>();
  for (const e of EVENTS) {
    const list = days.get(e.publishedAt) ?? [];
    list.push(e);
    days.set(e.publishedAt, list);
  }
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, limit)
    .map(([date, events]) => ({ date, events }));
}

/**
 * Honest one-line description of what the store currently covers. Rendered
 * wherever events are shown, so a thin feed is never mistaken for a quiet month.
 */
export function eventCoverageNote(): string {
  const live = EVENT_STORE_META.adapters.filter((a) => a.ok).length;
  const failed = failedAdapters().length;
  const base =
    `Tracking ${EVENTS.length} government events from ${live} automated source${live === 1 ? "" : "s"}, ` +
    `since ${EVENT_STORE_META.since}. More sources are being added — see the methodology page for the full list, ` +
    "including the ones we do not yet ingest.";
  return failed > 0
    ? `${base} ${failed} source${failed === 1 ? "" : "s"} failed on the last run, so recent items from ${failed === 1 ? "it" : "them"} may be missing.`
    : base;
}
