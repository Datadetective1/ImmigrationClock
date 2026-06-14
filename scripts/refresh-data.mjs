#!/usr/bin/env node
/**
 * ImmigrationClock — build-time / scheduled data refresh.
 *
 * Runs as `prebuild` and in the scheduled GitHub Action. It fetches from public
 * sources that expose a reliable machine-readable feed, and writes the results
 * (with a real `fetchedAt` timestamp) to src/lib/generated/refresh.json, which
 * the app reads at build time.
 *
 * INTEGRITY RULES (enforced here):
 *  - We only mark a value `reported` when we actually fetched it from the source.
 *  - On any failure we keep the LAST GOOD fetched value (never fabricate a new
 *    one) and flag the source as stale — the build still succeeds.
 *  - `generatedAt` records when the pipeline last ran (this build). It is NOT a
 *    claim that the underlying datasets are real-time.
 *
 * Most federal immigration datasets (CBP, ICE, USCIS, DOS) publish via Excel/PDF
 * behind dynamic pages with no stable API, so their figures are maintained in
 * src/lib/sample-data.ts as the latest published values + clearly-labelled
 * projections. As stable feeds are wired, add them to FEEDS below.
 */
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/lib/generated/refresh.json", import.meta.url));
const TIMEOUT_MS = 15000;

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": "ImmigrationClock/1.0", ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    return null;
  }
}

// --- BLS national unemployment rate (real, no API key, monthly) ---------------
async function fetchBlsUnemployment(prev) {
  const url = "https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000";
  try {
    const j = await fetchJson(url);
    const series = j?.Results?.series?.[0]?.data;
    if (!Array.isArray(series) || series.length === 0) throw new Error("no data");
    const latest = series[0];
    const value = parseFloat(latest.value);
    if (!Number.isFinite(value)) throw new Error("bad value");
    return {
      ok: true,
      value,
      period: `${latest.periodName} ${latest.year}`,
      sourceUpdatedAt: `${latest.year}-${String(latest.period).replace("M", "").padStart(2, "0")}-01`,
      fetchedAt: new Date().toISOString(),
      sourceName: "U.S. Bureau of Labor Statistics",
      sourceUrl: "https://www.bls.gov/cps/",
      note: "Seasonally adjusted national unemployment rate (LNS14000000).",
    };
  } catch (err) {
    console.warn(`[refresh] BLS unemployment fetch failed: ${err.message}; keeping last good value`);
    const last = prev?.bls;
    return last
      ? { ...last, ok: false, note: `Last good value (fetch failed: ${err.message}).` }
      : { ok: false, value: null, period: null, fetchedAt: null, note: `Unavailable (${err.message}).`, sourceName: "U.S. Bureau of Labor Statistics", sourceUrl: "https://www.bls.gov/cps/" };
  }
}

// Sources that are auto-fetched vs maintained as latest-published + projections.
const SOURCE_MANIFEST = [
  { key: "bls_unemployment", mode: "auto-fetch", feed: "BLS Public Data API" },
  { key: "cbp_encounters", mode: "published-file", feed: "CBP Nationwide Encounters (Excel)" },
  { key: "ice_stats", mode: "published-report", feed: "ICE ERO statistics / annual report" },
  { key: "uscis_h1b", mode: "published-file", feed: "USCIS H-1B Employer Data Hub (CSV)" },
  { key: "dos_visa", mode: "published-table", feed: "State Dept monthly NIV/IV tables" },
  { key: "dol_lca", mode: "published-file", feed: "DOL OFLC disclosure data" },
  { key: "warn_layoffs", mode: "published-portal", feed: "State WARN portals" },
];

async function main() {
  const prev = await loadPrevious();
  const bls = await fetchBlsUnemployment(prev);

  const payload = {
    generatedAt: new Date().toISOString(),
    note: "generatedAt is when this pipeline last ran (this build). It is not a claim that the underlying datasets are real-time.",
    bls,
    manifest: SOURCE_MANIFEST.map((s) => ({
      ...s,
      lastFetchedAt: s.key === "bls_unemployment" ? bls.fetchedAt : null,
      status: s.key === "bls_unemployment" ? (bls.ok ? "ok" : "stale") : "manual",
    })),
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[refresh] wrote ${OUT} — BLS ${bls.ok ? "ok" : "stale"} (${bls.period ?? "n/a"})`);
}

main().catch((err) => {
  // Never fail the build because a public feed is down.
  console.error(`[refresh] unexpected error (continuing): ${err.message}`);
  process.exit(0);
});
