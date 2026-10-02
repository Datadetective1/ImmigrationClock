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
//
// The exact pass runs over the whole list before the substring pass, so an
// exact name can sit anywhere; order only decides ties. Entries were checked
// against the header row each warn-scraper module actually writes (2026-09):
//   · Colorado publishes its headcount as `jobs` and its start date as
//     `begin_date` — without those two every Colorado notice was 0 employees
//     with no effective date.
//   · Connecticut's filing date is `warn_document_date`; the generic `date`
//     substring used to land on `layoff_dates` instead and then be nulled by
//     the notice≠effective guard, so no Connecticut row had a notice date.
//   · Alabama's type is `closing_or_layoff` and its start date
//     `planned_starting_date`.
//   · California writes `layoff_or_closure`; Arizona, Delaware, Kansas, Maine,
//     Oklahoma and Vermont (the Job Center platform) write `warn_type`.
//   · `st` is gone from the state aliases: no module writes a bare `st`
//     column, and as a substring it matched `planned_starting_date` and
//     `state_notification_date`. Only the two-character value guard below
//     kept those from mis-attributing rows.
//   · Illinois (IEBS export): employer is `location_name`, the filing date
//     `initial_date_reported`, the layoff date `impact_date`, and the headcount
//     `revised_layoff` when the state has revised it, else `expected_layoff`;
//     `approximate_total_of_full_time_employees` is the site's whole workforce
//     and must never be read as the layoff. Missouri: `title`, `affected`,
//     `received_sort_descending`, `layoff_date_s`, `location_s`. New York:
//     `business_legal_name`, `date_of_warn_notice`, `date_layoff_closure_starts`,
//     `number_of_affected_workers`. All three states were "no employer column"
//     in the 2026-09-11 dry run — 5,455 notices skipped between them.
const ALIASES = {
  employer: ["company", "company_name", "employer", "employer_name", "affected_company", "business_legal_name", "organization_name", "job_site_name", "business_name", "organization", "location_name", "title"],
  city: ["city", "city_name", "worksite_city", "location_city", "location_s", "location"],
  county: ["county", "county_name", "county_parish"],
  state: ["state", "state_code"],
  noticeDate: ["notice_date", "received_date", "date_received", "notice_received", "received_sort_descending", "warn_date", "warn_document_date", "date_of_warn_notice", "state_notification_date", "date_of_notice", "notice_received_date", "initial_report_date", "initial_date_reported", "notification_date_s", "date_posted", "date"],
  effectiveDate: ["effective_date", "date_effective", "layoff_date", "layoff_start_date", "lo_cl_date", "begin_date", "impact_date", "date_layoff_closure_starts", "layoff_date_s", "planned_starting_date", "effective_layoff_date", "separation_date", "closure_date", "layoff_begin_date"],
  employees: ["employees_affected", "affected_employees", "affected_workers", "jobs_affected", "number_affected", "total_layoff_number", "number_of_impacted_workers", "number_of_employees_affected", "number_of_affected_workers", "planned_affected_employees", "revised_layoff", "expected_layoff", "affected", "emp", "workforce_affected", "of_workers", "number_of_workers", "num_workers", "employees", "jobs", "laid_off", "num_employees", "workers_affected", "impact"],
  // `reason` sits before `layoff_type` for Illinois, whose `layoff_type` is
  // "State"/"Federal" (which WARN act applies) while `reason` is the closure
  // or layoff itself.
  layoffType: ["layoff_closure", "layoff_or_closure", "closing_or_layoff", "closure_or_layoff", "reason", "layoff_type", "type_of_layoff", "closure_type", "notice_type", "closure_layoff", "warn_type", "type"],
  sourceUrl: ["detail_page_url", "source_url", "pdf_url", "url", "link"],
};

// Files whose header row is empty. Maryland's parser reads its first page's
// header row with the <td> selector, so the <th> cells come out as an empty
// first row and the data rows that follow are positional. This is the portal
// table's column order (dllr.state.md.us/employment/warn.shtml), confirmed
// against the rows the 2026-09-11 run wrote; it is applied only when the
// data width matches, so a changed layout is reported rather than misread.
const POSITIONAL_HEADERS = {
  MD: ["notice_date", "naics", "company", "address", "county", "employees", "effective_date", "layoff_type"],
};

