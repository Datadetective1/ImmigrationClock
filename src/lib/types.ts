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
  sourceUpdatedAt: string;
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
  periodLabel: string; // human phrase for the latest period
  lastComplete?: MetricPeriod; // last complete fiscal year (for the toggle / comparison)
  spark?: SparkPoint[]; // up-to-6-year mini series for the trend view
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
  layoffs: { year: number; employeesAffected: number; events: number }[];
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
  sourceUpdatedAt: string; // when the source published its latest release
  lastRefreshAt: string; // when we last ingested it
  nextRefreshAt: string;
  rowCount: number;
  status: RefreshStatus;
  errorMessage?: string;
}

export interface SourceDef {
  key: string;
  name: string;
  agency: string;
  description: string;
  homepageUrl: string;
  datasetUrl: string;
  cadence: string;
}
