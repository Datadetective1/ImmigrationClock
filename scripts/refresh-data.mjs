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
// Machine-readable manifest served as a static asset at /data-manifest.json
const PUBLIC_OUT = fileURLToPath(new URL("../public/data-manifest.json", import.meta.url));
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
  { key: "bls_unemployment", name: "BLS unemployment rate", mode: "auto-fetch", feed: "BLS Public Data API" },
  { key: "cbp_encounters", name: "CBP Nationwide Encounters", mode: "published-file", feed: "CBP Nationwide Encounters (Excel)" },
  { key: "ice_stats", name: "ICE enforcement & removals", mode: "published-report", feed: "ICE ERO statistics / annual report" },
  { key: "uscis_h1b", name: "USCIS H-1B Employer Data Hub", mode: "published-file", feed: "USCIS H-1B Employer Data Hub (CSV)" },
  { key: "dos_visa", name: "State Dept visa statistics", mode: "published-table", feed: "State Dept monthly NIV/IV tables" },
  { key: "dol_lca", name: "DOL OFLC disclosure data", mode: "published-file", feed: "DOL OFLC disclosure data" },
  { key: "warn_layoffs", name: "State WARN layoff notices", mode: "published-portal", feed: "State WARN portals" },
];

async function main() {
  const startedAt = new Date().toISOString();
  const prev = await loadPrevious();
  const errors = [];

  // --- auto-fetched feeds ---
  const bls = await fetchBlsUnemployment(prev);
  if (!bls.ok) errors.push(`bls_unemployment: ${bls.note ?? "fetch failed"}`);

  // Overall health = every auto-fetch feed succeeded (currently just BLS).
  const ok = bls.ok;
  const finishedAt = new Date().toISOString();

  const manifest = SOURCE_MANIFEST.map((s) => {
    const isBls = s.key === "bls_unemployment";
    return {
      ...s,
      auto: s.mode === "auto-fetch",
      status: isBls ? (bls.ok ? "ok" : "stale") : "manual",
      lastFetchedAt: isBls ? bls.fetchedAt : null,
      lastError: isBls && !bls.ok ? bls.note ?? "fetch failed" : null,
    };
  });

  const payload = {
    generatedAt: finishedAt,
    startedAt,
    finishedAt,
    ok,
    errors,
    note: "generatedAt is when this pipeline last ran. It is NOT a claim that the underlying datasets are real-time.",
    bls,
    manifest,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await mkdir(dirname(PUBLIC_OUT), { recursive: true });
  await writeFile(PUBLIC_OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  if (ok) {
    console.log(`[refresh] OK — BLS ${bls.period} (fetched ${bls.fetchedAt})`);
  } else {
    // Surface failures clearly (and in GitHub Actions job logs).
    console.error(`[refresh] COMPLETED WITH ERRORS:`);
    for (const e of errors) console.error(`  - ${e}`);
    if (process.env.GITHUB_ACTIONS === "true") {
      for (const e of errors) console.log(`::warning::refresh failure: ${e}`);
    }
  }
}

main().catch((err) => {
  // Never crash the build because a public feed is down — log and move on.
  console.error(`[refresh] unexpected error (continuing): ${err.stack || err.message}`);
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::error::refresh crashed: ${err.message}`);
  process.exit(0);
});
