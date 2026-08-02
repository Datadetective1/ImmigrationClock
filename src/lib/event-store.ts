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
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO
// Ad-hoc querying — by date, severity, classification — belongs to
// @/lib/event-index, which serves the browser from a slim payload. This module
// keeps only what needs the FULL event: the server-rendered feed, and the graph
// traversals whose semantics live nowhere else (an event that CHANGES an entity
// versus one that merely mentions it, versus one whose stated impact names it).
// Duplicating filters across both would give two answers to the same question.
// =============================================================================

import store from "./generated/events.json";
import {
  publishableEvents,
  sortEvents,
  eventsForEntity,
  primaryEventsForEntity,
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

/**
 * Adapters that ran without failing but returned nothing.
 *
 * `ok` means "did not fail", which is NOT the same as "is feeding us data". An
 * unconfigured source (Congress without its API key) reports ok and contributes
 * zero — correctly, because a missing key is a configuration gap rather than an
 * outage, and conflating the two would hide real outages in the build.
 *
 * But the reader-facing claim must not inherit that distinction. Counting a
 * source that has produced nothing toward "we track N sources" overstates
 * coverage, which is the one thing this platform promises not to do.
 */
export function silentAdapters() {
  return EVENT_STORE_META.adapters.filter((a) => a.ok && a.eventCount === 0);
}

/** Adapters that actually put events in the store. The only honest count. */
export function contributingAdapters() {
  return EVENT_STORE_META.adapters.filter((a) => a.ok && a.eventCount > 0);
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


/**
 * Honest one-line description of what the store currently covers. Rendered
 * wherever events are shown, so a thin feed is never mistaken for a quiet month.
 *
 * THE COUNT IS OF SOURCES THAT ACTUALLY CONTRIBUTED, not of sources that did not
 * fail. Those are different numbers, and the difference is exactly the kind of
 * quiet overstatement this platform exists not to make: at the time of writing,
 * eight adapters reported `ok` while seven had produced any events, because
 * Congress runs fine and ingests nothing until its API key is present. Saying
 * "eight sources" would have claimed coverage we did not have.
 *
 * A source that is registered and silent is disclosed separately rather than
 * absorbed into the headline, so a reader can see both what is feeding the
 * archive and what is not.
 */
export function eventCoverageNote(): string {
  const contributing = contributingAdapters().length;
  const failed = failedAdapters().length;
  const silent = silentAdapters().length;

  const parts = [
    `Tracking ${EVENTS.length} government events from ${contributing} automated ` +
      `source${contributing === 1 ? "" : "s"}, since ${EVENT_STORE_META.since}. ` +
      "More sources are being added — see the methodology page for the full list, " +
      "including the ones we do not yet ingest.",
  ];

  if (silent > 0) {
    parts.push(
      `${silent} further source${silent === 1 ? " is" : "s are"} connected but ` +
        `${silent === 1 ? "has" : "have"} contributed nothing yet, so ${silent === 1 ? "it is" : "they are"} not counted above.`
    );
  }
  if (failed > 0) {
    parts.push(
      `${failed} source${failed === 1 ? "" : "s"} failed on the last run, so recent items from ` +
        `${failed === 1 ? "it" : "them"} may be missing.`
    );
  }
  return parts.join(" ");
}
