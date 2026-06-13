// Shared domain types for ImmigrationClock.
// These mirror the Prisma models but are framework-agnostic so the UI can read
// from the bundled sample dataset OR the database through the same shapes.

export type TrendDirection = "UP" | "DOWN" | "FLAT";
export type StatusLevel = "GREEN" | "AMBER" | "RED";
export type RefreshStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "PENDING";

export interface SourceRef {
  sourceName: string;
  sourceUrl: string;
  sourceUpdatedAt: string; // ISO date
}

export interface Metric extends SourceRef {
  key: string;
  label: string;
  value: number;
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
  lastRefreshAt: string;
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
