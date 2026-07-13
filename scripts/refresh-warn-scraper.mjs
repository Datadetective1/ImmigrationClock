#!/usr/bin/env node
/**
 * ImmigrationClock — bridge from Big Local News `warn-scraper` → committed cache.
 *
 * `warn-scraper` (Python) parses 40+ state WARN portals but emits per-state CSVs
 * with *heterogeneous* columns. This script reads those CSVs from a local scrape
 * directory, maps them through a header-alias table (mirrors
 * data_pipeline/ingest_warn_layoffs.py), normalizes, and writes a single committed
 * cache at src/lib/generated/warn-scraper.json.
 *
 * That committed cache is the "wide net": scripts/build-warn.ts reads it as one
 * more source and merges it with the live JSON/Excel adapters (TX/OR/CA). This
 * script is the OCCASIONAL refresh step (run locally or in a scheduled CI job);
 * the site build itself never runs Python — it just reads the committed JSON.
 *
 * Usage:
 *   1) pip install warn-scraper
 *   2) warn-scraper --data-dir <dir> wa nj md ga ...     # scrape states
 *   3) WARN_SCRAPE_DIR=<dir> node scripts/refresh-warn-scraper.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const SCRAPE_DIR = process.env.WARN_SCRAPE_DIR;
const OUT = fileURLToPath(new URL("../src/lib/generated/warn-scraper.json", import.meta.url));

if (!SCRAPE_DIR || !existsSync(SCRAPE_DIR)) {
  console.error(
    `[refresh-warn-scraper] Set WARN_SCRAPE_DIR to a warn-scraper --data-dir. ` +
      `Got: ${SCRAPE_DIR || "(unset)"}`
  );
  process.exit(1);
}

// Header aliases (cleaned to lower_snake). First present wins; then loose contains.
const ALIASES = {
  employer: ["company", "company_name", "employer", "employer_name", "job_site_name", "business_name", "organization"],
  city: ["city", "city_name", "location", "worksite_city", "location_city"],
  county: ["county", "county_name", "county_parish"],
  state: ["state", "state_code", "st"],
  noticeDate: ["notice_date", "received_date", "date_received", "warn_date", "date_of_notice", "notice_received_date", "initial_report_date", "date_posted", "date"],
  effectiveDate: ["effective_date", "layoff_date", "layoff_start_date", "separation_date", "closure_date", "layoff_begin_date"],
  employees: ["employees_affected", "affected_employees", "number_affected", "total_layoff_number", "workforce_affected", "of_workers", "number_of_workers", "num_workers", "employees", "laid_off", "num_employees", "number_of_employees_affected", "workers_affected", "impact"],
  layoffType: ["layoff_closure", "layoff_type", "type_of_layoff", "closure_type", "notice_type", "closure_layoff", "type"],
  sourceUrl: ["detail_page_url", "source_url", "url", "link"],
};

// Best-effort per-state portal for provenance when a row has no source URL column.
const STATE_PORTAL = {
  WA: "https://esd.wa.gov/about-employees/WARN",
  NJ: "https://www.nj.gov/labor/employer-services/warn/",
  MD: "https://www.dllr.state.md.us/employment/warn.shtml",
  GA: "https://www.dol.state.ga.us/public/es/warn/searchwarns/list",
  MN: "https://mn.gov/deed/programs-services/dislocated-worker/employers/warn/",
  CO: "https://cdle.colorado.gov/employers/layoff-separations/layoff-warn-list",
  MA: "https://www.mass.gov/service-details/worker-adjustment-and-retraining-act-warn-notices",
  KS: "https://www.kansasworks.com/search/warn_lookups",
  VA: "https://www.vec.virginia.gov/warn-notices",
  IN: "https://www.in.gov/dwd/warn-notices/",
  WI: "https://dwd.wisconsin.gov/dislocatedworker/warn/",
};
const FALLBACK_PORTAL = "https://www.dol.gov/agencies/eta/layoffs/warn";

function cleanHeader(h) {
  return String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function pick(headers, aliases) {
  for (const a of aliases) {
    const i = headers.indexOf(a);
    if (i >= 0) return i;
  }
  for (const a of aliases) {
    const i = headers.findIndex((h) => h.includes(a));
    if (i >= 0) return i;
  }
  return -1;
}
const MAX_EMPLOYEES = 1_000_000; // no single WARN notice is bigger; larger = data error
const MIN_YEAR = 1988; // the WARN Act was enacted in 1988
function toInt(v) {
  const d = String(v ?? "").replace(/[^0-9]/g, "");
  const n = d ? parseInt(d, 10) : 0;
  return Number.isFinite(n) && n >= 0 && n <= MAX_EMPLOYEES ? n : 0;
}
function toIso(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let iso = null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // yyyy-mm-dd[ hh:mm:ss]
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  if (!iso) {
    m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/); // m/d/yyyy
    if (m) {
      let [, mo, d, y] = m;
      if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
      iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
  }
  if (!iso) {
    const dt = new Date(s); // "Feb 23, 2026" etc.
    if (!Number.isNaN(dt.getTime())) iso = dt.toISOString().slice(0, 10);
  }
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const year = Number(iso.slice(0, 4)); // reject typos like 3030 / 0204
  return year >= MIN_YEAR && year <= new Date().getFullYear() + 3 ? iso : null;
}
function clean(v) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

// Minimal RFC-4180 CSV parser (handles quotes, embedded commas/newlines).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* skip */ }
    else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function main() {
  const files = readdirSync(SCRAPE_DIR).filter((f) => f.toLowerCase().endsWith(".csv"));
  if (files.length === 0) {
    console.error(`[refresh-warn-scraper] no CSVs in ${SCRAPE_DIR}`);
    process.exit(1);
  }

  const notices = [];
  const stateCounts = {};
  for (const file of files) {
    const code = basename(file, ".csv").toUpperCase().slice(0, 2);
    let grid;
    try {
      grid = parseCsv(readFileSync(join(SCRAPE_DIR, file), "utf8"));
    } catch (err) {
      console.warn(`[refresh-warn-scraper] ${file}: read failed (${err.message}); skipping`);
      continue;
    }
    if (grid.length < 2) continue;
    const headers = grid[0].map(cleanHeader);
    const idx = Object.fromEntries(Object.entries(ALIASES).map(([k, a]) => [k, pick(headers, a)]));
    if (idx.employer < 0) {
      console.warn(`[refresh-warn-scraper] ${file}: no employer column (${headers}); skipping`);
      continue;
    }
    // Guard against mislabeling: if "noticeDate" only matched the effective/layoff
    // date column (e.g. NJ, which publishes no received date), leave it null rather
    // than pass an effective date off as a notice date.
    if (idx.noticeDate >= 0 && idx.noticeDate === idx.effectiveDate) idx.noticeDate = -1;
    const portal = STATE_PORTAL[code] ?? FALLBACK_PORTAL;
    let n = 0;
    for (let r = 1; r < grid.length; r++) {
      const row = grid[r];
      const at = (i) => (i >= 0 && i < row.length ? row[i] : "");
      const employer = String(at(idx.employer) || "").trim();
      if (!employer) continue;
      const stateVal = clean(at(idx.state));
      const state = stateVal && stateVal.length === 2 ? stateVal.toUpperCase() : code;
      const src = clean(at(idx.sourceUrl));
      notices.push({
        employer,
        city: clean(at(idx.city)),
        county: clean(String(at(idx.county)).replace(/\s+county$/i, "")),
        state,
        noticeDate: toIso(at(idx.noticeDate)),
        effectiveDate: toIso(at(idx.effectiveDate)),
        employees: toInt(at(idx.employees)),
        layoffType: clean(at(idx.layoffType)),
        sourceUrl: src && /^https?:\/\//.test(src) ? src : portal,
      });
      n++;
    }
    stateCounts[code] = (stateCounts[code] ?? 0) + n;
    console.log(`[refresh-warn-scraper] ${code}: ${n} notices`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: "biglocalnews/warn-scraper",
    states: Object.entries(stateCounts)
      .map(([code, count]) => ({ code, count, portal: STATE_PORTAL[code] ?? FALLBACK_PORTAL }))
      .sort((a, b) => b.count - a.count),
    noticeCount: notices.length,
    notices,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload) + "\n", "utf8");
  console.log(
    `[refresh-warn-scraper] wrote ${notices.length} notices across ${Object.keys(stateCounts).length} states → ${OUT}`
  );
}

main();
