// =============================================================================
// data/visa-bulletin-history/*.csv  ->  src/lib/visa-bulletin/history.generated.json
//
// Turns the final action charts read from past official bulletins into the
// series the priority date forecast measures pace from. Run after adding or
// correcting a month:
//
//   npx tsx scripts/build-bulletin-history.ts
//
// It refuses rather than guesses: a cell that is not "C", "U", "NA" or a
// DDMMMYY date stops the build with the file and row named. "NA" (a row the
// bulletin did not print that month) and "??" (two reads disagreed) are
// skipped, so the forecast simply has one point fewer there.
// =============================================================================

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "data", "visa-bulletin-history");
const OUT = join(process.cwd(), "src", "lib", "visa-bulletin", "history.generated.json");

const COUNTRIES = ["all", "china", "india", "mexico", "philippines"] as const;
const FAMILY = ["F1", "F2A", "F2B", "F3", "F4"];
const EMPLOYMENT = ["EB1", "EB2", "EB3", "EW", "EB4", "SR", "EB5U", "EB5R", "EB5H", "EB5I"];
const MON: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/** "08NOV16" -> "2016-11-08". Two-digit years below 70 are 20xx. */
export function parseCell(raw: string): string | null | undefined {
  const v = raw.trim().toUpperCase();
  if (v === "C" || v === "U") return v;
  if (v === "NA" || v === "??" || v === "") return null;
  const m = /^(\d{2})([A-Z]{3})(\d{2})$/.exec(v);
  if (!m || !MON[m[2]]) return undefined;
  const yy = Number(m[3]);
  const year = yy < 70 ? 2000 + yy : 1900 + yy;
  const day = Number(m[1]);
  if (day < 1 || day > 31) return undefined;
  return `${year}-${MON[m[2]]}-${m[1]}`;
}

export function parseMonthFile(id: string, text: string) {
  const out = { id, sourceUrl: "", family: {} as Record<string, Record<string, string>>, employment: {} as Record<string, Record<string, string>> };
  let section: "family" | "employment" | null = null;
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(",").map((c) => c.trim());
    if (!cells[0]) continue;
    if (cells[0] === "source") {
      out.sourceUrl = cells.slice(1).join(",");
      continue;
    }
    if (cells[0] === "section") {
      section = cells[1] === "family" ? "family" : cells[1] === "employment" ? "employment" : null;
      continue;
    }
    const row = cells[0];
    const allowed = section === "family" ? FAMILY : section === "employment" ? EMPLOYMENT : [];
    if (!section || !allowed.includes(row)) throw new Error(`${id}: unexpected row "${row}"`);
    if (cells.length !== 6) throw new Error(`${id} ${row}: expected 5 cells, got ${cells.length - 1}`);
    const table: Record<string, string> = {};
    COUNTRIES.forEach((country, i) => {
      const parsed = parseCell(cells[i + 1]);
      if (parsed === undefined) throw new Error(`${id} ${row} ${country}: cannot read "${cells[i + 1]}"`);
      if (parsed !== null) table[country] = parsed;
    });
    out[section][row] = table;
  }
  if (!/^https:\/\/travel\.state\.gov\//.test(out.sourceUrl)) throw new Error(`${id}: source is not travel.state.gov`);
  for (const r of FAMILY) if (!out.family[r]) throw new Error(`${id}: missing ${r}`);
  for (const r of EMPLOYMENT) if (!out.employment[r]) throw new Error(`${id}: missing ${r}`);
  return out;
}

function main() {
  const files = readdirSync(DIR).filter((f) => /^\d{4}-\d{2}\.csv$/.test(f)).sort();
  const months = files.map((f) => parseMonthFile(f.replace(".csv", ""), readFileSync(join(DIR, f), "utf8")));
  writeFileSync(OUT, JSON.stringify(months, null, 1) + "\n");
  console.log(`[bulletin-history] ${months.length} months, ${months[0]?.id} to ${months[months.length - 1]?.id}`);
}

if (process.argv[1]?.endsWith("build-bulletin-history.ts")) main();
