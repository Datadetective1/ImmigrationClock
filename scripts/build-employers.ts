#!/usr/bin/env tsx
/**
 * ImmigrationClock — bulk USCIS H-1B employer ingestion (the "Carfax" coverage).
 *
 * Fetches the latest USCIS H-1B Employer Data Hub export (a single ~600KB CSV of
 * ~28k employers), aggregates approvals/denials per employer, and writes the
 * employers above a volume threshold to src/lib/generated/employers.json. This
 * turns the site from a 10-employer sample into a real, searchable directory of
 * thousands of sponsoring employers — every figure a reported USCIS number.
 *
 * Runs in prebuild. On any failure it leaves the committed employers.json in
 * place (never overwrites with partial/empty data).
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { slugify } from "../src/lib/format";

const OUT = fileURLToPath(new URL("../src/lib/generated/employers.json", import.meta.url));
const ARCHIVE = "https://www.uscis.gov/archive/h-1b-employer-data-hub-files";
const HOST = "https://www.uscis.gov";
const MIN_APPROVALS = 10; // keep the directory performant; covers the serious sponsors
const UA = { "User-Agent": "ImmigrationClock/1.0" };

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
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

async function fetchText(url: string, timeout = 30000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: UA });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const page = await fetchText(ARCHIVE, 15000);
  const links = [...page.matchAll(/\/sites\/default\/files\/document\/data\/h1b_datahubexport-(\d{4})\.csv/gi)]
    .map((m) => ({ url: m[0], year: Number(m[1]) }))
    .sort((a, b) => b.year - a.year);
  if (links.length === 0) throw new Error("no datahub export links found");
  const latest = links[0];

  const csv = await fetchText(HOST + latest.url, 45000);
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("empty CSV");
  const H = parseCsvLine(lines[0]).map((h) => h.trim().replace(/^"|"$/g, ""));
  const col = (name: string) => H.indexOf(name);
  const eI = col("Employer");
  const iaI = col("Initial Approval");
  const idI = col("Initial Denial");
  const caI = col("Continuing Approval");
  const cdI = col("Continuing Denial");
  const stI = col("State");
  if ([eI, iaI, idI, caI, cdI].some((i) => i < 0)) throw new Error("unexpected CSV columns");

  const num = (s: string) => parseInt(s || "0", 10) || 0;
  const agg = new Map<string, { name: string; appr: number; den: number; st: Map<string, number> }>();
  for (let i = 1; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    if (r.length < H.length) continue;
    const name = (r[eI] || "").trim();
    if (!name) continue;
    const appr = num(r[iaI]) + num(r[caI]);
    const den = num(r[idI]) + num(r[cdI]);
    const e = agg.get(name) ?? { name, appr: 0, den: 0, st: new Map() };
    e.appr += appr;
    e.den += den;
    const st = (r[stI] || "").trim();
    if (st) e.st.set(st, (e.st.get(st) ?? 0) + appr);
    agg.set(name, e);
  }

  const slugs = new Set<string>();
  const employers = [...agg.values()]
    .filter((e) => e.appr >= MIN_APPROVALS)
    .sort((a, b) => b.appr - a.appr)
    .map((e) => {
      let slug = slugify(e.name);
      if (slugs.has(slug)) {
        let n = 2;
        while (slugs.has(`${slug}-${n}`)) n++;
        slug = `${slug}-${n}`;
      }
      slugs.add(slug);
      const topState = [...e.st.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      const total = e.appr + e.den;
      return {
        slug,
        name: e.name,
        approvals: e.appr,
        denials: e.den,
        approvalRate: total ? Math.round((e.appr / total) * 1000) / 1000 : 1,
        topState,
      };
    });

  const payload = {
    generatedAt: new Date().toISOString(),
    fiscalYear: latest.year,
    sourceName: "USCIS H-1B Employer Data Hub",
    sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
    datasetUrl: HOST + latest.url,
    minApprovals: MIN_APPROVALS,
    count: employers.length,
    employers,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`[build-employers] FY${latest.year}: wrote ${employers.length} employers (>=${MIN_APPROVALS} approvals) from ${agg.size} total`);
}

main().catch((err) => {
  console.error(`[build-employers] FAILED (keeping committed employers.json): ${err?.message || err}`);
  process.exit(0); // best-effort: never break the build; keep last-good directory
});
