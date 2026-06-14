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
 * src/lib/source-data.ts as the latest published values + clearly-labelled
 * projections, then serialized to src/lib/generated/dataset.json by
 * scripts/build-dataset.ts (the prebuild step that runs right after this one).
 * As stable feeds are wired, add them to FEEDS below.
 */
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/lib/generated/refresh.json", import.meta.url));
// Machine-readable manifest served as a static asset at /data-manifest.json
const PUBLIC_OUT = fileURLToPath(new URL("../public/data-manifest.json", import.meta.url));
// Growing historical archive (seeded by scripts/backfill-history.mjs).
const HISTORY_OUT = fileURLToPath(new URL("../src/lib/generated/history.json", import.meta.url));
const TIMEOUT_MS = 15000;
const CBP_MONTH_ORDER = { OCT: 1, NOV: 2, DEC: 3, JAN: 4, FEB: 5, MAR: 6, APR: 7, MAY: 8, JUN: 9, JUL: 10, AUG: 11, SEP: 12 };

async function fetchWithTimeout(url, opts = {}, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": "ImmigrationClock/1.0", ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function fetchJson(url, opts = {}) {
  return (await fetchWithTimeout(url, opts)).json();
}

/** Minimal RFC-4180-ish CSV line parser (handles quoted fields with commas). */
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
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

// --- CBP Nationwide Encounters (real, CSV, monthly) --------------------------
// CBP publishes a CSV per reporting month at a predictable path, linked from the
// landing page. Each row is an encounter count by FY / month / component /
// citizenship; summing per fiscal year gives the nationwide total (full year for
// completed FYs, year-to-date for the in-progress FY, tagged "(FYTD)").
const CBP_HOST = "https://www.cbp.gov";
const CBP_LANDING = "https://www.cbp.gov/document/stats/nationwide-encounters";
const CBP_NEWSROOM = "https://www.cbp.gov/newsroom/stats/nationwide-encounters";
const MONTH_NAMES = {
  JAN: "January", FEB: "February", MAR: "March", APR: "April", MAY: "May", JUN: "June",
  JUL: "July", AUG: "August", SEP: "September", OCT: "October", NOV: "November", DEC: "December",
};

