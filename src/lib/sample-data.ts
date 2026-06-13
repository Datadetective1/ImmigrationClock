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
// Time frame
// ---------------------------------------------------------------------------
export const FISCAL_YEARS = [2022, 2023, 2024, 2025, 2026];
export const CURRENT_FY = 2026; // in-progress fiscal year (Oct 2025 – Sep 2026)
// Roughly 8 of 12 fiscal-year months complete by mid-June.
export const FY_COMPLETENESS = 8 / 12;

// When each underlying source was last refreshed (sample/MVP values).
export const UPDATED = {
  uscis_h1b: "2026-03-31",
  dol_lca: "2026-04-15",
  ice_stats: "2026-05-20",
  dhs_stats: "2026-05-20",
  cbp_encounters: "2026-06-15",
  dos_visa: "2026-05-31",
  bls_wages: "2025-04-30",
  warn_layoffs: "2026-06-10",
  trac: "2026-06-01",
};

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helpers (stable across builds)
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
  h1bWeight: number; // relative share of H-1B sponsorship
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
// Countries
// ---------------------------------------------------------------------------
interface CountrySeed {
  slug: string;
  name: string;
  region: string;
  visaWeight: number; // share of employment/student visa flow
  borderWeight: number; // share of border encounters
  removalWeight: number; // share of removals
}
const COUNTRY_SEEDS: CountrySeed[] = [
  { slug: "india", name: "India", region: "South Asia", visaWeight: 1.0, borderWeight: 0.05, removalWeight: 0.08 },
  { slug: "china", name: "China", region: "East Asia", visaWeight: 0.42, borderWeight: 0.04, removalWeight: 0.03 },
  { slug: "mexico", name: "Mexico", region: "North America", visaWeight: 0.14, borderWeight: 0.32, removalWeight: 0.41 },
  { slug: "canada", name: "Canada", region: "North America", visaWeight: 0.12, borderWeight: 0.03, removalWeight: 0.01 },
  { slug: "philippines", name: "Philippines", region: "Southeast Asia", visaWeight: 0.16, borderWeight: 0.02, removalWeight: 0.02 },
  { slug: "south-korea", name: "South Korea", region: "East Asia", visaWeight: 0.18, borderWeight: 0.01, removalWeight: 0.01 },
  { slug: "brazil", name: "Brazil", region: "South America", visaWeight: 0.1, borderWeight: 0.09, removalWeight: 0.05 },
  { slug: "nigeria", name: "Nigeria", region: "West Africa", visaWeight: 0.08, borderWeight: 0.01, removalWeight: 0.02 },
  { slug: "vietnam", name: "Vietnam", region: "Southeast Asia", visaWeight: 0.07, borderWeight: 0.01, removalWeight: 0.01 },
  { slug: "guatemala", name: "Guatemala", region: "Central America", visaWeight: 0.03, borderWeight: 0.16, removalWeight: 0.14 },
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
// Companies (10 H-1B sponsoring employers)
// ---------------------------------------------------------------------------
interface CompanySeed {
  slug: string;
  name: string;
  industry: string;
  hqCity: string;
  stateCode: string;
  website: string;
  baseInitialApprovals: number;
  baseWage: number;
  approvalGrowth: number; // YoY multiplier for initial approvals
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
    slug: "cognizant",
    name: "Cognizant Technology Solutions",
    industry: "IT Services & Consulting",
    hqCity: "Teaneck",
    stateCode: "NJ",
    website: "https://www.cognizant.com",
    baseInitialApprovals: 3200,
    baseWage: 92000,
    approvalGrowth: 0.92,
    denialRate: 0.06,
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
    slug: "infosys",
    name: "Infosys",
    industry: "IT Services & Consulting",
    hqCity: "Richardson",
    stateCode: "TX",
    website: "https://www.infosys.com",
    baseInitialApprovals: 2400,
    baseWage: 95000,
    approvalGrowth: 0.95,
    denialRate: 0.05,
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
    slug: "tata-consultancy-services",
    name: "Tata Consultancy Services",
    industry: "IT Services & Consulting",
    hqCity: "Edison",
    stateCode: "NJ",
    website: "https://www.tcs.com",
    baseInitialApprovals: 1500,
    baseWage: 93000,
    approvalGrowth: 0.97,
    denialRate: 0.05,
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
    slug: "amazon",
    name: "Amazon",
    industry: "Technology & E-commerce",
    hqCity: "Seattle",
    stateCode: "WA",
    website: "https://www.amazon.com",
    baseInitialApprovals: 9000,
    baseWage: 145000,
    approvalGrowth: 1.03,
    denialRate: 0.03,
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
    slug: "alphabet-google",
    name: "Alphabet (Google)",
    industry: "Technology & Internet",
    hqCity: "Mountain View",
    stateCode: "CA",
    website: "https://www.google.com",
    baseInitialApprovals: 4500,
    baseWage: 168000,
    approvalGrowth: 1.01,
    denialRate: 0.02,
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
    slug: "microsoft",
    name: "Microsoft",
    industry: "Technology & Software",
    hqCity: "Redmond",
    stateCode: "WA",
    website: "https://www.microsoft.com",
    baseInitialApprovals: 4200,
    baseWage: 162000,
    approvalGrowth: 1.0,
    denialRate: 0.02,
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
    slug: "meta-platforms",
    name: "Meta Platforms",
    industry: "Technology & Social Media",
    hqCity: "Menlo Park",
    stateCode: "CA",
    website: "https://www.meta.com",
    baseInitialApprovals: 2600,
    baseWage: 175000,
    approvalGrowth: 0.98,
    denialRate: 0.02,
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
    slug: "apple",
    name: "Apple",
    industry: "Technology & Hardware",
    hqCity: "Cupertino",
    stateCode: "CA",
    website: "https://www.apple.com",
    baseInitialApprovals: 2300,
    baseWage: 165000,
    approvalGrowth: 1.0,
    denialRate: 0.02,
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
    slug: "deloitte-consulting",
    name: "Deloitte Consulting",
    industry: "Professional Services & Consulting",
    hqCity: "New York",
    stateCode: "NY",
    website: "https://www2.deloitte.com",
    baseInitialApprovals: 1700,
    baseWage: 110000,
    approvalGrowth: 0.96,
    denialRate: 0.04,
    titles: [
      { title: T.con.title, share: 0.36, wageMult: T.con.wageMult },
      { title: T.sa.title, share: 0.26, wageMult: T.sa.wageMult },
      { title: T.ds.title, share: 0.2, wageMult: T.ds.wageMult },
      { title: T.swe.title, share: 0.18, wageMult: T.swe.wageMult },
    ],
    worksites: [
      { city: "New York", stateCode: "NY", share: 0.24 },
      { city: "Chicago", stateCode: "IL", share: 0.2 },
      { city: "Arlington", stateCode: "VA", share: 0.18 },
      { city: "Atlanta", stateCode: "GA", share: 0.16 },
    ],
    layoffYears: [{ year: 2024, employeesAffected: 1500, events: 2 }],
  },
  {
    slug: "ibm",
    name: "IBM",
    industry: "Technology & Consulting",
    hqCity: "Armonk",
    stateCode: "NY",
    website: "https://www.ibm.com",
    baseInitialApprovals: 1300,
    baseWage: 128000,
    approvalGrowth: 0.9,
    denialRate: 0.04,
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

function buildCompanyYears(seed: CompanySeed): CompanyYear[] {
  return FISCAL_YEARS.map((fy, idx) => {
    const growth = Math.pow(seed.approvalGrowth, idx);
    let initialApprovals = jitter(
      seed.baseInitialApprovals * growth,
      `${seed.slug}-ia-${fy}`,
      0.1
    );
    // current FY is partial — scale to pace.
    if (fy === CURRENT_FY) initialApprovals *= FY_COMPLETENESS;
    initialApprovals = roundTo(initialApprovals, 1);

    const continuingApprovals = roundTo(
      initialApprovals * jitter(1.5, `${seed.slug}-ca-${fy}`, 0.1),
      1
    );
    const initialDenials = roundTo(
      initialApprovals * seed.denialRate * jitter(1, `${seed.slug}-id-${fy}`, 0.3),
      1
    );
    const continuingDenials = roundTo(
      continuingApprovals * seed.denialRate * 0.5 * jitter(1, `${seed.slug}-cd-${fy}`, 0.3),
      1
    );
    const lcaFilings = roundTo(
      (initialApprovals + continuingApprovals) * jitter(1.35, `${seed.slug}-lca-${fy}`, 0.1),
      1
    );
    const avgOfferedWage = roundTo(
      seed.baseWage * Math.pow(1.045, idx) * jitter(1, `${seed.slug}-w-${fy}`, 0.04),
      500
    );
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
  const latestWage = years[years.length - 2].avgOfferedWage; // last complete FY
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
// ICE enforcement (national totals + state + nationality slices)
// ---------------------------------------------------------------------------
// Realistic-order baselines, scaled by year with an upward enforcement trend.
const ICE_BASE = {
  arrests: 113000,
  removals: 142000,
  detentionAvgDaily: 34000,
};
const ICE_TREND = 1.16; // YoY rise in enforcement intensity

export const iceRows: IceRow[] = FISCAL_YEARS.map((fy, idx) => {
  const mult = Math.pow(ICE_TREND, idx);
  const partial = fy === CURRENT_FY ? FY_COMPLETENESS : 1;
  const arrests = roundTo(ICE_BASE.arrests * mult * partial, 100);
  const removals = roundTo(ICE_BASE.removals * mult * partial, 100);
  const criminalArrests = roundTo(arrests * 0.52, 100);
  return {
    fiscalYear: fy,
    arrests,
    removals,
    criminalArrests,
    nonCriminal: arrests - criminalArrests,
    detentionAvgDaily: roundTo(ICE_BASE.detentionAvgDaily * Math.pow(1.08, idx), 100),
    ...sourceRef("ice_stats", UPDATED.ice_stats),
  };
});
export const iceByFy: Record<number, IceRow> = Object.fromEntries(
  iceRows.map((r) => [r.fiscalYear, r])
);

// State-level ICE arrests for the latest complete fiscal year.
const ICE_STATE_WEIGHT: Record<string, number> = {
  TX: 0.22, CA: 0.16, FL: 0.11, NY: 0.07, GA: 0.06,
  IL: 0.05, NJ: 0.04, WA: 0.03, MA: 0.03, VA: 0.03,
};
export const iceByState: IceRow[] = STATE_SEEDS.map((s) => {
  const base = iceByFy[CURRENT_FY - 1];
  const w = ICE_STATE_WEIGHT[s.code] ?? 0.02;
  return {
    fiscalYear: CURRENT_FY - 1,
    arrests: roundTo(base.arrests * w, 100),
    removals: roundTo(base.removals * w, 100),
    criminalArrests: roundTo(base.criminalArrests * w, 100),
    nonCriminal: roundTo(base.nonCriminal * w, 100),
    detentionAvgDaily: roundTo(base.detentionAvgDaily * w, 100),
    stateCode: s.code,
    ...sourceRef("ice_stats", UPDATED.ice_stats),
  };
});

// Nationality breakdown of removals for the latest complete fiscal year.
export const iceByCountry: IceRow[] = COUNTRY_SEEDS.map((c) => {
  const base = iceByFy[CURRENT_FY - 1];
  return {
    fiscalYear: CURRENT_FY - 1,
    arrests: roundTo(base.arrests * c.removalWeight, 100),
    removals: roundTo(base.removals * c.removalWeight, 100),
    criminalArrests: roundTo(base.criminalArrests * c.removalWeight, 100),
    nonCriminal: roundTo(base.nonCriminal * c.removalWeight, 100),
    detentionAvgDaily: 0,
    country: c.name,
    ...sourceRef("ice_stats", UPDATED.ice_stats),
  };
});

// ---------------------------------------------------------------------------
// CBP encounters (border activity)
// ---------------------------------------------------------------------------
const CBP_SW_BASE = 2_010_000; // southwest border, FY2022 baseline
const CBP_SW_TREND = [1.0, 1.13, 0.92, 0.41, 0.34]; // FY22..FY26 path (decline recently)
const CBP_NORTH_SHARE = 0.06;
const CBP_COASTAL_SHARE = 0.03;

function splitDemographics(total: number, seed: string) {
  const singleAdults = roundTo(total * jitter(0.62, seed + "-sa", 0.06), 100);
  const familyUnits = roundTo(total * jitter(0.3, seed + "-fu", 0.08), 100);
  const unaccompaniedMinors = Math.max(0, total - singleAdults - familyUnits);
  return { singleAdults, familyUnits, unaccompaniedMinors: roundTo(unaccompaniedMinors, 100) };
}

export const cbpRows: CbpRow[] = [];
FISCAL_YEARS.forEach((fy, idx) => {
  const partial = fy === CURRENT_FY ? FY_COMPLETENESS : 1;
  const sw = roundTo(CBP_SW_BASE * CBP_SW_TREND[idx] * partial, 100);
  const north = roundTo(sw * CBP_NORTH_SHARE, 100);
  const coastal = roundTo(sw * CBP_COASTAL_SHARE, 100);
  for (const [border, total] of [
    ["southwest", sw],
    ["northern", north],
    ["coastal", coastal],
  ] as const) {
    cbpRows.push({
      fiscalYear: fy,
      border,
      totalEncounters: total,
      ...splitDemographics(total, `${border}-${fy}`),
      ...sourceRef("cbp_encounters", UPDATED.cbp_encounters),
    });
  }
  // nationwide aggregate
  const nationwide = sw + north + coastal;
  cbpRows.push({
    fiscalYear: fy,
    border: "nationwide",
    totalEncounters: nationwide,
    ...splitDemographics(nationwide, `nationwide-${fy}`),
    ...sourceRef("cbp_encounters", UPDATED.cbp_encounters),
  });
});

// Monthly southwest encounters for the latest complete + current fiscal year.
export const cbpMonthly: CbpRow[] = [];
for (const fy of [CURRENT_FY - 1, CURRENT_FY]) {
  const yearRow = cbpRows.find((r) => r.fiscalYear === fy && r.border === "southwest")!;
  const monthsToShow = fy === CURRENT_FY ? 8 : 12;
  // Fiscal months: Oct(10)..Sep(9). Index 0 => October.
  for (let m = 0; m < monthsToShow; m++) {
    const calendarMonth = ((9 + m) % 12) + 1; // Oct=10 ... Sep=9
    const base = yearRow.totalEncounters / monthsToShow;
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

// Encounters by citizenship for the latest complete fiscal year.
export const cbpByCountry: CbpRow[] = COUNTRY_SEEDS.map((c) => {
  const yearRow = cbpRows.find(
    (r) => r.fiscalYear === CURRENT_FY - 1 && r.border === "nationwide"
  )!;
  const total = roundTo(yearRow.totalEncounters * c.borderWeight, 100);
  return {
    fiscalYear: CURRENT_FY - 1,
    border: "nationwide",
    citizenship: c.name,
    totalEncounters: total,
    ...splitDemographics(total, `cbpc-${c.slug}`),
    ...sourceRef("cbp_encounters", UPDATED.cbp_encounters),
  };
});

// ---------------------------------------------------------------------------
// Visa issuance (Department of State)
// ---------------------------------------------------------------------------
const VISA_BASE: Record<string, { base: number; category: VisaRow["category"]; trend: number }> = {
  "H-1B": { base: 135000, category: "employment", trend: 1.02 },
  "F-1": { base: 411000, category: "student", trend: 1.03 },
  "J-1": { base: 280000, category: "exchange", trend: 1.04 },
  "EB (employment-based IV)": { base: 142000, category: "employment", trend: 1.01 },
  "Family-based IV": { base: 230000, category: "family", trend: 1.0 },
};

export const visaRows: VisaRow[] = [];
for (const [visaClass, cfg] of Object.entries(VISA_BASE)) {
  FISCAL_YEARS.forEach((fy, idx) => {
    const partial = fy === CURRENT_FY ? FY_COMPLETENESS : 1;
    const issued = roundTo(
      cfg.base * Math.pow(cfg.trend, idx) * jitter(1, `${visaClass}-${fy}`, 0.05) * partial,
      100
    );
    visaRows.push({
      fiscalYear: fy,
      visaClass,
      category: cfg.category,
      issued,
      ...sourceRef("dos_visa", UPDATED.dos_visa),
    });
  });
}

// Visa issuance by country for the latest complete fiscal year (H-1B + F-1).
export const visaByCountry: VisaRow[] = [];
for (const visaClass of ["H-1B", "F-1"]) {
  const cfg = VISA_BASE[visaClass];
  const yearTotal =
    visaRows.find((r) => r.visaClass === visaClass && r.fiscalYear === CURRENT_FY - 1)
      ?.issued ?? cfg.base;
  const weightSum = COUNTRY_SEEDS.reduce((s, c) => s + c.visaWeight, 0);
  for (const c of COUNTRY_SEEDS) {
    visaByCountry.push({
      fiscalYear: CURRENT_FY - 1,
      visaClass,
      category: cfg.category,
      country: c.name,
      issued: roundTo((yearTotal * c.visaWeight) / weightSum, 100),
      ...sourceRef("dos_visa", UPDATED.dos_visa),
    });
  }
}

// ---------------------------------------------------------------------------
// BLS wages (occupation + state)
// ---------------------------------------------------------------------------
const OCCUPATIONS: { occ: string; soc: string; mean: number; employment: number }[] = [
  { occ: "Software Developers", soc: "15-1252", mean: 138110, employment: 1795000 },
  { occ: "Data Scientists", soc: "15-2051", mean: 119040, employment: 202000 },
  { occ: "Computer Systems Analysts", soc: "15-1211", mean: 103790, employment: 520000 },
  { occ: "Computer & Information Systems Managers", soc: "11-3021", mean: 169510, employment: 592000 },
  { occ: "Management Analysts", soc: "13-1111", mean: 104660, employment: 1003000 },
  { occ: "Electrical & Electronics Engineers", soc: "17-2070", mean: 117730, employment: 311000 },
];
export const wageRows: WageRow[] = [];
for (const o of OCCUPATIONS) {
  wageRows.push({
    year: 2024,
    occupation: o.occ,
    socCode: o.soc,
    meanWage: o.mean,
    medianWage: roundTo(o.mean * 0.93, 10),
    employment: o.employment,
    ...sourceRef("bls_wages", UPDATED.bls_wages),
  });
  // by state (software developers as the flagship occupation)
}
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
// WARN layoffs (derived from company layoff events)
// ---------------------------------------------------------------------------
export const layoffRows: LayoffRow[] = [];
for (const seed of COMPANY_SEEDS) {
  for (const ly of seed.layoffYears) {
    // spread events across the year
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
// A few non-tracked employer layoffs to make state pages richer.
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
