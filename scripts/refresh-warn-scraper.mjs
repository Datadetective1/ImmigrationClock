#!/usr/bin/env node
/**
 * ImmigrationClock — bridge from Big Local News `warn-scraper` → committed cache.
 *
 * `warn-scraper` (Python) parses 40+ state WARN portals but emits per-state CSVs
 * with *heterogeneous* columns. This script reads those CSVs from a scrape
 * directory, maps them through a header-alias table, normalizes, and writes a
 * single committed cache at src/lib/generated/warn-scraper.json.
 *
 * That committed cache is the "wide net": scripts/build-warn.ts reads it as one
 * more source and merges it with the live JSON/Excel adapters (TX/OR/CA). This
 * script is the scheduled refresh step (.github/workflows/refresh-warn.yml);
 * the site build itself never runs Python — it just reads the committed JSON.
 *
 * PER-STATE, NOT ALL-OR-NOTHING. The cache used to be rebuilt from whatever
 * CSVs the current run produced, so a state whose portal was down for one run
 * vanished from the site until the next run that happened to succeed — and
 * with forty portals some are always down. Now a state that produced no usable
 * rows this run KEEPS ITS LAST GOOD SNAPSHOT from the previous cache, stamped
 * with the date it was actually read, so coverage never flickers and staleness
 * is stated rather than hidden.
 *
 * Usage:
 *   1) pip install warn-scraper
 *   2) bash .github/scripts/scrape-warn-states.sh <dir> wa nj md ...   # one process per state
 *      (plain `warn-scraper --data-dir <dir> wa nj ...` works too; there are then no status records)
 *   3) WARN_SCRAPE_DIR=<dir> node scripts/refresh-warn-scraper.mjs
 *
 * Environment:
 *   WARN_SCRAPE_DIR         directory of <st>.csv files, plus status/<st>.json
 *                           records written by scrape-warn-states.sh (optional)
 *   WARN_SCRAPER_OUT        where to write (default src/lib/generated/warn-scraper.json)
 *   WARN_SCRAPER_PREVIOUS   previous cache to carry states forward from (default: the output path)
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { STATE_SOURCE, FALLBACK_PORTAL } from "./warn-states.mjs";

const SCRAPE_DIR = process.env.WARN_SCRAPE_DIR;
const OUT =
  process.env.WARN_SCRAPER_OUT ||
  fileURLToPath(new URL("../src/lib/generated/warn-scraper.json", import.meta.url));
const PREVIOUS = process.env.WARN_SCRAPER_PREVIOUS || OUT;

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

function portalFor(code) {
  return STATE_SOURCE[code]?.portal ?? FALLBACK_PORTAL;
}
function agencyFor(code) {
  return STATE_SOURCE[code]?.agency ?? "State WARN portal";
}

/** status/<st>.json records from scrape-warn-states.sh, keyed by postal code. */
function readAttempts(dir) {
  const attempts = new Map();
  const statusDir = join(dir, "status");
  if (!existsSync(statusDir)) return attempts;
  for (const f of readdirSync(statusDir).filter((f) => f.endsWith(".json"))) {
    try {
      const rec = JSON.parse(readFileSync(join(statusDir, f), "utf8"));
      const code = String(rec.state || basename(f, ".json")).toUpperCase().slice(0, 2);
      attempts.set(code, { ...rec, state: code });
    } catch (err) {
      console.warn(`[refresh-warn-scraper] status/${f}: unreadable (${err.message}); ignored`);
    }
  }
  return attempts;
}

/** The previous committed cache, or null. Its states are what gets carried forward. */
function readPrevious(path) {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(raw.notices)) return null;
    return raw;
  } catch (err) {
    console.warn(`[refresh-warn-scraper] previous cache ${path}: unreadable (${err.message}); nothing carried forward`);
    return null;
  }
}

/** Parse one state's CSV into normalized notices. Returns null when unusable. */
function parseStateCsv(file, code) {
  let grid;
  try {
    grid = parseCsv(readFileSync(join(SCRAPE_DIR, file), "utf8"));
  } catch (err) {
    return { notices: null, reason: `read failed (${err.message})` };
  }
  if (grid.length < 2) return { notices: null, reason: "no data rows" };
  const headers = grid[0].map(cleanHeader);
  const idx = Object.fromEntries(Object.entries(ALIASES).map(([k, a]) => [k, pick(headers, a)]));
  if (idx.employer < 0) return { notices: null, reason: `no employer column (${headers.join(",") || "empty header"})` };
  // Guard against mislabeling: if "noticeDate" only matched the effective/layoff
  // date column (e.g. NJ, which publishes no received date), leave it null rather
  // than pass an effective date off as a notice date.
  if (idx.noticeDate >= 0 && idx.noticeDate === idx.effectiveDate) idx.noticeDate = -1;
  const portal = portalFor(code);
  const notices = [];
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
  }
  if (notices.length === 0) return { notices: null, reason: "no rows with an employer" };
  return { notices, reason: "" };
}

function stepSummary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

