// =============================================================================
// ISSUE SELECTION — turning the archive into one edition
//
// The only place that decides WHAT goes in a newsletter. Rendering never
// filters, so every edition type reaches the template through this one funnel:
//
//   weekly digest      cadence "weekly", no entity filter
//   daily digest       cadence "daily"
//   breaking alert     cadence "breaking", minSeverity "major", excludeIds
//   H-1B edition       entityIds ["visa:h-1b"]
//   India edition      entityIds ["country:india"]
//   personalized       entityIds from the subscriber's own follows
//
// None of those need new code. That is the point.
// =============================================================================

import { EVENTS } from "@/lib/event-store";
import { SEVERITY_ORDER, isScheduled, type ImmigrationEvent } from "@/domains/graph/events";
import { isNotInForce } from "@/lib/event-labels";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { labelForEntity } from "@/lib/entity-labels";
import { CADENCE_WINDOW_DAYS, type Issue, type IssueItem, type IssueStat, type Segment } from "./types";

/**
 * How many stories one edition carries.
 *
 * A newsletter is an edit, not a dump. Past roughly six items readers stop
 * reading rather than scroll, and the archive is one click away for anyone who
 * wants everything — the issue says how many it left out.
 */
export const MAX_ITEMS = 6;

export interface SelectOptions {
  segment: Segment;
  /** Defaults to today. Injectable so tests and backfills are deterministic. */
  today?: string;
  /** Ids already sent — used by breaking alerts to avoid repeating a story. */
  excludeIds?: ReadonlySet<string>;
  /** Overrides the cadence window. Used by backfills. */
  windowDays?: number;
}

function daysBefore(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Agency name for the card, from the event's own explicit issuer link. */
function agencyFor(e: ImmigrationEvent): string {
  const explicit = e.issuingAgencyId ?? e.entities.find((l) => l.relation === "issued_by")?.entityId;
  return explicit ? labelForEntity(explicit) : (SOURCE_BY_KEY[e.sourceKey]?.agency ?? "—");
}

function toItem(e: ImmigrationEvent, today: string): IssueItem {
  return {
    id: e.id,
    title: e.title,
    summary: e.summary,
    // Passed through only when the event carries one. The newsletter never
    // writes a "why it matters" the archive does not already hold.
    whyItMatters: e.whyItMatters,
    agency: agencyFor(e),
    sourceName: SOURCE_BY_KEY[e.sourceKey]?.name ?? e.sourceKey,
    sourceUrl: e.sourceUrl,
    publishedAt: e.publishedAt,
    severity: e.severity,
    classification: e.classification,
    scheduled: isScheduled(e, today),
    notInForce: isNotInForce(e.classification),
  };
}

/** Counts worth stating. Zero-valued keys are dropped rather than shown as 0. */
function statsFor(events: ImmigrationEvent[]): IssueStat[] {
  const count = (fn: (e: ImmigrationEvent) => boolean) => events.filter(fn).length;
  const candidates: IssueStat[] = [
    { key: "uscis_policy", value: count((e) => e.sourceKey.startsWith("uscis")) },
    { key: "executive_actions", value: count((e) => e.classification === "executive_action") },
    { key: "federal_register", value: count((e) => e.sourceKey === "federal_register") },
    { key: "court_decisions", value: count((e) => e.classification === "court_decision") },
    { key: "dhs_announcements", value: count((e) => e.entities.some((l) => l.entityId === "agency:dhs")) },
    { key: "total_recorded", value: events.length },
  ];
  return candidates.filter((s) => s.value > 0);
}

/**
 * Build one issue.
 *
 * Pure with respect to the store: it reads EVENTS and returns a value. No
 * network, no writes, no clock unless you let it default — which is what makes
 * the whole pipeline testable without mocking anything.
 */
export function selectIssue(opts: SelectOptions): Issue {
  const { segment } = opts;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const windowDays = opts.windowDays ?? CADENCE_WINDOW_DAYS[segment.cadence];
  const from = daysBefore(today, windowDays);

  const minRank = SEVERITY_ORDER[segment.minSeverity ?? "notable"];
  const wanted = segment.entityIds?.length ? new Set(segment.entityIds) : null;

  const inWindow = EVENTS.filter((e) => {
    if (e.publishedAt < from || e.publishedAt > today) return false;
    if (opts.excludeIds?.has(e.id)) return false;
    if (SEVERITY_ORDER[e.severity] > minRank) return false;
    if (wanted && !e.entities.some((l) => wanted.has(l.entityId))) return false;
    return true;
  });

  // Most important first, then newest. A reader who opens on a phone and reads
  // one card should have read the one that matters most.
  const ordered = [...inWindow].sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return b.publishedAt.localeCompare(a.publishedAt);
  });

  return {
    id: `${segment.id}-${today}`,
    segment,
    from,
    to: today,
    issuedAt: today,
    items: ordered.slice(0, MAX_ITEMS).map((e) => toItem(e, today)),
    stats: statsFor(inWindow),
    totalInWindow: inWindow.length,
  };
}
