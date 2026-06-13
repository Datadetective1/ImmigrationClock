// Transform selectors into the row shapes Recharts expects. Shared by the
// homepage previews and the full section pages so numbers always match.

import {
  enforcementYearly,
  enforcementByState,
  enforcementByCountry,
  borderYearly,
  borderMonthly,
  borderByCountry,
  visaSeries,
  visaClasses,
  visaCountryBreakdown,
  topSponsors,
  layoffsVsSponsorship,
  CURRENT_FY,
} from "./data";
import { fiscalYearLabel, monthLabel } from "./format";

// Fiscal-year axis label; the in-progress year is suffixed "YTD" so incomplete
// data is visually flagged on every trend chart.
function fyChartLabel(fy: number): string {
  return fy === CURRENT_FY ? `${fiscalYearLabel(fy)} YTD` : fiscalYearLabel(fy);
}

export function enforcementChartData() {
  return enforcementYearly().map((r) => ({
    label: fyChartLabel(r.fiscalYear),
    partial: r.fiscalYear === CURRENT_FY,
    Arrests: r.arrests,
    Removals: r.removals,
    "Avg detention": r.detentionAvgDaily,
  }));
}

export function enforcementCriminalSplit() {
  return enforcementYearly().map((r) => ({
    label: fyChartLabel(r.fiscalYear),
    partial: r.fiscalYear === CURRENT_FY,
    Criminal: r.criminalArrests,
    "Non-criminal": r.nonCriminal,
  }));
}

export function enforcementStateData() {
  return enforcementByState().map((r) => ({
    code: r.stateCode!,
    name: r.stateCode!,
    value: r.arrests,
  }));
}

export function enforcementCountryData() {
  return enforcementByCountry().map((r) => ({
    label: r.country!,
    value: r.removals,
  }));
}

export function borderYearlyData(border: "southwest" | "northern" | "nationwide" = "southwest") {
  return borderYearly(border).map((r) => ({
    label: fyChartLabel(r.fiscalYear),
    partial: r.fiscalYear === CURRENT_FY,
    Encounters: r.totalEncounters,
  }));
}

export function borderDemographicsData(border: "southwest" | "northern" | "nationwide" = "southwest") {
  return borderYearly(border).map((r) => ({
    label: fyChartLabel(r.fiscalYear),
    partial: r.fiscalYear === CURRENT_FY,
    "Single adults": r.singleAdults,
    "Family units": r.familyUnits,
    "Unaccompanied minors": r.unaccompaniedMinors,
  }));
}

export function borderMonthlyData() {
  return borderMonthly().map((r) => ({
    label: `${monthLabel(r.month!)} '${String(r.fiscalYear).slice(2)}`,
    Encounters: r.totalEncounters,
  }));
}

export function borderCountryData() {
  return borderByCountry().map((r) => ({
    label: r.citizenship!,
    value: r.totalEncounters,
  }));
}

export function visaChartData() {
  const classes = visaClasses();
  const years = visaSeries(classes[0]).map((r) => r.fiscalYear);
  return years.map((fy) => {
    const row: Record<string, number | string | boolean> = {
      label: fyChartLabel(fy),
      partial: fy === CURRENT_FY,
    };
    for (const cls of classes) {
      const point = visaSeries(cls).find((r) => r.fiscalYear === fy);
      row[cls] = point?.issued ?? 0;
    }
    return row;
  });
}

export function visaSeriesDefs() {
  const colors = ["#38bdf8", "#f59e0b", "#a78bfa", "#22c55e", "#f43f5e"];
  return visaClasses().map((key, i) => ({ key, label: key, color: colors[i % colors.length] }));
}

export function visaCountryData(visaClass: string) {
  return visaCountryBreakdown(visaClass).map((r) => ({
    label: r.country!,
    value: r.issued,
  }));
}

export function sponsorBarData(limit = 8) {
  return topSponsors()
    .slice(0, limit)
    .map((s) => ({ label: s.name.split(" ")[0], value: s.approvals }));
}

export function layoffsVsH1bData() {
  return layoffsVsSponsorship().map((c) => ({
    label: c.name.split(" ")[0],
    "H-1B approvals": c.approvals,
    "Layoffs (WARN)": c.layoffs,
  }));
}