function main() {
  const now = new Date().toISOString();
  const files = readdirSync(SCRAPE_DIR).filter((f) => f.toLowerCase().endsWith(".csv"));
  const attempts = readAttempts(SCRAPE_DIR);
  const previous = readPrevious(PREVIOUS);

  // ── 1. Fresh: every CSV that parses to at least one notice ────────────────
  const fresh = new Map(); // code → { notices, scrapedAt, scraperVersion }
  const unusable = new Map(); // code → reason (a CSV that exists but yields nothing)
  for (const file of files) {
    const code = basename(file, ".csv").toUpperCase().slice(0, 2);
    const { notices, reason } = parseStateCsv(file, code);
    if (!notices) {
      console.warn(`[refresh-warn-scraper] ${file}: ${reason}; skipping`);
      unusable.set(code, reason);
      continue;
    }
    const attempt = attempts.get(code);
    fresh.set(code, {
      notices,
      scrapedAt: attempt?.scrapedAt || now,
      scraperVersion: attempt?.scraperVersion || null,
    });
    console.log(`[refresh-warn-scraper] ${code}: ${notices.length} notices`);
  }

  // ── 2. Carried: previous states with nothing fresh this run ───────────────
  const carried = new Map(); // code → { notices, scrapedAt, scraperVersion }
  if (previous) {
    const prevMeta = new Map((previous.states ?? []).map((s) => [s.code, s]));
    const byState = new Map();
    for (const n of previous.notices) {
      const code = String(n.state || "").toUpperCase();
      if (!code || fresh.has(code)) continue;
      if (!byState.has(code)) byState.set(code, []);
      byState.get(code).push(n);
    }
    for (const [code, notices] of byState) {
      const meta = prevMeta.get(code);
      carried.set(code, {
        notices,
        scrapedAt: meta?.scrapedAt || previous.generatedAt || now,
        scraperVersion: meta?.scraperVersion ?? null,
      });
    }
  }

  // ── 3. Report, per state ──────────────────────────────────────────────────
  // Every state this run touched or carries, with an outcome a reader can act on.
  const codes = new Set([...fresh.keys(), ...carried.keys(), ...attempts.keys(), ...unusable.keys()]);
  const report = [];
  for (const code of [...codes].sort()) {
    const attempt = attempts.get(code);
    const thisRun = fresh.has(code)
      ? "ok"
      : unusable.has(code)
        ? `unusable — ${unusable.get(code)}`
        : attempt
          ? `${attempt.status}${attempt.reason ? ` — ${attempt.reason}` : ""}`
          : "not attempted";
    const outcome = fresh.has(code) ? "fresh" : carried.has(code) ? "carried" : "none";
    const data = fresh.get(code) ?? carried.get(code);
    report.push({
      code,
      outcome,
      count: data?.notices.length ?? 0,
      asOf: data?.scrapedAt?.slice(0, 10) ?? null,
      thisRun,
    });
  }
  for (const r of report) {
    if (r.outcome === "carried") {
      console.warn(`[refresh-warn-scraper] ${r.code}: ${r.thisRun}; keeping ${r.count} notices last read ${r.asOf}`);
    } else if (r.outcome === "none") {
      console.warn(`[refresh-warn-scraper] ${r.code}: ${r.thisRun}; no earlier snapshot to keep`);
    }
  }
  stepSummary([
    "### WARN cache — per state",
    "",
    "| State | Outcome | Notices | Data as of | This run |",
    "|---|---|---:|---|---|",
    ...report.map((r) => `| ${r.code} | ${r.outcome} | ${r.count} | ${r.asOf ?? "—"} | ${r.thisRun.replace(/\|/g, "¦")} |`),
    "",
    `**${fresh.size} state(s) refreshed, ${carried.size} carried forward from an earlier run, ` +
      `${report.filter((r) => r.outcome === "none").length} with no data.**`,
  ]);

  if (fresh.size === 0) {
    // Nothing new at all: the pipeline, not a portal, is broken. Leave the
    // committed cache exactly as it is and make the run red.
    console.error(
      `[refresh-warn-scraper] no state produced usable rows (${files.length} CSV file(s), ` +
        `${attempts.size} status record(s)); cache left untouched`
    );
    process.exit(1);
  }

  // ── 4. Write ──────────────────────────────────────────────────────────────
  const notices = [];
  const states = [];
  for (const [code, data] of [...fresh].concat([...carried])) {
    notices.push(...data.notices);
    states.push({
      code,
      count: data.notices.length,
      agency: agencyFor(code),
      portal: portalFor(code),
      // "fresh" = read from the portal this run; "carried" = kept from an
      // earlier run because this one produced nothing usable for the state.
      status: fresh.has(code) ? "fresh" : "carried",
      scrapedAt: data.scrapedAt,
      scraperVersion: data.scraperVersion,
    });
  }
  states.sort((a, b) => b.count - a.count);

  const payload = {
    generatedAt: now,
    source: "biglocalnews/warn-scraper",
    states,
    // What this run tried, whether or not it produced data — the audit trail
    // for a state that is missing above.
    attempts: [...attempts.values()]
      .map((a) => ({
        state: a.state,
        status: a.status,
        rows: a.rows ?? 0,
        seconds: a.seconds ?? null,
        reason: a.reason || "",
        scrapedAt: a.scrapedAt || now,
      }))
      .sort((a, b) => a.state.localeCompare(b.state)),
    noticeCount: notices.length,
    notices,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload) + "\n", "utf8");
  console.log(
    `[refresh-warn-scraper] wrote ${notices.length} notices across ${states.length} states ` +
      `(${fresh.size} fresh, ${carried.size} carried) → ${OUT}`
  );
}

main();
