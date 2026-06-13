import { SOURCES } from "./sources";
import {
  companies,
  cbpRows,
  iceRows,
  visaRows,
  wageRows,
  layoffRows,
  UPDATED,
} from "./sample-data";
import type { RefreshRow } from "./types";

// Row counts per source (sample dataset). With USE_DATABASE on, replace with
// SELECT count(*) per table via Prisma.
const ROW_COUNTS: Record<string, number> = {
  uscis_h1b: companies.reduce((s, c) => s + c.years.length, 0),
  dol_lca: companies.reduce((s, c) => s + c.topJobTitles.length * c.years.length, 0),
  ice_stats: iceRows.length,
  dhs_stats: iceRows.length,
  cbp_encounters: cbpRows.length,
  dos_visa: visaRows.length,
  bls_wages: wageRows.length,
  warn_layoffs: layoffRows.length,
  trac: iceRows.length,
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const NEXT_REFRESH_DAYS: Record<string, number> = {
  monthly: 30,
  quarterly: 91,
  annual: 365,
  weekly: 7,
};

// One source intentionally shown as FAILED to exercise the admin UI.
const FAILED_KEYS = new Set<string>(["bls_wages"]);

export function refreshRows(): RefreshRow[] {
  return SOURCES.map((s) => {
    const last = (UPDATED as Record<string, string>)[s.key] ?? "2026-01-01";
    const status = FAILED_KEYS.has(s.key) ? "FAILED" : "SUCCESS";
    return {
      key: s.key,
      name: s.name,
      agency: s.agency,
      cadence: s.cadence,
      lastRefreshAt: last,
      nextRefreshAt: addDays(last, NEXT_REFRESH_DAYS[s.cadence] ?? 30),
      rowCount: ROW_COUNTS[s.key] ?? 0,
      status: status as RefreshRow["status"],
      errorMessage: FAILED_KEYS.has(s.key)
        ? "HTTP 503 from source endpoint during last scheduled pull; serving last good snapshot."
        : undefined,
    };
  });
}
