// =============================================================================
// scripts/reextract-actions.ts — the "may be required" quote, from the
// corrected extractor
//
//   npm run intelligence:reextract-actions              (dry run)
//   npm run intelligence:reextract-actions -- --write
//
// WHY
// ---
// The "what the document says may be required" quote was the first sentence
// with a requirement phrase ("must be", "are required to"…) that was not
// comment boilerplate. The boilerplate filter missed common comment-deadline
// wording ("Written comments and related materials must be submitted on or
// before November 13, 2026"), and a requirement phrase alone also matched
// duties on the agency ("DHS is required to adjust the fee") and rhetoric
// ("More can and must be done"). Under that heading those read as obligations
// on immigrants.
//
// The extractor now also requires the obligation to fall on someone the
// document covers (extract-impact.ts, isCoveredPartyRequirement). Ingestion
// re-reads recent records on every build, so the archive must hold what the
// extractor would produce: this applies it over the same text ingestion read
// (title, abstract, retained body).
//
// WHAT IT WILL NOT DO
// -------------------
// Add a quote where there was none. A record whose old quote failed and whose
// text holds no covered-party requirement simply loses the section, which is
// the safe direction: no quote means nothing is shown.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { actionRequiredFor } from "../src/domains/graph/extract-impact";
import { sourceTextFor } from "../src/lib/source-text";

const WRITE = process.argv.includes("--write");
const PATH = resolve("src/lib/generated/events.json");

interface Action {
  evidence: string;
  [k: string]: unknown;
}

interface Rec {
  id: string;
  title: string;
  summary: string;
  classification: string;
  effectiveAt?: string | null;
  impact?: { actionRequired?: Action; [k: string]: unknown };
  [k: string]: unknown;
}

function main() {
  const file = JSON.parse(readFileSync(PATH, "utf8")) as { events: Rec[]; [k: string]: unknown };
  let kept = 0;
  let changed = 0;
  let removed = 0;

  for (const e of file.events) {
    const current = e.impact?.actionRequired;
    if (!current) continue;

    const next = actionRequiredFor({
      title: e.title,
      abstract: e.summary,
      body: sourceTextFor(e.id),
      effectiveAt: e.classification === "proposed_rule" ? null : (e.effectiveAt ?? null),
    });
    if (next && next.evidence === current.evidence) {
      kept++;
      continue;
    }
    console.log(`\n${e.id}  ${e.title.slice(0, 70)}`);
    console.log(`  - ${current.evidence.slice(0, 160)}`);
    if (next) {
      console.log(`  + ${next.evidence.slice(0, 160)}`);
      e.impact!.actionRequired = next as unknown as Action;
      changed++;
    } else {
      console.log("  + (none)");
      delete e.impact!.actionRequired;
      removed++;
    }
  }

  console.log(`\nKEPT ${kept} · CHANGED ${changed} · REMOVED ${removed}`);
  if (WRITE) {
    writeFileSync(PATH, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`WROTE ${PATH}`);
  } else {
    console.log("DRY RUN — nothing written. Pass --write to apply.");
  }
}

main();
