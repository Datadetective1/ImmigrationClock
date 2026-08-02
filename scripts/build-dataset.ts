#!/usr/bin/env tsx
/**
 * ImmigrationClock — build-time dataset snapshot.
 *
 * Runs during `prebuild` (and manually via `npm run build:data`). It executes
 * the curated + modeled data source in src/lib/source-data.ts and serializes the
 * fully-computed dataset to src/lib/generated/dataset.json — the ONLY data the
 * frontend reads at runtime (via src/lib/dataset.ts).
 *
 * This unifies the data layers: there is no hand-imported runtime data module;
 * the pipeline produces the snapshot and the app consumes it. The output is
 * deterministic (the modeled granularity uses seeded math, no randomness), so
 * the file only changes when the underlying figures change.
 *
 * Unlike the near-live refresh (which may soft-fail and keep the last good
 * value), this MUST succeed — the app cannot render without the snapshot.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "../src/lib/source-data";

const OUT = fileURLToPath(new URL("../src/lib/generated/dataset.json", import.meta.url));

async function main() {
  const dataset = {
    _meta: {
      note: "Build-time snapshot emitted by scripts/build-dataset.ts from src/lib/source-data.ts. The frontend reads this file via src/lib/dataset.ts; it is regenerated on every build. Deterministic — only changes when the source figures change.",
    },
    // Time-frame constants
    FISCAL_YEARS: S.FISCAL_YEARS,
    CURRENT_FY: S.CURRENT_FY,
    FY2026_ELAPSED: S.FY2026_ELAPSED,
    FY_COMPLETENESS: S.FY_COMPLETENESS,
    LATEST_COMPLETE_FY: S.LATEST_COMPLETE_FY,
    EMPLOYER_LATEST_FY: S.EMPLOYER_LATEST_FY,
    DATAHUB_LATEST_FY: S.DATAHUB_LATEST_FY,
    LATEST_REPORTED_FY: S.LATEST_REPORTED_FY,
    DATA_VINTAGE: S.DATA_VINTAGE,
    UPDATED: S.UPDATED,
    // Dimensions
    states: S.states,
    stateWeight: S.stateWeight,
    countries: S.countries,
    countrySeedByName: S.countrySeedByName,
    countrySeedBySlug: S.countrySeedBySlug,
    companies: S.companies,
    companyBySlug: S.companyBySlug,
    // Enforcement
    iceRows: S.iceRows,
    iceByFy: S.iceByFy,
    iceByState: S.iceByState,
    iceByCountry: S.iceByCountry,
    DETENTION_NOW: S.DETENTION_NOW,
    // Border
    cbpRows: S.cbpRows,
    cbpMonthly: S.cbpMonthly,
    cbpByCountry: S.cbpByCountry,
    CBP_LIVE: S.CBP_LIVE,
    // Visas
    visaRows: S.visaRows,
    visaByCountry: S.visaByCountry,
    H1B_NATIONAL: S.H1B_NATIONAL,
    // Wages
    wageRows: S.wageRows,
    wageByState: S.wageByState,
    // Layoffs are NOT part of this snapshot. They live in warn.json /
    // warn-summary.json, built by scripts/build-warn.ts from real state filings.
    // Nothing modeled may re-enter through here — see docs/data-corrections.md.
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(dataset, null, 2) + "\n", "utf8");

  console.log(`[build-dataset] wrote ${OUT}`);
  console.log(
    `[build-dataset] companies=${S.companies.length} states=${S.states.length} ` +
      `countries=${S.countries.length} cbpRows=${S.cbpRows.length} ` +
      `visaRows=${S.visaRows.length} (layoffs: see build-warn.ts)`
  );
}

main().catch((err) => {
  console.error(`[build-dataset] FAILED: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
