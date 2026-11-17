// =============================================================================
// VISA BULLETIN FEED: THE NEWEST CHECKED MONTH, AS PLAIN JSON
//
// Served at /api/v1/visa-bulletin for the ImmigrationClock browser extension
// and anyone else who wants the current dates without scraping a page.
//
// It carries exactly what ./data carries for the newest month, plus the month
// before it so a reader can show movement. Nothing is estimated or fetched
// here. A month appears in this feed only once it has been typed from the
// official PDF and checked (verifiedAt), so the feed is never ahead of the
// site, and it is usually some days behind the State Department's own release.
// =============================================================================

import {
  CHARGEABILITY,
  CHARGEABILITY_LABEL,
  EMPLOYMENT_ROWS,
  FAMILY_ROWS,
  OFFICIAL_INDEX_URL,
  ROW_HINT,
  ROW_LABEL,
  bulletinPath,
  cutoffFor,
  latestBulletin,
  previousBulletin,
  type Bulletin,
  type Chargeability,
  type Cutoff,
  type Row,
  type Section,
} from "./index";
import { WAIT_PAIRS, waitPath } from "./wait-time";

export const FEED_PATH = "/api/v1/visa-bulletin";
export const FEED_SCHEMA = 1;

export interface FeedCell {
  finalAction: Cutoff;
  filing: Cutoff;
}

export interface FeedMonth {
  id: string;
  label: string;
  sourceUrl: string;
  pdfUrl?: string;
  verifiedAt: string;
  /** The ImmigrationClock page for this month. */
  path: string;
  dates: Record<Section, Partial<Record<Row, Record<Chargeability, FeedCell>>>>;
}

export interface Feed {
  schema: number;
  publisher: string;
  note: string;
  officialIndexUrl: string;
  countries: { key: Chargeability; label: string }[];
  categories: { section: Section; row: Row; label: string; hint: string }[];
  /** "employment:EB2:india" -> "/green-card-wait-time/eb-2-india", for pairs that have a page. */
  waitTimePages: Record<string, string>;
  latest: FeedMonth | null;
  previous: FeedMonth | null;
}

function monthDates(b: Bulletin): FeedMonth["dates"] {
  const out: FeedMonth["dates"] = { family: {}, employment: {} };
  const sections: [Section, readonly Row[]][] = [
    ["family", FAMILY_ROWS],
    ["employment", EMPLOYMENT_ROWS],
  ];
  for (const [section, rows] of sections) {
    for (const row of rows) {
      const cells = {} as Record<Chargeability, FeedCell>;
      let complete = true;
      for (const country of CHARGEABILITY) {
        const finalAction = cutoffFor(b, section, "finalAction", row, country);
        const filing = cutoffFor(b, section, "filing", row, country);
        if (finalAction === undefined || filing === undefined) {
          complete = false;
          break;
        }
        cells[country] = { finalAction, filing };
      }
      // A row missing any cell is left out rather than half-filled.
      if (complete) out[section][row] = cells;
    }
  }
  return out;
}

export function feedMonth(b: Bulletin): FeedMonth {
  return {
    id: b.id,
    label: b.label,
    sourceUrl: b.sourceUrl,
    ...(b.pdfUrl ? { pdfUrl: b.pdfUrl } : {}),
    verifiedAt: b.verifiedAt,
    path: bulletinPath(b),
    dates: monthDates(b),
  };
}

export function waitKey(section: Section, row: Row, country: Chargeability): string {
  return `${section}:${row}:${country}`;
}

export function buildFeed(b: Bulletin | null = latestBulletin()): Feed {
  const prev = b ? previousBulletin(b) : null;
  return {
    schema: FEED_SCHEMA,
    publisher: "ImmigrationClock",
    note:
      "Dates are typed by hand from the official State Department Visa Bulletin and checked cell by " +
      "cell before they appear here (see verifiedAt). A new month appears some days after the State " +
      "Department publishes it. Always confirm against the official bulletin before acting.",
    officialIndexUrl: OFFICIAL_INDEX_URL,
    countries: CHARGEABILITY.map((key) => ({ key, label: CHARGEABILITY_LABEL[key] })),
    categories: [
      ...EMPLOYMENT_ROWS.map((row) => ({ section: "employment" as const, row, label: ROW_LABEL[row], hint: ROW_HINT[row] })),
      ...FAMILY_ROWS.map((row) => ({ section: "family" as const, row, label: ROW_LABEL[row], hint: ROW_HINT[row] })),
    ],
    waitTimePages: Object.fromEntries(
      WAIT_PAIRS.map((p) => [waitKey(p.section, p.row, p.country), waitPath(p)])
    ),
    latest: b ? feedMonth(b) : null,
    previous: prev ? feedMonth(prev) : null,
  };
}
