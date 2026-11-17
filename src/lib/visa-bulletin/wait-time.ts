// =============================================================================
// GREEN CARD WAIT TIME, ONE CATEGORY AND COUNTRY AT A TIME
//
// One page per category and country ("EB-2 India"), answering the question
// people actually type: how long is the wait? Every number on those pages is
// read from the hand-checked bulletins in ./data and, for the year-ago
// comparison, the double-read history in ./history. Nothing is estimated
// here: "how far behind" is the distance between the bulletin month and its
// own final action date, and "moved in the past year" is the distance between
// two printed dates. The forecast, with its stated method, stays on its own
// page and is linked, not repeated.
// =============================================================================

import {
  CHARGEABILITY_LABEL,
  FORECAST_PATH,
  ROW_HINT,
  ROW_LABEL,
  calendarGap,
  cutoffFor,
  formatCutoff,
  isDate,
  latestBulletin,
  movement,
  type Bulletin,
  type Chargeability,
  type Cutoff,
  type Movement,
  type Row,
  type Section,
} from "./index";
import { HISTORY_MONTHS } from "./history";

export const WAIT_TIME_PATH = "/green-card-wait-time";

export interface WaitPair {
  section: Section;
  row: Row;
  country: Chargeability;
}

/**
 * The pairs with a page, most searched first. Employment rows for the five
 * columns the bulletin prints, EB-1 for the two countries with a line, and
 * the family rows people most often ask about.
 */
export const WAIT_PAIRS: WaitPair[] = [
  ...(["india", "china", "all", "mexico", "philippines"] as const).flatMap((country) =>
    (["EB2", "EB3"] as const).map((row) => ({ section: "employment" as const, row, country }))
  ),
  { section: "employment", row: "EB1", country: "india" },
  { section: "employment", row: "EB1", country: "china" },
  { section: "family", row: "F2A", country: "mexico" },
  { section: "family", row: "F2A", country: "india" },
  { section: "family", row: "F4", country: "india" },
  { section: "family", row: "F4", country: "mexico" },
];

const COUNTRY_SLUG: Record<Chargeability, string> = {
  all: "rest-of-world",
  china: "china",
  india: "india",
  mexico: "mexico",
  philippines: "philippines",
};

/** How the column reads in a heading: "India", "Rest of world". */
export const COUNTRY_NAME: Record<Chargeability, string> = {
  all: "Rest of World",
  china: "China",
  india: "India",
  mexico: "Mexico",
  philippines: "Philippines",
};

export function waitSlug(p: WaitPair): string {
  return `${ROW_LABEL[p.row].toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${COUNTRY_SLUG[p.country]}`;
}

export function waitPath(p: WaitPair): string {
  return `${WAIT_TIME_PATH}/${waitSlug(p)}`;
}

/** "EB-2 India", "F2A Mexico", "EB-3 Rest of World". */
export function waitLabel(p: WaitPair): string {
  return `${ROW_LABEL[p.row]} ${COUNTRY_NAME[p.country]}`;
}

export function pairFromSlug(slug: string): WaitPair | null {
  return WAIT_PAIRS.find((p) => waitSlug(p) === slug) ?? null;
}

/** The forecast form, opened on this category and country. */
export function forecastLink(p: WaitPair): string {
  return `${FORECAST_PATH}?${new URLSearchParams({ section: p.section, row: p.row, country: p.country })}`;
}

/** "13 years", "1 year and 4 months", "3 months", "less than a month". */
export function gapWords(g: { months: number; days: number }): string {
  const years = Math.floor(g.months / 12);
  const months = g.months % 12;
  const y = years ? `${years} year${years === 1 ? "" : "s"}` : "";
  const m = months ? `${months} month${months === 1 ? "" : "s"}` : "";
  if (y && m) return `${y} and ${m}`;
  if (y || m) return y || m;
  return g.days ? `${g.days} day${g.days === 1 ? "" : "s"}` : "no time";
}

/** A gap rounded to whole years once it passes two years, for the answer line. */
export function behindWords(g: { months: number; days: number }): string {
  if (g.months >= 24) {
    const years = Math.round(g.months / 12);
    return `about ${years} years`;
  }
  if (g.months < 1) return "less than a month";
  return `about ${gapWords({ months: g.months, days: 0 })}`;
}

export interface YearAgo {
  month: string;
  cutoff: Cutoff;
  move: Movement;
  sourceUrl: string;
}

