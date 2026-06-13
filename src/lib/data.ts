// Read-only selectors over the sample dataset. Every page in the app pulls
// derived numbers from here so company/state/country pages stay consistent with
// the homepage counters. When USE_DATABASE is wired up these functions are the
// single place to swap in Prisma queries.

import {
  companies,
  companyBySlug,
  states,
  countries,
  iceRows,
  iceByFy,
  iceByState,
  iceByCountry,
  cbpRows,
  cbpMonthly,
  cbpByCountry,
  visaRows,
  visaByCountry,
  wageRows,
  wageByState,
  layoffRows,
  stateWeight,
  countrySeedBySlug,
  CURRENT_FY,
  FISCAL_YEARS,
  LATEST_COMPLETE_FY,
  EMPLOYER_LATEST_FY,
  FY2026_ELAPSED,
  H1B_NATIONAL,
  DETENTION_NOW,
  UPDATED,
} from "./sample-data";
import type {
  Metric,
  MetricPeriod,
  SparkPoint,
  Completeness,
  TrendDirection,
  StatusLevel,
  Company,
  SourceRef,
} from "./types";

// Pull only provenance fields off a record (avoids leaking fiscalYear etc).
const srcRef = (r: SourceRef) => ({
  sourceName: r.sourceName,
  sourceUrl: r.sourceUrl,
  sourceUpdatedAt: r.sourceUpdatedAt,
});

// Employer / state / company aggregations use the latest *available* employer
// fiscal year (USCIS Data Hub lags to FY2024). Keep the historical export name.
export const LAST_COMPLETE_FY = EMPLOYER_LATEST_FY;

// Re-export time-frame constants so pages can import them from the data layer.
export {
  CURRENT_FY,
  FISCAL_YEARS,
  FY_COMPLETENESS,
  LATEST_COMPLETE_FY,
  EMPLOYER_LATEST_FY,
} from "./sample-data";

function fyTag(y: number): string {
  return `FY${y}`;
}

function pct(a: number, b: number): number {
  if (!b) return 0;
  return ((a - b) / b) * 100;
}
function dir(p: number): Metric["trend"] {
  if (p > 1.5) return "UP";
  if (p < -1.5) return "DOWN";
  return "FLAT";
}

// ---------------------------------------------------------------------------
// Company aggregates
// ---------------------------------------------------------------------------
export function companyTotals(company: Company, fy: number) {
  const y = company.years.find((yr) => yr.fiscalYear === fy);
  if (!y) return null;
  const approvals = y.initialApprovals + y.continuingApprovals;
  const denials = y.initialDenials + y.continuingDenials;
  const approvalRate = approvals + denials > 0 ? approvals / (approvals + denials) : 0;
  return {
    ...y,
    approvals,
    denials,
    approvalRate,
  };
}

export function topSponsors(fy: number = LAST_COMPLETE_FY) {
  return companies
    .map((c) => {
      const t = companyTotals(c, fy)!;
      return {
        slug: c.slug,
        name: c.name,
        stateCode: c.stateCode,
        industry: c.industry,
        approvals: t.approvals,
        denials: t.denials,
        approvalRate: t.approvalRate,
        avgWage: t.avgOfferedWage,
        lcaFilings: t.lcaFilings,
      };
    })
    .sort((a, b) => b.approvals - a.approvals);
}

export function companyTrend(company: Company) {
  return company.years.map((y) => ({
    fiscalYear: y.fiscalYear,
    approvals: y.initialApprovals + y.continuingApprovals,
    denials: y.initialDenials + y.continuingDenials,
    avgWage: y.avgOfferedWage,
  }));
}

// ---------------------------------------------------------------------------
// State aggregates
// ---------------------------------------------------------------------------
export function stateBySlug(code: string) {
  return states.find((s) => s.code.toLowerCase() === code.toLowerCase());
}

