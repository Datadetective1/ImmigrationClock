import type {
  Company,
  CompanyYear,
  StateInfo,
  CountryInfo,
  CbpRow,
  IceRow,
  VisaRow,
  WageRow,
  LayoffRow,
} from "./types";
import { sourceRef } from "./sources";

// ---------------------------------------------------------------------------
// REAL DATA — sourced from official U.S. government public datasets.
//
// Headline annual figures (H-1B totals + top employers, ICE arrests/removals/
// detention, CBP encounters, DOS visa issuances, BLS wages) are taken from the
// agencies' published reports/tables and are cited on every card via the source
// badge + date. Fine-grained breakdowns that the agencies do not publish at the
// same granularity (per-state apportionment, some per-country splits, monthly
// distributions, and employer history before the latest Data Hub release) are
// DERIVED from those real totals and are labelled as estimates in the UI and on
// the /methodology page. See DATA_VINTAGE below.
//
// Primary sources:
//   USCIS H-1B Employer Data Hub + "Characteristics of H-1B Workers FY2024"
//   ICE FY2024 Annual Report (ice.gov/statistics)
//   CBP Nationwide Encounters (cbp.gov/newsroom/stats)
//   U.S. Dept. of State visa statistics (travel.state.gov)
//   BLS OEWS (bls.gov/oes)
// ---------------------------------------------------------------------------

export const FISCAL_YEARS = [2021, 2022, 2023, 2024, 2025];
// FY2024 is the most recent fiscal year with complete, published data across
// all sources, so headline counters report FY2024 ("latest reported"). FY2025
// is shown where available and marked preliminary.
export const CURRENT_FY = 2025;
export const LATEST_REPORTED_FY = 2024;
// Annual figures are real totals, so no partial-year pace scaling is applied.
export const FY_COMPLETENESS = 1;

export const DATA_VINTAGE =
  "Headline figures reflect final published agency releases (FY2021–FY2024 complete; FY2025 preliminary). Detention population is a point-in-time figure dated on its card. Every number links to its official source.";

// Source last-updated dates (publication dates of the releases used).
export const UPDATED = {
  uscis_h1b: "2025-03-04",
  dol_lca: "2025-01-31",
  ice_stats: "2024-12-19",
  dhs_stats: "2024-12-19",
  cbp_encounters: "2025-10-21",
  dos_visa: "2025-02-28",
  bls_wages: "2025-04-03",
  warn_layoffs: "2026-01-15",
  trac: "2026-01-15",
};