function minusMonths(id: string, n: number): string {
  const [y, m] = id.split("-").map(Number);
  const total = y * 12 + (m - 1) - n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export interface WaitFacts {
  pair: WaitPair;
  bulletin: Bulletin;
  finalAction: Cutoff | undefined;
  filing: Cutoff | undefined;
  /** How far the final action date sits behind the first day of the bulletin month. */
  behind: { months: number; days: number } | null;
  /** The same cell twelve bulletins earlier, when we have that month. */
  yearAgo: YearAgo | null;
}

export function waitFacts(pair: WaitPair, bulletin: Bulletin | null = latestBulletin()): WaitFacts | null {
  if (!bulletin) return null;
  const finalAction = cutoffFor(bulletin, pair.section, "finalAction", pair.row, pair.country);
  const filing = cutoffFor(bulletin, pair.section, "filing", pair.row, pair.country);
  const monthStart = `${bulletin.id}-01`;
  const behind = isDate(finalAction) && finalAction < monthStart ? calendarGap(finalAction, monthStart) : null;

  const agoId = minusMonths(bulletin.id, 12);
  const agoMonth = HISTORY_MONTHS.find((m) => m.id === agoId);
  const agoCell = agoMonth?.[pair.section][pair.row]?.[pair.country];
  const yearAgo =
    agoMonth && agoCell
      ? { month: agoId, cutoff: agoCell, move: movement(agoCell, finalAction), sourceUrl: agoMonth.sourceUrl }
      : null;

  return { pair, bulletin, finalAction, filing, behind, yearAgo };
}

/** The one sentence a page opens with. Plain, and only what the bulletin says. */
export function answerLine(f: WaitFacts): string {
  const name = waitLabel(f.pair);
  const month = f.bulletin.label;
  if (f.finalAction === "C") {
    return `${name} is current in the ${month} Visa Bulletin: a visa number is available for every priority date, so the wait is processing time, not the line.`;
  }
  if (f.finalAction === "U") {
    return `No ${name} visa numbers are available in the ${month} Visa Bulletin, so no case in this category can be approved this month.`;
  }
  if (!isDate(f.finalAction)) return `The ${month} Visa Bulletin does not list a date for ${name}.`;
  const behind = f.behind ? `, ${behindWords(f.behind)} behind the bulletin month` : "";
  return `In the ${month} Visa Bulletin, the ${name} final action date is ${formatCutoff(f.finalAction)}${behind}.`;
}

/** The bulletin's rule, said for this cell. Null when the cell is not a date. */
export function ruleLine(f: WaitFacts): string | null {
  if (!isDate(f.finalAction)) return null;
  return `Only a priority date earlier than ${formatCutoff(f.finalAction)} can have a green card approved this month.`;
}

/** The year-on-year change in words, or null when we do not have last year's month. */
export function yearLine(f: WaitFacts, formatMonth: (m: string) => string): string | null {
  const y = f.yearAgo;
  if (!y) return null;
  const from = `${formatMonth(y.month)} (${formatCutoff(y.cutoff)})`;
  switch (y.move.kind) {
    case "ahead": {
      const [a, b] = [y.cutoff as string, f.finalAction as string];
      return `Since ${from}, the final action date moved ahead ${gapWords(calendarGap(a, b))}.`;
    }
    case "back": {
      const [a, b] = [f.finalAction as string, y.cutoff as string];
      return `Since ${from}, the final action date moved back ${gapWords(calendarGap(a, b))}.`;
    }
    case "same":
      return `The final action date has not moved since ${from}.`;
    case "now-current":
      return `The category was dated in ${formatMonth(y.month)} and is now current.`;
    case "now-unavailable":
      return `The category had numbers in ${formatMonth(y.month)} and is unavailable now.`;
    case "now-dated":
      return `The category was ${y.cutoff === "C" ? "current" : "unavailable"} in ${formatMonth(y.month)} and has a cut-off date now.`;
    default:
      return null;
  }
}

/** What the category is, in a line, for the page's description. */
export function categoryHint(p: WaitPair): string {
  return ROW_HINT[p.row];
}

/** "India" in a sentence, "people born in all other countries" for the rest. */
export function countryPhrase(c: Chargeability): string {
  return c === "all" ? "people born outside China, India, Mexico and the Philippines" : `people born in ${CHARGEABILITY_LABEL[c].replace(" (mainland born)", " (mainland)")}`;
}
