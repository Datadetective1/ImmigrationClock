// =============================================================================
// scripts/social-examples.ts — run the example posts through the real gates
//
//   npm run social:examples
//
// Reads fixtures/social-examples-v9.json, builds today's candidate for each
// entry from the committed archive, substitutes the candidate's tracked deep
// link for {deepLink}, and runs each post through the validator, the opening
// and shape checks, and the wording-similarity check against the committed
// ledger. Prints the posts and the verdicts. Writes nothing, publishes nothing,
// calls no model.
//
// This is how the examples in docs/social.md were verified. It is also a
// quick way to see what the v9 voice is asked to sound like.
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EVENT_INDEX } from "../src/lib/event-index";
import { candidatesFor } from "../src/lib/social/select";
import { chicagoParts } from "../src/lib/social/slots";
import { validatePost, xWeightedLength } from "../src/lib/social/validate";
import { checkOpeningVariety, checkWording, openingConstruction } from "../src/lib/social/dedupe";
import { EMPTY_POST_LEDGER, parsePostLedger } from "../src/lib/social/ledger";
import { isContentType, isStructure } from "../src/lib/social/content-types";
import type { PostLedger } from "../src/lib/social/ledger";

interface Example {
  structure: string;
  headline: string;
  x: string;
  linkedin: string;
}

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

function main() {
  const path = resolve(arg("file", "fixtures/social-examples-v9.json") as string);
  const today = arg("date") ?? chicagoParts(new Date()).date;
  const file = JSON.parse(readFileSync(path, "utf8")) as { entries: Record<string, Example> };

  let ledger: PostLedger = EMPTY_POST_LEDGER;
  const ledgerPath = arg("ledger", "src/lib/generated/social-posted.json") as string;
  try {
    ledger = parsePostLedger(readFileSync(resolve(ledgerPath), "utf8")) ?? EMPTY_POST_LEDGER;
  } catch {
    ledger = EMPTY_POST_LEDGER;
  }

  const candidates = candidatesFor(EVENT_INDEX, today);
  let failures = 0;
  const openings: string[] = [];

  for (const [key, ex] of Object.entries(file.entries)) {
    const [subjectId, contentType] = key.split("::");
    const rule = "─".repeat(78);
    console.log(`\n${rule}\n${key}\n${rule}`);

    if (!isContentType(contentType)) {
      console.log(`✗ unknown content type ${contentType}`);
      failures++;
      continue;
    }
    const candidate = candidates.find((c) => c.subjectId === subjectId && c.contentType === contentType);
    if (!candidate) {
      console.log(`— not a candidate on ${today} (aged out, or its type no longer applies); skipped`);
      continue;
    }
    if (!isStructure(ex.structure) || !candidate.structures.includes(ex.structure)) {
      console.log(`✗ shape "${ex.structure}" is not offered for this type (${candidate.structures.join(", ")})`);
      failures++;
    }

    const x = ex.x.replace("{deepLink}", candidate.facts.deepLink);
    const linkedin = ex.linkedin.replace("{deepLink}", candidate.facts.deepLink);

    console.log(`shape: ${ex.structure} · headline: ${ex.headline}`);
    console.log(`\n${x.split("\n").map((l) => `  │ ${l}`).join("\n")}`);
    console.log(`  └ ${xWeightedLength(x)} chars as X counts them (${x.length} literal)`);

    for (const [platform, text] of [["x", x], ["linkedin", linkedin]] as const) {
      const v = validatePost(text, platform, candidate.facts);
      const o = checkOpeningVariety(ledger, text, platform);
      const w = checkWording(ledger, text, platform);
      const ok = v.ok && o.ok && w.ok;
      if (!ok) failures++;
      console.log(
        `  ${platform.padEnd(9)} ${ok ? "PASS" : "FAIL"} — validator ${v.ok ? "ok" : v.failures.join("; ")}` +
          `${o.ok ? "" : ` · ${o.reason}`}${w.ok ? ` · wording distinct (max ${w.maxSimilarity.toFixed(2)})` : ` · ${w.reason}`}`
      );
    }
    openings.push(openingConstruction(x));
  }

  console.log(`\nDistinct opening constructions: ${new Set(openings.filter(Boolean)).size} of ${openings.length}`);
  console.log(failures ? `\n${failures} check(s) failed.` : "\nEvery example passes every gate.");
  if (failures) process.exitCode = 1;
}

main();
