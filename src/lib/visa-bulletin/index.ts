// =============================================================================
// VISA BULLETIN HELPERS
//
// Pure functions over the hand-entered months in ./data. Nothing here fetches
// or parses: a month exists on the site only once it is in BULLETINS, and it
// is in BULLETINS only once someone has checked it against the official PDF.
//
// Adding a month: copy the newest entry in ./data.ts, change id, label, the two
// source URLs and verifiedAt, and retype every cell from the official PDF. The
// tests check shape and dates; they cannot check the numbers, so read each row
// back against the PDF before committing.
// =============================================================================

import { BULLETINS as RAW } from "./data";
import {
  CHARGEABILITY,
  EMPLOYMENT_ROWS,
  FAMILY_ROWS,
  type Bulletin,
  type Chargeability,
  type ChartKind,
  type Cutoff,
  type Row,
} from "./types";

export * from "./types";

/** Newest first. */
export const BULLETINS: Bulletin[] = [...RAW].sort((a, b) => b.id.localeCompare(a.id));

export const VISA_BULLETIN_PATH = "/visa-bulletin";
export const OFFICIAL_INDEX_URL = "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html";

export function bulletinPath(b: Pick<Bulletin, "id">): string {
  return `${VISA_BULLETIN_PATH}/${b.id}`;
}

export function latestBulletin(): Bulletin | null {
  return BULLETINS[0] ?? null;
}

export function getBulletin(id: string): Bulletin | null {
  return BULLETINS.find((b) => b.id === id) ?? null;
}

/** The month before this one, if we have it. */
export function previousBulletin(b: Pick<Bulletin, "id">): Bulletin | null {
  const i = BULLETINS.findIndex((x) => x.id === b.id);
  return i >= 0 ? (BULLETINS[i + 1] ?? null) : null;
}

export type Section = "family" | "employment";

export function rowsFor(section: Section): readonly Row[] {
  return section === "family" ? FAMILY_ROWS : EMPLOYMENT_ROWS;
}

export function cutoffFor(
  b: Bulletin,
  section: Section,
  chart: ChartKind,
  row: Row,
  country: Chargeability
): Cutoff | undefined {
  const table = (section === "family" ? b.family[chart] : b.employment[chart]) as Record<
    string,
    Record<Chargeability, Cutoff>
  >;
  return table[row]?.[country];
}

export function isDate(c: Cutoff | undefined): c is `${number}-${number}-${number}` {
  return typeof c === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2020-01-01" -> "Jan 1, 2020". Read as a calendar date, never a time. */
export function formatCutoff(c: Cutoff | undefined): string {
  if (c === "C") return "Current";
  if (c === "U") return "Unavailable";
  if (!isDate(c)) return "Not listed";
  const [y, m, d] = c.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Whole calendar months and leftover days from a to b (a <= b). */
function calendarGap(a: string, b: string): { months: number; days: number } {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  let months = (by - ay) * 12 + (bm - am);
  let days = bd - ad;
  if (days < 0) {
    months -= 1;
    // Days in the month before b's month.
    days += new Date(Date.UTC(by, bm - 1, 0)).getUTCDate();
  }
  return { months, days };
}

export function formatGap(g: { months: number; days: number }): string {
  const parts: string[] = [];
  const years = Math.floor(g.months / 12);
  const months = g.months % 12;
  if (years) parts.push(`${years} yr`);
  if (months) parts.push(`${months} mo`);
  if (g.days || parts.length === 0) parts.push(`${g.days} d`);
  return parts.join(" ");
}

export type Movement =
  | { kind: "ahead"; gap: string }
  | { kind: "back"; gap: string }
  | { kind: "same" }
  | { kind: "now-current" }
  | { kind: "now-unavailable" }
  | { kind: "now-dated" }
  | { kind: "unknown" };

/** How one cell moved from last month to this month. */
export function movement(prev: Cutoff | undefined, cur: Cutoff | undefined): Movement {
  if (prev === undefined || cur === undefined) return { kind: "unknown" };
  if (prev === cur) return { kind: "same" };
  if (cur === "C") return { kind: "now-current" };
  if (cur === "U") return { kind: "now-unavailable" };
  if (!isDate(prev)) return { kind: "now-dated" };
  if (cur > prev) return { kind: "ahead", gap: formatGap(calendarGap(prev, cur)) };
  return { kind: "back", gap: formatGap(calendarGap(cur, prev)) };
}

export type DateCheck =
  | { kind: "current" }
  | { kind: "unavailable" }
  | { kind: "before-cutoff"; cutoff: string }
  | { kind: "after-cutoff"; cutoff: string; gap: string }
  | { kind: "not-listed" };

/**
 * The bulletin's own rule: a case may proceed when its priority date is
 * EARLIER than the listed date, so a priority date on the cut-off itself is
 * not yet reached.
 */
export function checkDate(priorityDate: string, cutoff: Cutoff | undefined): DateCheck {
  if (cutoff === "C") return { kind: "current" };
  if (cutoff === "U") return { kind: "unavailable" };
  if (!isDate(cutoff)) return { kind: "not-listed" };
  if (priorityDate < cutoff) return { kind: "before-cutoff", cutoff: formatCutoff(cutoff) };
  return {
    kind: "after-cutoff",
    cutoff: formatCutoff(cutoff),
    gap: formatGap(calendarGap(cutoff, priorityDate)),
  };
}

/** Every cell that moved forward, sorted by row order, for the "what moved" strip. */
export function changedCells(b: Bulletin, section: Section, chart: ChartKind = "finalAction") {
  const prev = previousBulletin(b);
  if (!prev) return [];
  const out: { row: Row; country: Chargeability; from: Cutoff; to: Cutoff; move: Movement }[] = [];
  for (const row of rowsFor(section)) {
    for (const country of CHARGEABILITY) {
      const from = cutoffFor(prev, section, chart, row, country);
      const to = cutoffFor(b, section, chart, row, country);
      const move = movement(from, to);
      if (from !== undefined && to !== undefined && move.kind !== "same" && move.kind !== "unknown") {
        out.push({ row, country, from, to, move });
      }
    }
  }
  return out;
}
