// =============================================================================
// scripts/social-post.ts — one slot, one run
//
//   npm run social:post                 dry run for whichever slot is open now
//   npm run social:post -- --slot=evening   force a slot (manual dispatch)
//   npm run social:post -- --live       publish, if SOCIAL_POST_ENABLED=true
//   npm run social:post -- --approved=approvals/x.json --live
//                                       publish the EXACT copy a human approved,
//                                       with no model call — see approval.ts
//
// PUBLISHING IS OFF BY DEFAULT AND OFF TWICE OVER.
// `--live` alone does nothing: the repository variable SOCIAL_POST_ENABLED must
// also be "true". Two independent switches, because the failure this guards
// against — an unattended process posting to a public account before anyone has
// read its output — is not recoverable by editing a file afterwards.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EVENT_INDEX } from "../src/lib/event-index";
import { runSlot, runApproved, isPublishingEnabled } from "../src/lib/social/run";
import { parseApproval } from "../src/lib/social/approval";
import { currentSlot, SLOT_BY_ID, chicagoParts } from "../src/lib/social/slots";
import { createCopyEngine } from "../src/lib/social/copy-engine";
import {
  parsePostLedger,
  serializePostLedger,
  type PostLedger,
} from "../src/lib/social/ledger";
import { XPublisher, readXCredentials } from "../src/lib/social/platforms/x";
import { LinkedInPublisher, readLinkedInCredentials } from "../src/lib/social/platforms/linkedin";
import type { Publisher } from "../src/lib/social/platforms/types";
import type { Platform, SlotId } from "../src/lib/social/types";

const DEFAULT_LEDGER = "src/lib/generated/social-posted.json";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exitCode = 1;
  // Returning rather than calling process.exit(): an explicit exit here has
  // crashed on Windows mid-write in this repository before (libuv assertion,
  // exit code 3221226505). Setting exitCode and unwinding is equivalent and safe.
  throw new Error(message);
}

async function main() {
  const ledgerPath = resolve(process.env.SOCIAL_POST_LEDGER || DEFAULT_LEDGER);

  // ---- the ledger, fail-closed --------------------------------------------
  let raw: string | null = null;
  try {
    raw = readFileSync(ledgerPath, "utf8");
  } catch {
    raw = null; // absent is the normal state before the first run
  }
  const ledger = parsePostLedger(raw);
  if (!ledger) {
    fail(
      `The post ledger at ${ledgerPath} is unreadable. Refusing to run: without it, ` +
        `every subject it was protecting could be re-posted.`
    );
  }

  // ---- which slot ----------------------------------------------------------
  const now = arg("date") ? new Date(`${arg("date")}T12:00:00Z`) : new Date();
  const forced = arg("slot") as SlotId | undefined;
  const slot = forced ? SLOT_BY_ID.get(forced) : currentSlot(now);

  if (forced && !slot) fail(`Unknown slot "${forced}". Use morning, afternoon or evening.`);

  const parts = chicagoParts(now);
  if (!slot) {
    console.log(
      `SKIPPED_OUTSIDE_WINDOW — ${parts.date} ${parts.time} America/Chicago is not a publishing slot (09:00, 15:00, 18:00).`
    );
    return;
  }

  // ---- live gate -----------------------------------------------------------
  const wantsLive = flag("live");
  const enabled = isPublishingEnabled();
  const live = wantsLive && enabled;

  if (wantsLive && !enabled) {
    console.log(
      "NOTE: --live was passed but SOCIAL_POST_ENABLED is not 'true'. Running as a dry run.\n"
    );
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
  //
  // `--approved=<file>` publishes the exact text a human read and signed off,
  // and NEVER calls the model: no engine is constructed on this branch, so a
  // regeneration is not possible rather than merely skipped. runApproved()
  // re-runs the validator, the cooldowns and the wording check against the
  // CURRENT ledger and today's recomputed fact set, and refuses on any failure.
  const approvedPath = arg("approved");
  let result;
  let engineId: string;

  if (approvedPath) {
    const raw = readFileSync(resolve(approvedPath), "utf8");
    const envelope = parseApproval(raw);
    if (!envelope) {
      fail(`${approvedPath} is not a readable approval envelope of the current version.`);
    }
    if (envelope.slot !== slot.id) {
      fail(`This envelope is for the ${envelope.slot} slot, but the run is ${slot.id}.`);
    }
    engineId = envelope.model;
    result = await runApproved({
      envelope,
      events: EVENT_INDEX,
      ledger,
      publishers,
      now,
      live,
    });
  } else {
    const engine = createCopyEngine({
      provider: arg("engine"),
      transcriptPath: arg("transcript") ? resolve(arg("transcript") as string) : undefined,
    });
    engineId = engine.id;
    result = await runSlot({
      slot,
      events: EVENT_INDEX,
      ledger,
      engine,
      publishers,
      now,
      live,
    });
  }

  report(result.outcome, live, engineId);

  // ---- persist -------------------------------------------------------------
  // Written on every path, including every skip. A ledger that recorded only
  // successes could not tell a quiet archive from a broken selector.
  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, serializePostLedger(result.ledger as PostLedger), "utf8");
  console.log(`\nLedger: ${result.records.length} record(s) appended → ${ledgerPath}`);

  const failed = result.outcome.platforms.filter((p) => p.decision === "SKIPPED_PUBLISH_FAILED");
  if (failed.length) {
    fail(`${failed.length} platform(s) failed to publish: ${failed.map((f) => f.reason).join("; ")}`);
  }
}