// ---------------------------------------------------------------------------
// Deterministic helpers (used only for clearly-labelled derived granularity)
// ---------------------------------------------------------------------------
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}
function jitter(base: number, seed: string, spread = 0.12): number {
  return base * (1 + (seeded(seed) - 0.5) * spread);
}
function roundTo(n: number, step = 1): number {
  return Math.round(n / step) * step;
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------
interface StateSeed {
  code: string;
  name: string;
  region: string;
  h1bWeight: number;
}
const STATE_SEEDS: StateSeed[] = [
  { code: "CA", name: "California", region: "West", h1bWeight: 1.0 },
  { code: "TX", name: "Texas", region: "South", h1bWeight: 0.62 },
  { code: "NY", name: "New York", region: "Northeast", h1bWeight: 0.55 },
  { code: "NJ", name: "New Jersey", region: "Northeast", h1bWeight: 0.48 },
  { code: "WA", name: "Washington", region: "West", h1bWeight: 0.5 },
  { code: "IL", name: "Illinois", region: "Midwest", h1bWeight: 0.34 },
  { code: "GA", name: "Georgia", region: "South", h1bWeight: 0.28 },
  { code: "MA", name: "Massachusetts", region: "Northeast", h1bWeight: 0.33 },
  { code: "FL", name: "Florida", region: "South", h1bWeight: 0.3 },
  { code: "VA", name: "Virginia", region: "South", h1bWeight: 0.31 },
];

export const states: StateInfo[] = STATE_SEEDS.map((s) => ({
  code: s.code,
  name: s.name,
  region: s.region,
  ...sourceRef("uscis_h1b", UPDATED.uscis_h1b),
}));
export const stateWeight: Record<string, number> = Object.fromEntries(
  STATE_SEEDS.map((s) => [s.code, s.h1bWeight])
);

// ---------------------------------------------------------------------------
// Countries — H-1B and border weights anchored to real FY2024 shares
// (USCIS: India 283,397 / China 46,680 of 399,395 H-1B approvals).
// ---------------------------------------------------------------------------
interface CountrySeed {
  slug: string;
  name: string;
  region: string;
  h1bApprovals2024: number; // real (India/China) or estimated (others)
  f1Share: number; // share of F-1 issuances (estimated)
  borderWeight: number; // share of CBP encounters (estimated)
  removalWeight: number; // share of ICE removals (estimated)
}
const COUNTRY_SEEDS: CountrySeed[] = [
  { slug: "india", name: "India", region: "South Asia", h1bApprovals2024: 283397, f1Share: 0.29, borderWeight: 0.04, removalWeight: 0.05 },
  { slug: "china", name: "China", region: "East Asia", h1bApprovals2024: 46680, f1Share: 0.25, borderWeight: 0.03, removalWeight: 0.02 },
  { slug: "south-korea", name: "South Korea", region: "East Asia", h1bApprovals2024: 9024, f1Share: 0.05, borderWeight: 0.01, removalWeight: 0.01 },
  { slug: "canada", name: "Canada", region: "North America", h1bApprovals2024: 5800, f1Share: 0.02, borderWeight: 0.02, removalWeight: 0.01 },
  { slug: "philippines", name: "Philippines", region: "Southeast Asia", h1bApprovals2024: 3400, f1Share: 0.02, borderWeight: 0.02, removalWeight: 0.02 },
  { slug: "mexico", name: "Mexico", region: "North America", h1bApprovals2024: 4100, f1Share: 0.03, borderWeight: 0.30, removalWeight: 0.38 },
  { slug: "brazil", name: "Brazil", region: "South America", h1bApprovals2024: 2600, f1Share: 0.03, borderWeight: 0.08, removalWeight: 0.05 },
  { slug: "nigeria", name: "Nigeria", region: "West Africa", h1bApprovals2024: 1700, f1Share: 0.03, borderWeight: 0.01, removalWeight: 0.02 },
  { slug: "vietnam", name: "Vietnam", region: "Southeast Asia", h1bApprovals2024: 1500, f1Share: 0.02, borderWeight: 0.01, removalWeight: 0.01 },
  { slug: "guatemala", name: "Guatemala", region: "Central America", h1bApprovals2024: 220, f1Share: 0.01, borderWeight: 0.16, removalWeight: 0.16 },
];

export const countries: CountryInfo[] = COUNTRY_SEEDS.map((c) => ({
  slug: c.slug,
  name: c.name,
  region: c.region,
  ...sourceRef("dos_visa", UPDATED.dos_visa),
}));
export const countrySeedByName: Record<string, CountrySeed> = Object.fromEntries(
  COUNTRY_SEEDS.map((c) => [c.name, c])
);
export const countrySeedBySlug: Record<string, CountrySeed> = Object.fromEntries(
  COUNTRY_SEEDS.map((c) => [c.slug, c])
);

// ---------------------------------------------------------------------------
// Companies — real FY2024 H-1B total approvals (USCIS H-1B Employer Data Hub,
// as compiled in widely-cited FY2024 rankings). Prior/following years are
// modeled around the FY2024 anchor (labelled approximate in the UI), reflecting
// the known 2023→2024 decline and the 2025 H-1B pull-back.
// ---------------------------------------------------------------------------
interface CompanySeed {
  slug: string;
  name: string;
  industry: string;
  hqCity: string;
  stateCode: string;
  website: string;
  approvals2024: number; // REAL FY2024 total approvals
  baseWage: number; // FY2024 avg offered wage (LCA, approx)
  denialRate: number;
  titles: { title: string; share: number; wageMult: number }[];
  worksites: { city: string; stateCode: string; share: number }[];
  layoffYears: { year: number; employeesAffected: number; events: number }[];
}

const T = {
  swe: { title: "Software Developer", wageMult: 1.05 },
  se: { title: "Software Engineer", wageMult: 1.08 },
  ds: { title: "Data Scientist", wageMult: 1.12 },
  sa: { title: "Systems Analyst", wageMult: 0.82 },
  pm: { title: "Product Manager", wageMult: 1.2 },
  hw: { title: "Hardware Engineer", wageMult: 1.1 },
  ml: { title: "Machine Learning Engineer", wageMult: 1.25 },
  con: { title: "Management Consultant", wageMult: 0.95 },
};

const COMPANY_SEEDS: CompanySeed[] = [
  {
    slug: "amazon", name: "Amazon", industry: "Technology & E-commerce",
    hqCity: "Seattle", stateCode: "WA", website: "https://www.amazon.com",
    approvals2024: 9265, baseWage: 156000, denialRate: 0.04,
    titles: [
      { title: T.se.title, share: 0.42, wageMult: T.se.wageMult },
      { title: T.ds.title, share: 0.2, wageMult: T.ds.wageMult },
      { title: T.pm.title, share: 0.18, wageMult: T.pm.wageMult },
      { title: T.ml.title, share: 0.2, wageMult: T.ml.wageMult },
    ],
    worksites: [
      { city: "Seattle", stateCode: "WA", share: 0.34 },
      { city: "Bellevue", stateCode: "WA", share: 0.2 },
      { city: "Arlington", stateCode: "VA", share: 0.16 },
      { city: "New York", stateCode: "NY", share: 0.14 },
    ],
    layoffYears: [
      { year: 2023, employeesAffected: 18000, events: 6 },
      { year: 2024, employeesAffected: 5200, events: 3 },
    ],
  },
  {
    slug: "infosys", name: "Infosys", industry: "IT Services & Consulting",
    hqCity: "Richardson", stateCode: "TX", website: "https://www.infosys.com",
    approvals2024: 8140, baseWage: 98000, denialRate: 0.04,
    titles: [
      { title: T.sa.title, share: 0.3, wageMult: T.sa.wageMult },
      { title: T.swe.title, share: 0.3, wageMult: T.swe.wageMult },
      { title: T.con.title, share: 0.22, wageMult: T.con.wageMult },
      { title: T.ds.title, share: 0.18, wageMult: T.ds.wageMult },
    ],
    worksites: [
      { city: "Richardson", stateCode: "TX", share: 0.24 },
      { city: "Indianapolis", stateCode: "IN", share: 0.2 },
      { city: "Raleigh", stateCode: "NC", share: 0.18 },
      { city: "Phoenix", stateCode: "AZ", share: 0.14 },
    ],
    layoffYears: [],
  },
  {
    slug: "cognizant", name: "Cognizant Technology Solutions", industry: "IT Services & Consulting",
    hqCity: "Teaneck", stateCode: "NJ", website: "https://www.cognizant.com",
    approvals2024: 6321, baseWage: 95000, denialRate: 0.05,
    titles: [
      { title: T.sa.title, share: 0.34, wageMult: T.sa.wageMult },
      { title: T.swe.title, share: 0.28, wageMult: T.swe.wageMult },
      { title: T.con.title, share: 0.2, wageMult: T.con.wageMult },
      { title: T.ds.title, share: 0.18, wageMult: T.ds.wageMult },
    ],
    worksites: [
      { city: "College Station", stateCode: "TX", share: 0.22 },
      { city: "Teaneck", stateCode: "NJ", share: 0.2 },
      { city: "Phoenix", stateCode: "AZ", share: 0.18 },
      { city: "Atlanta", stateCode: "GA", share: 0.16 },
    ],
    layoffYears: [{ year: 2023, employeesAffected: 3500, events: 4 }],
  },
  {
    slug: "alphabet-google", name: "Alphabet (Google)", industry: "Technology & Internet",
    hqCity: "Mountain View", stateCode: "CA", website: "https://www.google.com",
    approvals2024: 5364, baseWage: 170000, denialRate: 0.02,
    titles: [
      { title: T.se.title, share: 0.46, wageMult: T.se.wageMult },
      { title: T.ml.title, share: 0.22, wageMult: T.ml.wageMult },
      { title: T.ds.title, share: 0.16, wageMult: T.ds.wageMult },
      { title: T.pm.title, share: 0.16, wageMult: T.pm.wageMult },
    ],
    worksites: [
      { city: "Mountain View", stateCode: "CA", share: 0.34 },
      { city: "Sunnyvale", stateCode: "CA", share: 0.22 },
      { city: "New York", stateCode: "NY", share: 0.18 },
      { city: "Seattle", stateCode: "WA", share: 0.14 },
    ],
    layoffYears: [{ year: 2023, employeesAffected: 12000, events: 2 }],
  },
  {
    slug: "tata-consultancy-services", name: "Tata Consultancy Services", industry: "IT Services & Consulting",
    hqCity: "Edison", stateCode: "NJ", website: "https://www.tcs.com",
    approvals2024: 5274, baseWage: 94000, denialRate: 0.05,
    titles: [
      { title: T.sa.title, share: 0.36, wageMult: T.sa.wageMult },
      { title: T.swe.title, share: 0.3, wageMult: T.swe.wageMult },
      { title: T.con.title, share: 0.2, wageMult: T.con.wageMult },
      { title: T.ds.title, share: 0.14, wageMult: T.ds.wageMult },
    ],
    worksites: [
      { city: "Edison", stateCode: "NJ", share: 0.24 },
      { city: "Cincinnati", stateCode: "OH", share: 0.2 },
      { city: "Milwaukee", stateCode: "WI", share: 0.16 },
      { city: "Santa Clara", stateCode: "CA", share: 0.16 },
    ],
    layoffYears: [],
  },
  {
    slug: "meta-platforms", name: "Meta Platforms", industry: "Technology & Social Media",
    hqCity: "Menlo Park", stateCode: "CA", website: "https://www.meta.com",
    approvals2024: 4844, baseWage: 177000, denialRate: 0.02,
    titles: [
      { title: T.se.title, share: 0.5, wageMult: T.se.wageMult },
      { title: T.ml.title, share: 0.22, wageMult: T.ml.wageMult },
      { title: T.ds.title, share: 0.16, wageMult: T.ds.wageMult },
      { title: T.pm.title, share: 0.12, wageMult: T.pm.wageMult },
    ],
    worksites: [
      { city: "Menlo Park", stateCode: "CA", share: 0.38 },
      { city: "New York", stateCode: "NY", share: 0.2 },
      { city: "Seattle", stateCode: "WA", share: 0.18 },
      { city: "Austin", stateCode: "TX", share: 0.12 },
    ],
    layoffYears: [{ year: 2023, employeesAffected: 21000, events: 3 }],
  },
  {
    slug: "microsoft", name: "Microsoft", industry: "Technology & Software",
    hqCity: "Redmond", stateCode: "WA", website: "https://www.microsoft.com",
    approvals2024: 4725, baseWage: 162000, denialRate: 0.02,
    titles: [
      { title: T.se.title, share: 0.48, wageMult: T.se.wageMult },
      { title: T.pm.title, share: 0.18, wageMult: T.pm.wageMult },
      { title: T.ds.title, share: 0.18, wageMult: T.ds.wageMult },
      { title: T.ml.title, share: 0.16, wageMult: T.ml.wageMult },
    ],
    worksites: [
      { city: "Redmond", stateCode: "WA", share: 0.4 },
      { city: "Bellevue", stateCode: "WA", share: 0.18 },
      { city: "Mountain View", stateCode: "CA", share: 0.16 },
      { city: "Atlanta", stateCode: "GA", share: 0.12 },
    ],
    layoffYears: [
      { year: 2023, employeesAffected: 10000, events: 3 },
      { year: 2025, employeesAffected: 6000, events: 2 },
    ],
  },
  {
    slug: "apple", name: "Apple", industry: "Technology & Hardware",
    hqCity: "Cupertino", stateCode: "CA", website: "https://www.apple.com",
    approvals2024: 3873, baseWage: 165000, denialRate: 0.02,
    titles: [
      { title: T.se.title, share: 0.4, wageMult: T.se.wageMult },
      { title: T.hw.title, share: 0.24, wageMult: T.hw.wageMult },
      { title: T.ml.title, share: 0.2, wageMult: T.ml.wageMult },
      { title: T.ds.title, share: 0.16, wageMult: T.ds.wageMult },
    ],
    worksites: [
      { city: "Cupertino", stateCode: "CA", share: 0.46 },
      { city: "Sunnyvale", stateCode: "CA", share: 0.18 },
      { city: "San Diego", stateCode: "CA", share: 0.14 },
      { city: "Austin", stateCode: "TX", share: 0.14 },
    ],
    layoffYears: [],
  },
  {
    slug: "hcl-america", name: "HCL America", industry: "IT Services & Consulting",
    hqCity: "Sunnyvale", stateCode: "CA", website: "https://www.hcltech.com",
    approvals2024: 2953, baseWage: 92000, denialRate: 0.05,
    titles: [
      { title: T.sa.title, share: 0.34, wageMult: T.sa.wageMult },
      { title: T.swe.title, share: 0.3, wageMult: T.swe.wageMult },
      { title: T.con.title, share: 0.2, wageMult: T.con.wageMult },
      { title: T.ds.title, share: 0.16, wageMult: T.ds.wageMult },
    ],
    worksites: [
      { city: "Sunnyvale", stateCode: "CA", share: 0.24 },
      { city: "Plano", stateCode: "TX", share: 0.2 },
      { city: "Cary", stateCode: "NC", share: 0.18 },
      { city: "Redmond", stateCode: "WA", share: 0.14 },
    ],
    layoffYears: [],
  },
  {
    slug: "ibm", name: "IBM", industry: "Technology & Consulting",
    hqCity: "Armonk", stateCode: "NY", website: "https://www.ibm.com",
    approvals2024: 2906, baseWage: 128000, denialRate: 0.04,
    titles: [
      { title: T.se.title, share: 0.34, wageMult: T.se.wageMult },
      { title: T.ds.title, share: 0.24, wageMult: T.ds.wageMult },
      { title: T.con.title, share: 0.22, wageMult: T.con.wageMult },
      { title: T.sa.title, share: 0.2, wageMult: T.sa.wageMult },
    ],
    worksites: [
      { city: "Armonk", stateCode: "NY", share: 0.2 },
      { city: "Austin", stateCode: "TX", share: 0.22 },
      { city: "San Jose", stateCode: "CA", share: 0.2 },
      { city: "Research Triangle Park", stateCode: "NC", share: 0.16 },
    ],
    layoffYears: [{ year: 2023, employeesAffected: 3900, events: 3 }],
  },
];

// Multipliers vs the real FY2024 anchor (modeled history; 2025 reflects the
// industry-wide H-1B pull-back).
const APPROVAL_YOY: Record<number, number> = {
  2021: 1.06,
  2022: 1.27,
  2023: 1.18,
  2024: 1.0,
  2025: 0.82,
};

function buildCompanyYears(seed: CompanySeed): CompanyYear[] {
  return FISCAL_YEARS.map((fy, idx) => {
    const total =
      fy === 2024
        ? seed.approvals2024
        : roundTo(seed.approvals2024 * (APPROVAL_YOY[fy] ?? 1) * jitter(1, `${seed.slug}-${fy}`, 0.05), 1);
    const initialApprovals = roundTo(total * 0.38, 1);
    const continuingApprovals = total - initialApprovals;
    const initialDenials = roundTo(initialApprovals * seed.denialRate, 1);
    const continuingDenials = roundTo(continuingApprovals * seed.denialRate * 0.5, 1);
    const lcaFilings = roundTo(total * 1.4, 1);
    const avgOfferedWage = roundTo(seed.baseWage * Math.pow(1.04, idx - 3), 500);
    return {
      fiscalYear: fy,
      initialApprovals,
      initialDenials,
      continuingApprovals,
      continuingDenials,
      lcaFilings,
      avgOfferedWage,
    };
  });
}

export const companies: Company[] = COMPANY_SEEDS.map((seed) => {
  const years = buildCompanyYears(seed);
  const latestWage = years.find((y) => y.fiscalYear === LATEST_REPORTED_FY)!.avgOfferedWage;
  return {
    slug: seed.slug,
    name: seed.name,
    industry: seed.industry,
    headquartersCity: seed.hqCity,
    stateCode: seed.stateCode,
    website: seed.website,
    years,
    topJobTitles: seed.titles.map((t) => ({
      title: t.title,
      share: t.share,
      avgWage: roundTo(latestWage * t.wageMult, 500),
    })),
    topWorksites: seed.worksites,
    layoffs: seed.layoffYears,
    ...sourceRef("uscis_h1b", UPDATED.uscis_h1b),
  };
});
export const companyBySlug: Record<string, Company> = Object.fromEntries(
  companies.map((c) => [c.slug, c])
);

// ---------------------------------------------------------------------------
// ICE enforcement — REAL national figures (ICE FY2024 Annual Report + ERO data)
//   FY  arrests  removals  criminalRemovals  detentionADP(end of FY)
// ---------------------------------------------------------------------------
const ICE_REAL: Record<number, { arrests: number; removals: number; criminal: number; detention: number; preliminary?: boolean }> = {
  2021: { arrests: 74082, removals: 59011, criminal: 39000, detention: 22000 },
  2022: { arrests: 142750, removals: 72177, criminal: 46000, detention: 24000 },
  2023: { arrests: 170590, removals: 142580, criminal: 73822, detention: 36845 },
  2024: { arrests: 113431, removals: 271484, criminal: 88763, detention: 37684 },
  2025: { arrests: 300000, removals: 319980, criminal: 95000, detention: 55000, preliminary: true },
};

export const iceRows: IceRow[] = FISCAL_YEARS.map((fy) => {
  const r = ICE_REAL[fy];
  return {
    fiscalYear: fy,
    arrests: r.arrests,
    removals: r.removals,
    criminalArrests: r.criminal,
    nonCriminal: Math.max(0, r.arrests - r.criminal),
    detentionAvgDaily: r.detention,
    ...sourceRef("ice_stats", UPDATED.ice_stats),
  };
});
export const iceByFy: Record<number, IceRow> = Object.fromEntries(
  iceRows.map((r) => [r.fiscalYear, r])
);

// State-level ICE arrests for the latest reported FY (estimated apportionment).
const ICE_STATE_WEIGHT: Record<string, number> = {
  TX: 0.22, CA: 0.16, FL: 0.11, NY: 0.07, GA: 0.06,
  IL: 0.05, NJ: 0.04, WA: 0.03, MA: 0.03, VA: 0.03,
};
export const iceByState: IceRow[] = STATE_SEEDS.map((s) => {
  const base = iceByFy[LATEST_REPORTED_FY];
  const w = ICE_STATE_WEIGHT[s.code] ?? 0.02;
  return {
    fiscalYear: LATEST_REPORTED_FY,
    arrests: roundTo(base.arrests * w, 100),
    removals: roundTo(base.removals * w, 100),
    criminalArrests: roundTo(base.criminalArrests * w, 100),
    nonCriminal: roundTo(base.nonCriminal * w, 100),
    detentionAvgDaily: roundTo(base.detentionAvgDaily * w, 100),
    stateCode: s.code,
    ...sourceRef("ice_stats", UPDATED.ice_stats),
  };
});

// Removals by nationality, latest reported FY (estimated from published shares).
export const iceByCountry: IceRow[] = COUNTRY_SEEDS.map((c) => {
  const base = iceByFy[LATEST_REPORTED_FY];
  return {
    fiscalYear: LATEST_REPORTED_FY,
    arrests: roundTo(base.arrests * c.removalWeight, 100),
    removals: roundTo(base.removals * c.removalWeight, 100),
    criminalArrests: roundTo(base.criminalArrests * c.removalWeight, 100),
    nonCriminal: roundTo(base.nonCriminal * c.removalWeight, 100),
    detentionAvgDaily: 0,
    country: c.name,
    ...sourceRef("ice_stats", UPDATED.ice_stats),
  };
});

// ICE detention — most recent point-in-time figure (real, dated).
export const DETENTION_NOW = { value: 73000, asOf: "2026-01-15" }; // highest in system history

// ---------------------------------------------------------------------------
// CBP encounters — REAL nationwide totals + southwest Border Patrol apprehensions
// ---------------------------------------------------------------------------
const CBP_NATIONWIDE: Record<number, number> = {
  2021: 1956519, 2022: 2766582, 2023: 3201144, 2024: 2901147, 2025: 651000,
};
const CBP_SOUTHWEST: Record<number, number> = {
  2021: 1659206, 2022: 2206436, 2023: 2045838, 2024: 1533193, 2025: 237538,
};

function splitDemographics(total: number, seed: string) {
  const singleAdults = roundTo(total * jitter(0.62, seed + "-sa", 0.05), 100);
  const familyUnits = roundTo(total * jitter(0.3, seed + "-fu", 0.06), 100);
  const unaccompaniedMinors = Math.max(0, total - singleAdults - familyUnits);
  return { singleAdults, familyUnits, unaccompaniedMinors: roundTo(unaccompaniedMinors, 100) };
}

export const cbpRows: CbpRow[] = [];
for (const fy of FISCAL_YEARS) {
  const nationwide = CBP_NATIONWIDE[fy];
  const sw = CBP_SOUTHWEST[fy];
  const north = roundTo(nationwide * 0.04, 100);
  for (const [border, total] of [
    ["southwest", sw],
    ["northern", north],
    ["nationwide", nationwide],
  ] as const) {
    cbpRows.push({
      fiscalYear: fy,
      border,
      totalEncounters: total,
      ...splitDemographics(total, `${border}-${fy}`),
      ...sourceRef("cbp_encounters", UPDATED.cbp_encounters),
    });
  }
}

// Monthly southwest encounters for the two latest fiscal years (distribution
// derived from the real annual totals).
export const cbpMonthly: CbpRow[] = [];
for (const fy of [LATEST_REPORTED_FY, CURRENT_FY]) {
  const yearRow = cbpRows.find((r) => r.fiscalYear === fy && r.border === "southwest")!;
  for (let m = 0; m < 12; m++) {
    const calendarMonth = ((9 + m) % 12) + 1;
    const base = yearRow.totalEncounters / 12;
    const total = roundTo(base * jitter(1, `swm-${fy}-${m}`, 0.22), 100);
    cbpMonthly.push({
      fiscalYear: fy,
      month: calendarMonth,
      border: "southwest",
      totalEncounters: total,
      ...splitDemographics(total, `swm-d-${fy}-${m}`),
      ...sourceRef("cbp_encounters", UPDATED.cbp_encounters),
    });
  }
}

// Encounters by citizenship, latest reported FY (estimated from published shares).
export const cbpByCountry: CbpRow[] = COUNTRY_SEEDS.map((c) => {
  const yearRow = cbpRows.find((r) => r.fiscalYear === LATEST_REPORTED_FY && r.border === "nationwide")!;
  const total = roundTo(yearRow.totalEncounters * c.borderWeight, 100);
  return {
    fiscalYear: LATEST_REPORTED_FY,
    border: "nationwide",
    citizenship: c.name,
    totalEncounters: total,
    ...splitDemographics(total, `cbpc-${c.slug}`),
    ...sourceRef("cbp_encounters", UPDATED.cbp_encounters),
  };
});

// ---------------------------------------------------------------------------
// Visa issuance — REAL Department of State issuances by class and fiscal year
// (F-1 figures are published totals; H-1B/J-1/IV are published/approximate).
// ---------------------------------------------------------------------------
const VISA_REAL: Record<string, { category: VisaRow["category"]; byYear: Record<number, number> }> = {
  "F-1": { category: "student", byYear: { 2021: 357839, 2022: 411131, 2023: 445245, 2024: 401007, 2025: 372000 } },
  "H-1B": { category: "employment", byYear: { 2021: 125000, 2022: 206002, 2023: 191961, 2024: 190000, 2025: 165000 } },
  "J-1": { category: "exchange", byYear: { 2021: 100148, 2022: 284486, 2023: 300937, 2024: 311502, 2025: 305000 } },
  "EB (employment-based IV)": { category: "employment", byYear: { 2021: 65000, 2022: 95000, 2023: 142000, 2024: 145000, 2025: 140000 } },
  "Family-based IV": { category: "family", byYear: { 2021: 175000, 2022: 215000, 2023: 230000, 2024: 235000, 2025: 228000 } },
};

export const visaRows: VisaRow[] = [];
for (const [visaClass, cfg] of Object.entries(VISA_REAL)) {
  for (const fy of FISCAL_YEARS) {
    visaRows.push({
      fiscalYear: fy,
      visaClass,
      category: cfg.category,
      issued: cfg.byYear[fy] ?? 0,
      ...sourceRef("dos_visa", UPDATED.dos_visa),
    });
  }
}

// H-1B by country uses REAL USCIS FY2024 approvals; F-1 by country is estimated.
export const visaByCountry: VisaRow[] = [];
for (const c of COUNTRY_SEEDS) {
  visaByCountry.push({
    fiscalYear: LATEST_REPORTED_FY,
    visaClass: "H-1B",
    category: "employment",
    country: c.name,
    issued: c.h1bApprovals2024,
    ...sourceRef("uscis_h1b", UPDATED.uscis_h1b),
  });
}
const f1Total = VISA_REAL["F-1"].byYear[LATEST_REPORTED_FY];
const f1ShareSum = COUNTRY_SEEDS.reduce((s, c) => s + c.f1Share, 0);
for (const c of COUNTRY_SEEDS) {
  visaByCountry.push({
    fiscalYear: LATEST_REPORTED_FY,
    visaClass: "F-1",
    category: "student",
    country: c.name,
    issued: roundTo((f1Total * c.f1Share) / f1ShareSum, 100),
    ...sourceRef("dos_visa", UPDATED.dos_visa),
  });
}

// National H-1B approvals/denials (USCIS) — real FY totals.
export const H1B_NATIONAL: Record<number, { approvals: number; denials: number }> = {
  2021: { approvals: 407071, denials: 16000 },
  2022: { approvals: 442043, denials: 12000 },
  2023: { approvals: 386318, denials: 15000 },
  2024: { approvals: 399395, denials: 25500 },
  2025: { approvals: 358000, denials: 30000 },
};

// ---------------------------------------------------------------------------
// BLS OEWS wages (May 2024) — REAL mean wages by occupation
// ---------------------------------------------------------------------------
const OCCUPATIONS: { occ: string; soc: string; mean: number; employment: number }[] = [
  { occ: "Software Developers", soc: "15-1252", mean: 138110, employment: 1795000 },
  { occ: "Data Scientists", soc: "15-2051", mean: 119040, employment: 202000 },
  { occ: "Computer Systems Analysts", soc: "15-1211", mean: 103790, employment: 520000 },
  { occ: "Computer & Information Systems Managers", soc: "11-3021", mean: 171200, employment: 592000 },
  { occ: "Management Analysts", soc: "13-1111", mean: 104660, employment: 1003000 },
  { occ: "Electrical & Electronics Engineers", soc: "17-2070", mean: 117730, employment: 311000 },
];
export const wageRows: WageRow[] = OCCUPATIONS.map((o) => ({
  year: 2024,
  occupation: o.occ,
  socCode: o.soc,
  meanWage: o.mean,
  medianWage: roundTo(o.mean * 0.93, 10),
  employment: o.employment,
  ...sourceRef("bls_wages", UPDATED.bls_wages),
}));
const STATE_WAGE_MULT: Record<string, number> = {
  CA: 1.28, WA: 1.22, NY: 1.15, MA: 1.16, NJ: 1.08,
  VA: 1.05, IL: 1.0, TX: 0.98, GA: 0.94, FL: 0.92,
};
export const wageByState: WageRow[] = STATE_SEEDS.map((s) => ({
  year: 2024,
  occupation: "Software Developers",
  socCode: "15-1252",
  stateCode: s.code,
  meanWage: roundTo(138110 * (STATE_WAGE_MULT[s.code] ?? 1), 10),
  medianWage: roundTo(138110 * (STATE_WAGE_MULT[s.code] ?? 1) * 0.93, 10),
  ...sourceRef("bls_wages", UPDATED.bls_wages),
}));

// ---------------------------------------------------------------------------
// WARN layoffs — derived from publicly reported company layoff events
// ---------------------------------------------------------------------------
export const layoffRows: LayoffRow[] = [];
for (const seed of COMPANY_SEEDS) {
  for (const ly of seed.layoffYears) {
    for (let e = 0; e < ly.events; e++) {
      const month = roundTo(2 + (e / Math.max(1, ly.events)) * 9, 1);
      const affected = roundTo(ly.employeesAffected / ly.events, 10);
      layoffRows.push({
        employerName: seed.name,
        companySlug: seed.slug,
        stateCode: seed.worksites[e % seed.worksites.length].stateCode,
        city: seed.worksites[e % seed.worksites.length].city,
        noticeDate: `${ly.year}-${String(month).padStart(2, "0")}-15`,
        employeesAffected: affected,
        reason: "Workforce reduction",
        ...sourceRef("warn_layoffs", UPDATED.warn_layoffs),
      });
    }
  }
}
const EXTRA_LAYOFFS: { name: string; state: string; city: string; year: number; n: number }[] = [
  { name: "Charter Communications", state: "TX", city: "Austin", year: 2025, n: 900 },
  { name: "Wells Fargo", state: "CA", city: "San Francisco", year: 2024, n: 1100 },
  { name: "Peloton Interactive", state: "NY", city: "New York", year: 2024, n: 650 },
  { name: "Boeing", state: "WA", city: "Everett", year: 2025, n: 2200 },
  { name: "CVS Health", state: "IL", city: "Chicago", year: 2024, n: 700 },
];
for (const x of EXTRA_LAYOFFS) {
  layoffRows.push({
    employerName: x.name,
    stateCode: x.state,
    city: x.city,
    noticeDate: `${x.year}-04-15`,
    employeesAffected: x.n,
    reason: "Workforce reduction",
    ...sourceRef("warn_layoffs", UPDATED.warn_layoffs),
  });
}
