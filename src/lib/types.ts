// Shared domain types for ImmigrationClock.
// These mirror the Prisma models but are framework-agnostic so the UI can read
// from the bundled sample dataset OR the database through the same shapes.

export type TrendDirection = "UP" | "DOWN" | "FLAT";
export type StatusLevel = "GREEN" | "AMBER" | "RED";
export type RefreshStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "PENDING";

// How fresh / complete a reporting period is.
export type Completeness =
  | "complete" // a finished fiscal year
  | "ytd" // fiscal year to date (in progress)
  | "preliminary" // latest release, not yet finalized
  | "point_in_time" // a snapshot on a specific date (e.g. detention)
  | "estimated"; // estimated pace from latest reporting

// Where a number comes from — the integrity dimension. We never present a
// projected, estimated, or modeled figure as an official reported one.
//
// The distinction between these matters and is not cosmetic:
//   reported  — the agency published this exact number for this exact period.
//   projected — we extrapolated a reported partial period to a full one.
//   estimated — we apportioned a reported total using a published share.
//   modeled   — we apportioned a reported total using OUR OWN assumed weights,
//               which the agency never published. The weakest claim we make;
//               it must always carry a visible label saying so.
export type Provenance = "reported" | "projected" | "estimated" | "modeled";

export interface SourceRef {
  sourceName: string;
  sourceUrl: string;
  sourceUpdatedAt: string; // ISO date
}

// A single reporting period for a metric (latest vs last-complete).
export interface MetricPeriod {
  value: number;
  display?: string;
  fiscalYear?: number;
  periodLabel: string; // human phrase, e.g. "Latest available: FY2025", "FY2026 YTD", "Point-in-time"
  completeness: Completeness;
  provenance: Provenance; // reported | projected | estimated
  sourceUpdatedAt: string; // when the SOURCE published this figure
}

export interface SparkPoint {
  label: string;
  value: number;
  partial?: boolean; // incomplete (YTD/preliminary) year — render lighter/dashed
}

export interface Metric extends SourceRef {
  key: string;
  label: string; // base label, no fiscal year (period shown via badge/phrase)
  value: number; // latest available value
  display?: string; // pre-formatted value for non-numeric metrics (e.g. employer name)
  unit?: string;
  fiscalYear?: number;
  paceEstimated: boolean;
  trend: TrendDirection;
  trendPct?: number;
  status: StatusLevel;
  tooltip: string;
  href?: string;
  group: "enforcement" | "border" | "visa" | "workforce";

  // Freshness model
  completeness: Completeness; // of the latest period
  provenance: Provenance; // of the latest value
  periodLabel: string; // human phrase for the latest period
  lastComplete?: MetricPeriod; // last complete fiscal year (for the toggle / comparison)
  spark?: SparkPoint[]; // up-to-6-year mini series for the trend view
}

// An auto-generated narrative "insight card" derived from the dataset. Each one
// turns raw numbers into a plain-language claim with a source and an integrity
// label — the engagement / shareable layer. Never asserts causation.
export interface Insight {
  key: string;
  stat: string; // punchy pre-formatted figure, e.g. "71%", "73K", "−80%"
  headline: string; // one-line claim
  detail: string; // supporting sentence(s)
  whyItMatters: string; // neutral framing of significance
  group: "enforcement" | "border" | "visa" | "workforce";
  provenance: Provenance; // reported | projected | estimated
  trend?: TrendDirection;
  periodLabel: string; // e.g. "FY2026 YTD vs FY2025"
  href?: string; // deep link to the relevant tracker
  sourceName: string;
  sourceUrl: string;
  sourceUpdatedAt: string;
}

export interface CompanyYear {
  fiscalYear: number;
  initialApprovals: number;
  initialDenials: number;
  continuingApprovals: number;
  continuingDenials: number;
  lcaFilings: number;
  avgOfferedWage: number;
}

export interface Company extends SourceRef {
  slug: string;
  name: string;
  industry: string;
  headquartersCity: string;
  stateCode: string;
  website?: string;
  years: CompanyYear[];
  topJobTitles: { title: string; share: number; avgWage: number }[];
  topWorksites: { city: string; stateCode: string; share: number }[];
  // NOTE: this type deliberately has no `layoffs` field. Layoff data belongs to
  // the real WARN feed and is looked up by employer name via warnForEmployer()
  // in src/lib/warn.ts. See docs/data-corrections.md.
}

export interface StateInfo extends SourceRef {
  code: string;
  name: string;
  region: string;
}

export interface CountryInfo extends SourceRef {
  slug: string;
  name: string;
  region: string;
}

export interface CbpRow extends SourceRef {
  fiscalYear: number;
  month?: number;
  border: "southwest" | "northern" | "coastal" | "nationwide";
  citizenship?: string;
  totalEncounters: number;
  singleAdults: number;
  familyUnits: number;
  unaccompaniedMinors: number;
}

export interface IceRow extends SourceRef {
  fiscalYear: number;
  arrests: number;
  removals: number;
  criminalArrests: number;
  nonCriminal: number;
  detentionAvgDaily: number;
  stateCode?: string;
  country?: string;
}

export interface VisaRow extends SourceRef {
  fiscalYear: number;
  visaClass: string;
  category: "employment" | "student" | "exchange" | "family" | "other";
  country?: string;
  issued: number;
}

export interface WageRow extends SourceRef {
  year: number;
  occupation: string;
  socCode?: string;
  stateCode?: string;
  meanWage: number;
  medianWage: number;
  employment?: number;
}

export interface LayoffRow extends SourceRef {
  employerName: string;
  companySlug?: string;
  stateCode: string;
  city?: string;
  noticeDate: string;
  employeesAffected: number;
  reason?: string;
}

export interface RefreshRow {
  key: string;
  name: string;
  agency: string;
  cadence: string;
  latestPeriod: string; // latest reporting period in the dataset, e.g. "FY2026 YTD"
  completeness: Completeness;
  sourceUpdatedAt: string; // when the SOURCE published its latest release
  lastRefreshAt: string; // when WE last ingested it
  /** When a human last confirmed the source's URL, shape, and cadence. */
  lastVerifiedAt: string;
  /** Months since that confirmation — shown so a stale check is visible. */
  monthsSinceVerified: number | null;
  /** How the data reaches the site: live-api | live-file | scheduled-scrape | curated | planned. */
  ingestion: string;
  /** official | official-aggregated | third-party. Non-official must be marked. */
  tier: string;
  nextRefreshAt: string;
  rowCount: number;
  status: RefreshStatus;
  errorMessage?: string;
}

// NOTE: `SourceDef` now lives in src/lib/sources.ts, alongside the registry it
// describes, and carries the tier / ingestion / verification fields the Founder
// Directive requires. It was removed from here to keep exactly one definition.