function report(outcome: ReturnType<typeof Object>, live: boolean, engineId: string) {
  const o = outcome as import("../src/lib/social/types").SlotOutcome;
  const line = "─".repeat(72);

  console.log(line);
  console.log(
    `${o.localDate} ${o.localTime} America/Chicago · ${o.slot.toUpperCase()} · pool=${o.pool} · ${
      live ? "LIVE" : "DRY RUN"
    }`
  );
  console.log(`engine: ${engineId}`);
  console.log(line);

  if (!o.subjectId) {
    console.log(`\nNo post. ${o.platforms[0]?.decision}: ${o.platforms[0]?.reason}\n`);
    console.log(`Candidates considered: ${o.poolSize}`);
    return;
  }

  console.log(`\nSubject : ${o.subjectLabel}`);
  console.log(`Angle   : ${o.angle}`);
  console.log(`Score   : ${o.score}  (${o.scoreExplain})`);
  console.log(`Link    : ${o.deepLink}`);
  console.log(`Pool    : ${o.poolSize} candidate(s) considered`);

  if (o.validator) {
    console.log(
      `Validator: ${o.validator.ok ? "PASS" : "FAIL"} — checked ${o.validator.checked.join(", ")}`
    );
    for (const f of o.validator.failures) console.log(`   ✗ ${f}`);
  }
  if (o.dedupe) {
    console.log(
      `Dedupe   : ${o.dedupe.ok ? "distinct" : "blocked"} (max similarity ${o.dedupe.maxSimilarity.toFixed(2)})`
    );
  }

  for (const p of o.platforms) {
    console.log(`\n── ${p.platform.toUpperCase()} — ${p.decision}`);
    if (p.reason && p.decision !== "POSTED") console.log(`   ${p.reason}`);
    if (p.text) {
      console.log("");
      console.log(p.text.split("\n").map((l) => `   │ ${l}`).join("\n"));
      console.log(`   └ ${p.text.length} characters`);
    }
    // The platform's own id is the only proof a post exists. Printed for every
    // success, so a run's log can be reconciled against the accounts later.
    if (p.externalId) console.log(`   post id : ${p.externalId}`);
    if (p.externalUrl) console.log(`   url     : ${p.externalUrl}`);
  }

  if (o.usage) {
    console.log(
      `\nTokens: ${o.usage.inputTokens} in / ${o.usage.outputTokens} out · $${o.usage.costUsd.toFixed(4)}`
    );
  }
}

main().catch((err) => {
  if (process.exitCode !== 1) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
});