export function stateAggregate(code: string) {
  const state = stateBySlug(code);
  if (!state) return null;
  const fy = LAST_COMPLETE_FY;

  // Companies headquartered or with major worksites in the state.
  const stateCompanies = companies
    .filter(
      (c) =>
        c.stateCode === state.code ||
        c.topWorksites.some((w) => w.stateCode === state.code)
    )
    .map((c) => {
      const t = companyTotals(c, fy)!;
      const worksiteShare =
        c.stateCode === state.code
          ? 1
          : c.topWorksites
              .filter((w) => w.stateCode === state.code)
              .reduce((s, w) => s + w.share, 0);
      return {
        slug: c.slug,
        name: c.name,
        approvals: Math.round(t.approvals * worksiteShare),
        avgWage: t.avgOfferedWage,
      };
    })
    .sort((a, b) => b.approvals - a.approvals);

  const totalApprovals = stateCompanies.reduce((s, c) => s + c.approvals, 0);
  const avgWage =
    stateCompanies.length > 0
      ? Math.round(
          stateCompanies.reduce((s, c) => s + c.avgWage, 0) / stateCompanies.length
        )
      : 0;

  const stateLayoffs = layoffRows
    .filter((l) => l.stateCode === state.code)
    .sort((a, b) => b.noticeDate.localeCompare(a.noticeDate));
  const layoffTotal = stateLayoffs.reduce((s, l) => s + l.employeesAffected, 0);

  const ice = iceByState.find((r) => r.stateCode === state.code);
  const wage = wageByState.find((w) => w.stateCode === state.code);

  // Top occupations in the state by aggregating tracked-employer job titles.
  const occMap = new Map<string, number>();
  for (const c of companies) {
    if (c.stateCode !== state.code && !c.topWorksites.some((w) => w.stateCode === state.code))
      continue;
    for (const t of c.topJobTitles) {
      occMap.set(t.title, (occMap.get(t.title) ?? 0) + t.share);
    }
  }
  const topOccupations = [...occMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title]) => title);

  return {
    state,
    fiscalYear: fy,
    totalApprovals,
    avgWage,
    swWageMean: wage?.meanWage ?? null,
    companies: stateCompanies,
    layoffs: stateLayoffs,
    layoffTotal,
    ice,
    topOccupations,
    h1bWeight: stateWeight[state.code] ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Country aggregates
// ---------------------------------------------------------------------------
export function countryAggregate(slug: string) {
  const country = countries.find((c) => c.slug === slug);
  if (!country) return null;
  const seed = countrySeedBySlug[slug];

  const visas = visaByCountry.filter((v) => v.country === country.name);
  const h1b = visas.find((v) => v.visaClass === "H-1B");
  const f1 = visas.find((v) => v.visaClass === "F-1");

  // Multi-year series: H-1B is the country's real FY2024 approvals scaled by the
  // national H-1B trend; F-1 apportions the national issuance by the country's
  // estimated share (clearly an estimate — see /methodology).
  const f1ShareSum = countries.reduce(
    (s, c) => s + (countrySeedBySlug[c.slug]?.f1Share ?? 0),
    0
  );
  const h1bAnchor = H1B_NATIONAL[LAST_COMPLETE_FY].approvals;
  const series = FISCAL_YEARS.map((fy) => {
    const h1bNational = H1B_NATIONAL[fy]?.approvals ?? h1bAnchor;
    const f1National = visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === fy)?.issued ?? 0;
    return {
      fiscalYear: fy,
      h1b: Math.round(seed.h1bApprovals2024 * (h1bNational / h1bAnchor)),
      f1: Math.round((f1National * seed.f1Share) / f1ShareSum),
    };
  });

  const ice = iceByCountry.find((r) => r.country === country.name);
  const cbp = cbpByCountry.find((r) => r.citizenship === country.name);

  return { country, seed, h1b, f1, series, ice, cbp };
}

// ---------------------------------------------------------------------------
// Border / enforcement / visa selectors for section pages
// ---------------------------------------------------------------------------
export function borderYearly(border: "southwest" | "northern" | "nationwide" = "southwest") {
  return cbpRows
    .filter((r) => r.border === border)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
}
export function borderMonthly() {
  return cbpMonthly;
}
export function borderByCountry() {
  return [...cbpByCountry].sort((a, b) => b.totalEncounters - a.totalEncounters);
}
export function enforcementYearly() {
  return [...iceRows].sort((a, b) => a.fiscalYear - b.fiscalYear);
}
export function enforcementByState() {
  return [...iceByState].sort((a, b) => b.arrests - a.arrests);
}
export function enforcementByCountry() {
  return [...iceByCountry].sort((a, b) => b.removals - a.removals);
}
export function visaSeries(visaClass: string) {
  return visaRows
    .filter((v) => v.visaClass === visaClass)
    .sort((a, b) => a.fiscalYear - b.fiscalYear);
}
export function visaClasses() {
  return [...new Set(visaRows.map((v) => v.visaClass))];
}
export function visaCountryBreakdown(visaClass: string) {
  return visaByCountry
    .filter((v) => v.visaClass === visaClass)
    .sort((a, b) => b.issued - a.issued);
}

