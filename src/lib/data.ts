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
  H1B_NATIONAL,
  DETENTION_NOW,
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
// Live counter grid (homepage)
// ---------------------------------------------------------------------------
export function buildMetrics(): Metric[] {
  const fy = LAST_COMPLETE_FY; // FY2024 — latest fully-reported year across sources
  const prevFy = fy - 1;
  const ice = iceByFy[fy];
  const icePrev = iceByFy[prevFy];
  const cbp = cbpRows.find((r) => r.fiscalYear === fy && r.border === "nationwide")!;
  const cbpPrev = cbpRows.find((r) => r.fiscalYear === prevFy && r.border === "nationwide")!;

  const sponsors = topSponsors(fy);
  const topEmployer = sponsors[0];
  const avgWage = Math.round(
    sponsors.reduce((s, c) => s + c.avgWage * c.approvals, 0) /
      sponsors.reduce((s, c) => s + c.approvals, 0)
  );

  const f1 = visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === fy)!;
  const f1Prev = visaRows.find((v) => v.visaClass === "F-1" && v.fiscalYear === prevFy)!;

  const h1b = H1B_NATIONAL[fy];
  const h1bPrev = H1B_NATIONAL[prevFy];

  const layoffsTracked = layoffRows
    .filter(
      (l) =>
        l.noticeDate.startsWith(String(prevFy)) ||
        l.noticeDate.startsWith(String(fy)) ||
        l.noticeDate.startsWith(String(fy + 1))
    )
    .reduce((s, l) => s + l.employeesAffected, 0);

  const topState = states
    .map((s) => ({ code: s.code, name: s.name, w: stateWeight[s.code] ?? 0 }))
    .sort((a, b) => b.w - a.w)[0];

  const topNationality = visaByCountry
    .filter((v) => v.visaClass === "H-1B")
    .sort((a, b) => b.issued - a.issued)[0];

  const fyTag = `FY${fy}`;
  const uscis = {
    sourceName: "USCIS H-1B Employer Data Hub",
    sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
    sourceUpdatedAt: UPDATED.uscis_h1b,
  };

  const m = (x: Metric): Metric => x;
  return [
    m({
      key: "ice_arrests_fy",
      label: `ICE arrests · ${fyTag}`,
      value: ice.arrests,
      unit: "people",
      fiscalYear: fy,
      paceEstimated: false,
      trend: dir(pct(ice.arrests, icePrev.arrests)),
      trendPct: pct(ice.arrests, icePrev.arrests),
      status: "RED",
      tooltip:
        "Administrative arrests by ICE in the latest full-year report (FY2024). An arrest is not a deportation — see the methodology page. ICE reports interior arrests rose sharply in FY2025.",
      group: "enforcement",
      href: "/immigration/enforcement-trends",
      ...srcRef(ice),
    }),
    m({
      key: "removals_fy",
      label: `Deportations / removals · ${fyTag}`,
      value: ice.removals,
      unit: "people",
      fiscalYear: fy,
      paceEstimated: false,
      trend: dir(pct(ice.removals, icePrev.removals)),
      trendPct: pct(ice.removals, icePrev.removals),
      status: "RED",
      tooltip:
        "Noncitizens removed under an order of removal in FY2024 — the highest single-year total in over a decade (ICE). Removals differ from arrests and from detention counts.",
      group: "enforcement",
      href: "/immigration/enforcement-trends",
      ...srcRef(ice),
    }),
    m({
      key: "detention_population",
      label: "ICE detention population (current)",
      value: DETENTION_NOW.value,
      unit: "people",
      paceEstimated: false,
      trend: dir(pct(DETENTION_NOW.value, ice.detentionAvgDaily)),
      trendPct: pct(DETENTION_NOW.value, ice.detentionAvgDaily),
      status: "RED",
      tooltip:
        "People in ICE detention as of the date shown — among the highest levels in the system's history. A point-in-time figure, not a fiscal-year total.",
      group: "enforcement",
      href: "/immigration/enforcement-trends",
      sourceName: "ICE Enforcement and Removal Statistics",
      sourceUrl: "https://www.ice.gov/statistics",
      sourceUpdatedAt: DETENTION_NOW.asOf,
    }),
    m({
      key: "border_encounters_fy",
      label: `Border encounters · ${fyTag}`,
      value: cbp.totalEncounters,
      unit: "encounters",
      fiscalYear: fy,
      paceEstimated: false,
      trend: dir(pct(cbp.totalEncounters, cbpPrev.totalEncounters)),
      trendPct: pct(cbp.totalEncounters, cbpPrev.totalEncounters),
      status: "GREEN",
      tooltip:
        "CBP nationwide encounters in FY2024. Encounters then fell to historic lows in FY2025. An encounter is an event, not a person, and is not a deportation.",
      group: "border",
      href: "/border/encounters",
      ...srcRef(cbp),
    }),
    m({
      key: "h1b_approvals_fy",
      label: `H-1B approvals · ${fyTag}`,
      value: h1b.approvals,
      unit: "petitions",
      fiscalYear: fy,
      paceEstimated: false,
      trend: dir(pct(h1b.approvals, h1bPrev.approvals)),
      trendPct: pct(h1b.approvals, h1bPrev.approvals),
      status: "GREEN",
      tooltip:
        "USCIS H-1B petition approvals (initial + continuing) nationwide in FY2024 — 399,395 total, most of them renewals. USCIS approvals are not State Department visa issuances.",
      group: "visa",
      href: "/h1b/top-sponsors",
      ...uscis,
    }),
    m({
      key: "h1b_denials_fy",
      label: `H-1B denials · ${fyTag}`,
      value: h1b.denials,
      unit: "petitions",
      fiscalYear: fy,
      paceEstimated: false,
      trend: dir(pct(h1b.denials, h1bPrev.denials)),
      trendPct: pct(h1b.denials, h1bPrev.denials),
      status: "AMBER",
      tooltip:
        "USCIS H-1B petition denials nationwide in FY2024. Denial rates vary year to year with policy and case mix.",
      group: "visa",
      href: "/h1b/top-sponsors",
      ...uscis,
    }),
    m({
      key: "f1_visas_year",
      label: `F-1 student visas · ${fyTag}`,
      value: f1.issued,
      unit: "visas",
      fiscalYear: fy,
      paceEstimated: false,
      trend: dir(pct(f1.issued, f1Prev.issued)),
      trendPct: pct(f1.issued, f1Prev.issued),
      status: "AMBER",
      tooltip:
        "F-1 academic student visas issued by U.S. consulates in FY2024 (Department of State) — 401,007, down from 445,245 in FY2023.",
      group: "visa",
      href: "/visa/f1-student-visas",
      ...srcRef(f1),
    }),
    m({
      key: "top_h1b_employer",
      label: "Top H-1B sponsoring employer",
      value: topEmployer.approvals,
      display: topEmployer.name,
      unit: "approvals",
      fiscalYear: fy,
      paceEstimated: false,
      trend: "FLAT",
      status: "GREEN",
      tooltip:
        "Employer with the most H-1B approvals in FY2024 (USCIS H-1B Employer Data Hub). Sponsorship volume does not by itself indicate displacement of U.S. workers.",
      group: "workforce",
      href: `/company/${topEmployer.slug}`,
      ...uscis,
    }),
    m({
      key: "avg_h1b_wage",
      label: "Average H-1B offered wage",
      value: avgWage,
      unit: "USD",
      fiscalYear: fy,
      paceEstimated: false,
      trend: "UP",
      status: "GREEN",
      tooltip:
        "Approval-weighted average offered wage across the top H-1B employers (DOL LCA disclosure data), FY2024.",
      group: "workforce",
      href: "/layoffs-vs-h1b",
      ...{ sourceName: "DOL OFLC Disclosure Data (LCA / PERM)", sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance", sourceUpdatedAt: UPDATED.dol_lca },
    }),
    m({
      key: "layoffs_year",
      label: "Layoffs tracked (2023–2025)",
      value: layoffsTracked,
      unit: "employees",
      paceEstimated: false,
      trend: "FLAT",
      status: "AMBER",
      tooltip:
        "Employees affected by tracked WARN Act layoff notices, 2023–2025. Layoffs do not prove replacement by foreign workers — see methodology.",
      group: "workforce",
      href: "/layoffs-vs-h1b",
      ...{ sourceName: "State WARN Act Layoff Notices", sourceUrl: "https://www.dol.gov/agencies/eta/layoffs/warn", sourceUpdatedAt: UPDATED.warn_layoffs },
    }),
    m({
      key: "top_h1b_state",
      label: "Top state for H-1B sponsorship",
      value: 0,
      display: topState.name,
      fiscalYear: fy,
      paceEstimated: false,
      trend: "FLAT",
      status: "GREEN",
      tooltip:
        "State with the largest share of H-1B sponsorship among the top employers and their worksites.",
      group: "workforce",
      href: `/state/${topState.code}`,
      ...{ sourceName: "DOL OFLC Disclosure Data (LCA / PERM)", sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance", sourceUpdatedAt: UPDATED.dol_lca },
    }),
    m({
      key: "top_nationality",
      label: "Top nationality — H-1B approvals",
      value: topNationality.issued,
      display: topNationality.country ?? "—",
      unit: "approvals",
      fiscalYear: fy,
      paceEstimated: false,
      trend: "FLAT",
      status: "GREEN",
      tooltip:
        "Country of birth with the most H-1B approvals in FY2024 (USCIS): India, 283,397 of 399,395 — about 71%.",
      group: "visa",
      href: `/country/${countries.find((c) => c.name === topNationality.country)?.slug ?? "india"}`,
      ...uscis,
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
