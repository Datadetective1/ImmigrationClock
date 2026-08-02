// =============================================================================
// "WHAT CHANGED" ENGINE — cross-source change feed.
//
// Synthesizes real movement across the datasets into a single feed of change
// items: border inflow, Texas layoffs month-over-month, ICE removal pace, the
// H-1B reporting lag, and the labor-market backdrop. Powers the homepage
// "What changed this month" section and the shareable /pulse page. Every item is
// computed from data and carries an integrity label — direction, not judgement.
// =============================================================================
import type { Provenance, TrendDirection } from "./types";
import { cbpLatestChange } from "./history";
import { iceByFy, CURRENT_FY, EMPLOYER_LATEST_FY, FY2026_ELAPSED } from "./dataset";
import { WARN_SUMMARY, WARN_SOURCE, warnCompleteMonths } from "./warn-summary";
import { LIVE_BLS } from "./data";
import { reportingLagRows } from "./refresh";
import { formatNumber, formatCompact } from "./format";

export interface ChangeItem {
  key: string;
  title: string;
  detail?: string;
  direction: TrendDirection | "none";
  metric?: string; // e.g. "+14%"
  group: "border" | "workforce" | "enforcement" | "visa";
  provenance: Provenance;
  period: string;
  sourceName: string;
  sourceUrl: string;
  href?: string;
}

const MONTHS_FULL: Record<string, string> = {
  "01": "January", "02": "February", "03": "March", "04": "April", "05": "May", "06": "June",
  "07": "July", "08": "August", "09": "September", "10": "October", "11": "November", "12": "December",
};
const MONTHS_SHORT: Record<string, string> = {
  "01": "Jan", "02": "Feb", "03": "Mar", "04": "Apr", "05": "May", "06": "Jun",
  "07": "Jul", "08": "Aug", "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dec",
};
function monthFull(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS_FULL[m] ?? m} ${y}`;
}
function monthShort(ym: string): string {
  return MONTHS_SHORT[ym.split("-")[1]] ?? ym;
}
function dir(pct: number): TrendDirection {
  if (pct >= 1) return "UP";
  if (pct <= -1) return "DOWN";
  return "FLAT";
}
function signed(pct: number): string {
  const r = Math.round(pct);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}%`;
}

/** Build the cross-source change feed from the current data snapshot. */
export function buildChangeFeed(): ChangeItem[] {
  const items: ChangeItem[] = [];

  // 1. CBP border encounters — latest month inflow + month-over-month
  const cbp = cbpLatestChange();
  if (cbp && cbp.latestInflow != null) {
    const d = cbp.inflowDeltaPct;
    const showPct = d != null && Math.abs(Math.round(d)) >= 1;
    items.push({
      key: "cbp-inflow",
      title: `${formatNumber(cbp.latestInflow)} border encounters added in ${cbp.latestPeriod.split(" ")[0]}`,
      detail:
        d != null
          ? `Monthly inflow ${d >= 1 ? "up" : d <= -1 ? "down" : "about level"} vs the prior month. FY total so far: ${formatNumber(cbp.cumulative)}.`
          : `FY total so far: ${formatNumber(cbp.cumulative)}.`,
      direction: d != null ? dir(d) : "none",
      metric: showPct ? signed(d!) : undefined,
      group: "border",
      provenance: "reported",
      period: cbp.latestPeriod,
      sourceName: "CBP Nationwide Encounters",
      sourceUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
      href: "/border/encounters",
    });
  }

  // 2. WARN layoffs across the covered states — last complete month vs the one
  //    before. The current month is excluded (still accumulating notices).
  const { latest: warnLatest, prior: warnPrior } = warnCompleteMonths();
  if (warnLatest && warnPrior) {
    const pct = warnPrior.employees
      ? ((warnLatest.employees - warnPrior.employees) / warnPrior.employees) * 100
      : 0;
    const showPct = Math.abs(Math.round(pct)) >= 1;
    items.push({
      key: "warn-mom",
      title: `WARN layoff notices ${pct >= 1 ? "up" : pct <= -1 ? "down" : "roughly flat"}${
        showPct ? ` ${Math.abs(Math.round(pct))}%` : ""
      } month-over-month`,
      detail:
        `${formatNumber(warnLatest.employees)} employees across ${formatNumber(warnLatest.notices)} notices in ` +
        `${monthFull(warnLatest.month)}, vs ${formatNumber(warnPrior.employees)} in ${monthFull(warnPrior.month)}. ` +
        `Covers ${WARN_SUMMARY.stateCount} states (${WARN_SUMMARY.stateCodes.join(", ")}) — not a national total.`,
      direction: dir(pct),
      metric: showPct ? signed(pct) : undefined,
      group: "workforce",
      provenance: "reported",
      period: `${monthShort(warnLatest.month)} vs ${monthShort(warnPrior.month)}`,
      sourceName: WARN_SOURCE.sourceName,
      sourceUrl: WARN_SOURCE.sourceUrl,
      href: "/layoffs",
    });
  }

  // 3. ICE removals vs the last reported full-year pace (projected)
  const iceNow = iceByFy[CURRENT_FY];
  const iceBase = iceByFy[EMPLOYER_LATEST_FY];
  if (iceNow && iceBase) {
    const projected = Math.round(iceNow.removals / FY2026_ELAPSED);
    const pct = iceBase.removals ? ((projected - iceBase.removals) / iceBase.removals) * 100 : 0;
    items.push({
      key: "ice-removals-pace",
      title: `ICE removals running ${pct >= 0 ? "above" : "below"} the FY${EMPLOYER_LATEST_FY} pace`,
      detail: `At the current pace, FY${CURRENT_FY} would reach ~${formatCompact(
        projected
      )} removals vs ${formatNumber(iceBase.removals)} in FY${EMPLOYER_LATEST_FY}.`,
      direction: dir(pct),
      metric: signed(pct),
      group: "enforcement",
      provenance: "projected",
      period: `FY${CURRENT_FY} pace`,
      sourceName: "ICE Enforcement and Removal Statistics",
      sourceUrl: "https://www.ice.gov/statistics",
      href: "/immigration/enforcement-trends",
    });
  }

  // 4. H-1B reporting lag (structural — why the visa data trails the economy)
  const uscis = reportingLagRows().find((r) => r.key === "uscis_h1b");
  if (uscis && uscis.lagMonths != null) {
    items.push({
      key: "h1b-lag",
      title: `H-1B employer data still lags ~${uscis.lagMonths} months behind the real economy`,
      detail: `The latest official USCIS employer release is ${uscis.latestPeriod}. Layoffs and the labor market move months before the visa data catches up.`,
      direction: "none",
      group: "visa",
      provenance: "reported",
      period: uscis.latestPeriod,
      sourceName: "USCIS H-1B Employer Data Hub",
      sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
      href: "/data",
    });
  }

  // 5. Labor-market backdrop (BLS, live)
  if (LIVE_BLS.value != null) {
    items.push({
      key: "bls-unemployment",
      title: `U.S. unemployment at ${LIVE_BLS.value}% (${LIVE_BLS.period})`,
      detail: "The labor-market backdrop for the immigration debate — fetched live from BLS.",
      direction: "none",
      group: "workforce",
      provenance: "reported",
      period: LIVE_BLS.period ?? "Latest release",
      sourceName: LIVE_BLS.sourceName,
      sourceUrl: LIVE_BLS.sourceUrl,
      href: "/data",
    });
  }

  return items;
}