// ---------------------------------------------------------------------------
// Workforce selectors
// ---------------------------------------------------------------------------
export function topOccupationsBySponsorship() {
  const map = new Map<string, { share: number; wage: number; n: number }>();
  for (const c of companies) {
    const latest = companyTotals(c, LAST_COMPLETE_FY)!;
    for (const t of c.topJobTitles) {
      const prev = map.get(t.title) ?? { share: 0, wage: 0, n: 0 };
      map.set(t.title, {
        share: prev.share + t.share * latest.approvals,
        wage: prev.wage + t.avgWage,
        n: prev.n + 1,
      });
    }
  }
  return [...map.entries()]
    .map(([title, v]) => ({
      title,
      approxApprovals: Math.round(v.share),
      avgWage: Math.round(v.wage / v.n),
    }))
    .sort((a, b) => b.approxApprovals - a.approxApprovals);
}

export function layoffsVsSponsorship() {
  return companies
    .map((c) => {
      const latest = companyTotals(c, LAST_COMPLETE_FY)!;
      const layoffs = c.layoffs.reduce((s, l) => s + l.employeesAffected, 0);
      return {
        slug: c.slug,
        name: c.name,
        approvals: latest.approvals,
        layoffs,
        avgWage: latest.avgOfferedWage,
      };
    })
    .sort((a, b) => b.layoffs - a.layoffs);
}

export function allWageRows() {
  return wageRows;
}
export function wagesByStateRows() {
  return [...wageByState].sort((a, b) => b.meanWage - a.meanWage);
}
export function allLayoffs() {
  return [...layoffRows].sort((a, b) => b.noticeDate.localeCompare(a.noticeDate));
}

