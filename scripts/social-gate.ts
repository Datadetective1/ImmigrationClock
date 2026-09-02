// =============================================================================
// scripts/social-gate.ts — should this scheduled firing do anything?
//
//   npx tsx scripts/social-gate.ts        exit 0 = a window is open and unfilled
//                                         exit 1 = nothing to do; stop cheaply
//
// The workflow fires every hour of the publishing day, so most firings should
// stop here, in seconds, before dependencies are installed for the real run.
// Two questions, both answered from files already in the checkout:
//
//   1. Is the Chicago hour inside a window at all?
//   2. Has that window already published today, on any platform?
//
// The second is the rerun guard's cheap twin. runSlot() would reach the same
// answer, but only after `npm ci`; this is what keeps eleven no-op firings a
// day from costing eleven installs.
//
// Every skip is printed, never silent. A quiet day and a broken gate must
// never look the same in the logs.
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { currentSlot, chicagoParts } from "../src/lib/social/slots";
import { parsePostLedger, hasPostedInSlot } from "../src/lib/social/ledger";
import { PLATFORMS } from "../src/lib/social/types";

const DEFAULT_LEDGER = "src/lib/generated/social-posted.json";

function main() {
  const now = new Date();
  const p = chicagoParts(now);
  const slot = currentSlot(now);

  if (!slot) {
    console.log(`No window open at ${p.date} ${p.time} America/Chicago. Nothing to do.`);
    process.exitCode = 1;
    return;
  }

  let raw: string | null = null;
  try {
    raw = readFileSync(resolve(process.env.SOCIAL_POST_LEDGER || DEFAULT_LEDGER), "utf8");
  } catch {
    raw = null;
  }
  const ledger = parsePostLedger(raw);
  if (!ledger) {
    // Let the real run refuse loudly, with its own message, rather than hiding
    // a corrupt ledger behind a gate that says "nothing to do".
    console.log(`Window ${slot.id} is open at ${p.time}; the ledger could not be read here, handing over to the run.`);
    return;
  }

  const posted = PLATFORMS.filter((platform) => hasPostedInSlot(ledger, p.date, slot.id, platform));
  if (posted.length === PLATFORMS.length) {
    console.log(`Window ${slot.id} already published today (${p.date}) on ${posted.join(" and ")}. Nothing to do.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Window open: ${slot.id} (${slot.hours[0]}:00–${slot.hours[1]}:59) at ${p.time} America/Chicago on ${p.date}.`);
}

main();
