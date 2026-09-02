// =============================================================================
// scripts/social-post.ts — one run, in whichever window is open
//
//   npm run social:post                    dry run for the window open now
//   npm run social:post -- --slot=evening  force a window (manual dispatch)
//   npm run social:post -- --live          publish, if SOCIAL_POST_ENABLED=true
//   npm run social:post -- --approved=approvals/x.json --live
//                                          publish the EXACT copy a human approved,
//                                          with no model call — see approval.ts
//
// PUBLISHING IS OFF BY DEFAULT AND OFF TWICE OVER.
// `--live` alone does nothing: the repository variable SOCIAL_POST_ENABLED must
// also be "true". Two independent switches, because the failure this guards
// against — an unattended process posting to a public account before anyone has
// read its output — is not recoverable by editing a file afterwards.
//
// TWO FILES SURVIVE THE RUN, AND THEY ARE DIFFERENT KINDS OF THING.
// The LEDGER is the guard: every cooldown and every rerun check reads it, and
// an unreadable ledger halts the run. The QUEUE is a memory: what the account
// could say, what became of each item, and validated copy waiting for a window.
// A corrupt queue is reported and rebuilt; it can never unlock a subject.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EVENT_INDEX } from "../src/lib/event-index";
import { runSlot, runApproved, isPublishingEnabled } from "../src/lib/social/run";
import { parseApproval } from "../src/lib/social/approval";
import { currentSlot, SLOT_BY_ID, chicagoParts } from "../src/lib/social/slots";
import { createCopyEngine } from "../src/lib/social/copy-engine";
import { parsePostLedger, serializePostLedger, type PostLedger } from "../src/lib/social/ledger";
import { EMPTY_QUEUE, parseQueue, serializeQueue, summarizeQueue, type EditorialQueue } from "../src/lib/social/queue";
import { XPublisher, readXCredentials } from "../src/lib/social/platforms/x";
import { LinkedInPublisher, readLinkedInCredentials } from "../src/lib/social/platforms/linkedin";
import type { Publisher } from "../src/lib/social/platforms/types";
import type { Platform, SlotId, SlotOutcome } from "../src/lib/social/types";

const DEFAULT_LEDGER = "src/lib/generated/social-posted.json";
const DEFAULT_QUEUE = "src/lib/generated/social-queue.json";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exitCode = 1;
  // Returning rather than calling process.exit(): an explicit exit here has
  // crashed on Windows mid-write in this repository before. Setting exitCode and
  // unwinding is equivalent and safe.
  throw new Error(message);
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