// ---------------------------------------------------------------------------
// Live counter grid (homepage) — latest-available period per metric
// ---------------------------------------------------------------------------
const SRC = {
  iceStats: { sourceName: "ICE Enforcement and Removal Statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_stats },
  iceAnnual: { sourceName: "ICE Enforcement and Removal Statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_annual },
  cbp: { sourceName: "CBP Nationwide Encounters", sourceUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters", sourceUpdatedAt: UPDATED.cbp_encounters },
  uscisHub: { sourceName: "USCIS H-1B Employer Data Hub", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: UPDATED.uscis_h1b },
  uscisNational: { sourceName: "USCIS H-1B petition statistics", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: UPDATED.uscis_h1b_national },
  dos: { sourceName: "Department of State Visa Statistics", sourceUrl: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html", sourceUpdatedAt: UPDATED.dos_visa },
  dol: { sourceName: "DOL OFLC Disclosure Data (LCA / PERM)", sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance", sourceUpdatedAt: UPDATED.dol_lca },
  warn: { sourceName: "State WARN Act Layoff Notices", sourceUrl: "https://www.dol.gov/agencies/eta/layoffs/warn", sourceUpdatedAt: UPDATED.warn_layoffs },
};

function periodLabel(fy: number | undefined, completeness: Completeness, isLatest: boolean): string {
  if (completeness === "point_in_time") return "Point-in-time";
  if (!fy) return isLatest ? "Latest available" : "—";
  if (completeness === "ytd") return `${fyTag(fy)} YTD`;
  if (completeness === "preliminary") return `${isLatest ? "Latest: " : ""}${fyTag(fy)} preliminary`;
  if (completeness === "estimated") return `${fyTag(fy)} est. pace`;
  return isLatest ? `Latest available: ${fyTag(fy)}` : fyTag(fy);
}

function mp(
  value: number,
  fy: number | undefined,
  completeness: Completeness,
  sourceUpdatedAt: string,
  isLatest: boolean,
  opts: { display?: string; labelOverride?: string } = {}
): MetricPeriod {
  return {
    value,
    display: opts.display,
    fiscalYear: fy,
    completeness,
    sourceUpdatedAt,
    periodLabel: opts.labelOverride ?? periodLabel(fy, completeness, isLatest),
  };
}

function spk(get: (fy: number) => number, years: number[], partial: number[]): SparkPoint[] {
  return years.map((fy) => ({
    label: `FY${String(fy).slice(2)}`,
    value: get(fy),
    partial: partial.includes(fy),
  }));
}

// Projected full-year pace for a YTD value vs the last complete year.
function ytdTrend(ytd: number, lastComplete: number): { trend: TrendDirection; trendPct: number } {
  const projected = Math.round(ytd / FY2026_ELAPSED);
  const p = pct(projected, lastComplete);
  return { trend: dir(p), trendPct: p };
}

function layoffsInYear(y: number): number {
  return layoffRows
    .filter((l) => l.noticeDate.startsWith(String(y)))
    .reduce((s, l) => s + l.employeesAffected, 0);
}

interface BuildArgs {
  key: string;
  label: string;
  unit?: string;
  group: Metric["group"];
  href?: string;
  status: StatusLevel;
  tooltip: string;
  latest: MetricPeriod;
  lastComplete?: MetricPeriod;
  src: SourceRef;
  spark?: SparkPoint[];
  trend?: TrendDirection;
  trendPct?: number;
  paceEstimated?: boolean;
}
function buildMetric(a: BuildArgs): Metric {
  return {
    key: a.key,
    label: a.label,
    value: a.latest.value,
    display: a.latest.display,
    unit: a.unit,
    fiscalYear: a.latest.fiscalYear,
    paceEstimated: a.paceEstimated ?? false,
    trend: a.trend ?? "FLAT",
    trendPct: a.trendPct,
    status: a.status,
    tooltip: a.tooltip,
    href: a.href,
    group: a.group,
    completeness: a.latest.completeness,
    periodLabel: a.latest.periodLabel,
    lastComplete: a.lastComplete,
    spark: a.spark,
    sourceName: a.src.sourceName,
    sourceUrl: a.src.sourceUrl,
    sourceUpdatedAt: a.latest.sourceUpdatedAt,
  };
}

export function buildMetrics(): Metric[] {
  const MACRO_YEARS = FISCAL_YEARS; // 2021..2026
  const H1B_YEARS = [2021, 2022, 2023, 2024, 2025];
  const EMP_YEARS = [2021, 2022, 2023, 2024];

  // ---- Enforcement ----
  const arrestsTrend = ytdTrend(iceByFy[CURRENT_FY].arrests, iceByFy[LATEST_COMPLETE_FY].arrests);
  const removalsTrend = ytdTrend(iceByFy[CURRENT_FY].removals, iceByFy[LATEST_COMPLETE_FY].removals);
  const detentionPct = pct(DETENTION_NOW.value, iceByFy[LATEST_COMPLETE_FY].detentionAvgDaily);

  // ---- Border ----
  const cbpNow = cbpRows.find((r) => r.fiscalYear === CURRENT_FY && r.border === "nationwide")!;
  const cbpComplete = cbpRows.find((r) => r.fiscalYear === LATEST_COMPLETE_FY && r.border === "nationwide")!;
  const borderTrend = ytdTrend(cbpNow.totalEncounters, cbpComplete.totalEncounters);

  // ---- H-1B national ----
  const h1bLatest = H1B_NATIONAL[LATEST_COMPLETE_FY]; // FY2025 preliminary
  const h1bComplete = H1B_NATIONAL[EMPLOYER_LATEST_FY]; // FY2024 final
  const h1bApprPct = pct(h1bLatest.approvals, h1bComplete.approvals);
  const h1bDenPct = pct(h1bLatest.denials, h1bComplete.denials);

  // ---- Visas ----
  const f1Now = visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === CURRENT_FY)!;
  const f1Complete = visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === LATEST_COMPLETE_FY)!;
  const f1Trend = ytdTrend(f1Now.issued, f1Complete.issued);

  // ---- Workforce ----
  const sponsors = topSponsors(EMPLOYER_LATEST_FY);
  const topEmployer = sponsors[0];
  function weightedWage(fy: number): number {
    const s = topSponsors(fy);
    const tot = s.reduce((a, c) => a + c.approvals, 0);
    return tot ? Math.round(s.reduce((a, c) => a + c.avgWage * c.approvals, 0) / tot) : 0;
  }
  const avgWage = weightedWage(EMPLOYER_LATEST_FY);

  const layoffsLatest = layoffsInYear(CURRENT_FY);
  const layoffsComplete = layoffsInYear(LATEST_COMPLETE_FY);

  const topState = states
    .map((s) => ({ code: s.code, name: s.name, w: stateWeight[s.code] ?? 0 }))
    .sort((a, b) => b.w - a.w)[0];

  const topNationality = visaByCountry
    .filter((v) => v.visaClass === "H-1B")
    .sort((a, b) => b.issued - a.issued)[0];

  return [
    buildMetric({
      key: "ice_arrests_fy",
      label: "ICE arrests",
      unit: "people",
      group: "enforcement",
      href: "/immigration/enforcement-trends",
      status: "RED",
      tooltip:
        "Administrative arrests by ICE. FY2026 is year-to-date; the trend projects a full-year pace from the elapsed share of the fiscal year. An arrest is not a deportation — see methodology.",
      latest: mp(iceByFy[CURRENT_FY].arrests, CURRENT_FY, "ytd", UPDATED.ice_stats, true),
      lastComplete: mp(iceByFy[LATEST_COMPLETE_FY].arrests, LATEST_COMPLETE_FY, "complete", UPDATED.ice_annual, false),
      src: SRC.iceStats,
      spark: spk((fy) => iceByFy[fy]?.arrests ?? 0, MACRO_YEARS, [CURRENT_FY]),
      trend: arrestsTrend.trend,
      trendPct: arrestsTrend.trendPct,
      paceEstimated: true,
    }),
    buildMetric({
      key: "removals_fy",
      label: "Deportations / removals",
      unit: "people",
      group: "enforcement",
      href: "/immigration/enforcement-trends",
      status: "RED",
      tooltip:
        "Noncitizens removed under an order of removal. FY2026 is year-to-date with a projected full-year pace. Removals differ from arrests and from detention counts.",
      latest: mp(iceByFy[CURRENT_FY].removals, CURRENT_FY, "ytd", UPDATED.ice_stats, true),
      lastComplete: mp(iceByFy[LATEST_COMPLETE_FY].removals, LATEST_COMPLETE_FY, "complete", UPDATED.ice_annual, false),
      src: SRC.iceStats,
      spark: spk((fy) => iceByFy[fy]?.removals ?? 0, MACRO_YEARS, [CURRENT_FY]),
      trend: removalsTrend.trend,
      trendPct: removalsTrend.trendPct,
      paceEstimated: true,
    }),
    buildMetric({
      key: "detention_population",
      label: "ICE detention population",
      unit: "people",
      group: "enforcement",
      href: "/immigration/enforcement-trends",
      status: "RED",
      tooltip:
        "People in ICE detention on a specific date — a point-in-time figure, not a fiscal-year total. Among the highest levels in the system's history.",
      latest: mp(DETENTION_NOW.value, undefined, "point_in_time", DETENTION_NOW.asOf, true),
      lastComplete: mp(iceByFy[LATEST_COMPLETE_FY].detentionAvgDaily, LATEST_COMPLETE_FY, "complete", UPDATED.ice_annual, false, { labelOverride: `${fyTag(LATEST_COMPLETE_FY)} avg daily` }),
      src: { ...SRC.iceStats, sourceUpdatedAt: DETENTION_NOW.asOf },
      spark: spk((fy) => iceByFy[fy]?.detentionAvgDaily ?? 0, MACRO_YEARS, [CURRENT_FY]),
      trend: dir(detentionPct),
      trendPct: detentionPct,
    }),
    buildMetric({
      key: "border_encounters_fy",
      label: "Border encounters",
      unit: "encounters",
      group: "border",
      href: "/border/encounters",
      status: "GREEN",
      tooltip:
        "CBP nationwide encounters. FY2026 is year-to-date (encounters are at multi-decade lows). An encounter is an event, not a person, and is not a deportation.",
      latest: mp(cbpNow.totalEncounters, CURRENT_FY, "ytd", UPDATED.cbp_encounters, true),
      lastComplete: mp(cbpComplete.totalEncounters, LATEST_COMPLETE_FY, "complete", UPDATED.cbp_encounters, false),
      src: SRC.cbp,
      spark: spk((fy) => cbpRows.find((r) => r.fiscalYear === fy && r.border === "nationwide")?.totalEncounters ?? 0, MACRO_YEARS, [CURRENT_FY]),
      trend: borderTrend.trend,
      trendPct: borderTrend.trendPct,
      paceEstimated: true,
    }),
    buildMetric({
      key: "h1b_approvals_fy",
      label: "H-1B approvals",
      unit: "petitions",
      group: "visa",
      href: "/h1b/top-sponsors",
      status: "GREEN",
      tooltip:
        "USCIS H-1B petition approvals (initial + continuing) nationwide. FY2025 figures are preliminary; FY2024 (399,395) is final. USCIS approvals are not State Department visa issuances.",
      latest: mp(h1bLatest.approvals, LATEST_COMPLETE_FY, "preliminary", UPDATED.uscis_h1b_national, true),
      lastComplete: mp(h1bComplete.approvals, EMPLOYER_LATEST_FY, "complete", UPDATED.uscis_h1b, false),
      src: SRC.uscisNational,
      spark: spk((fy) => H1B_NATIONAL[fy]?.approvals ?? 0, H1B_YEARS, [LATEST_COMPLETE_FY]),
      trend: dir(h1bApprPct),
      trendPct: h1bApprPct,
    }),
    buildMetric({
      key: "h1b_denials_fy",
      label: "H-1B denials",
      unit: "petitions",
      group: "visa",
      href: "/h1b/top-sponsors",
      status: "AMBER",
      tooltip:
        "USCIS H-1B petition denials nationwide. FY2025 is preliminary. Denial rates vary year to year with policy and case mix.",
      latest: mp(h1bLatest.denials, LATEST_COMPLETE_FY, "preliminary", UPDATED.uscis_h1b_national, true),
      lastComplete: mp(h1bComplete.denials, EMPLOYER_LATEST_FY, "complete", UPDATED.uscis_h1b, false),
      src: SRC.uscisNational,
      spark: spk((fy) => H1B_NATIONAL[fy]?.denials ?? 0, H1B_YEARS, [LATEST_COMPLETE_FY]),
      trend: dir(h1bDenPct),
      trendPct: h1bDenPct,
    }),
    buildMetric({
      key: "f1_visas_year",
      label: "F-1 student visas",
      unit: "visas",
      group: "visa",
      href: "/visa/f1-student-visas",
      status: "AMBER",
      tooltip:
        "F-1 academic student visas issued by U.S. consulates (Department of State). FY2026 is year-to-date with a projected full-year pace.",
      latest: mp(f1Now.issued, CURRENT_FY, "ytd", UPDATED.dos_visa, true),
      lastComplete: mp(f1Complete.issued, LATEST_COMPLETE_FY, "complete", UPDATED.dos_visa, false),
      src: SRC.dos,
      spark: spk((fy) => visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === fy)?.issued ?? 0, MACRO_YEARS, [CURRENT_FY]),
      trend: f1Trend.trend,
      trendPct: f1Trend.trendPct,
      paceEstimated: true,
    }),
    buildMetric({
      key: "top_h1b_employer",
      label: "Top H-1B sponsoring employer",
      unit: "approvals",
      group: "workforce",
      href: `/company/${topEmployer.slug}`,
      status: "GREEN",
      tooltip:
        "Employer with the most H-1B approvals in the latest available USCIS Employer Data Hub release (FY2024). Sponsorship volume does not by itself indicate displacement of U.S. workers.",
      latest: mp(topEmployer.approvals, EMPLOYER_LATEST_FY, "complete", UPDATED.uscis_h1b, true, { display: topEmployer.name }),
      src: SRC.uscisHub,
    }),
    buildMetric({
      key: "avg_h1b_wage",
      label: "Average H-1B offered wage",
      unit: "USD",
      group: "workforce",
      href: "/layoffs-vs-h1b",
      status: "GREEN",
      tooltip:
        "Approval-weighted average offered wage across the top H-1B employers (DOL LCA disclosure data), latest available year (FY2024).",
      latest: mp(avgWage, EMPLOYER_LATEST_FY, "complete", UPDATED.dol_lca, true),
      src: SRC.dol,
      spark: spk(weightedWage, EMP_YEARS, []),
      trend: "UP",
    }),
    buildMetric({
      key: "layoffs_year",
      label: "Layoffs tracked",
      unit: "employees",
      group: "workforce",
      href: "/layoffs-vs-h1b",
      status: "AMBER",
      tooltip:
        "Employees affected by tracked WARN Act layoff notices in the current calendar year to date. Layoffs do not prove replacement by foreign workers — see methodology.",
      latest: mp(layoffsLatest, CURRENT_FY, "ytd", UPDATED.warn_layoffs, true, { labelOverride: `${CURRENT_FY} YTD` }),
      lastComplete: mp(layoffsComplete, LATEST_COMPLETE_FY, "complete", UPDATED.warn_layoffs, false, { labelOverride: `${LATEST_COMPLETE_FY}` }),
      src: SRC.warn,
      spark: spk(layoffsInYear, [2022, 2023, 2024, 2025, 2026], [CURRENT_FY]),
    }),
    buildMetric({
      key: "top_h1b_state",
      label: "Top state for H-1B sponsorship",
      group: "workforce",
      href: `/state/${topState.code}`,
      status: "GREEN",
      tooltip:
        "State with the largest share of H-1B sponsorship among the top employers and their worksites (latest available employer data, FY2024).",
      latest: mp(0, EMPLOYER_LATEST_FY, "complete", UPDATED.dol_lca, true, { display: topState.name }),
      src: SRC.dol,
    }),
    buildMetric({
      key: "top_nationality",
      label: "Top nationality — H-1B approvals",
      unit: "approvals",
      group: "visa",
      href: `/country/${countries.find((c) => c.name === topNationality.country)?.slug ?? "india"}`,
      status: "GREEN",
      tooltip:
        "Country of birth with the most H-1B approvals in the latest available USCIS data (FY2024): India, 283,397 of 399,395 — about 71%.",
      latest: mp(topNationality.issued, EMPLOYER_LATEST_FY, "complete", UPDATED.uscis_h1b, true, { display: topNationality.country ?? "—" }),
      src: SRC.uscisHub,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Search (employers, states, countries, visa types, job titles)
// ---------------------------------------------------------------------------
export interface SearchResult {
  type: "company" | "state" | "country" | "visa" | "occupation";
  label: string;
  sublabel: string;
  href: string;
}

export function search(query: string): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: SearchResult[] = [];

  for (const c of companies) {
    if (c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q)) {
      results.push({
        type: "company",
        label: c.name,
        sublabel: `${c.industry} · ${c.headquartersCity}, ${c.stateCode}`,
        href: `/company/${c.slug}`,
      });
    }
  }
  for (const s of states) {
    if (s.name.toLowerCase().includes(q) || s.code.toLowerCase() === q) {
      results.push({
        type: "state",
        label: s.name,
        sublabel: `State · ${s.region}`,
        href: `/state/${s.code}`,
      });
    }
  }
  for (const c of countries) {
    if (c.name.toLowerCase().includes(q)) {
      results.push({
        type: "country",
        label: c.name,
        sublabel: `Country · ${c.region}`,
        href: `/country/${c.slug}`,
      });
    }
  }
  for (const v of visaClasses()) {
    if (v.toLowerCase().includes(q)) {
      results.push({
        type: "visa",
        label: v,
        sublabel: "Visa class",
        href: v === "F-1" ? "/visa/f1-student-visas" : "/h1b/top-sponsors",
      });
    }
  }
  const occSet = new Set<string>();
  for (const c of companies)
    for (const t of c.topJobTitles)
      if (t.title.toLowerCase().includes(q)) occSet.add(t.title);
  for (const title of occSet) {
    results.push({
      type: "occupation",
      label: title,
      sublabel: "Job title · H-1B salaries",
      href: `/h1b/salaries/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    });
  }
  return results.slice(0, 12);
}
