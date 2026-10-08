#!/usr/bin/env node
/**
 * Plan the wide-net WARN scrape: turn the workflow's `states` input into the
 * CI matrix that .github/workflows/refresh-warn.yml fans out over.
 *
 *   node scripts/warn-scrape-plan.mjs [--batches N] "<states | default | all>"
 *
 * Prints {states, unknown, batches} as JSON. When GITHUB_OUTPUT is set it also
 * appends `batches` (compact JSON for `fromJSON`), `states` and `unknown` as
 * step outputs, and emits a ::warning:: for every code the scraper package does
 * not support — those used to crash the whole scrape rather than be skipped.
 */
import { appendFileSync } from "node:fs";
import { planBatches, resolveStates } from "./warn-states.mjs";

const argv = process.argv.slice(2);
let batchCount = 5;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--batches") batchCount = Number(argv[++i]);
  else positional.push(argv[i]);
}

const { states, unknown } = resolveStates(positional.join(" "));
const batches = planBatches(states, batchCount);

if (unknown.length) {
  console.log(`::warning::warn-scraper has no parser for: ${unknown.join(", ")} — skipped`);
}
if (states.length === 0) {
  console.log("::error::no supported states to scrape");
  process.exit(1);
}

const plan = { states, unknown, batches };
console.log(JSON.stringify(plan, null, 2));

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `batches=${JSON.stringify(batches)}\n` + `states=${states.join(" ")}\n` + `unknown=${unknown.join(" ")}\n`
  );
}
