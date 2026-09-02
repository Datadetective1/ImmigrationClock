// =============================================================================
// scripts/social-preflight.ts — is this system fit to run unattended?
//
//   npm run social:preflight
//
// Answers the operational questions a human would otherwise have to remember to
// ask, and answers them without publishing anything or calling any API:
//
//   • is the ledger readable? (an unreadable one halts publishing entirely)
//   • is the queue readable? (an unreadable one is rebuilt, and said so)
//   • which credentials are configured, per platform, independently?
//   • does the copy engine resolve to a real provider, with its key present?
//   • what would the cadence policy allow in each of today's windows, and
//     what is at the top of each allowed tier?
//   • does every candidate resolve to a real share page?
//
// It exits non-zero only for conditions that would make a live run unsafe — an
// unreadable ledger, a broken destination, or a copy engine that cannot run. A
// quiet queue is not a fault; it is the normal state on many days, and the
// whole design is built around it.
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EVENT_INDEX, INDEX_COVERAGE } from "../src/lib/event-index";
import { SLOTS, chicagoParts, currentSlot, instantInWindow } from "../src/lib/social/slots";
import { candidatesFor } from "../src/lib/social/select";
import { isPublishingEnabled, hashFacts } from "../src/lib/social/run";
import { decideCadence } from "../src/lib/social/cadence";
import {
  DEFAULT_PROVIDER,
  DEFAULT_MODEL_BY_PROVIDER,
  KEY_BY_PROVIDER,
  KNOWN_PROVIDERS,
  isKnownProvider,
  resolveProvider,
} from "../src/lib/social/copy-engine";
import { parsePostLedger, publishedPosts } from "../src/lib/social/ledger";
import { EMPTY_QUEUE, parseQueue, refreshQueue, summarizeQueue } from "../src/lib/social/queue";
import { isPublishableDestination } from "../src/lib/social/links";
import { readXCredentials } from "../src/lib/social/platforms/x";
import { readLinkedInCredentials } from "../src/lib/social/platforms/linkedin";
import { buildSignals } from "../src/lib/editorial/signals";
import { EXPLAINERS } from "../src/lib/editorial/explainers";
import type { CadenceTier } from "../src/lib/social/content-types";

