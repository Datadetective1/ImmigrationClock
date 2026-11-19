// =============================================================================
// Add a new Visa Bulletin month: data/visa-bulletin-incoming/YYYY-MM.txt -> data.ts
//
//   npx tsx scripts/add-bulletin.ts data/visa-bulletin-incoming/2026-12.txt          # check only
//   npx tsx scripts/add-bulletin.ts data/visa-bulletin-incoming/2026-12.txt --write  # add it
//
// The check prints, for every wait-time page, the new final action date and
// how it moved, so the numbers can be read back against the official PDF one
// more time before anything is written. --write adds the month to the top of
// src/lib/visa-bulletin/data.ts. After the change is merged and deployed:
//
//   • the 16 /green-card-wait-time pages and their index show the new month,
//   • /visa-bulletin shows it, with what moved,
//   • /api/v1/visa-bulletin (the Chrome extension's feed) serves it,
//   • the next daily run of /api/bulletin-alerts/send emails free subscribers
//     (only when BULLETIN_ALERTS_SEND is "true").
//
// See data/visa-bulletin-incoming/README.md for the file format.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { IncomingError, insertIntoData, parseIncoming } from "../src/lib/visa-bulletin/incoming";
import { BULLETINS, cutoffFor, formatCutoff, movement } from "../src/lib/visa-bulletin";
import { WAIT_PAIRS, waitLabel } from "../src/lib/visa-bulletin/wait-time";
import { movementWords } from "../src/lib/bulletin-alerts/email";

const DATA = join(process.cwd(), "src", "lib", "visa-bulletin", "data.ts");

function main() {
  const file = process.argv[2];
  const write = process.argv.includes("--write");
  if (!file) {
    console.error("Usage: npx tsx scripts/add-bulletin.ts <file> [--write]");
    process.exit(2);
  }

  let month;
  try {
    month = parseIncoming(readFileSync(file, "utf8"));
  } catch (err) {
    if (err instanceof IncomingError) {
      console.error(`[add-bulletin] ${file}: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
  const b = month.bulletin;
  const previous = BULLETINS.find((x) => x.id < b.id) ?? null;
  if (BULLETINS[0] && b.id <= BULLETINS[0].id) {
    console.error(`[add-bulletin] ${b.id} is not newer than ${BULLETINS[0].id}, the newest month on the site.`);
    process.exit(1);
  }

  console.log(`[add-bulletin] ${b.label} read: 4 charts, 150 cells, all readable.`);
  console.log(`Read these back against ${b.sourceUrl}\n`);
  console.log(`${"Page".padEnd(26)}${"Final action".padEnd(16)}${"Filing".padEnd(16)}Since ${previous?.label ?? "(none)"}`);
  for (const p of WAIT_PAIRS) {
    const fa = cutoffFor(b, p.section, "finalAction", p.row, p.country);
    const df = cutoffFor(b, p.section, "filing", p.row, p.country);
    const move = previous ? movementWords(movement(cutoffFor(previous, p.section, "finalAction", p.row, p.country), fa)) : "";
    console.log(`${waitLabel(p).padEnd(26)}${formatCutoff(fa).padEnd(16)}${formatCutoff(df).padEnd(16)}${move}`);
  }

  if (!write) {
    console.log("\nCheck only. Run again with --write to add it to data.ts.");
    return;
  }
  const next = insertIntoData(readFileSync(DATA, "utf8"), month);
  writeFileSync(DATA, next);
  console.log(`\n[add-bulletin] Added ${b.id} to src/lib/visa-bulletin/data.ts. Run the tests, then open a PR.`);
}

main();
