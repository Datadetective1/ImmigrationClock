// =============================================================================
// TIMELINE OF MAJOR IMMIGRATION EVENTS — curated, dated, sourced.
//
// A hand-curated, non-exhaustive list of major U.S. immigration policy, legal,
// and political events, each with a primary-source link. Where an event maps to
// a data series we anchor it to the real figure for that fiscal year, so readers
// can connect policy to the numbers ("overlay data changes"). Facts only — dates
// and descriptions are factual; we add no interpretation of motive or outcome.
// =============================================================================
import { cbpRows, iceByFy, H1B_NATIONAL, LATEST_COMPLETE_FY } from "./dataset";
import { formatCompact, formatNumber, fiscalYearLabel } from "./format";

export type EventCategory = "policy" | "legal" | "enforcement" | "visa" | "border" | "political";

export interface ImmigrationEvent {
  date: string; // ISO "YYYY-MM-DD"
  title: string;
  category: EventCategory;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  group?: "border" | "visa" | "enforcement"; // which data series this relates to
  fiscalYear?: number; // for data anchoring + chart overlay
  chartLabel?: string; // short label when drawn as a chart marker
}

// Newest items can be appended; the UI sorts by date. Keep entries factual and
// sourced to the responsible agency / official record.
const EVENTS: ImmigrationEvent[] = [
  {
    date: "2021-01-20",
    title: "Administration change: day-one immigration executive actions",
    category: "political",
    summary:
      "A new administration took office and issued executive actions revising border and interior enforcement priorities and pausing some prior policies.",
    sourceName: "The White House",
    sourceUrl: "https://www.whitehouse.gov/presidential-actions/",
  },
  {
    date: "2023-05-11",
    title: "Title 42 expulsions ended",
    category: "border",
    summary:
      "The COVID-19 public health order used to rapidly expel migrants (Title 42) ended with the public health emergency, returning processing to Title 8.",
    sourceName: "U.S. Department of Homeland Security",
    sourceUrl: "https://www.dhs.gov/news",
    group: "border",
    fiscalYear: 2023,
    chartLabel: "Title 42 ends",
  },
  {
    date: "2023-05-11",
    title: "Circumvention of Lawful Pathways rule took effect",
    category: "legal",
    summary:
      "An asylum rule presuming ineligibility for migrants who crossed without using lawful pathways took effect alongside the end of Title 42.",
    sourceName: "Federal Register",
    sourceUrl: "https://www.federalregister.gov/",
    group: "border",
    fiscalYear: 2023,
  },
  {
    date: "2024-03-01",
    title: "H-1B beneficiary-centric selection introduced",
    category: "visa",
    summary:
      "USCIS moved to a beneficiary-centric H-1B registration for the FY2025 cap, counting each individual once regardless of how many employers registered them — aimed at curbing duplicate registrations.",
    sourceName: "U.S. Citizenship and Immigration Services",
    sourceUrl: "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
    group: "visa",
    fiscalYear: 2024,
  },
  {
    date: "2024-04-01",
    title: "USCIS fee schedule increase took effect",
    category: "policy",
    summary:
      "USCIS's first major fee rule since 2016 took effect, raising many petition and application fees, including for employment-based filings.",
    sourceName: "U.S. Citizenship and Immigration Services",
    sourceUrl: "https://www.uscis.gov/forms/filing-fees",
    group: "visa",
    fiscalYear: 2024,
  },
  {
    date: "2024-06-04",
    title: "Presidential proclamation limiting asylum at the border",
    category: "policy",
    summary:
      "A proclamation restricted asylum processing at the southern border when average daily encounters exceeded a set threshold; encounters fell sharply afterward.",
    sourceName: "The White House",
    sourceUrl: "https://www.whitehouse.gov/presidential-actions/",
    group: "border",
    fiscalYear: 2024,
    chartLabel: "Asylum proclamation",
  },
  {
    date: "2024-11-05",
    title: "U.S. general election",
    category: "political",
    summary:
      "The 2024 general election; immigration was a central campaign issue, and the outcome preceded a significant shift in federal immigration policy.",
    sourceName: "U.S. Election Assistance Commission",
    sourceUrl: "https://www.eac.gov/",
  },
  {
    date: "2025-01-20",
    title: "Administration change: sweeping day-one immigration actions",
    category: "political",
    summary:
      "A new administration took office and issued broad immigration executive actions affecting border processing, interior enforcement, and parole/refugee programs.",
    sourceName: "The White House",
    sourceUrl: "https://www.whitehouse.gov/presidential-actions/",
    group: "enforcement",
    fiscalYear: 2025,
  },
  {
    date: "2025-02-01",
    title: "Interior enforcement surge",
    category: "enforcement",
    summary:
      "ICE arrests, removals, and the detained population rose substantially through 2025, reaching among the highest detention levels in the system's history.",
    sourceName: "U.S. Immigration and Customs Enforcement",
    sourceUrl: "https://www.ice.gov/statistics",
    group: "enforcement",
    fiscalYear: 2025,
  },
];

/** All events, newest first. */
export function timelineEvents(): ImmigrationEvent[] {
  return [...EVENTS].sort((a, b) => b.date.localeCompare(a.date));
}

/** Real data figure for the event's fiscal year, where it maps to a series. */
export function eventDataContext(e: ImmigrationEvent): { text: string; reported: boolean } | null {
  if (!e.group || !e.fiscalYear) return null;
  const fy = e.fiscalYear;
  const reported = fy <= LATEST_COMPLETE_FY;
  const tag = reported ? "" : " (YTD)";
  if (e.group === "border") {
    const row = cbpRows.find((r) => r.fiscalYear === fy && r.border === "nationwide");
    if (row) return { text: `CBP nationwide encounters, FY${fy}${tag}: ${formatCompact(row.totalEncounters)}.`, reported };
  }
  if (e.group === "enforcement") {
    const r = iceByFy[fy];
    if (r) return { text: `ICE removals, FY${fy}${tag}: ${formatNumber(r.removals)}.`, reported };
  }
  if (e.group === "visa") {
    const h = H1B_NATIONAL[fy];
    if (h) return { text: `H-1B approvals, FY${fy}: ${formatNumber(h.approvals)}.`, reported };
  }
  return null;
}

/** One marker per fiscal year for overlaying border events on the FY chart. */
export function borderChartMarkers(): { x: string; label: string }[] {
  const seen = new Set<string>();
  const out: { x: string; label: string }[] = [];
  for (const e of EVENTS) {
    if (e.group !== "border" || !e.fiscalYear || !e.chartLabel) continue;
    const x = fiscalYearLabel(e.fiscalYear);
    if (seen.has(x)) continue;
    seen.add(x);
    out.push({ x, label: e.chartLabel });
  }
  return out;
}
