#!/usr/bin/env tsx
/**
 * ImmigrationClock — real, multi-state WARN layoff feed (the "live layoffs" set).
 *
 * There is no national WARN feed. Each state publishes on its own — some as clean
 * machine-readable open-data tables, most as HTML/Excel/PDF. This script pulls the
 * states that expose a stable structured endpoint (a per-state adapter registry),
 * normalizes them into one schema, dedupes, cross-aggregates by employer, and
 * writes src/lib/generated/warn.json. Every notice keeps a link back to the state
 * portal it came from.
 *
 * Adding a state = one entry in ADAPTERS below. The heavy-coverage path (40+ states
 * behind HTML/Excel/PDF) lives in the Python pipeline via biglocalnews/warn-scraper;
 * this build stays self-contained (HTTP + JSON only) so the site build needs no
 * database or Python. Runs in prebuild. On any failure it leaves the committed
 * warn.json in place (never overwrites with partial/empty data), matching
 * build-employers.ts.
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { normalizeEmployer, slugify } from "../src/lib/format";

const OUT = fileURLToPath(new URL("../src/lib/generated/warn.json", import.meta.url));
// Wide-net cache produced from biglocalnews/warn-scraper by
// scripts/refresh-warn-scraper.mjs. Committed to the repo and refreshed on a
// schedule; the site build just reads it (no Python at build time).
const SCRAPED_CACHE = fileURLToPath(new URL("../src/lib/generated/warn-scraper.json", import.meta.url));
const DOL_WARN = "https://www.dol.gov/agencies/eta/layoffs/warn";
// Public, free, machine-readable API surface (served as static files by the
// static-export host). WARN Tracker charges for this; we give it away.
const PUBLIC_JSON = fileURLToPath(new URL("../public/api/warn.json", import.meta.url));
const PUBLIC_CSV = fileURLToPath(new URL("../public/api/warn.csv", import.meta.url));
const UA = { "User-Agent": "ImmigrationClock/1.0 (+https://immigrationclock.com)" };

// A single normalized WARN notice, regardless of which state it came from.
interface Notice {
  employer: string;
  normalized: string;
  city: string | null;
  county: string | null;
  state: string;
  noticeDate: string | null; // ISO yyyy-mm-dd (the date filed / received)
  effectiveDate: string | null; // ISO yyyy-mm-dd (layoff effective date)
  employees: number;
  layoffType: string | null;
  sourceUrl: string; // human-readable state portal for this notice
}

interface Adapter {
  code: string; // USPS state code
  agency: string; // publishing agency, for provenance
  pageUrl: string; // human portal
  datasetUrl: string; // machine endpoint we actually fetch
  fetch(): Promise<Notice[]>;
}

async function fetchJson<T = any>(url: string, timeout = 45000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function fetchBuffer(url: string, timeout = 60000): Promise<Buffer> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(t);
  }
}

/** Socrata datetimes look like "2026-06-23T00:00:00.000" — keep the date part. */
function isoDate(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const d = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/** Parse US-style dates ("06/30/2026", "6/3/26") into ISO yyyy-mm-dd. */
function usDate(v: unknown): string | null {
  const m = String(v ?? "").trim().match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (!m) return null;
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  let yyyy = m[3];
  if (yyyy.length === 2) yyyy = (Number(yyyy) > 50 ? "19" : "20") + yyyy;
  return `${yyyy}-${mm}-${dd}`;
}

/** California WARN addresses embed the city: "1 DNA Way  South San Francisco CA 94080". */
function cityFromCaAddress(addr: unknown): string | null {
  const s = String(addr ?? "").trim();
  if (!s) return null;
  // Street and city are separated by 2+ spaces; the tail ends in "<City> CA <ZIP>".
  const parts = s.split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  const tail = parts.length > 1 ? parts[parts.length - 1] : s;
  const m = tail.match(/^(.*?)[\s,]+CA\s+\d{5}/i);
  return m && m[1].trim() ? m[1].trim() : null;
}

/** Header cells carry newlines ("Notice\r\nDate") — flatten for matching. */
function flatHeader(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function toInt(v: unknown): number {
  const n = parseInt(String(v ?? "").replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clean(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

// Data-quality guards. Some state feeds carry typos (year 3030) or garbage counts
// (a stray ID parsed as employees). Reject the implausible rather than trust it.
const MAX_EMPLOYEES = 1_000_000; // no single WARN notice is bigger; larger = error
const MIN_YEAR = 1988; // the WARN Act was enacted in 1988

function saneEmployees(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_EMPLOYEES ? v : 0;
}
function saneDate(d: string | null | undefined): string | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const year = Number(d.slice(0, 4));
  return year >= MIN_YEAR && year <= new Date().getFullYear() + 3 ? d : null;
}

function mkNotice(state: string, sourceUrl: string, p: Partial<Notice> & { employer: string }): Notice | null {
  const employer = p.employer?.trim();
  if (!employer) return null;
  return {
    employer,
    normalized: normalizeEmployer(employer),
    city: p.city ?? null,
    county: p.county ?? null,
    state,
    noticeDate: saneDate(p.noticeDate),
    effectiveDate: saneDate(p.effectiveDate),
    employees: saneEmployees(p.employees),
    layoffType: p.layoffType ?? null,
    sourceUrl,
  };
}

// ---------------------------------------------------------------------------
// State adapters. Verified live (2026) against each open-data endpoint.
// ---------------------------------------------------------------------------
const ADAPTERS: Adapter[] = [
  {
    code: "TX",
    agency: "Texas Workforce Commission",
    pageUrl: "https://data.texas.gov/d/8w53-c4f6",
    datasetUrl: "https://data.texas.gov/resource/8w53-c4f6.json",
    async fetch() {
      const rows = await fetchJson<Record<string, string>[]>(
        `${this.datasetUrl}?$limit=50000&$order=notice_date DESC`
      );
      return rows
        .map((r) =>
          mkNotice("TX", this.pageUrl, {
            employer: r.job_site_name,
            city: clean(r.city_name),
            county: clean(r.county_name),
            noticeDate: isoDate(r.notice_date),
            effectiveDate: isoDate(r.layoff_date),
            employees: toInt(r.total_layoff_number),
          })
        )
        .filter((n): n is Notice => n !== null);
    },
  },
  {
    code: "OR",
    agency: "Oregon Higher Education Coordinating Commission",
    pageUrl: "https://data.oregon.gov/d/ijbz-jpx8",
    datasetUrl: "https://data.oregon.gov/resource/ijbz-jpx8.json",
    async fetch() {
      const rows = await fetchJson<Record<string, string>[]>(
        `${this.datasetUrl}?$limit=50000&$order=received_date DESC`
      );
      return rows
        .map((r) =>
          mkNotice("OR", this.pageUrl, {
            employer: r.company_name,
            city: clean(r.city),
            noticeDate: isoDate(r.received_date),
            effectiveDate: isoDate(r.layoff_date),
            employees: toInt(r.laid_off),
            layoffType: clean(r.layoff_type),
          })
        )
        .filter((n): n is Notice => n !== null);
    },
  },
  {
    // California EDD publishes a "Daily WARN Report" as an Excel workbook (updated
    // Tue/Thu). It's a rolling recent window — the freshest CA notices — not the
    // full year (that lives only in annual PDFs, handled by the Python path).
    code: "CA",
    agency: "California Employment Development Department",
    pageUrl: "https://edd.ca.gov/en/jobs_and_training/Layoff_Services_WARN/",
    datasetUrl: "https://edd.ca.gov/siteassets/files/jobs_and_training/warn/warn_report1.xlsx",
    async fetch() {
      const buf = await fetchBuffer(this.datasetUrl);
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheetName =
        wb.SheetNames.find((n) => flatHeader(n).includes("detailed warn")) ??
        wb.SheetNames[wb.SheetNames.length - 1];
      const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: "",
      });

      // Find the header row (has a "county" and a "company" column), then map by name.
      const headerIdx = grid.findIndex(
        (row) =>
          Array.isArray(row) &&
          row.some((c) => flatHeader(c).includes("county")) &&
          row.some((c) => flatHeader(c) === "company")
      );
      if (headerIdx < 0) throw new Error("CA: header row not found");
      const header = grid[headerIdx].map(flatHeader);
      const find = (pred: (h: string) => boolean) => header.findIndex(pred);
      const iCounty = find((h) => h.includes("county"));
      const iNotice = find((h) => h.includes("notice") && h.includes("date"));
      const iEff = find((h) => h.includes("effective"));
      const iCompany = find((h) => h === "company");
      const iType = find((h) => h.includes("layoff") && h.includes("closure"));
      const iEmp = find((h) => h.includes("employee"));
      const iAddr = find((h) => h.includes("address"));

      const out: Notice[] = [];
      for (let r = headerIdx + 1; r < grid.length; r++) {
        const row = grid[r];
        if (!Array.isArray(row)) continue;
        const at = (i: number) => (i >= 0 && i < row.length ? row[i] : "");
        const employer = String(at(iCompany) || "").trim();
        if (!employer) continue; // skips blank/summary rows
        const n = mkNotice("CA", this.pageUrl, {
          employer,
          city: cityFromCaAddress(at(iAddr)),
          county: clean(String(at(iCounty)).replace(/\s+county$/i, "")),
          noticeDate: usDate(at(iNotice)),
          effectiveDate: usDate(at(iEff)),
          employees: toInt(at(iEmp)), // cells render as "$103" — toInt strips it
          layoffType: clean(at(iType)),
        });
        if (n) out.push(n);
      }
      return out;
    },
  },
];

interface StateMeta {
  agency: string;
  pageUrl: string;
  datasetUrl: string;
}

async function main() {
  const stateMeta = new Map<string, StateMeta>();
  const all: Notice[] = [];

  // 1) Live, structured adapters (TX/OR Socrata JSON, CA Excel).
  for (const a of ADAPTERS) {
    try {
      const notices = await a.fetch();
      if (notices.length === 0) throw new Error("0 rows");
      all.push(...notices);
      stateMeta.set(a.code, { agency: a.agency, pageUrl: a.pageUrl, datasetUrl: a.datasetUrl });
      const employeesTotal = notices.reduce((s, n) => s + n.employees, 0);
      console.log(`[build-warn] ${a.code}: ${notices.length} notices, ${employeesTotal.toLocaleString()} employees`);
    } catch (err: any) {
      // One dead state must not sink the run — skip it, keep the others.
      console.warn(`[build-warn] ${a.code} skipped: ${err?.message || err}`);
    }
  }

  // 2) Wide-net cache from biglocalnews/warn-scraper (committed JSON). Best-effort:
  //    a missing/broken cache leaves the live adapters untouched.
  try {
    if (existsSync(SCRAPED_CACHE)) {
      const raw = JSON.parse(await readFile(SCRAPED_CACHE, "utf8"));
      let n = 0;
      for (const r of raw.notices ?? []) {
        const code = String(r.state || "").toUpperCase();
        const notice = mkNotice(code, r.sourceUrl || DOL_WARN, {
          employer: r.employer,
          city: r.city ?? null,
          county: r.county ?? null,
          noticeDate: r.noticeDate ?? null,
          effectiveDate: r.effectiveDate ?? null,
          employees: r.employees ?? 0,
          layoffType: r.layoffType ?? null,
        });
        if (notice) { all.push(notice); n++; }
      }
      for (const s of raw.states ?? []) {
        // Live adapters win on metadata; only fill states they didn't cover.
        if (!stateMeta.has(s.code)) {
          stateMeta.set(s.code, {
            agency: "State WARN portal (via warn-scraper)",
            pageUrl: s.portal || DOL_WARN,
            datasetUrl: s.portal || DOL_WARN,
          });
        }
      }
      console.log(`[build-warn] scraped cache: ${n} notices across ${(raw.states ?? []).length} states`);
    }
  } catch (err: any) {
    console.warn(`[build-warn] scraped cache skipped: ${err?.message || err}`);
  }

  if (all.length === 0) throw new Error("no notices from any state");

  // Dedupe within a state (employer + notice date + size). Different states can
  // legitimately share an employer+date, so state is part of the key.
  const seen = new Set<string>();
  const notices = all.filter((n) => {
    const key = `${n.state}|${n.normalized}|${n.noticeDate ?? ""}|${n.employees}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Sort by notice date, falling back to effective date for states that don't
  // publish a received date (so they still interleave correctly, not sink to the end).
  const sortKey = (n: Notice) => n.noticeDate ?? n.effectiveDate ?? "";
  notices.sort((a, b) => sortKey(b).localeCompare(sortKey(a)));

  // Cross-aggregate by employer (the seam for the WARN × H-1B join at read time).
  const byNorm = new Map<
    string,
    { normalized: string; name: string; slug: string; notices: number; employees: number; states: Set<string>; latestNotice: string | null }
  >();
  for (const n of notices) {
    if (!n.normalized) continue;
    const e = byNorm.get(n.normalized) ?? {
      normalized: n.normalized,
      name: n.employer, // notices are date-desc, so first seen = most recent label
      slug: slugify(n.employer),
      notices: 0,
      employees: 0,
      states: new Set<string>(),
      latestNotice: null,
    };
    e.notices += 1;
    e.employees += n.employees;
    e.states.add(n.state);
    if (n.noticeDate && (!e.latestNotice || n.noticeDate > e.latestNotice)) e.latestNotice = n.noticeDate;
    byNorm.set(n.normalized, e);
  }
  const byEmployer = [...byNorm.values()]
    .map((e) => ({ ...e, states: [...e.states].sort() }))
    .sort((a, b) => b.employees - a.employees);

  // Per-state summaries from the FINAL deduped notices, so live + wide-net states
  // are reported consistently.
  const summaryByState = new Map<
    string,
    { noticeCount: number; employeesTotal: number; latestNotice: string | null }
  >();
  for (const n of notices) {
    const s = summaryByState.get(n.state) ?? { noticeCount: 0, employeesTotal: 0, latestNotice: null };
    s.noticeCount += 1;
    s.employeesTotal += n.employees;
    if (n.noticeDate && (!s.latestNotice || n.noticeDate > s.latestNotice)) s.latestNotice = n.noticeDate;
    summaryByState.set(n.state, s);
  }
  const stateSummaries = [...summaryByState.entries()]
    .map(([code, s]) => {
      const m = stateMeta.get(code) ?? { agency: "State WARN portal", pageUrl: DOL_WARN, datasetUrl: DOL_WARN };
      return { code, agency: m.agency, pageUrl: m.pageUrl, datasetUrl: m.datasetUrl, ...s };
    })
    .sort((a, b) => b.employeesTotal - a.employeesTotal);

  const dates = notices.map((n) => n.noticeDate).filter((d): d is string => !!d).sort();
  const employeesTotal = notices.reduce((s, n) => s + n.employees, 0);

  const payload = {
    generatedAt: new Date().toISOString(),
    coverageNote:
      "Real WARN notices aggregated from state feeds — structured open-data portals (TX, OR, CA) plus states parsed via biglocalnews/warn-scraper. Not every state has a WARN act or a public feed; this is a growing subset, not a national total.",
    states: stateSummaries,
    stateCount: stateSummaries.length,
    noticeCount: notices.length,
    employeesTotal,
    employerCount: byEmployer.length,
    minNoticeDate: dates.length ? dates[0] : null,
    maxNoticeDate: dates.length ? dates[dates.length - 1] : null,
    byEmployer,
    notices,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  // Public API artifacts: a documented JSON envelope + a flat CSV of every notice.
  const publicPayload = {
    ...payload,
    endpoint: "https://immigrationclock.com/api/warn.json",
    csv: "https://immigrationclock.com/api/warn.csv",
    docs: "https://immigrationclock.com/developers",
    license:
      "Underlying notices are public records from state government WARN portals. Free to use; attribution to ImmigrationClock (immigrationclock.com) appreciated.",
  };
  const csvCols = [
    "employer", "normalized", "city", "county", "state",
    "noticeDate", "effectiveDate", "employees", "layoffType", "sourceUrl",
  ] as const;
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    csvCols.join(","),
    ...notices.map((n) => csvCols.map((c) => esc((n as unknown as Record<string, unknown>)[c])).join(",")),
  ].join("\n");

  await mkdir(dirname(PUBLIC_JSON), { recursive: true });
  await writeFile(PUBLIC_JSON, JSON.stringify(publicPayload) + "\n", "utf8");
  await writeFile(PUBLIC_CSV, csv + "\n", "utf8");

  console.log(
    `[build-warn] wrote ${notices.length} notices across ${stateSummaries.length} states ` +
      `(${byEmployer.length} employers, ${employeesTotal.toLocaleString()} employees) ` +
      `+ public /api/warn.json + /api/warn.csv`
  );
}

main().catch((err) => {
  console.error(`[build-warn] FAILED (keeping committed warn.json): ${err?.message || err}`);
  process.exit(0); // best-effort: never break the build; keep last-good feed
});
