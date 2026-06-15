#!/usr/bin/env node
/**
 * One-time (re-runnable) backfill of real historical CBP data.
 *
 * CBP keeps a published CSV for every monthly release, linked from the landing
 * page. This script fetches the in-progress-FY monthly files and records the
 * cumulative nationwide year-to-date total at each reporting month, producing a
 * real month-by-month series in src/lib/generated/history.json.
 *
 * The scheduled refresh (scripts/refresh-data.mjs) then APPENDS each new month
 * to this file going forward — so the archive only grows. Safe to re-run: it
 * upserts by reporting period and never loses earlier points.
 */
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../src/lib/generated/history.json", import.meta.url));
const CBP_HOST = "https://www.cbp.gov";
const CBP_LANDING = "https://www.cbp.gov/document/stats/nationwide-encounters";
const MONTH_NAMES = {
  JAN: "January", FEB: "February", MAR: "March", APR: "April", MAY: "May", JUN: "June",
  JUL: "July", AUG: "August", SEP: "September", OCT: "October", NOV: "November", DEC: "December",
};
const MONTH_ORDER = { OCT: 1, NOV: 2, DEC: 3, JAN: 4, FEB: 5, MAR: 6, APR: 7, MAY: 8, JUN: 9, JUL: 10, AUG: 11, SEP: 12 };

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function fetchText(url, timeout = 30000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "ImmigrationClock/1.0" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Sum the in-progress-FY ("(FYTD)") nationwide total from one monthly CSV. */
function parseCurrentFyYtd(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const H = parseCsvLine(lines[0]).map((h) => h.trim());
  const fyI = H.indexOf("Fiscal Year");
  const cntI = H.indexOf("Encounter Count");
  if (fyI < 0 || cntI < 0) throw new Error("unexpected columns");
  let currentFy = null;
  let total = 0;
  for (let i = 1; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    if (r.length < H.length) continue;
    const raw = (r[fyI] || "").trim();
    if (!/FYTD/i.test(raw)) continue; // only the in-progress FY rows
    currentFy = parseInt(raw, 10);
    total += parseInt((r[cntI] || "0").replace(/[^0-9-]/g, ""), 10) || 0;
  }
  if (!currentFy) throw new Error("no (FYTD) rows");
  return { currentFy, total };
}

async function main() {
  console.log("[backfill] fetching CBP landing page…");
  const page = await fetchText(CBP_LANDING);
  // All monthly "...-MON-aor.csv" links that include the in-progress FY (fy..26).
  const links = [
    ...new Set(
      [...page.matchAll(/\/sites\/default\/files\/[^"']*nationwide-encounters-fy\d{2}-fy26-([a-z]{3})-aor\.csv/gi)].map(
        (m) => m[0]
      )
    ),
  ];
  console.log(`[backfill] found ${links.length} in-progress-FY monthly files`);

  const series = [];
  for (const rel of links) {
    const monthM = rel.match(/-([a-z]{3})-aor\.csv$/i);
    const month = monthM ? monthM[1].toUpperCase() : null;
    const folderM = rel.match(/files\/(\d{4}-\d{2})\//);
    try {
      const csv = await fetchText(CBP_HOST + rel);
      const { currentFy, total } = parseCurrentFyYtd(csv);
      const calYear = ["OCT", "NOV", "DEC"].includes(month) ? currentFy - 1 : currentFy;
      series.push({
        period: month ? `${MONTH_NAMES[month]} ${calYear}` : `FY${currentFy}`,
        month,
        order: MONTH_ORDER[month] ?? 99,
        fy: currentFy,
        cbpNationwideYtd: total,
        publishedFolder: folderM ? folderM[1] : null,
        backfilled: true,
      });
      console.log(`[backfill]   ${month} FY${currentFy}: ${total.toLocaleString()}`);
    } catch (e) {
      console.warn(`[backfill]   skip ${rel} (${e.message})`);
    }
  }

  series.sort((a, b) => a.fy - b.fy || a.order - b.order);

  // Merge with any existing history (don't clobber later appends).
  let existing = { cbpNationwideYtd: [] };
  try {
    existing = JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    /* none yet */
  }
  const byPeriod = new Map((existing.cbpNationwideYtd ?? []).map((s) => [s.period, s]));
  for (const s of series) byPeriod.set(s.period, { ...byPeriod.get(s.period), ...s });
  const merged = [...byPeriod.values()].sort((a, b) => a.fy - b.fy || (a.order ?? 99) - (b.order ?? 99));

  const payload = {
    note:
      "Real historical archive. cbpNationwideYtd is the cumulative nationwide encounters year-to-date at each CBP monthly release (summed from CBP's published CSVs). Appended on each scheduled refresh.",
    lastUpdated: new Date().toISOString(),
    cbpNationwideYtd: merged,
  };
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[backfill] wrote ${merged.length} points to ${OUT}`);
}

main().catch((err) => {
  console.error(`[backfill] FAILED: ${err.stack || err.message}`);
  process.exit(1);
});
