import { SOURCES, SOURCE_BY_KEY, monthsSinceVerified } from "./sources";
import {
  companies,
  cbpRows,
  iceRows,
  visaRows,
  wageRows,
  UPDATED,
  CBP_LIVE,
} from "./dataset";
import { WARN_SUMMARY } from "./warn-summary";
import { EMPLOYERS_META } from "./employers";
import refresh from "./generated/refresh.json";
import type { RefreshRow, Completeness } from "./types";

// Latest reporting period in the dataset per source (what the freshness logic
// surfaces on the cards).
//
// TODO(Phase 2): these periods are still hand-maintained for the curated sources.
// They move to the event model, which will carry a real data-through date per
// release. The machine-ingested sources (CBP, BLS, WARN, USCIS Data Hub) already
// derive their period from the pipeline output below rather than from this table.
const LATEST_PERIOD: Record<string, { period: string; completeness: Completeness; updatedKey: keyof typeof UPDATED }> = {
  // Derived from the file we actually ingested — never hardcoded. Hardcoding this
  // is what let the site claim FY2024 while serving an FY2023 export.
  uscis_h1b: {
    period: `FY${EMPLOYERS_META.fiscalYear}`,
    completeness: "complete",
    updatedKey: "uscis_h1b",
  },
  uscis_h1b_national: { period: "FY2025 (preliminary)", completeness: "preliminary", updatedKey: "uscis_h1b_national" },
  dol_lca: { period: "FY2024", completeness: "complete", updatedKey: "dol_lca" },
  ice_stats: { period: "FY2026 YTD", completeness: "ytd", updatedKey: "ice_stats" },
  dhs_stats: { period: "FY2025", completeness: "complete", updatedKey: "dhs_stats" },
  cbp_encounters: {
    period: CBP_LIVE.ok && CBP_LIVE.reportingMonthLabel
      ? `FY${CBP_LIVE.currentFy} through ${CBP_LIVE.reportingMonthLabel}`
      : "FY2026 YTD",
    completeness: "ytd",
    updatedKey: "cbp_encounters",
  },
  dos_visa: { period: "FY2026 YTD", completeness: "ytd", updatedKey: "dos_visa" },
  bls_wages: { period: "May 2024 (OEWS)", completeness: "complete", updatedKey: "bls_wages" },
  bls_unemployment: {
    period: (refresh as { bls?: { period?: string } }).bls?.period ?? "—",
    completeness: "point_in_time",
    updatedKey: "bls_wages",
  },
  warn_layoffs: {
    period: WARN_SUMMARY.maxNoticeDate
      ? `Notices through ${WARN_SUMMARY.maxNoticeDate}`
      : "No notices",
    completeness: "ytd",
    updatedKey: "warn_layoffs",
  },
  trac: { period: "Not ingested", completeness: "preliminary", updatedKey: "trac" },
};

