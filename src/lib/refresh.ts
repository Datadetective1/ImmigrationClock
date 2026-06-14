import { SOURCES, SOURCE_BY_KEY } from "./sources";
import {
  companies,
  cbpRows,
  iceRows,
  visaRows,
  wageRows,
  layoffRows,
  UPDATED,
  CBP_LIVE,
  WARN_LIVE,
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

// ---------------------------------------------------------------------------
// Reporting lag — a plain-English, per-source view of how current each dataset
// is and whether it is a live machine-readable feed or curated/manual. Powers
// the <ReportingLag /> explainer so users understand why (e.g.) visa data lags.
// ---------------------------------------------------------------------------
export interface ReportingLagRow {
  key: string;
  name: string;
  agency: string;
  cadence: string;
  live: boolean;
  liveScope?: string; // e.g. "Texas only"
  latestPeriod: string; // human description of the newest data
  dataThrough: string | null; // ISO date the newest data reaches
  lagMonths: number | null; // months between dataThrough and now
  labels: string[]; // honesty chips
  note?: string;
}

const MONTHS_IDX: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

// "April 2026" -> last day of that month, "2026-04-30".
function monthLabelToISO(label: string | null | undefined): string | null {
  const m = /([A-Za-z]+)\s+(\d{4})/.exec(label ?? "");
  if (!m) return null;
  const mi = MONTHS_IDX[m[1]];
  if (mi == null) return null;
  const y = Number(m[2]);
  const lastDay = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate();
  return `${y}-${String(mi + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function monthsBehind(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((Date.now() - then) / (86400000 * 30.44)));
}

const CURATED_LABELS = ["Latest official published figures", "Delayed reporting", "Curated / manual source"];

export function reportingLagRows(): ReportingLagRow[] {
  const bls = (refresh as { bls?: { ok?: boolean; period?: string; sourceUpdatedAt?: string } }).bls;
  const agency = (k: string) => SOURCE_BY_KEY[k]?.agency ?? "—";

  const rows: ReportingLagRow[] = [
    {
      key: "cbp_encounters",
      name: "CBP Nationwide Encounters",
      agency: agency("cbp_encounters"),
      cadence: "monthly",
      live: !!CBP_LIVE.ok,
      latestPeriod: CBP_LIVE.ok ? `FY${CBP_LIVE.currentFy} through ${CBP_LIVE.reportingMonthLabel}` : "FY2026 YTD",
      dataThrough: CBP_LIVE.ok ? monthLabelToISO(CBP_LIVE.reportingMonthLabel) : null,
      lagMonths: null,
      labels: CBP_LIVE.ok ? ["Live machine-readable CSV"] : CURATED_LABELS,
    },
    {
      key: "bls_unemployment",
      name: "BLS Unemployment Rate",
      agency: "U.S. Bureau of Labor Statistics",
      cadence: "monthly",
      live: !!bls?.ok,
      latestPeriod: bls?.period ?? "—",
      dataThrough: monthLabelToISO(bls?.period),
      lagMonths: null,
      labels: bls?.ok ? ["Live machine-readable API"] : ["Unavailable"],
    },
    {
      key: "warn_layoffs",
      name: "State WARN Layoff Notices",
      agency: agency("warn_layoffs"),
      cadence: "weekly",
      live: !!WARN_LIVE.ok,
      liveScope: WARN_LIVE.ok ? "Texas only" : undefined,
      latestPeriod: WARN_LIVE.ok ? `${WARN_LIVE.ytdYear} year-to-date (Texas)` : "Curated subset",
      dataThrough: WARN_LIVE.ok ? WARN_LIVE.sourceUpdatedAt ?? null : null,
      lagMonths: null,
      labels: WARN_LIVE.ok ? ["Live feed (Texas)", "Other states curated"] : CURATED_LABELS,
    },
    {
      key: "ice_stats",
      name: "ICE Enforcement & Removals",
      agency: agency("ice_stats"),
      cadence: "monthly",
      live: false,
      latestPeriod: "FY2026 YTD (ERO dashboard)",
      dataThrough: UPDATED.ice_stats,
      lagMonths: null,
      labels: CURATED_LABELS,
    },
    {
      key: "dos_visa",
      name: "State Dept Visa Issuances",
      agency: agency("dos_visa"),
      cadence: "monthly",
      live: false,
      latestPeriod: "Monthly tables to Sep 2025 · FY2024 annual",
      dataThrough: "2025-09-30",
      lagMonths: null,
      labels: CURATED_LABELS,
      note:
        "The State Department publishes monthly issuances as PDFs on a lag (no machine-readable feed). Current-year figures shown on the site are clearly-labelled projections until the official tables catch up — we never present them as reported totals.",
    },
    {
      key: "uscis_h1b",
      name: "USCIS H-1B Employer Data Hub",
      agency: agency("uscis_h1b"),
      cadence: "annual",
      live: false,
      latestPeriod: "FY2024 (latest release)",
      dataThrough: "2024-09-30",
      lagMonths: null,
      labels: CURATED_LABELS,
    },
    {
      key: "dol_lca",
      name: "DOL OFLC Disclosure (LCA / PERM)",
      agency: agency("dol_lca"),
      cadence: "quarterly",
      live: false,
      latestPeriod: "FY2024 (latest release)",
      dataThrough: "2024-09-30",
      lagMonths: null,
      labels: CURATED_LABELS,
    },
  ];

  for (const r of rows) r.lagMonths = monthsBehind(r.dataThrough);
  return rows;
}
