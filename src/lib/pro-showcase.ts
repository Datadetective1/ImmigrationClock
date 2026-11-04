// =============================================================================
// WHAT THE PRO PAGE SHOWS, BUILT FROM THE REAL DATA
//
// The Pro page has no customers to quote, so it shows the product instead:
// one forecast and one alert, each produced by the same code a subscriber gets,
// run on the latest official bulletin at build time. Nothing here is typed by
// hand. If the data stops supporting an example (a category goes current, the
// history runs short), the example is dropped rather than replaced with a
// made up one.
//
// The trust facts are the same: counts and dates read from the event store and
// the bulletin history, never a subscriber count or a review.
// =============================================================================

import { BULLETINS, latestBulletin, isDate } from "@/lib/visa-bulletin";
import { CHARGEABILITY_SHORT, ROW_LABEL, type Chargeability, type Row } from "@/lib/visa-bulletin/types";
import { forecast, teaser, type Forecast } from "@/lib/visa-bulletin/forecast";
import { formatMonth } from "@/lib/visa-bulletin/forecast-format";
import { historyRange, historySeries } from "@/lib/visa-bulletin/history";
import { visaBulletinAlerts } from "@/lib/billing/alerts";
import { EVENTS, EVENT_STORE_META, contributingAdapters } from "@/lib/event-store";
import { LAST_REFRESHED } from "@/lib/data";

export interface ForecastExample {
  /** "EB-2 China". */
  label: string;
  /** "Jan 1, 2022", the sample priority date. */
  priorityDate: string;
  /** The free answer, exactly as the free forecast words it. */
  freeAnswer: string;
  earliest: string;
  likely: string;
  latest: string;
  /** The bulletin month the estimate is measured from, "November 2026". */
  asOf: string;
  /** Cut-off dates over time, oldest first, as days since the first one. */
  trail: { month: string; value: number }[];
}

/**
 * Candidates in order. The first one the data gives a closed range for wins,
 * so the example moves with the bulletins instead of going stale.
 */
const CANDIDATES: { row: Row; country: Chargeability; date: string }[] = [
  { row: "EB2", country: "china", date: "2022-01-01" },
  { row: "EB3", country: "china", date: "2022-06-01" },
  { row: "EB1", country: "india", date: "2023-06-01" },
  { row: "EB2", country: "india", date: "2014-06-01" },
];

function formatDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export function forecastExample(): ForecastExample | null {
  for (const c of CANDIDATES) {
    const f: Forecast = forecast("employment", c.row, c.country, c.date);
    if (f.kind !== "estimate" || !f.latest || f.beyondHorizon) continue;
    if (f.earliest === f.latest) continue;
    const points = historySeries("employment", c.row, c.country).filter((p) => isDate(p.cutoff));
    if (points.length < 4) continue;
    const base = dayNumber(points[0].cutoff as string);
    return {
      label: `${ROW_LABEL[c.row]} ${CHARGEABILITY_SHORT[c.country]}`,
      priorityDate: formatDay(c.date),
      freeAnswer: teaser(f),
      earliest: formatMonth(f.earliest),
      likely: formatMonth(f.likely),
      latest: formatMonth(f.latest),
      asOf: formatMonth(f.asOf),
      trail: points.map((p) => ({ month: p.month, value: dayNumber(p.cutoff as string) - base })),
    };
  }
  return null;
}

export interface AlertExample {
  /** Who it is for, in the reader's words: "Following EB-2". */
  following: string;
  title: string;
  detail: string;
  source: string;
}

/** The alert the real job would send for the latest bulletin, or null if nothing moved. */
export function alertExample(): AlertExample | null {
  for (const [follow, label] of [
    ["visa:eb-2", "EB-2"],
    ["visa:eb-1", "EB-1"],
    ["visa:eb-3", "EB-3"],
  ] as const) {
    const alert = visaBulletinAlerts(BULLETINS, [follow], { sent: [] })[0];
    if (!alert || alert.detail.startsWith("No final action dates moved")) continue;
    return {
      following: `Following ${label}`,
      title: alert.title,
      detail: alert.detail,
      source: alert.source?.name ?? "U.S. Department of State",
    };
  }
  return null;
}

export interface TrustFacts {
  changes: number;
  sources: number;
  sourceNames: string[];
  bulletins: number;
  latestBulletin: string | null;
  refreshed: string;
  since: string | null;
}

/** Everything here is counted from the data the site is built from. */
export function trustFacts(): TrustFacts {
  const adapters = contributingAdapters();
  const range = historyRange();
  const latest = latestBulletin();
  return {
    changes: EVENTS.length,
    sources: adapters.length,
    sourceNames: adapters.map((a) => a.name),
    bulletins: range?.months ?? 0,
    latestBulletin: latest?.label ?? null,
    refreshed: LAST_REFRESHED,
    since: EVENT_STORE_META.earliestEvent,
  };
}