// How many records each source actually contributes to the shipped snapshot.
// A source we do not ingest contributes 0 — attributing rows to it would imply an
// ingestion that never ran.
const ROW_COUNTS: Record<string, number> = {
  uscis_h1b: EMPLOYERS_META.count,
  uscis_h1b_national: 0,
  dol_lca: companies.reduce((s, c) => s + c.topJobTitles.length * c.years.length, 0),
  ice_stats: iceRows.length,
  dhs_stats: iceRows.length,
  cbp_encounters: cbpRows.length,
  dos_visa: visaRows.length,
  bls_wages: wageRows.length,
  bls_unemployment: (refresh as { bls?: { value?: number | null } }).bls?.value != null ? 1 : 0,
  warn_layoffs: WARN_SUMMARY.noticeCount,
  trac: 0, // registered but not ingested
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

// Real per-source pipeline outcome, read from refresh.json (written by
// scripts/refresh-data.mjs) plus the generated snapshots.
//
// This function previously hardcoded one source to FAILED "to exercise the admin
// UI", and derived every other status from nothing at all. A page whose entire
// job is to report whether the platform is honest about its data cannot itself
// display a fabricated status. Removed 2026-08-01; see docs/data-corrections.md.
function pipelineStatus(key: string): { status: RefreshRow["status"]; error?: string } {
  const src = SOURCE_BY_KEY[key];
  if (!src) return { status: "PENDING" };

  // Curated sources are not fetched by any pipeline, so they have no run outcome
  // to report. Saying SUCCESS would imply an automated check that never happened.
  if (src.ingestion === "curated") return { status: "PENDING" };
  if (src.ingestion === "planned") {
    return { status: "PENDING", error: "Registered as a source to cover; ingestion not built yet." };
  }

  const r = refresh as Record<string, unknown>;
  const feed = src.refreshKey ? (r[src.refreshKey] as { ok?: boolean; stale?: boolean } | undefined) : undefined;

  // WARN and the employer directory are built by their own scripts, so their
  // health is the presence of real output rather than a refresh.json flag.
  if (key === "warn_layoffs") {
    return WARN_SUMMARY.noticeCount > 0
      ? { status: "SUCCESS" }
      : { status: "FAILED", error: "No WARN notices in the current snapshot." };
  }
  if (key === "uscis_h1b") {
    return EMPLOYERS_META.count > 0
      ? { status: "SUCCESS" }
      : { status: "FAILED", error: "Employer directory is empty." };
  }

  if (!feed) return { status: "PENDING" };
  if (feed.ok) return { status: "SUCCESS" };
  if (feed.stale) {
    return { status: "PARTIAL", error: "Last fetch failed; serving the last good snapshot." };
  }
  return { status: "FAILED", error: "Last scheduled fetch did not return usable data." };
}

export function refreshRows(): RefreshRow[] {
  return SOURCES.map((s) => {
    const fresh = LATEST_PERIOD[s.key];
    const sourceUpdatedAt =
      (UPDATED as Record<string, string>)[fresh?.updatedKey ?? s.key] ??
      (UPDATED as Record<string, string>)[s.key] ??
      s.lastVerifiedAt;
    // When we actually pulled it. For curated sources there is no fetch, so this
    // is the agency's publication date — the honest answer to "how did this get
    // here" is "a human transcribed the published report".
    const lastRefreshAt = REFRESH_STATUS.generatedAt.slice(0, 10);
    const outcome = pipelineStatus(s.key);
    return {
      key: s.key,
      name: s.name,
      agency: s.agency,
      cadence: s.cadence,
      latestPeriod: fresh?.period ?? "—",
      completeness: fresh?.completeness ?? "complete",
      sourceUpdatedAt,
      lastRefreshAt: s.ingestion === "curated" ? sourceUpdatedAt : lastRefreshAt,
      lastVerifiedAt: s.lastVerifiedAt,
      monthsSinceVerified: monthsSinceVerified(s.key),
      ingestion: s.ingestion,
      tier: s.tier,
      nextRefreshAt: addDays(lastRefreshAt, NEXT_REFRESH_DAYS[s.cadence] ?? 30),
      rowCount: ROW_COUNTS[s.key] ?? 0,
      status: outcome.status,
      errorMessage: outcome.error,
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
      live: WARN_SUMMARY.noticeCount > 0,
      liveScope: `${WARN_SUMMARY.stateCount} states: ${WARN_SUMMARY.stateCodes.join(", ")}`,
      latestPeriod: WARN_SUMMARY.maxNoticeDate
        ? `Notices through ${WARN_SUMMARY.maxNoticeDate}`
        : "No notices",
      dataThrough: WARN_SUMMARY.maxNoticeDate,
      lagMonths: null,
      labels: [
        `${WARN_SUMMARY.noticeCount.toLocaleString()} real notices`,
        "Every notice links to its state portal",
        "Partial state coverage — not a national total",
      ],
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
