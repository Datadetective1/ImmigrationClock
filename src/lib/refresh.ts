import { SOURCES } from "./sources";
import {
  companies,
  cbpRows,
  iceRows,
  visaRows,
  wageRows,
  layoffRows,
  UPDATED,
} from "./dataset";
import refresh from "./generated/refresh.json";
import type { RefreshRow, Completeness } from "./types";

// Latest reporting period in the dataset per source (what the freshness logic
// surfaces on the cards).
const LATEST_PERIOD: Record<string, { period: string; completeness: Completeness; updatedKey: keyof typeof UPDATED }> = {
  uscis_h1b: { period: "FY2024", completeness: "complete", updatedKey: "uscis_h1b" },
  dol_lca: { period: "FY2024", completeness: "complete", updatedKey: "dol_lca" },
  ice_stats: { period: "FY2026 YTD", completeness: "ytd", updatedKey: "ice_stats" },
  dhs_stats: { period: "FY2025", completeness: "complete", updatedKey: "dhs_stats" },
  cbp_encounters: { period: "FY2026 YTD", completeness: "ytd", updatedKey: "cbp_encounters" },
  dos_visa: { period: "FY2026 YTD", completeness: "ytd", updatedKey: "dos_visa" },
  bls_wages: { period: "May 2024 (OEWS)", completeness: "complete", updatedKey: "bls_wages" },
  warn_layoffs: { period: "2026 YTD", completeness: "ytd", updatedKey: "warn_layoffs" },
  trac: { period: "Mar 2026", completeness: "preliminary", updatedKey: "trac" },
};

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
    const fresh = LATEST_PERIOD[s.key];
    const sourceUpdatedAt =
      (UPDATED as Record<string, string>)[fresh?.updatedKey ?? s.key] ??
      (UPDATED as Record<string, string>)[s.key] ??
      "2026-01-01";
    const last = sourceUpdatedAt;
    const status = FAILED_KEYS.has(s.key) ? "FAILED" : "SUCCESS";
    return {
      key: s.key,
      name: s.name,
      agency: s.agency,
      cadence: s.cadence,
      latestPeriod: fresh?.period ?? "—",
      completeness: fresh?.completeness ?? "complete",
      sourceUpdatedAt,
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

// ---------------------------------------------------------------------------
// Data manifest (for /data-manifest) — source × refresh status × auto/manual
// ---------------------------------------------------------------------------
export interface ManifestRow {
  key: string;
  name: string;
  agency: string;
  feed: string;
  mode: string; // auto-fetch | published-file | published-report | ...
  auto: boolean;
  status: string; // ok | stale | manual
  latestPeriod: string;
  completeness: Completeness;
  sourceUpdatedAt: string | null; // when the source last published
  lastFetchedAt: string | null; // when our pipeline last fetched it
  lastError?: string | null;
}

export const REFRESH_STATUS = {
  generatedAt: (refresh as { generatedAt: string }).generatedAt,
  ok: (refresh as { ok?: boolean }).ok ?? true,
  errors: ((refresh as { errors?: string[] }).errors ?? []) as string[],
};

export function dataManifest(): ManifestRow[] {
  const bySourceKey = Object.fromEntries(SOURCES.map((s) => [s.key, s]));
  const m = (refresh as { manifest: Record<string, unknown>[] }).manifest ?? [];
  const bls = (refresh as { bls?: { period?: string; sourceUpdatedAt?: string } }).bls;
  return m.map((raw) => {
    const r = raw as {
      key: string;
      name?: string;
      feed: string;
      mode: string;
      auto: boolean;
      status: string;
      lastFetchedAt: string | null;
      lastError?: string | null;
    };
    const src = bySourceKey[r.key];
    const fresh = LATEST_PERIOD[r.key];
    const isBls = r.key === "bls_unemployment";
    const sourceUpdatedAt = isBls
      ? bls?.sourceUpdatedAt ?? null
      : (UPDATED as Record<string, string>)[fresh?.updatedKey ?? r.key] ??
        (UPDATED as Record<string, string>)[r.key] ??
        null;
    return {
      key: r.key,
      name: r.name ?? src?.name ?? r.key,
      agency: src?.agency ?? (isBls ? "U.S. Bureau of Labor Statistics" : "—"),
      feed: r.feed,
      mode: r.mode,
      auto: r.auto,
      status: r.status,
      latestPeriod: isBls ? bls?.period ?? "—" : fresh?.period ?? "—",
      completeness: isBls ? "point_in_time" : fresh?.completeness ?? "complete",
      sourceUpdatedAt,
      lastFetchedAt: r.lastFetchedAt,
      lastError: r.lastError,
    };
  });
}
