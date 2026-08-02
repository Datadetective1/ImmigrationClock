// =============================================================================
// EVENT SEARCH INDEX — the browser's view of the archive
//
// /what-changed has to let a reader search and filter the WHOLE archive, and on
// a static site that means the data reaches the client. The full event store is
// 332KB at 190 events and grows without bound, so shipping it would put every
// evidence quote and limitation into a page bundle to support a text box.
//
// This module reads the slim index that scripts/build-events.ts writes from the
// same merged list in the same run — the two cannot drift, because there is no
// second pipeline to forget.
//
// The filter functions are PURE and live here rather than inside the component,
// so the rules that decide what a reader sees are testable without rendering
// anything.
// =============================================================================

import indexFile from "./generated/events-index.json";
import type { EventClassification, EventSeverity } from "@/domains/graph/events";

export interface IndexedEvent {
  id: string;
  title: string;
  publishedAt: string;
  effectiveAt: string | null;
  scheduled: boolean;
  severity: EventSeverity;
  classification: EventClassification;
  sourceKey: string;
  sourceUrl: string;
  summary: string;
  entityIds: string[];
}

interface IndexFile {
  generatedAt: string;
  events: IndexedEvent[];
}

const FILE = indexFile as unknown as IndexFile;

/** Every indexed event, newest first. */
export const EVENT_INDEX: IndexedEvent[] = [...(FILE.events ?? [])].sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt)
);

export interface EventFilters {
  /** Free text over title and summary. */
  q?: string;
  severity?: EventSeverity[];
  classification?: EventClassification[];
  sourceKey?: string[];
  /** Only events linked to this entity — the "does this affect me" filter. */
  entityId?: string;
  /** Inclusive ISO bounds. */
  from?: string;
  to?: string;
}

/**
 * Match free text against an event.
 *
 * SUBSTRING matching is correct HERE, unlike in the adapters' keyword lists
 * where it caused three separate bugs. The difference is who is choosing the
 * term: a reader typing "visa" wants "visas" and "Visa Bulletin" to match, and
 * they can see the results and refine. An adapter's hardcoded keyword deciding
 * classification has no such feedback loop, which is why those use whole-term
 * matching. The asymmetry is deliberate, not an inconsistency.
 */
function matchesText(e: IndexedEvent, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  // Every whitespace-separated term must appear somewhere, so adding a word
  // narrows rather than widens — what a reader expects from a search box.
  const hay = `${e.title} ${e.summary} ${e.sourceKey}`.toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

export function filterEvents(events: IndexedEvent[], f: EventFilters): IndexedEvent[] {
  return events.filter((e) => {
    if (f.severity?.length && !f.severity.includes(e.severity)) return false;
    if (f.classification?.length && !f.classification.includes(e.classification)) return false;
    if (f.sourceKey?.length && !f.sourceKey.includes(e.sourceKey)) return false;
    if (f.entityId && !e.entityIds.includes(f.entityId)) return false;
    if (f.from && e.publishedAt < f.from) return false;
    if (f.to && e.publishedAt > f.to) return false;
    if (f.q && !matchesText(e, f.q)) return false;
    return true;
  });
}

/** True when no filter is set — used to decide between the feed and results. */
export function hasActiveFilters(f: EventFilters): boolean {
  return Boolean(
    f.q?.trim() ||
      f.severity?.length ||
      f.classification?.length ||
      f.sourceKey?.length ||
      f.entityId ||
      f.from ||
      f.to
  );
}

/** Facet counts for the CURRENT result set, so a reader can see what narrowing costs. */
export function facetCounts(events: IndexedEvent[]) {
  const bySeverity: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const e of events) {
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
    byClassification[e.classification] = (byClassification[e.classification] ?? 0) + 1;
    bySource[e.sourceKey] = (bySource[e.sourceKey] ?? 0) + 1;
  }
  return { bySeverity, byClassification, bySource };
}

/** Distinct source keys present in the index, for building the filter UI. */
export function indexedSourceKeys(): string[] {
  return [...new Set(EVENT_INDEX.map((e) => e.sourceKey))].sort();
}


/** Group results by publication day, newest first. */
export function groupByDay(events: IndexedEvent[]): { date: string; events: IndexedEvent[] }[] {
  const days = new Map<string, IndexedEvent[]>();
  for (const e of events) {
    const list = days.get(e.publishedAt) ?? [];
    list.push(e);
    days.set(e.publishedAt, list);
  }
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, evts]) => ({ date, events: evts }));
}

/**
 * Result ordering.
 *
 * Lives here rather than in the explorer component for two reasons: pure logic
 * belongs beside the other pure filters, and exporting a non-component value
 * from a "use client" component file breaks Fast Refresh — Next warns about it
 * explicitly, and the dev server was doing a full reload on every edit.
 *
 * The comparator is TOTAL. Equal keys fall back to date and then to id, so the
 * order can never depend on the engine's sort stability — otherwise a reader who
 * changes a filter and comes back sees rows rearranged for no reason they can
 * perceive.
 */
export type SortOrder = "newest" | "oldest" | "importance";

const SEVERITY_RANK: Record<EventSeverity, number> = { major: 0, notable: 1, routine: 2 };

export function sortResults(events: IndexedEvent[], order: SortOrder): IndexedEvent[] {
  const out = [...events];
  out.sort((a, b) => {
    if (order === "importance") {
      const d = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (d !== 0) return d;
    }
    const dateCmp =
      order === "oldest"
        ? a.publishedAt.localeCompare(b.publishedAt)
        : b.publishedAt.localeCompare(a.publishedAt);
    if (dateCmp !== 0) return dateCmp;
    return a.id.localeCompare(b.id);
  });
  return out;
}