async function main() {
  const ledgerPath = resolve(process.env.SOCIAL_POST_LEDGER || DEFAULT_LEDGER);
  const queuePath = resolve(process.env.SOCIAL_QUEUE_PATH || DEFAULT_QUEUE);

  // ---- the ledger, fail-closed --------------------------------------------
  const ledger = parsePostLedger(readOrNull(ledgerPath));
  if (!ledger) {
    fail(
      `The post ledger at ${ledgerPath} is unreadable. Refusing to run: without it, ` +
        `every subject it was protecting could be re-posted.`
    );
  }

  // ---- the queue, fail-open with a warning --------------------------------
  let queue: EditorialQueue = EMPTY_QUEUE;
  const rawQueue = readOrNull(queuePath);
  const parsedQueue = parseQueue(rawQueue);
  if (parsedQueue) {
    queue = parsedQueue;
  } else {
    console.log(`WARNING: the editorial queue at ${queuePath} is unreadable and will be rebuilt from today's candidates.`);
  }

  // ---- which window --------------------------------------------------------
  const now = arg("date") ? new Date(`${arg("date")}T12:00:00Z`) : new Date();
  const forced = arg("slot") as SlotId | undefined;
  const slot = forced ? SLOT_BY_ID.get(forced) : currentSlot(now);

  if (forced && !slot) fail(`Unknown window "${forced}". Use morning, afternoon or evening.`);

  const parts = chicagoParts(now);
  if (!slot) {
    console.log(
      `SKIPPED_OUTSIDE_WINDOW — ${parts.date} ${parts.time} America/Chicago is outside every publishing window (08:00–12:59, 13:00–16:59, 17:00–20:59).`
    );
    return;
  }

  // ---- live gate -----------------------------------------------------------
  const wantsLive = flag("live");
  const enabled = isPublishingEnabled();
  const live = wantsLive && enabled;

  if (wantsLive && !enabled) {
    console.log("NOTE: --live was passed but SOCIAL_POST_ENABLED is not 'true'. Running as a dry run.\n");
  }

  // ---- publishers, independently -------------------------------------------
  const publishers: Partial<Record<Platform, Publisher>> = {};
  if (live) {
    const x = readXCredentials();
    if (x) publishers.x = new XPublisher(x);
    else console.log("NOTE: X credentials are not configured — X will skip.");

    const li = readLinkedInCredentials();
    if (li) publishers.linkedin = new LinkedInPublisher(li);
    else console.log("NOTE: LinkedIn credentials are not configured — LinkedIn will skip.");
  }

  // ---- the exact-copy path -------------------------------------------------
  const approvedPath = arg("approved");
  let result;
  let engineId: string;

  if (approvedPath) {
    const raw = readFileSync(resolve(approvedPath), "utf8");
    const envelope = parseApproval(raw);
    if (!envelope) fail(`${approvedPath} is not a readable approval envelope of the current version.`);
    if (envelope.slot !== slot.id) fail(`This envelope is for the ${envelope.slot} window, but the run is ${slot.id}.`);
    engineId = envelope.model;
    result = await runApproved({ envelope, events: EVENT_INDEX, ledger, publishers, now, live, queue });
  } else {
    const engine = createCopyEngine({
      provider: arg("engine"),
      transcriptPath: arg("transcript") ? resolve(arg("transcript") as string) : undefined,
    });
    engineId = engine.id;
    result = await runSlot({ slot, events: EVENT_INDEX, ledger, engine, publishers, now, live, queue });
  }

  report(result.outcome, live, engineId);

  // ---- persist -------------------------------------------------------------
  // Written on every path, including every skip. A ledger that recorded only
  // successes could not tell a quiet archive from a broken selector.
  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, serializePostLedger(result.ledger as PostLedger), "utf8");
  console.log(`\nLedger: ${result.records.length} record(s) appended → ${ledgerPath}`);

  mkdirSync(dirname(queuePath), { recursive: true });
  writeFileSync(queuePath, serializeQueue(result.queue), "utf8");
  const q = summarizeQueue(result.queue);
  console.log(
    `Queue : ${result.queue.items.length} item(s) → ${queuePath} ` +
      `(ready ${q.ready}, scheduled ${q.scheduled}, verified ${q.verified}, published ${q.published}, rejected ${q.rejected}, superseded ${q.superseded})`
  );

  const failed = result.outcome.platforms.filter((p) => p.decision === "SKIPPED_PUBLISH_FAILED");
  if (failed.length) {
    fail(`${failed.length} platform(s) failed to publish: ${failed.map((f) => f.reason).join("; ")}`);
  }
}

function report(o: SlotOutcome, live: boolean, engineId: string) {
  const line = "─".repeat(72);

  console.log(line);
  console.log(
    `${o.localDate} ${o.localTime} America/Chicago · ${o.slot.toUpperCase()} window · ${live ? "LIVE" : "DRY RUN"}`
  );
  console.log(`engine: ${engineId}`);
  console.log(line);

  if (o.cadenceExplain) console.log(`Cadence : ${o.cadenceExplain}`);

  if (!o.subjectId) {
    console.log(`\nNo post. ${o.platforms[0]?.decision}: ${o.platforms[0]?.reason}\n`);
    console.log(`Candidates considered: ${o.poolSize}`);
    return;
  }

  console.log(`\nSubject : ${o.subjectLabel}`);
  console.log(`Type    : ${o.contentType} (${o.tier}) · shape ${o.structure ?? "unspecified"}`);
  console.log(`Score   : ${o.score}  (${o.scoreExplain})`);
  console.log(`Link    : ${o.shareUrl}`);
  console.log(`Pool    : ${o.poolSize} candidate(s) considered`);

  if (o.validator) {
    console.log(`Validator: ${o.validator.ok ? "PASS" : "FAIL"} — checked ${o.validator.checked.join(", ")}`);
    for (const f of o.validator.failures) console.log(`   ✗ ${f}`);
  }
  if (o.dedupe) {
    console.log(`Dedupe   : ${o.dedupe.ok ? "distinct" : "blocked"} (max similarity ${o.dedupe.maxSimilarity.toFixed(2)})`);
  }

  for (const p of o.platforms) {
    console.log(`\n── ${p.platform.toUpperCase()} — ${p.decision}`);
    if (p.reason && p.decision !== "POSTED") console.log(`   ${p.reason}`);
    if (p.text) {
      console.log("");
      console.log(p.text.split("\n").map((l) => `   │ ${l}`).join("\n"));
      console.log(`   └ ${p.text.length} characters`);
    }
    if (p.externalId) console.log(`   post id : ${p.externalId}`);
    if (p.externalUrl) console.log(`   url     : ${p.externalUrl}`);
  }

  if (o.usage) {
    console.log(`\nTokens: ${o.usage.inputTokens} in / ${o.usage.outputTokens} out · $${o.usage.costUsd.toFixed(4)}`);
  }
}

main().catch((err) => {
  if (process.exitCode !== 1) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
});
