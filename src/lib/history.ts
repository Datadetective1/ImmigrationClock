// =============================================================================
// HISTORICAL ARCHIVE + CHANGE TRACKING.
//
// Reads the growing archive in src/lib/generated/history.json (seeded by
// scripts/backfill-history.mjs, appended on every refresh) and exposes the
// series plus month-over-month change. This is the "what changed" layer.
// =============================================================================
import history from "./generated/history.json";
import type { SparkPoint } from "./types";

export interface HistoryPoint {
  period: string; // e.g. "April 2026"
  month: string | null; // "APR"
  fy: number;
  cbpNationwideYtd: number; // cumulative nationwide encounters YTD at that release
  backfilled?: boolean;
}

const series = ((history as { cbpNationwideYtd?: HistoryPoint[] }).cbpNationwideYtd ?? []) as HistoryPoint[];

export const HISTORY_UPDATED = (history as { lastUpdated?: string }).lastUpdated ?? null;

/** Cumulative nationwide YTD by reporting month, oldest → newest. */
export function cbpYtdSeries(): HistoryPoint[] {
  return series;
}

/** Cumulative YTD as sparkline points (latest point drawn as in-progress). */
export function cbpYtdSpark(): SparkPoint[] {
  return series.map((p, i) => ({
    label: p.month ?? p.period,
    value: p.cbpNationwideYtd,
    partial: i === series.length - 1,
  }));
}

/** Encounters added in each month (the increment between cumulative points). */
export function cbpMonthlyInflows(): { period: string; month: string | null; inflow: number; fy: number }[] {
  const out: { period: string; month: string | null; inflow: number; fy: number }[] = [];
  for (let i = 1; i < series.length; i++) {
    out.push({
      period: series[i].period,
      month: series[i].month,
      inflow: series[i].cbpNationwideYtd - series[i - 1].cbpNationwideYtd,
      fy: series[i].fy,
    });
  }
  return out;
}

export interface CbpChange {
  latestPeriod: string;
  cumulative: number;
  latestInflow: number | null; // encounters added in the most recent month
  prevInflow: number | null; // encounters added the month before
  inflowDeltaPct: number | null; // change in monthly inflow (acceleration / slowdown)
  points: number; // how many months are in the archive
}

/** Month-over-month change at the most recent release, or null if too short. */
export function cbpLatestChange(): CbpChange | null {
  if (series.length === 0) return null;
  const latest = series[series.length - 1];
  const inflows = cbpMonthlyInflows();
  const latestInflow = inflows.length ? inflows[inflows.length - 1].inflow : null;
  const prevInflow = inflows.length > 1 ? inflows[inflows.length - 2].inflow : null;
  const inflowDeltaPct =
    latestInflow != null && prevInflow ? ((latestInflow - prevInflow) / prevInflow) * 100 : null;
  return {
    latestPeriod: latest.period,
    cumulative: latest.cbpNationwideYtd,
    latestInflow,
    prevInflow,
    inflowDeltaPct,
    points: series.length,
  };
}