// Generic words that are safe as an exact column name but would match the
// wrong column as a substring in some other state ("title" inside
// "job_title", "jobs" inside "jobs_lost", "affected" inside a text column).
const EXACT_ONLY = new Set(["title", "jobs", "affected", "emp", "location_name", "location_s"]);

function cleanHeader(h) {
  return String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
/**
 * Column indexes for one field, best first. Every exact alias match is kept,
 * in alias order, so a row can fall through to the next column when the first
 * is empty — Illinois publishes `revised_layoff` beside `expected_layoff`, and
 * only the rows the state has revised fill the first. Substring matching is
 * the last resort and yields a single column.
 */
function pick(headers, aliases) {
  const exact = [];
  for (const a of aliases) {
    const i = headers.indexOf(a);
    if (i >= 0 && !exact.includes(i)) exact.push(i);
  }
  if (exact.length) return exact;
  for (const a of aliases) {
    if (EXACT_ONLY.has(a)) continue;
    const i = headers.findIndex((h) => h.includes(a));
    if (i >= 0) return [i];
  }
  return [];
}
const MAX_EMPLOYEES = 1_000_000; // no single WARN notice is bigger; larger = data error
const MIN_YEAR = 1988; // the WARN Act was enacted in 1988
/**
 * The FIRST figure in a headcount cell, thousands separators removed.
 *
 * Cells carry ranges ("50-75"), multi-site lists ("100 / 50") and notes ("Up
 * to 300", "45 (amended)"). Concatenating every digit turned "50-75" into
 * 5,075 and put Rhode Island at 2,458 employees per notice in the 2026-09-11
 * dry run. The first figure is the low end of a range and the first site of
 * a list: an undercount at worst, never an invented number.
 */
function toInt(v) {
  const m = String(v ?? "").replace(/(\d),(?=\d{3})/g, "$1").match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return Number.isFinite(n) && n >= 0 && n <= MAX_EMPLOYEES ? n : 0;
}
function toIso(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  let iso = null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // yyyy-mm-dd[ hh:mm:ss]
  if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  if (!iso) {
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/); // yyyymmdd (Wisconsin)
    if (m) iso = `${m[1]}-${m[2]}-${m[3]}`;
  }
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
/**
 * A city, or null. Several portals publish a street address in the column the
 * `location` alias reaches (Colorado's "Location Address", Connecticut's
 * "layoff_locations"), and the feed table renders city + state as a place —
 * "4850 32nd Avenue South, CO" is not one. A value that starts with a digit is
 * an address, not a city.
 */
function cityOf(v) {
  const s = clean(v);
  return s && !/^\d/.test(s) ? s : null;
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
    } else if (c === '"' && cur === "") q = true; // a quote opens a field only at its start; mid-field it is literal
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
  let headers = grid[0].map(cleanHeader);
  let positional = false;
  if (headers.every((h) => !h)) {
    const layout = POSITIONAL_HEADERS[code];
    const width = grid[1].length;
    if (!layout || layout.length !== width) {
      return { notices: null, reason: `empty header row and no ${width}-column layout for ${code}` };
    }
    headers = layout;
    positional = true;
  }
  const idx = Object.fromEntries(Object.entries(ALIASES).map(([k, a]) => [k, pick(headers, a)]));
  if (idx.employer.length === 0) return { notices: null, reason: `no employer column (${headers.join(",") || "empty header"})` };
  // Guard against mislabeling: if "noticeDate" only matched the effective/layoff
  // date column (e.g. NJ, which publishes no received date), leave it null rather
  // than pass an effective date off as a notice date.
  idx.noticeDate = idx.noticeDate.filter((i) => !idx.effectiveDate.includes(i));
  const portal = portalFor(code);
  const notices = [];
  let otherState = 0;
  let wrongWidth = 0;
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    // Without a header, a row of a different width cannot be read by
    // position — its employees cell would be some other column's value.
    if (positional && row.length !== headers.length) {
      wrongWidth++;
      continue;
    }
    // First column, in alias order, whose value survives the field's parser.
    const first = (cols, parse) => {
      for (const i of cols) {
        if (i >= row.length) continue;
        const v = parse(row[i]);
        if (v !== null && v !== 0 && v !== "") return v;
      }
      return null;
    };
    const employer = first(idx.employer, (v) => String(v ?? "").trim());
    if (!employer) continue;
    // The notice belongs to the state whose portal published it. A few exports
    // carry a state column for the worksite; it is counted for the log but
    // never re-attributes the row — otherwise a handful of out-of-state
    // worksites in one state's file would make the site claim coverage of a
    // state whose portal it has never read (the 2026-09-11 run reported 19
    // states from 9 files).
    const stateVal = first(idx.state, clean);
    if (stateVal && stateVal.toUpperCase() !== code) otherState++;
    const src = first(idx.sourceUrl, clean);
    notices.push({
      employer,
      city: first(idx.city, cityOf),
      county: first(idx.county, (v) => clean(String(v ?? "").replace(/\s+county$/i, ""))),
      state: code,
      noticeDate: first(idx.noticeDate, toIso),
      effectiveDate: first(idx.effectiveDate, toIso),
      employees: first(idx.employees, toInt) ?? 0,
      layoffType: first(idx.layoffType, clean),
      sourceUrl: src && /^https?:\/\//.test(src) ? src : portal,
    });
  }
  if (notices.length === 0) return { notices: null, reason: "no rows with an employer" };
  return { notices, reason: "", otherState, wrongWidth };
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
    const { notices, reason, otherState, wrongWidth } = parseStateCsv(file, code);
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
    const employees = notices.reduce((t, n) => t + n.employees, 0);
    console.log(
      `[refresh-warn-scraper] ${code}: ${notices.length} notices, ${employees.toLocaleString("en-US")} employees` +
        (otherState ? ` (${otherState} rows list a worksite in another state; kept as ${code})` : "") +
        (wrongWidth ? ` (${wrongWidth} rows skipped: not ${code}'s ${POSITIONAL_HEADERS[code].length}-column layout)` : "")
    );
  }

  // ── 1b. A read that shrank by more than half is a partial read ────────────
  // WARN archives only grow. A portal that returns 91 rows where the last good
  // read had 460 (Arizona, in two runs an hour apart) has been paginated short
  // or rate-limited, not pruned — and replacing the snapshot would silently
  // drop four fifths of a state. The earlier snapshot is kept and the run
  // says so. When a portal really has pruned its archive, pass the code in
  // WARN_ACCEPT_PARTIAL (or "all") once to accept the smaller read as the new
  // baseline.
  const PARTIAL_FLOOR = 20; // below this a halving is noise, not a signal
  const acceptPartial = new Set(
    String(process.env.WARN_ACCEPT_PARTIAL ?? "").toUpperCase().split(/[\s,]+/).filter(Boolean)
  );
  const partial = new Map(); // code → reason
  if (previous) {
    const before = new Map();
    for (const n of previous.notices) {
      const code = String(n.state || "").toUpperCase();
      before.set(code, (before.get(code) ?? 0) + 1);
    }
    for (const [code, data] of fresh) {
      const had = before.get(code) ?? 0;
      if (had < PARTIAL_FLOOR || data.notices.length * 2 >= had) continue;
      if (acceptPartial.has(code) || acceptPartial.has("ALL")) {
        console.warn(`[refresh-warn-scraper] ${code}: ${data.notices.length} rows where the last good read had ${had}; accepted as the new baseline (WARN_ACCEPT_PARTIAL)`);
        continue;
      }
      fresh.delete(code);
      partial.set(code, `partial read — ${data.notices.length} rows where the last good read had ${had}; kept the earlier snapshot (pass ${code} in WARN_ACCEPT_PARTIAL to accept it)`);
    }
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
      : partial.has(code)
        ? partial.get(code)
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
      employees: data ? data.notices.reduce((t, n) => t + n.employees, 0) : 0,
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
    "| State | Outcome | Notices | Employees | Data as of | This run |",
    "|---|---|---:|---:|---|---|",
    ...report.map(
      (r) => `| ${r.code} | ${r.outcome} | ${r.count} | ${r.employees.toLocaleString("en-US")} | ${r.asOf ?? "—"} | ${r.thisRun.replace(/\|/g, "¦")} |`
    ),
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
