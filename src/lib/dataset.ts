// =============================================================================
// SINGLE RUNTIME DATA SOURCE.
//
// The frontend reads ONLY this module, which loads the build-time snapshot
// emitted by scripts/build-dataset.ts (src/lib/generated/dataset.json). There is
// no hand-imported data module in the running app anymore: the pipeline produces
// the snapshot and the app consumes it. To change the data, change
// src/lib/source-data.ts (or the feeds it reads) and rebuild.
// =============================================================================
import ds from "./generated/dataset.json";
import type {
  Company,
  StateInfo,
  CountryInfo,
  CbpRow,
  IceRow,
  VisaRow,
  WageRow,
  LayoffRow,
} from "./types";

// Modeling seed shape for a country (kept here so the app stays decoupled from
// the build-time source module).
export interface CountrySeed {
  slug: string;
  name: string;
  region: string;
  h1bApprovals2024: number;
  f1Share: number;
  borderWeight: number;
  removalWeight: number;
}

// ---- Time-frame constants ----
export const FISCAL_YEARS = ds.FISCAL_YEARS as number[];
export const CURRENT_FY = ds.CURRENT_FY as number;
export const FY2026_ELAPSED = ds.FY2026_ELAPSED as number;
export const FY_COMPLETENESS = ds.FY_COMPLETENESS as number;
export const LATEST_COMPLETE_FY = ds.LATEST_COMPLETE_FY as number;
export const EMPLOYER_LATEST_FY = ds.EMPLOYER_LATEST_FY as number;
/** Fiscal year of the USCIS Employer Data Hub export actually ingested. */
export const DATAHUB_LATEST_FY = ds.DATAHUB_LATEST_FY as number;
export const LATEST_REPORTED_FY = ds.LATEST_REPORTED_FY as number;
export const DATA_VINTAGE = ds.DATA_VINTAGE as string;
export const UPDATED = ds.UPDATED as Record<string, string>;

// ---- Dimensions ----
export const states = ds.states as unknown as StateInfo[];
export const stateWeight = ds.stateWeight as Record<string, number>;
export const countries = ds.countries as unknown as CountryInfo[];
export const countrySeedByName = ds.countrySeedByName as unknown as Record<string, CountrySeed>;
export const countrySeedBySlug = ds.countrySeedBySlug as unknown as Record<string, CountrySeed>;
export const companies = ds.companies as unknown as Company[];
export const companyBySlug = ds.companyBySlug as unknown as Record<string, Company>;

// ---- Enforcement (ICE) ----
export const iceRows = ds.iceRows as unknown as IceRow[];
export const iceByFy = ds.iceByFy as unknown as Record<number, IceRow>;
export const iceByState = ds.iceByState as unknown as IceRow[];
export const iceByCountry = ds.iceByCountry as unknown as IceRow[];
export const DETENTION_NOW = ds.DETENTION_NOW as {
  value: number;
  asOf: string;
  /** Days after `asOf` beyond which this snapshot must be shown as dated. */
  staleAfterDays: number;
};

/**
 * Whether a point-in-time figure has outlived its useful window. A snapshot of a
 * single day does not stay true the way a fiscal-year total does, so the UI must
 * be able to say "this is a dated snapshot" instead of implying it is current.
 */
export function pointInTimeAge(
  asOf: string,
  staleAfterDays: number,
  now = new Date()
): { days: number; stale: boolean } {
  const then = new Date(asOf).getTime();
  if (Number.isNaN(then)) return { days: 0, stale: false };
  const days = Math.max(0, Math.round((now.getTime() - then) / 86_400_000));
  return { days, stale: days > staleAfterDays };
}

// ---- Border (CBP) ----
export const cbpRows = ds.cbpRows as unknown as CbpRow[];
export const cbpMonthly = ds.cbpMonthly as unknown as CbpRow[];
export const cbpByCountry = ds.cbpByCountry as unknown as CbpRow[];

// Live CBP feed status (used to label the border metric reported vs projected).
export const CBP_LIVE = ds.CBP_LIVE as {
  ok: boolean;
  reportingMonthLabel?: string | null;
  currentFy?: number | null;
  currentFyYtd?: number | null;
  sourceUpdatedAt?: string | null;
  datasetUrl?: string | null;
};

// ---- Visas (DOS / USCIS national) ----
export const visaRows = ds.visaRows as unknown as VisaRow[];
export const visaByCountry = ds.visaByCountry as unknown as VisaRow[];
export const H1B_NATIONAL = ds.H1B_NATIONAL as unknown as Record<
  number,
  { approvals: number; denials: number }
>;

// ---- Wages (BLS OEWS) ----
export const wageRows = ds.wageRows as unknown as WageRow[];
export const wageByState = ds.wageByState as unknown as WageRow[];

// ---- Layoffs (WARN) ----
// Deliberately absent. Layoff data is not part of this snapshot: it comes from
// real state filings via src/lib/warn.ts (individual notices) and
// src/lib/warn-summary.ts (rollups). Do not add a layoff export here — that path
// is how modeled layoff records reached production before the 2026-08 correction.
// See docs/data-corrections.md.
