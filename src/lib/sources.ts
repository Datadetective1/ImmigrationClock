import type { SourceDef } from "./types";

// Canonical public data sources. Every dataset rendered in the app maps back to
// one of these. URLs point at the official agency landing pages.
export const SOURCES: SourceDef[] = [
  {
    key: "uscis_h1b",
    name: "USCIS H-1B Employer Data Hub",
    agency: "U.S. Citizenship and Immigration Services (DHS)",
    description:
      "Employer-level counts of H-1B petition approvals and denials (initial and continuing) by fiscal year.",
    homepageUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
    datasetUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
    cadence: "annual",
  },
  {
    key: "dol_lca",
    name: "DOL OFLC Disclosure Data (LCA / PERM)",
    agency: "U.S. Department of Labor, Office of Foreign Labor Certification",
    description:
      "Labor Condition Application (LCA) and PERM disclosure files: job titles, worksites, offered and prevailing wages.",
    homepageUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance",
    datasetUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance",
    cadence: "quarterly",
  },
  {
    key: "ice_stats",
    name: "ICE Enforcement and Removal Statistics",
    agency: "U.S. Immigration and Customs Enforcement (DHS)",
    description:
      "Administrative arrests, removals, detention population, and criminality breakdowns.",
    homepageUrl: "https://www.ice.gov/statistics",
    datasetUrl: "https://www.ice.gov/statistics",
    cadence: "annual",
  },
  {
    key: "dhs_stats",
    name: "DHS Immigration Statistics (OHSS)",
    agency: "U.S. Department of Homeland Security, Office of Homeland Security Statistics",
    description:
      "Yearbook of Immigration Statistics and enforcement lifecycle reporting.",
    homepageUrl: "https://www.dhs.gov/immigration-statistics",
    datasetUrl: "https://www.dhs.gov/immigration-statistics",
    cadence: "annual",
  },
  {
    key: "cbp_encounters",
    name: "CBP Nationwide Encounters",
    agency: "U.S. Customs and Border Protection (DHS)",
    description:
      "Southwest, northern, and nationwide encounters by month, sector, demographic, and citizenship.",
    homepageUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
    datasetUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
    cadence: "monthly",
  },
  {
    key: "dos_visa",
    name: "Department of State Visa Statistics",
    agency: "U.S. Department of State, Bureau of Consular Affairs",
    description:
      "Nonimmigrant and immigrant visa issuances by class and country (NIV/IV tables).",
    homepageUrl:
      "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html",
    datasetUrl:
      "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html",
    cadence: "monthly",
  },
  {
    key: "bls_wages",
    name: "BLS Occupational Employment & Wage Statistics",
    agency: "U.S. Bureau of Labor Statistics",
    description:
      "Mean and median wages and employment by occupation and state (OEWS).",
    homepageUrl: "https://www.bls.gov/oes/",
    datasetUrl: "https://www.bls.gov/oes/tables.htm",
    cadence: "annual",
  },
  {
    key: "warn_layoffs",
    name: "State WARN Act Layoff Notices",
    agency: "State labor / workforce agencies (WARN Act filings)",
    description:
      "Employer layoff and plant-closing notices with employee counts, aggregated across state portals.",
    homepageUrl: "https://www.dol.gov/agencies/eta/layoffs/warn",
    datasetUrl: "https://www.dol.gov/agencies/eta/layoffs/warn",
    cadence: "weekly",
  },
  {
    key: "trac",
    name: "TRAC Immigration (Syracuse University)",
    agency: "Transactional Records Access Clearinghouse",
    description:
      "FOIA-derived immigration court, detention, and enforcement data used for cross-checks.",
    homepageUrl: "https://trac.syr.edu/immigration/",
    datasetUrl: "https://trac.syr.edu/immigration/",
    cadence: "monthly",
  },
];

export const SOURCE_BY_KEY: Record<string, SourceDef> = Object.fromEntries(
  SOURCES.map((s) => [s.key, s])
);

export function sourceRef(key: string, updatedAt: string) {
  const s = SOURCE_BY_KEY[key];
  return {
    sourceName: s?.name ?? "Public dataset",
    sourceUrl: s?.homepageUrl ?? "https://www.dhs.gov/immigration-statistics",
    sourceUpdatedAt: updatedAt,
  };
}
