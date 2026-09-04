// =============================================================================
// scripts/measure-benchmarks.ts — the detailed benchmark report
//
//   npm run intelligence:benchmarks
//
// The scoring lives in lib/intelligence/benchmarks.ts, shared with the
// scorecard, so the two can never disagree. This script is the long form: every
// dimension, development and holdout separately, with the false positives and
// false negatives named rather than counted.
// =============================================================================

import { EVENTS } from "../src/lib/event-store";
import { measureAll, type Score } from "../src/lib/intelligence/benchmarks";
import type { ImmigrationEvent } from "../src/domains/graph/events";

const pct = (x: number | null) => (x === null ? "NOT MEASURED" : `${(x * 100).toFixed(0)}%`);
const f1 = (x: number | null) => (x === null ? " n/a" : x.toFixed(2));

function line(name: string, s: Score) {
  console.log(
    `  ${name.padEnd(12)} precision ${pct(s.precision).padEnd(13)} recall ${pct(s.recall).padEnd(13)} F1 ${f1(
      s.f1
    )}   n ${String(s.n).padStart(3)}  (tp ${s.tp} fp ${s.fp} fn ${s.fn})`
  );
}

function main() {
  const rule = "─".repeat(78);
  console.log("MEASURED AGAINST HAND-LABELLED GROUND TRUTH IN fixtures/");
  console.log("Prediction = what the API returns by default: strong classifications only.");

  for (const d of measureAll(EVENTS as unknown as ImmigrationEvent[])) {
    console.log(`\n${rule}`);
    console.log(`${d.dimension}`);
    console.log(rule);
    console.log(`  ${d.note}`);
    if (!d.independentlyReviewed) {
      console.log(`  ⚠ NOT independently reviewed — one annotator per label.`);
    }
    if (d.contested > 0) {
      console.log(`  ${d.contested} contested label(s) excluded rather than resolved by rule.`);
    }
    line("development", d.dev);
    line("HOLDOUT", d.holdout);
    line("combined", d.combined);
    if (d.combined.falsePositives.length) {
      console.log(`  FALSE POSITIVES (${d.combined.falsePositives.length}):`);
      for (const x of d.combined.falsePositives.slice(0, 10)) console.log(`    ${x}`);
    }
    if (d.combined.falseNegatives.length) {
      console.log(`  FALSE NEGATIVES (${d.combined.falseNegatives.length}):`);
      for (const x of d.combined.falseNegatives.slice(0, 10)) console.log(`    ${x}`);
    }
  }
  console.log("");
}

main();
