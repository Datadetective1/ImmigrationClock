// =============================================================================
// scripts/social-gate.ts — should this scheduled firing do anything?
//
//   npx tsx scripts/social-gate.ts        exit 0 = a window is open and unfilled
//                                         exit 1 = nothing to do; stop cheaply
//
// The workflow fires every hour of the daily window and three times in the
// breaking window, so most firings should stop here, in seconds, before
// dependencies are installed and before any API is called. Four questions,
// all answered from files already in the checkout:
//
//   1. Is the Chicago hour inside a window at all?
//   2. Has that window already published today, on every configured platform?
//   3. Has X already refused today for an empty prepaid balance (HTTP 402)?
//      Every retry would be another request that fails the same way.
//   4. In the breaking window: does the archive hold any major development
//      from today or yesterday not yet posted? Almost every day it does not,
//      and the firing ends here.
//
// The second is the rerun guard's cheap twin. runSlot() would reach the same
// answer, but only after `npm ci`. Questions 3 and 4 are deliberately looser
// than the run: they can let a firing through that then publishes nothing,
// never stop one that would have published.
//
// Every skip is printed, never silent. A quiet day and a broken gate must
// never look the same in the logs.
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { currentSlot, chicagoParts } from "../src/lib/social/slots";
import { parsePostLedger, hasPostedInSlot } from "../src/lib/social/ledger";
import { creditsDepletedToday, mayHaveBreakingNews } from "../src/lib/social/cadence";
import { PLATFORMS } from "../src/lib/social/types";
import { readXCredentials } from "../src/lib/social/platforms/x";
import { readLinkedInCredentials } from "../src/lib/social/platforms/linkedin";

const DEFAULT_LEDGER = "src/lib/generated/social-posted.json";
const DEFAULT_EVENTS_INDEX = "src/lib/generated/events-index.json";

function main() {
  // SOCIAL_GATE_NOW exists for the tests, which run this script at chosen
  // instants; nothing in the workflow sets it.
  const now = process.env.SOCIAL_GATE_NOW ? new Date(process.env.SOCIAL_GATE_NOW) : new Date();
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

  // Only the platforms this deployment can publish to count. Waiting for a
  // LinkedIn post that no credential will ever make kept the gate open all
  // window long, and every later firing paid the install for nothing.
  const configured = PLATFORMS.filter((platform) =>
    platform === "x" ? readXCredentials() !== null : readLinkedInCredentials() !== null
  );
  const expected = configured.length ? configured : PLATFORMS.filter((platform) => platform === "x");
  const posted = expected.filter((platform) => hasPostedInSlot(ledger, p.date, slot.id, platform));
  if (posted.length === expected.length) {
    console.log(`Window ${slot.id} already published today (${p.date}) on ${posted.join(" and ")}. Nothing to do.`);
    process.exitCode = 1;
    return;
  }

  if (expected.includes("x")) {
    const depleted = creditsDepletedToday(ledger, p.date, "x");
    if (depleted) {
      console.log(
        `X refused a post at ${depleted.localTime} today with HTTP 402 (prepaid credits depleted). Not retrying today: ` +
          "every attempt would be another request that fails. Top up the balance, then run the workflow by hand to publish today."
      );
      process.exitCode = 1;
      return;
    }
  }

  if (slot.id === "breaking") {
    let events: { id: string; severity: string; publishedAt: string }[] = [];
    try {
      events = (JSON.parse(readFileSync(resolve(process.env.SOCIAL_EVENTS_INDEX || DEFAULT_EVENTS_INDEX), "utf8")) as { events?: typeof events }).events ?? [];
    } catch {
      console.log(`Window breaking is open at ${p.time}; the event index could not be read here, handing over to the run.`);
      return;
    }
    if (!mayHaveBreakingNews(events, ledger, "x", p.date)) {
      console.log(`Breaking window open at ${p.time}, but no major development from today or yesterday is unposted. Nothing to do.`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`Window open: ${slot.id} (${slot.hours[0]}:00–${slot.hours[1]}:59) at ${p.time} America/Chicago on ${p.date}.`);
}

main();
