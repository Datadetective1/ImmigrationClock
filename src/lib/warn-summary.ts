// =============================================================================
// REAL WARN ROLLUP — the only source of layoff totals shown on the site.
//
// Reads src/lib/generated/warn-summary.json, a ~10KB rollup emitted by
// scripts/build-warn.ts from the same deduped notices that back /layoffs and the
// public API. Importing this module costs a few kilobytes, so any route can show
// real WARN totals without pulling the multi-MB notice feed (src/lib/warn.ts)
// into its bundle.
//
// Every figure here traces to a state-published notice with a source URL. There
// is no modeled, apportioned, or illustrative layoff data anywhere in the app —
// see docs/data-corrections.md for the 2026-08 correction that removed it.
// =============================================================================
import summary from "./generated/warn-summary.json";

export interface WarnYearTotal {
  year: number;
  employees: number;
  notices: number;
}

export interface WarnMonthTotal {
  month: string; // "yyyy-mm"
  employees: number;
  notices: number;
}

export interface WarnStateSummaryRow {
  code: string;
  agency: string;
  pageUrl: string;
  datasetUrl: string;
  noticeCount: number;
  employeesTotal: number;
  latestNotice: string | null;
  /**
   * Which date the state actually publishes. `effective` states (New Jersey)
   * publish only the layoff effective date, so their `latestNotice` can be in
   * the FUTURE and must never be worded as a filing date.
   */
  dateBasis: "notice" | "effective" | "mixed";
  withNoticeDate: number;
  withEffectiveOnly: number;
}

export const WARN_SUMMARY = {
  generatedAt: summary.generatedAt as string,
  coverageNote: summary.coverageNote as string,
  sourceName: summary.sourceName as string,
  sourceUrl: summary.sourceUrl as string,
  states: summary.states as WarnStateSummaryRow[],
  stateCount: summary.stateCount as number,
  stateCodes: summary.stateCodes as string[],
  noticeCount: summary.noticeCount as number,
  employeesTotal: summary.employeesTotal as number,
  employerCount: summary.employerCount as number,
  minNoticeDate: summary.minNoticeDate as string | null,
  maxNoticeDate: summary.maxNoticeDate as string | null,
  yearBasisNote: summary.yearBasisNote as string,
  datedByNoticeDate: summary.datedByNoticeDate as number,
  datedByEffectiveDate: summary.datedByEffectiveDate as number,
  noticesWithoutDate: summary.noticesWithoutDate as number,
  byYear: summary.byYear as WarnYearTotal[],
  byMonth: summary.byMonth as WarnMonthTotal[],
  byStateYear: summary.byStateYear as Record<string, WarnYearTotal[]>,
};

/**
 * The most recent COMPLETE month and the one before it, for month-over-month
 * change detection. The current calendar month is excluded because it is still
 * accumulating notices and would always read as a collapse.
 */
export function warnCompleteMonths(now = new Date()): {
  latest: WarnMonthTotal | null;
  prior: WarnMonthTotal | null;
} {
  const currentYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const complete = WARN_SUMMARY.byMonth.filter((m) => m.month < currentYm);
  return {
    latest: complete[complete.length - 1] ?? null,
    prior: complete[complete.length - 2] ?? null,
  };
}

/**
 * Provenance block for any WARN figure. Always `reported` — these are filings.
 *
 * `sourceUpdatedAt` is the newest FILING date in the feed, never an effective
 * date, and never a future date: effective-date-only states carry records dated
 * months ahead, and showing one as "Updated <future date>" would be nonsense.
 */
function newestPastDate(...candidates: (string | null | undefined)[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const usable = candidates
    .filter((d): d is string => Boolean(d))
    .map((d) => d.slice(0, 10))
    .filter((d) => d <= today)
    .sort();
  return usable[usable.length - 1] ?? today;
}

export const WARN_SOURCE = {
  sourceName: WARN_SUMMARY.sourceName,
  sourceUrl: WARN_SUMMARY.sourceUrl,
  sourceUpdatedAt: newestPastDate(WARN_SUMMARY.maxNoticeDate, WARN_SUMMARY.generatedAt),
};

/** Employees covered by WARN notices dated to a calendar year. 0 if none. */
export function warnEmployeesInYear(year: number): number {
  return WARN_SUMMARY.byYear.find((y) => y.year === year)?.employees ?? 0;
}

/** Notice count for a calendar year. 0 if none. */
export function warnNoticesInYear(year: number): number {
  return WARN_SUMMARY.byYear.find((y) => y.year === year)?.notices ?? 0;
}

/** Per-state yearly totals, oldest → newest. Empty for uncovered states. */
export function warnYearsForState(stateCode: string): WarnYearTotal[] {
  return WARN_SUMMARY.byStateYear[stateCode.toUpperCase()] ?? [];
}

/** Roll-up for one state, or null when the state has no covered feed. */
export function warnStateSummary(stateCode: string): WarnStateSummaryRow | null {
  const code = stateCode.toUpperCase();
  return WARN_SUMMARY.states.find((s) => s.code === code) ?? null;
}

/**
 * Correct wording for a state's most recent dated record. Some states publish
 * only the layoff effective date, which can fall in the future — calling that
 * "most recent notice" would misdescribe it.
 */
export function warnLatestDateLabel(state: WarnStateSummaryRow): string | null {
  if (!state.latestNotice) return null;
  return state.dateBasis === "effective"
    ? "Latest layoff effective date"
    : "Most recent notice filed";
}

/** True when a state's WARN notices are in the feed at all. */
export function warnCoversState(stateCode: string): boolean {
  return WARN_SUMMARY.stateCodes.includes(stateCode.toUpperCase());
}

/**
 * One sentence naming exactly which states are represented. Used anywhere a WARN
 * total is displayed so a partial-coverage number is never read as national.
 */
export const WARN_COVERAGE_SENTENCE =
  `Covers ${WARN_SUMMARY.stateCount} states with a machine-readable WARN feed ` +
  `(${WARN_SUMMARY.stateCodes.join(", ")}). This is not a national total — ` +
  `most states publish WARN notices only as HTML, Excel, or PDF.`;
