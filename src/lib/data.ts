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
  FY_COMPLETENESS,
  UPDATED,
} from "./sample-data";
import type { Metric, Company, SourceRef } from "./types";

// Pull only provenance fields off a record (avoids leaking fiscalYear etc).
const srcRef = (r: SourceRef) => ({
  sourceName: r.sourceName,
  sourceUrl: r.sourceUrl,
  sourceUpdatedAt: r.sourceUpdatedAt,
});

export const LAST_COMPLETE_FY = CURRENT_FY - 1;

// Re-export time-frame constants so pages can import them from the data layer.
export { CURRENT_FY, FISCAL_YEARS, FY_COMPLETENESS } from "./sample-data";

// National H-1B totals (USCIS) — the tracked 10 employers are a subset of this.
const H1B_NATIONAL = { approvalsBase: 401000, denialsBase: 27000, trend: 1.02 };

function annualize(partialValue: number): number {
  return Math.round(partialValue / FY_COMPLETENESS);
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

  // Multi-year H-1B + F-1 for this country (apply weight to national series).
  const weightSum = countries.reduce(
    (s, c) => s + (countrySeedBySlug[c.slug]?.visaWeight ?? 0),
    0
  );
  const series = FISCAL_YEARS.map((fy) => {
    const h1bNational = visaRows.find((v) => v.visaClass === "H-1B" && v.fiscalYear === fy)?.issued ?? 0;
    const f1National = visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === fy)?.issued ?? 0;
    return {
      fiscalYear: fy,
      h1b: Math.round((h1bNational * seed.visaWeight) / weightSum),
      f1: Math.round((f1National * seed.visaWeight) / weightSum),
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
// Live counter grid (homepage)
// ---------------------------------------------------------------------------
export function buildMetrics(): Metric[] {
  const iceNow = iceByFy[CURRENT_FY];
  const icePrev = iceByFy[LAST_COMPLETE_FY];
  const cbpNow = cbpRows.find((r) => r.fiscalYear === CURRENT_FY && r.border === "nationwide")!;
  const cbpPrev = cbpRows.find((r) => r.fiscalYear === LAST_COMPLETE_FY && r.border === "nationwide")!;

  const sponsors = topSponsors(LAST_COMPLETE_FY);
  const topEmployer = sponsors[0];
  const avgWage = Math.round(
    sponsors.reduce((s, c) => s + c.avgWage * c.approvals, 0) /
      sponsors.reduce((s, c) => s + c.approvals, 0)
  );

  const f1Now = visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === CURRENT_FY)!;
  const f1Prev = visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === LAST_COMPLETE_FY)!;

  // National H-1B approvals/denials with current-year pace.
  const h1bApprovalsFull = Math.round(
    H1B_NATIONAL.approvalsBase * Math.pow(H1B_NATIONAL.trend, CURRENT_FY - FISCAL_YEARS[0])
  );
  const h1bApprovalsNow = Math.round(h1bApprovalsFull * FY_COMPLETENESS);
  const h1bDenialsFull = Math.round(
    H1B_NATIONAL.denialsBase * Math.pow(H1B_NATIONAL.trend, CURRENT_FY - FISCAL_YEARS[0])
  );
  const h1bDenialsNow = Math.round(h1bDenialsFull * FY_COMPLETENESS);

  const layoffsThisYear = layoffRows
    .filter((l) => l.noticeDate.startsWith(String(LAST_COMPLETE_FY)) || l.noticeDate.startsWith(String(CURRENT_FY)))
    .reduce((s, l) => s + l.employeesAffected, 0);

  const topState = states
    .map((s) => ({ code: s.code, name: s.name, w: stateWeight[s.code] ?? 0 }))
    .sort((a, b) => b.w - a.w)[0];

  const topNationality = visaByCountry
    .filter((v) => v.visaClass === "H-1B")
    .sort((a, b) => b.issued - a.issued)[0];

  const m = (x: Metric): Metric => x;
  return [
    m({
      key: "ice_arrests_fy",
      label: "ICE arrests this fiscal year",
      value: iceNow.arrests,
      unit: "people",
      fiscalYear: CURRENT_FY,
      paceEstimated: true,
      trend: dir(pct(annualize(iceNow.arrests), icePrev.arrests)),
      trendPct: pct(annualize(iceNow.arrests), icePrev.arrests),
      status: "RED",
      tooltip:
        "Administrative arrests by ICE so far this fiscal year. An arrest is not a deportation — see the methodology page. Current-year totals are partial and the pace is projected from prior-year reporting.",
      group: "enforcement",
      href: "/immigration/enforcement-trends",
      ...srcRef(iceNow),
    }),
    m({
      key: "removals_fy",
      label: "Deportations / removals this fiscal year",
      value: iceNow.removals,
      unit: "people",
      fiscalYear: CURRENT_FY,
      paceEstimated: true,
      trend: dir(pct(annualize(iceNow.removals), icePrev.removals)),
      trendPct: pct(annualize(iceNow.removals), icePrev.removals),
      status: "RED",
      tooltip:
        "Noncitizens removed from the U.S. under an order of removal this fiscal year. Removals differ from arrests and from detention counts.",
      group: "enforcement",
      href: "/immigration/enforcement-trends",
      ...srcRef(iceNow),
    }),
    m({
      key: "detention_population",
      label: "Current ICE detention population",
      value: iceNow.detentionAvgDaily,
      unit: "people",
      fiscalYear: CURRENT_FY,
      paceEstimated: false,
      trend: dir(pct(iceNow.detentionAvgDaily, icePrev.detentionAvgDaily)),
      trendPct: pct(iceNow.detentionAvgDaily, icePrev.detentionAvgDaily),
      status: "AMBER",
      tooltip:
        "Average daily population in ICE detention — a point-in-time snapshot, not a fiscal-year running total.",
      group: "enforcement",
      href: "/immigration/enforcement-trends",
      ...srcRef(iceNow),
    }),
    m({
      key: "border_encounters_fy",
      label: "Border encounters this fiscal year",
      value: cbpNow.totalEncounters,
      unit: "encounters",
      fiscalYear: CURRENT_FY,
      paceEstimated: true,
      trend: dir(pct(annualize(cbpNow.totalEncounters), cbpPrev.totalEncounters)),
      trendPct: pct(annualize(cbpNow.totalEncounters), cbpPrev.totalEncounters),
      status: "GREEN",
      tooltip:
        "CBP nationwide encounters this fiscal year. An encounter is an event, not a person, and is not the same as a deportation.",
      group: "border",
      href: "/border/encounters",
      ...srcRef(cbpNow),
    }),
    m({
      key: "h1b_approvals_fy",
      label: "H-1B approvals this fiscal year",
      value: h1bApprovalsNow,
      unit: "petitions",
      fiscalYear: CURRENT_FY,
      paceEstimated: true,
      trend: dir(pct(h1bApprovalsFull, Math.round(H1B_NATIONAL.approvalsBase * Math.pow(H1B_NATIONAL.trend, LAST_COMPLETE_FY - FISCAL_YEARS[0])))),
      trendPct: pct(h1bApprovalsFull, Math.round(H1B_NATIONAL.approvalsBase * Math.pow(H1B_NATIONAL.trend, LAST_COMPLETE_FY - FISCAL_YEARS[0]))),
      status: "GREEN",
      tooltip:
        "USCIS H-1B petition approvals (initial + continuing) nationwide. USCIS approvals are not the same as State Department visa issuances.",
      group: "visa",
      href: "/h1b/top-sponsors",
      ...{ sourceName: "USCIS H-1B Employer Data Hub", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: UPDATED.uscis_h1b },
    }),
    m({
      key: "h1b_denials_fy",
      label: "H-1B denials this fiscal year",
      value: h1bDenialsNow,
      unit: "petitions",
      fiscalYear: CURRENT_FY,
      paceEstimated: true,
      trend: dir(pct(h1bDenialsFull, Math.round(H1B_NATIONAL.denialsBase * Math.pow(H1B_NATIONAL.trend, LAST_COMPLETE_FY - FISCAL_YEARS[0])))),
      trendPct: pct(h1bDenialsFull, Math.round(H1B_NATIONAL.denialsBase * Math.pow(H1B_NATIONAL.trend, LAST_COMPLETE_FY - FISCAL_YEARS[0]))),
      status: "AMBER",
      tooltip:
        "USCIS H-1B petition denials nationwide this fiscal year. Denial rates vary year to year with policy and case mix.",
      group: "visa",
      href: "/h1b/top-sponsors",
      ...{ sourceName: "USCIS H-1B Employer Data Hub", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: UPDATED.uscis_h1b },
    }),
    m({
      key: "f1_visas_year",
      label: "F-1 student visas issued this year",
      value: f1Now.issued,
      unit: "visas",
      fiscalYear: CURRENT_FY,
      paceEstimated: true,
      trend: dir(pct(annualize(f1Now.issued), f1Prev.issued)),
      trendPct: pct(annualize(f1Now.issued), f1Prev.issued),
      status: "GREEN",
      tooltip:
        "F-1 academic student visas issued by U.S. consulates this fiscal year (Department of State).",
      group: "visa",
      href: "/visa/f1-student-visas",
      ...srcRef(f1Now),
    }),
    m({
      key: "top_h1b_employer",
      label: "Top H-1B sponsoring employer",
      value: topEmployer.approvals,
      display: topEmployer.name,
      unit: "approvals",
      fiscalYear: LAST_COMPLETE_FY,
      paceEstimated: false,
      trend: "FLAT",
      status: "GREEN",
      tooltip:
        "Employer with the most H-1B approvals among tracked employers in the latest complete fiscal year. Sponsorship volume does not by itself indicate displacement of U.S. workers.",
      group: "workforce",
      href: `/company/${topEmployer.slug}`,
      ...{ sourceName: "USCIS H-1B Employer Data Hub", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: UPDATED.uscis_h1b },
    }),
    m({
      key: "avg_h1b_wage",
      label: "Average H-1B offered wage",
      value: avgWage,
      unit: "USD",
      fiscalYear: LAST_COMPLETE_FY,
      paceEstimated: false,
      trend: "UP",
      status: "GREEN",
      tooltip:
        "Approval-weighted average offered wage across tracked H-1B employers (DOL LCA disclosure data), latest complete fiscal year.",
      group: "workforce",
      href: "/layoffs-vs-h1b",
      ...{ sourceName: "DOL OFLC Disclosure Data (LCA / PERM)", sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance", sourceUpdatedAt: UPDATED.dol_lca },
    }),
    m({
      key: "layoffs_year",
      label: "Layoffs tracked this year",
      value: layoffsThisYear,
      unit: "employees",
      fiscalYear: CURRENT_FY,
      paceEstimated: false,
      trend: "DOWN",
      status: "AMBER",
      tooltip:
        "Employees affected by WARN Act layoff notices we track. Layoffs do not prove replacement by foreign workers — see methodology.",
      group: "workforce",
      href: "/layoffs-vs-h1b",
      ...{ sourceName: "State WARN Act Layoff Notices", sourceUrl: "https://www.dol.gov/agencies/eta/layoffs/warn", sourceUpdatedAt: UPDATED.warn_layoffs },
    }),
    m({
      key: "top_h1b_state",
      label: "Top state for H-1B sponsorship",
      value: 0,
      display: topState.name,
      fiscalYear: LAST_COMPLETE_FY,
      paceEstimated: false,
      trend: "FLAT",
      status: "GREEN",
      tooltip:
        "State with the largest share of H-1B sponsorship among tracked employers and worksites.",
      group: "workforce",
      href: `/state/${topState.code}`,
      ...{ sourceName: "DOL OFLC Disclosure Data (LCA / PERM)", sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance", sourceUpdatedAt: UPDATED.dol_lca },
    }),
    m({
      key: "top_nationality",
      label: "Top nationality — H-1B visas",
      value: topNationality.issued,
      display: topNationality.country ?? "—",
      unit: "visas",
      fiscalYear: LAST_COMPLETE_FY,
      paceEstimated: false,
      trend: "FLAT",
      status: "GREEN",
      tooltip:
        "Country of nationality receiving the most H-1B visas in the latest complete fiscal year (Department of State).",
      group: "visa",
      href: `/country/${countries.find((c) => c.name === topNationality.country)?.slug ?? "india"}`,
      ...{ sourceName: "Department of State Visa Statistics", sourceUrl: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html", sourceUpdatedAt: UPDATED.dos_visa },
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
