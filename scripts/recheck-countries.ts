// =============================================================================
// scripts/recheck-countries.ts — hold every stored country to its own quote
//
//   npm run intelligence:recheck-countries              (dry run)
//   npm run intelligence:recheck-countries -- --write
//
// WHY THIS EXISTS
// ---------------
// A country classification is a `stated` claim, which in this codebase means
// the document says it and the evidence quote shows where. That invariant was
// never actually TESTED against the quote: the extractor found the country in
// the document, stored a nearby sentence as evidence, and nothing afterwards
// asked whether the sentence it stored contains the country at all.
//
// Hand-labelling all 38 committed (record, country) pairs found one case where
// it does not, and it is the worst kind. A rule terminating Temporary
// Protected Status for SOUTH SUDAN was classified as both south-sudan and
// sudan, because "Sudan" sits inside "South Sudan" behind a space and in front
// of a word boundary. Sudan holds its own separate TPS designation, so that
// one character range would send a subscriber monitoring Sudan a rule about a
// different country.
//
// countries.ts now refuses a shorter name inside a longer one at extraction
// time. This applies the same rule to the 544 records already committed, which
// cannot be re-extracted without re-fetching every source document.
//
// WHAT IT WILL NOT DO
// -------------------
// It never adds a classification. A quote is evidence for what it contains,
// and re-reading a stored quote can only ever remove a claim the quote does
// not support.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { findCountriesInText } from "../src/domains/graph/countries";

const PATH = resolve("src/lib/generated/events.json");
const WRITE = process.argv.includes("--write");

interface Impacted {
  entityId: string;
  basis: string;
  evidence?: string;
  method?: string;
  confidence: number;
}

interface Rec {
  id: string;
  title: string;
  impact?: { countries?: Impacted[]; [k: string]: unknown };
  [k: string]: unknown;
}

function main() {
  const file = JSON.parse(readFileSync(PATH, "utf8")) as { events: Rec[]; [k: string]: unknown };

  let checked = 0;
  let dropped = 0;
  const removals: string[] = [];

  for (const e of file.events) {
    const countries = e.impact?.countries;
    if (!countries?.length) continue;

    const kept: Impacted[] = [];
    for (const entry of countries) {
      checked++;
      const evidence = entry.evidence ?? "";
      // No quote at all is a separate defect and is left for validation to
      // report rather than silently repaired here.
      if (!evidence.trim()) {
        kept.push(entry);
        continue;
      }
      const supported = findCountriesInText(evidence).some((m) => m.entityId === entry.entityId);
      if (supported) {
        kept.push(entry);
      } else {
        dropped++;
        removals.push(
          `${entry.entityId} from "${e.title.slice(0, 58)}"\n      quote: ${evidence.slice(0, 120)}`
        );
      }
    }

    if (kept.length !== countries.length) {
      e.impact!.countries = kept;
    }
  }

  console.log("RECHECK COUNTRIES");
  console.log(`  pairs checked                ${checked}`);
  console.log(`  dropped as unsupported       ${dropped}`);
  for (const r of removals) console.log(`    ${r}`);

  if (WRITE) {
    writeFileSync(PATH, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`\nWROTE ${PATH}`);
  } else {
    console.log("\nDRY RUN — nothing written. Pass --write to apply.");
  }
}

main();