async function fetchCbpEncounters(prev) {
  try {
    const page = await (await fetchWithTimeout(CBP_LANDING)).text();
    // The newest "...-aor.csv" link appears first on the page.
    const m = page.match(/\/sites\/default\/files\/[^"']*nationwide-encounters-[^"']*-aor\.csv/i);
    if (!m) throw new Error("no nationwide-encounters CSV link on landing page");
    const csvUrl = CBP_HOST + m[0];
    const monthM = m[0].match(/-([a-z]{3})-aor\.csv$/i);
    const monthAbbr = monthM ? monthM[1].toUpperCase() : null;

    const csv = await (await fetchWithTimeout(csvUrl, {}, 30000)).text();
    const lines = csv.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw new Error("empty CSV");
    const H = parseCsvLine(lines[0]).map((h) => h.trim());
    const fyI = H.indexOf("Fiscal Year");
    const cntI = H.indexOf("Encounter Count");
    if (fyI < 0 || cntI < 0) throw new Error("unexpected CSV columns");

    const totals = {};
    let currentFy = null;
    for (let i = 1; i < lines.length; i++) {
      const r = parseCsvLine(lines[i]);
      if (r.length < H.length) continue;
      const fyRaw = (r[fyI] || "").trim();
      const fy = parseInt(fyRaw, 10);
      if (!Number.isFinite(fy)) continue;
      const n = parseInt((r[cntI] || "0").replace(/[^0-9-]/g, ""), 10) || 0;
      totals[fy] = (totals[fy] || 0) + n;
      if (/FYTD/i.test(fyRaw)) currentFy = fy; // in-progress FY is tagged "(FYTD)"
    }
    if (!currentFy || Object.keys(totals).length === 0) throw new Error("no rows parsed");

    const fyTotals = {};
    for (const [fy, v] of Object.entries(totals)) if (Number(fy) !== currentFy) fyTotals[fy] = v;
    const currentFyYtd = totals[currentFy];
    // Oct–Dec fall in the prior calendar year; everything else matches the FY.
    const calYear = monthAbbr && ["OCT", "NOV", "DEC"].includes(monthAbbr) ? currentFy - 1 : currentFy;
    const reportingMonthLabel = monthAbbr ? `${MONTH_NAMES[monthAbbr]} ${calYear}` : `FY${currentFy} YTD`;

    return {
      ok: true,
      stale: false,
      reportingMonth: monthAbbr,
      reportingMonthLabel,
      currentFy,
      currentFyYtd,
      fyTotals,
      datasetUrl: csvUrl,
      fetchedAt: new Date().toISOString(),
      sourceName: "CBP Nationwide Encounters",
      sourceUrl: CBP_NEWSROOM,
      sourceUpdatedAt: new Date().toISOString().slice(0, 10),
      note: `Nationwide encounters summed from CBP's published CSV. FY${currentFy} is year-to-date through ${reportingMonthLabel}.`,
    };
  } catch (err) {
    console.warn(`[refresh] CBP encounters fetch failed: ${err.message}; keeping last good value`);
    const last = prev?.cbp;
    return last && last.currentFyYtd != null
      ? { ...last, ok: false, stale: true, note: `Last good value (fetch failed: ${err.message}).` }
      : {
          ok: false, stale: false, currentFy: null, currentFyYtd: null, fyTotals: {}, fetchedAt: null,
          note: `Unavailable (${err.message}).`, sourceName: "CBP Nationwide Encounters", sourceUrl: CBP_NEWSROOM,
        };
  }
}

// Sources that are auto-fetched vs maintained as latest-published + projections.
const SOURCE_MANIFEST = [
  { key: "bls_unemployment", name: "BLS unemployment rate", mode: "auto-fetch", feed: "BLS Public Data API" },
  { key: "cbp_encounters", name: "CBP Nationwide Encounters", mode: "auto-fetch", feed: "CBP Nationwide Encounters (CSV)" },
  { key: "ice_stats", name: "ICE enforcement & removals", mode: "published-report", feed: "ICE ERO statistics / annual report" },
  { key: "uscis_h1b", name: "USCIS H-1B Employer Data Hub", mode: "published-file", feed: "USCIS H-1B Employer Data Hub (CSV)" },
  { key: "dos_visa", name: "State Dept visa statistics", mode: "published-table", feed: "State Dept monthly NIV/IV tables" },
  { key: "dol_lca", name: "DOL OFLC disclosure data", mode: "published-file", feed: "DOL OFLC disclosure data" },
  { key: "warn_layoffs", name: "State WARN layoff notices", mode: "published-portal", feed: "State WARN portals" },
];

/**
 * Append the current CBP reporting month to the growing historical archive.
 * Upserts by reporting period so re-runs don't duplicate or lose earlier points.
 */
async function updateHistory(cbp) {
  if (!cbp?.ok || cbp.currentFyYtd == null || !cbp.reportingMonthLabel) return null;
  let hist = { cbpNationwideYtd: [] };
  try {
    hist = JSON.parse(await readFile(HISTORY_OUT, "utf8"));
  } catch {
    /* none yet — start fresh */
  }
  const series = hist.cbpNationwideYtd ?? [];
  const point = {
    period: cbp.reportingMonthLabel,
    month: cbp.reportingMonth ?? null,
    order: CBP_MONTH_ORDER[cbp.reportingMonth] ?? 99,
    fy: cbp.currentFy,
    cbpNationwideYtd: cbp.currentFyYtd,
    publishedFolder: null,
    backfilled: false,
  };
  const idx = series.findIndex((s) => s.period === point.period);
  if (idx >= 0) series[idx] = { ...series[idx], ...point };
  else series.push(point);
  series.sort((a, b) => a.fy - b.fy || (a.order ?? 99) - (b.order ?? 99));

  const payload = {
    note:
      "Real historical archive. cbpNationwideYtd is the cumulative nationwide encounters year-to-date at each CBP monthly release (summed from CBP's published CSVs). Appended on each scheduled refresh.",
    lastUpdated: new Date().toISOString(),
    cbpNationwideYtd: series,
  };
  await writeFile(HISTORY_OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return series.length;
}

async function main() {
  const startedAt = new Date().toISOString();
  const prev = await loadPrevious();
  const errors = [];

  // --- auto-fetched feeds ---
  const bls = await fetchBlsUnemployment(prev);
  if (!bls.ok) errors.push(`bls_unemployment: ${bls.note ?? "fetch failed"}`);

  const cbp = await fetchCbpEncounters(prev);
  // CBP is best-effort: a hard failure with NO last-good value is a real error;
  // serving the last good value (stale) is a warning surfaced in the manifest.
  if (!cbp.ok && !cbp.stale && cbp.currentFyYtd == null) {
    errors.push(`cbp_encounters: ${cbp.note ?? "fetch failed"}`);
  }

  // Overall health gates the scheduled Netlify rebuild. BLS is the canonical
  // near-live check; CBP is best-effort (the build keeps last-good on failure).
  const ok = bls.ok;
  const finishedAt = new Date().toISOString();

  const manifest = SOURCE_MANIFEST.map((s) => {
    if (s.key === "bls_unemployment") {
      return { ...s, auto: true, status: bls.ok ? "ok" : "stale", lastFetchedAt: bls.fetchedAt, lastError: bls.ok ? null : bls.note ?? "fetch failed" };
    }
    if (s.key === "cbp_encounters") {
      return { ...s, auto: true, status: cbp.ok ? "ok" : cbp.stale ? "stale" : "manual", lastFetchedAt: cbp.fetchedAt ?? null, lastError: cbp.ok ? null : cbp.note ?? null };
    }
    return { ...s, auto: s.mode === "auto-fetch", status: "manual", lastFetchedAt: null, lastError: null };
  });

  const payload = {
    generatedAt: finishedAt,
    startedAt,
    finishedAt,
    ok,
    errors,
    note: "generatedAt is when this pipeline last ran. It is NOT a claim that the underlying datasets are real-time.",
    bls,
    cbp,
    manifest,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await mkdir(dirname(PUBLIC_OUT), { recursive: true });
  await writeFile(PUBLIC_OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  // Append this month's CBP figure to the growing historical archive.
  const histLen = await updateHistory(cbp);
  if (histLen) console.log(`[refresh] history archive now has ${histLen} CBP monthly points`);

  const cbpLog = cbp.ok
    ? `CBP FY${cbp.currentFy} YTD ${cbp.currentFyYtd?.toLocaleString?.() ?? cbp.currentFyYtd} (through ${cbp.reportingMonthLabel})`
    : `CBP ${cbp.stale ? "STALE (last good)" : "unavailable"}`;
  if (ok) {
    console.log(`[refresh] OK — BLS ${bls.period} (fetched ${bls.fetchedAt}) · ${cbpLog}`);
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
