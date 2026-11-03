// =============================================================================
// FINAL ACTION DATES, MONTH BY MONTH: THE FORECAST'S ONLY INPUT
//
// Two sources, and the stricter one wins:
//
//   1. BULLETINS (./data.ts): months typed by hand from the official PDF and
//      checked cell by cell. Shown on the site as the bulletin itself.
//   2. history.generated.json: older months read from the official
//      travel.state.gov bulletin pages, each read twice independently and kept
//      only where both reads agreed (see data/visa-bulletin-history/README.md).
//      Used only to measure how fast the line has moved, never shown as a
//      month's official table.
//
// When both have a month, the hand-checked one is used.
// =============================================================================

import HISTORY from "./history.generated.json";
import { BULLETINS } from "./data";
import { EMPLOYMENT_ROWS, FAMILY_ROWS, type Chargeability, type Cutoff, type Row } from "./types";
import type { Section } from "./index";

export interface HistoryMonth {
  /** "2024-03". */
  id: string;
  /** The official page the month was read from. */
  sourceUrl: string;
  family: Partial<Record<Row, Partial<Record<Chargeability, Cutoff>>>>;
  employment: Partial<Record<Row, Partial<Record<Chargeability, Cutoff>>>>;
}

export interface HistoryPoint {
  month: string;
  cutoff: Cutoff;
}

function fromBulletins(): HistoryMonth[] {
  return BULLETINS.map((b) => ({
    id: b.id,
    sourceUrl: b.sourceUrl,
    family: b.family.finalAction as HistoryMonth["family"],
    employment: b.employment.finalAction as HistoryMonth["employment"],
  }));
}

/** Oldest first, one entry per month, hand-checked months preferred. */
export const HISTORY_MONTHS: HistoryMonth[] = (() => {
  const byId = new Map<string, HistoryMonth>();
  for (const m of HISTORY as HistoryMonth[]) byId.set(m.id, m);
  for (const m of fromBulletins()) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
})();

const VALID_ROWS: Record<Section, readonly Row[]> = { family: FAMILY_ROWS, employment: EMPLOYMENT_ROWS };

/** One category and country across every month we have, oldest first. Gaps are skipped. */
export function historySeries(section: Section, row: Row, country: Chargeability): HistoryPoint[] {
  if (!VALID_ROWS[section].includes(row)) return [];
  const out: HistoryPoint[] = [];
  for (const m of HISTORY_MONTHS) {
    const cell = m[section][row]?.[country];
    if (cell === "C" || cell === "U" || (typeof cell === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cell))) {
      out.push({ month: m.id, cutoff: cell });
    }
  }
  return out;
}

export function historyRange(): { from: string; to: string; months: number } | null {
  if (HISTORY_MONTHS.length === 0) return null;
  return {
    from: HISTORY_MONTHS[0].id,
    to: HISTORY_MONTHS[HISTORY_MONTHS.length - 1].id,
    months: HISTORY_MONTHS.length,
  };
}
