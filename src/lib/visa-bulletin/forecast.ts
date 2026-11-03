// =============================================================================
// PRIORITY DATE FORECAST: WHEN MIGHT MY DATE BE REACHED?
//
// An ESTIMATE, built only from how far the official final action date has
// actually moved in past bulletins. Nothing here predicts policy, demand or
// retrogression; it asks "if the line keeps moving at the pace it has moved,
// when does it pass your date?" and answers with a range, never a day.
//
// THE METHOD, IN ONE PARAGRAPH
// ----------------------------
// For one category and country, take the final action cut-off in the newest
// bulletin and in the bulletins 12, 24 and 36 months before it. Each pair gives
// a pace: days of priority date the line advanced per calendar month. The gap
// between the newest cut-off and your date, divided by each pace, gives a
// number of months. The fastest pace is the early end of the range, the
// slowest positive pace the late end, and the median the "most likely" month.
// A window where the line did not move forward (or went back) has no pace; if
// no window moved forward at all, there is no estimate, and the page says so
// rather than inventing one.
//
// "C" (current) and "U" (unavailable) months are not dates. A window whose
// start is "C" or "U" starts at the first dated month after it instead, and a
// window shorter than six months is ignored as too short to mean anything.
// =============================================================================

import { yearOf } from "./forecast-format";
import { historySeries, type HistoryPoint } from "./history";
import type { Chargeability, Cutoff, Row } from "./types";
import { isDate, type Section } from "./index";

/** The trailing windows a pace is measured over, in months. */
export const PACE_WINDOWS = [12, 24, 36] as const;
/** Shorter than this, a window says more about one bulletin than about a trend. */
export const MIN_SPAN_MONTHS = 6;
/** Beyond this the arithmetic still works and means nothing. */
export const HORIZON_MONTHS = 240;

const DAY_MS = 86_400_000;

export interface Pace {
  /** The window asked for: 12, 24 or 36 months. */
  window: number;
  /** The months actually spanned, after skipping undated starts. */
  spanMonths: number;
  /** Days of priority date the line advanced per month. Negative: it went back. */
  daysPerMonth: number;
  from: { month: string; cutoff: string };
  to: { month: string; cutoff: string };
}

export type Forecast =
  | { kind: "reached"; asOf: string; cutoff: Cutoff }
  | { kind: "unavailable"; asOf: string }
  | { kind: "no-data" }
  | { kind: "stalled"; asOf: string; cutoff: string; gapDays: number; paces: Pace[] }
  | {
      kind: "estimate";
      asOf: string;
      cutoff: string;
      gapDays: number;
      paces: Pace[];
      /** "YYYY-MM", the bulletin month the date may be reached in. */
      earliest: string;
      likely: string;
      /** Null when one window shows no forward movement, so the late end is open. */
      latest: string | null;
      /** True when even the likely month is past the horizon. */
      beyondHorizon: boolean;
    };

function toUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** "2026-11" plus n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** The pace over one window, or null when the window has no usable dated span. */
export function paceOver(series: readonly HistoryPoint[], window: number): Pace | null {
  const end = series[series.length - 1];
  if (!end || !isDate(end.cutoff)) return null;
  const startMonth = addMonths(end.month, -window);
  // The first dated point at or after the window's start.
  const start = series.find((p) => p.month >= startMonth && isDate(p.cutoff));
  if (!start || start === end) return null;
  const spanMonths = monthsBetween(start.month, end.month);
  if (spanMonths < MIN_SPAN_MONTHS) return null;
  // A window that reaches back further than the history does is not that window.
  if (monthsBetween(series[0].month, end.month) < window) return null;
  return {
    window,
    spanMonths,
    daysPerMonth: daysBetween(start.cutoff as string, end.cutoff as string) / spanMonths,
    from: { month: start.month, cutoff: start.cutoff as string },
    to: { month: end.month, cutoff: end.cutoff as string },
  };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Months until the line covers `gapDays` at `daysPerMonth`, rounded up, at least one. */
function monthsToCover(gapDays: number, daysPerMonth: number): number {
  return Math.max(1, Math.ceil(gapDays / daysPerMonth));
}

/**
 * The bulletin's own rule decides "reached": a date strictly earlier than the
 * listed final action date may proceed.
 */
export function forecastFromSeries(series: readonly HistoryPoint[], priorityDate: string): Forecast {
  const end = series[series.length - 1];
  if (!end) return { kind: "no-data" };
  if (end.cutoff === "C") return { kind: "reached", asOf: end.month, cutoff: "C" };
  if (end.cutoff === "U") return { kind: "unavailable", asOf: end.month };
  if (!isDate(end.cutoff)) return { kind: "no-data" };
  if (priorityDate < end.cutoff) return { kind: "reached", asOf: end.month, cutoff: end.cutoff };

  // The line has to pass the date, so a date on the cut-off is one day short.
  const gapDays = daysBetween(end.cutoff, priorityDate) + 1;
  const paces = PACE_WINDOWS.map((w) => paceOver(series, w)).filter((p): p is Pace => p !== null);
  const forward = paces.filter((p) => p.daysPerMonth > 0);
  if (forward.length === 0) {
    return paces.length === 0
      ? { kind: "no-data" }
      : { kind: "stalled", asOf: end.month, cutoff: end.cutoff, gapDays, paces };
  }

  const speeds = forward.map((p) => p.daysPerMonth);
  const fastest = Math.max(...speeds);
  const slowest = Math.min(...speeds);
  const typical = median(speeds);
  const likelyMonths = monthsToCover(gapDays, typical);
  const latestMonths = monthsToCover(gapDays, slowest);
  const openEnded = forward.length < paces.length || latestMonths > HORIZON_MONTHS;

  return {
    kind: "estimate",
    asOf: end.month,
    cutoff: end.cutoff,
    gapDays,
    paces,
    earliest: addMonths(end.month, Math.min(monthsToCover(gapDays, fastest), HORIZON_MONTHS)),
    likely: addMonths(end.month, Math.min(likelyMonths, HORIZON_MONTHS)),
    latest: openEnded ? null : addMonths(end.month, latestMonths),
    beyondHorizon: likelyMonths > HORIZON_MONTHS,
  };
}

export function forecast(section: Section, row: Row, country: Chargeability, priorityDate: string): Forecast {
  return forecastFromSeries(historySeries(section, row, country), priorityDate);
}

/**
 * The free answer: one line, years only. The month range, the paces behind it
 * and the history chart are Pro (see /api/forecast).
 */
export function teaser(f: Forecast): string {
  switch (f.kind) {
    case "reached":
      return f.cutoff === "C"
        ? "This category is current: every priority date is reached."
        : "Your date is already reached on the final action chart.";
    case "unavailable":
      return "No visas are available in this category this month, so there is no estimate.";
    case "no-data":
      return "There is not enough bulletin history for this choice to estimate.";
    case "stalled":
      return "The line has not moved forward in recent years, so there is no honest estimate.";
    case "estimate": {
      if (f.beyondHorizon) return "More than 20 years at the recent pace.";
      const a = yearOf(f.earliest);
      const b = f.latest ? yearOf(f.latest) : null;
      if (!b) return `${a} at the earliest. It could be much later.`;
      return a === b ? `Around ${a}.` : `Between ${a} and ${b}.`;
    }
  }
}


export { describePace, formatMonth, yearOf } from "./forecast-format";