const DEFAULT_LEDGER = "src/lib/generated/social-posted.json";
const DEFAULT_QUEUE = "src/lib/generated/social-queue.json";

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function main() {
  const problems: string[] = [];
  const notes: string[] = [];
  const now = new Date();
  const parts = chicagoParts(now);

  console.log("═".repeat(72));
  console.log("ImmigrationClock social — preflight");
  console.log(`${parts.date} ${parts.time} America/Chicago`);
  console.log("═".repeat(72));

  // ---- ledger --------------------------------------------------------------
  const ledgerPath = resolve(process.env.SOCIAL_POST_LEDGER || DEFAULT_LEDGER);
  const rawLedger = readOrNull(ledgerPath);
  const ledger = parsePostLedger(rawLedger);

  console.log("\n── Ledger");
  if (!ledger) {
    problems.push(`Ledger at ${ledgerPath} is unreadable — publishing would refuse to run.`);
    console.log(`  UNREADABLE: ${ledgerPath}`);
  } else {
    const published = publishedPosts(ledger);
    console.log(`  ${ledgerPath}`);
    console.log(`  ${ledger.posts.length} row(s), ${published.length} published`);
    if (rawLedger === null) console.log("  (file does not exist yet — normal before the first run)");
    const last = published.filter((p) => p.platform === "x").sort((a, b) => b.runAtUtc.localeCompare(a.runAtUtc))[0];
    if (last) console.log(`  last X post: ${last.localDate} ${last.slot} — ${last.subjectLabel?.slice(0, 60)} [${last.contentType ?? "pre-content-types"}]`);
  }

  // ---- queue ---------------------------------------------------------------
  const queuePath = resolve(process.env.SOCIAL_QUEUE_PATH || DEFAULT_QUEUE);
  const rawQueue = readOrNull(queuePath);
  let queue = parseQueue(rawQueue);
  console.log("\n── Editorial queue");
  if (!queue) {
    notes.push(`The editorial queue at ${queuePath} is unreadable and will be rebuilt on the next run. The ledger, not the queue, is the guard.`);
    console.log(`  UNREADABLE (will be rebuilt): ${queuePath}`);
    queue = EMPTY_QUEUE;
  } else {
    const s = summarizeQueue(queue);
    console.log(`  ${queuePath}`);
    console.log(`  ${queue.items.length} item(s): ready ${s.ready}, scheduled ${s.scheduled}, verified ${s.verified}, published ${s.published}, rejected ${s.rejected}, superseded ${s.superseded}`);
    if (rawQueue === null) console.log("  (file does not exist yet — normal before the first run)");
  }

  // ---- credentials, per platform, independently -----------------------------
  console.log("\n── Credentials");
  const x = readXCredentials();
  const linkedin = readLinkedInCredentials();
  console.log(`  X        : ${x ? "configured (presence only — run social:verify-x to prove it authenticates)" : "NOT configured — X will skip"}`);
  console.log(`  LinkedIn : ${linkedin ? "configured" : "NOT configured — LinkedIn will skip, and cannot make a subject eligible"}`);

  const rawEngine = process.env.SOCIAL_ENGINE;
  const provider = resolveProvider();
  const engineModel = process.env.SOCIAL_MODEL || DEFAULT_MODEL_BY_PROVIDER[provider] || "(provider default)";

  if (!isKnownProvider(provider)) {
    problems.push(
      `SOCIAL_ENGINE is "${rawEngine}", which is not a known copy engine provider (${KNOWN_PROVIDERS.join(", ")}). Set it to "openai" for production.`
    );
    console.log(`  Engine   : UNKNOWN PROVIDER "${rawEngine}"`);
  } else {
    const engineKey = KEY_BY_PROVIDER[provider];
    const source = rawEngine?.trim() ? "SOCIAL_ENGINE" : `default (SOCIAL_ENGINE ${rawEngine === undefined ? "unset" : "empty"})`;
    console.log(
      `  Engine   : ${provider} / ${engineModel}  [from ${source}]${
        engineKey ? ` — ${process.env[engineKey] ? `${engineKey} present` : `${engineKey} MISSING`}` : ""
      }`
    );
    if (engineKey && !process.env[engineKey]) {
      problems.push(
        `${engineKey} is not set, and the ${provider} engine cannot generate copy without it. In CI it comes from GitHub Secrets; locally, put it in .env.`
      );
    }
    if (provider !== DEFAULT_PROVIDER) {
      notes.push(`The copy engine is ${provider}, not the ${DEFAULT_PROVIDER} default. That is a deliberate SOCIAL_ENGINE override.`);
    }
  }
  if (!x && !linkedin) notes.push("Neither platform is configured. Nothing could publish even with SOCIAL_POST_ENABLED=true.");
  if (linkedin) notes.push("LinkedIn tokens expire on a fixed cycle. When one does, LinkedIn skips with SKIPPED_CREDENTIAL_EXPIRED and X keeps running.");

  // ---- publishing switch ----------------------------------------------------
  console.log("\n── Publishing switch");
  const enabled = isPublishingEnabled();
  console.log(`  SOCIAL_POST_ENABLED = ${process.env.SOCIAL_POST_ENABLED ?? "(unset)"}`);
  console.log(`  ${enabled ? "LIVE publishing is permitted." : "DRY RUN only — nothing can be published."}`);

  // ---- archive --------------------------------------------------------------
  console.log("\n── Archive");
  console.log(`  ${INDEX_COVERAGE.indexed} indexed event(s), oldest ${INDEX_COVERAGE.oldest ?? "n/a"}`);
  const newest = EVENT_INDEX[0]?.publishedAt;
  console.log(`  newest ${newest ?? "n/a"}`);
  if (newest && newest < parts.date) {
    const staleDays = Math.round((Date.parse(`${parts.date}T00:00:00Z`) - Date.parse(`${newest}T00:00:00Z`)) / 86_400_000);
    if (staleDays > 7) notes.push(`The newest archived event is ${staleDays} days old. The news tier will stay quiet until the data refresh runs; the evergreen tier does not depend on it.`);
  }

  // ---- the evergreen tier's depth ------------------------------------------
  console.log("\n── Evergreen tier");
  const signals = buildSignals(parts.date);
  console.log(`  ${signals.length} data signal(s) supported by today's snapshots, ${EXPLAINERS.length} explainer(s)`);
  if (signals.length < 5) notes.push(`Only ${signals.length} data signals are supported today. Check whether a source refresh failed.`);

  // ---- what each window would do -------------------------------------------
  console.log("\n── Today's windows (X)");
  const candidates = candidatesFor(EVENT_INDEX, parts.date);
  const byTier: Record<CadenceTier, number> = { news: 0, follow_up: 0, evergreen: 0 };
  for (const c of candidates) byTier[c.tier] += 1;
  console.log(`  ${candidates.length} candidate(s): news ${byTier.news}, follow-up ${byTier.follow_up}, evergreen ${byTier.evergreen}`);
  if (ledger) {
    for (const slot of SLOTS) {
      const at = instantInWindow(parts.date, slot);
      const cadence = decideCadence({ ledger, platform: "x", slot, localDate: parts.date, now: at });
      const open = currentSlot(now)?.id === slot.id;
      console.log(`  ${slot.id.padEnd(9)} ${String(slot.hours[0]).padStart(2, "0")}:00–${slot.hours[1]}:59  ${cadence.blocked ? "BLOCKED" : `may publish: ${cadence.allowedTiers.join(", ")}`}${open ? "   ← open now" : ""}`);
      for (const tier of cadence.allowedTiers) {
        const top = candidates.find((c) => c.tier === tier);
        if (top) console.log(`             ${tier.padEnd(10)} top: ${top.label.slice(0, 66)} [${top.contentType}]`);
      }
    }
  }
  const refreshed = refreshQueue(queue, candidates, now, parts.date, hashFacts);
  console.log(`  queue after refresh (in memory): +${refreshed.added} new, ${refreshed.superseded} superseded, ${refreshed.expired} expired`);

  // ---- destinations ---------------------------------------------------------
  console.log("\n── Destinations");
  const bad = candidates.filter((c) => !isPublishableDestination(c.deepLink)).map((c) => `${c.subjectId} → ${c.deepLink}`);
  if (bad.length) {
    problems.push(`${bad.length} candidate(s) resolve to an unpublishable destination.`);
    for (const b of bad.slice(0, 5)) console.log(`  BAD: ${b}`);
  } else {
    console.log(`  All ${candidates.length} candidate destinations are specific pages with their own cards.`);
  }

  // ---- verdict --------------------------------------------------------------
  console.log(`\n${"═".repeat(72)}`);
  for (const n of notes) console.log(`NOTE  ${n}`);
  for (const p of problems) console.log(`BLOCK ${p}`);

  if (problems.length) {
    console.log("\nNOT SAFE TO RUN — fix the blocking problems above.");
    process.exitCode = 1;
    return;
  }
  console.log("\nSAFE TO RUN.");
  console.log(enabled ? "Publishing is ENABLED. A scheduled run in an open window would post." : "Publishing is DISABLED. Runs will validate and withhold.");
}

main();
