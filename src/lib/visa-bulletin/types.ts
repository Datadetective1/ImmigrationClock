// =============================================================================
// VISA BULLETIN: ONE MONTH, AS PUBLISHED
//
// The bulletin is a table of dates, and a mis-copied priority date is not a
// degraded fact but a confidently wrong one a reader will act on (see the
// "visa-bulletin" adapter note in src/domains/graph/adapters.ts). So nothing
// here is parsed from a page at build time. Each month is entered by hand from
// the official PDF, checked cell by cell, and carries the date it was checked.
//
// A cell is one of:
//   "C"           current: every priority date may proceed
//   "U"           unavailable: no numbers this month
//   "YYYY-MM-DD"  the cut-off date, exactly as printed (01JAN20 -> 2020-01-01)
// =============================================================================

export type Cutoff = "C" | "U" | `${number}-${number}-${number}`;

/** Columns, in the order the bulletin prints them. */
export const CHARGEABILITY = ["all", "china", "india", "mexico", "philippines"] as const;
export type Chargeability = (typeof CHARGEABILITY)[number];

export const CHARGEABILITY_LABEL: Record<Chargeability, string> = {
  all: "All other countries",
  china: "China (mainland born)",
  india: "India",
  mexico: "Mexico",
  philippines: "Philippines",
};

export const CHARGEABILITY_SHORT: Record<Chargeability, string> = {
  all: "All others",
  china: "China",
  india: "India",
  mexico: "Mexico",
  philippines: "Philippines",
};

export const FAMILY_ROWS = ["F1", "F2A", "F2B", "F3", "F4"] as const;
export type FamilyRow = (typeof FAMILY_ROWS)[number];

export const EMPLOYMENT_ROWS = [
  "EB1",
  "EB2",
  "EB3",
  "EW",
  "EB4",
  "SR",
  "EB5U",
  "EB5R",
  "EB5H",
  "EB5I",
] as const;
export type EmploymentRow = (typeof EMPLOYMENT_ROWS)[number];

export type Row = FamilyRow | EmploymentRow;

export const ROW_LABEL: Record<Row, string> = {
  F1: "F1",
  F2A: "F2A",
  F2B: "F2B",
  F3: "F3",
  F4: "F4",
  EB1: "EB-1",
  EB2: "EB-2",
  EB3: "EB-3",
  EW: "EB-3 other workers",
  EB4: "EB-4",
  SR: "Religious workers",
  EB5U: "EB-5 unreserved",
  EB5R: "EB-5 rural",
  EB5H: "EB-5 high unemployment",
  EB5I: "EB-5 infrastructure",
};

/** One plain line per row, for the checker and the table's row headers. */
export const ROW_HINT: Record<Row, string> = {
  F1: "Unmarried sons and daughters of U.S. citizens",
  F2A: "Spouses and children of permanent residents",
  F2B: "Unmarried sons and daughters (21+) of permanent residents",
  F3: "Married sons and daughters of U.S. citizens",
  F4: "Brothers and sisters of adult U.S. citizens",
  EB1: "Priority workers",
  EB2: "Advanced degree or exceptional ability",
  EB3: "Skilled workers and professionals",
  EW: "Other workers",
  EB4: "Certain special immigrants",
  SR: "Certain religious workers",
  EB5U: "Investors, unreserved",
  EB5R: "Investors, rural set-aside",
  EB5H: "Investors, high unemployment set-aside",
  EB5I: "Investors, infrastructure set-aside",
};

export type Table<R extends Row> = Record<R, Record<Chargeability, Cutoff>>;

export interface Chart<R extends Row> {
  finalAction: Table<R>;
  filing: Table<R>;
}

export type ChartKind = keyof Chart<Row>;

export interface Bulletin {
  /** "2026-11": the month the dates apply to. */
  id: string;
  /** "November 2026". */
  label: string;
  /** The official HTML page for this bulletin on travel.state.gov. */
  sourceUrl: string;
  /** The official PDF, when one is published. */
  pdfUrl?: string;
  /** The day a person checked every cell against the official bulletin. */
  verifiedAt: string;
  /**
   * Which chart USCIS says to use for adjustment of status this month, when
   * the bulletin or USCIS states it. Left out rather than guessed.
   */
  uscisChart?: { family: ChartKind; employment: ChartKind };
  family: Chart<FamilyRow>;
  employment: Chart<EmploymentRow>;
}
