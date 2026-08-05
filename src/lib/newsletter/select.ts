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
import { KEY_DATES, nextOccurrence } from "@/lib/key-dates";
import {
  CADENCE_WINDOW_DAYS,
  type Issue,
  type IssueItem,
  type IssueStat,
  type ResourceLink,
  type Segment,
  type UpcomingDate,
  type WatchTopic,
} from "./types";

/**
 * How many stories one edition carries.
 *
 * A newsletter is an edit, not a dump. Past roughly six items readers stop
 * reading rather than scroll, and the archive is one click away for anyone who
 * wants everything — the issue says how many it left out.
 */
export const MAX_ITEMS = 6;

/** How many stories the personalized lead group carries before the general feed. */
export const MAX_LEAD_ITEMS = 3;

/**
 * WHAT WE WATCH CLOSELY ENOUGH TO REPORT ITS SILENCE.
 *
 * "No changes to DACA this week" is the most reassuring sentence this product
 * can print, and the most dangerous to get wrong — people act on reassurance.
 * So an entry may only name entities that EXIST in the resolution vocabulary
 * (src/domains/graph/entities.ts). If we could not have detected a change, we
 * do not get to say there wasn't one.
 *
 * Two topics were requested and deliberately left out:
 *   • the Green Card lottery / Diversity Visa — no entity, so a DV change would
 *     not attach to anything and we would report silence we had not verified;
 *   • citizenship requirements — "USCIS" is an agency, not a naturalisation
 *     topic, and matching on the agency would call every USCIS notice a
 *     citizenship change.
 *
 * Both become watchable the moment an entity for them is seeded. Until then,
 * omitting them is the honest option.
 */
export const WATCHLIST: WatchTopic[] = [
  { key: "h1b", entityIds: ["visa:h-1b", "topic:h1b"] },
  { key: "daca", entityIds: ["visa:daca"] },
  { key: "tps", entityIds: ["visa:tps"] },
  { key: "asylum", entityIds: ["visa:asylum", "visa:refugee"] },
  { key: "students", entityIds: ["visa:f-1", "topic:international-students"] },
  { key: "employmentGreenCard", entityIds: ["visa:eb-1", "visa:eb-2", "visa:eb-3", "visa:eb-5"] },
];

/** The six destinations the footer rotates through, three at a time. */
const RESOURCE_POOL: ResourceLink[] = [
  { key: "searchVisa", href: "/search" },
  { key: "greenCard", href: "/for-you" },
  { key: "processingTimes", href: "/key-dates" },
  { key: "citizenship", href: "/explained" },
  { key: "h1b", href: "/h1b/employers" },
  { key: "countries", href: "/migration-map" },
];

/** Average adult reading speed for informational prose. */
const WORDS_PER_MINUTE = 200;

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
 * Stat keys worth saying were ZERO.
 *
 * Deliberately a short list. "No Executive Orders this week" is reassurance;
 * "No DHS announcements" is noise, and a snapshot full of negatives reads as
 * padding. These two are the categories readers actively worry about.
 */
const REPORT_ABSENT = ["executive_actions", "court_decisions"] as const;

function absentStatKeys(events: ImmigrationEvent[]): string[] {
  const present = new Set(statsFor(events).map((s) => s.key));
  return REPORT_ABSENT.filter((k) => !present.has(k));
}


/**
 * Topics we monitor that recorded NOTHING in the window.
 *
 * Computed against the FULL window set, not the capped item list — a topic that
 * produced a routine notice has not been silent, and saying so would be wrong
 * in the reassuring direction.
 */
function unchangedTopics(windowEvents: ImmigrationEvent[]): WatchTopic[] {
  const touched = new Set<string>();
  for (const e of windowEvents) for (const l of e.entities) touched.add(l.entityId);
  return WATCHLIST.filter((w) => !w.entityIds.some((id) => touched.has(id)));
}

/** The next few official dates, so an issue looks forward as well as back. */
function upcomingDates(today: string, limit = 4): UpcomingDate[] {
  const from = new Date(`${today}T00:00:00Z`);
  const dated = KEY_DATES.filter((d) => d.month && d.day).map((d) => {
    const next = nextOccurrence(d.month!, d.day!, from);
    return {
      title: d.title,
      detail: d.detail,
      date: next.toISOString().slice(0, 10),
      sourceName: d.sourceName,
      sourceUrl: d.sourceUrl,
      _sort: next.getTime(),
    };
  });
  const recurring = KEY_DATES.filter((d) => !d.month && d.cadence).map((d) => ({
    title: d.title,
    detail: d.detail,
    cadence: d.cadence,
    sourceName: d.sourceName,
    sourceUrl: d.sourceUrl,
    _sort: Number.MAX_SAFE_INTEGER,
  }));
  return [...dated, ...recurring]
    .sort((a, b) => a._sort - b._sort)
    .slice(0, limit)
    .map(({ _sort, ...rest }) => rest as UpcomingDate);
}

/**
 * Three of six, rotated by ISO week.
 *
 * Deterministic rather than random: the same issue rebuilt must produce the
 * same bytes, or the archive diff becomes noise and idempotency is a fiction.
 */
function rotateResources(today: string, count = 3): ResourceLink[] {
  const start = Date.UTC(new Date(`${today}T00:00:00Z`).getUTCFullYear(), 0, 1);
  const week = Math.floor((Date.parse(`${today}T00:00:00Z`) - start) / (7 * 86_400_000));
  const offset = ((week % RESOURCE_POOL.length) + RESOURCE_POOL.length) % RESOURCE_POOL.length;
  return Array.from({ length: count }, (_, i) => RESOURCE_POOL[(offset + i) % RESOURCE_POOL.length]);
}

/** Whole minutes, rounded up, with a floor of one. */
function readingMinutes(items: IssueItem[]): number {
  const words = items.reduce(
    (n, it) =>
      n +
      it.title.split(/\s+/).length +
      it.summary.split(/\s+/).length +
      (it.whyItMatters ? it.whyItMatters.split(/\s+/).length : 0),
    0
  );
  // The chrome — headings, snapshot, dates, footer — is roughly 150 words.
  return Math.max(1, Math.ceil((words + 150) / WORDS_PER_MINUTE));
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

  // PERSONALIZATION. When the segment names entities, the stories matching the
  // FIRST of them lead the issue under their own heading, and the general feed
  // takes what is left. An H-1B subscriber sees "Top H-1B changes" before
  // general immigration news — one branch here, nothing in the renderer.
  let lead: Issue["lead"];
  let rest = ordered;
  const leadEntity = segment.entityIds?.[0];
  if (leadEntity) {
    const matching = ordered.filter((e) => e.entities.some((l) => l.entityId === leadEntity));
    if (matching.length > 0) {
      const leadIds = new Set(matching.slice(0, MAX_LEAD_ITEMS).map((e) => e.id));
      lead = {
        entityId: leadEntity,
        label: labelForEntity(leadEntity),
        items: matching.slice(0, MAX_LEAD_ITEMS).map((e) => toItem(e, today)),
      };
      rest = ordered.filter((e) => !leadIds.has(e.id));
    }
  }

  const items = rest.slice(0, MAX_ITEMS).map((e) => toItem(e, today));

  return {
    id: `${segment.id}-${today}`,
    segment,
    from,
    to: today,
    issuedAt: today,
    items,
    lead,
    stats: statsFor(inWindow),
    absentStats: absentStatKeys(inWindow),
    unchanged: unchangedTopics(inWindow),
    upcoming: upcomingDates(today),
    resources: rotateResources(today),
    readingMinutes: readingMinutes([...(lead?.items ?? []), ...items]),
    totalInWindow: inWindow.length,
  };
}
