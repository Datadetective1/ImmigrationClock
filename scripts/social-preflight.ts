// =============================================================================
// scripts/social-preflight.ts — is this system fit to run unattended?
//
//   npm run social:preflight
//
// Answers the operational questions a human would otherwise have to remember to
// ask, and answers them without publishing anything or calling any API:
//
//   • is the ledger readable? (an unreadable one halts publishing entirely)
//   • which credentials are configured, per platform, independently?
//   • what would each of today's three slots do right now?
//   • is the standing pool deep enough to keep the evening slot from repeating?
//
// It exits non-zero only for conditions that would make a live run unsafe — an
// unreadable ledger, or a broken deep link. An empty news pool is not a fault;
// it is the normal state most days, and the whole design is built around it.
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EVENT_INDEX, INDEX_COVERAGE } from "../src/lib/event-index";
import { SLOTS, chicagoParts, currentSlot } from "../src/lib/social/slots";
import { candidatesFor } from "../src/lib/social/select";
import { isPublishingEnabled } from "../src/lib/social/run";
import { DEFAULT_PROVIDER, DEFAULT_MODEL_BY_PROVIDER } from "../src/lib/social/copy-engine";
import { parsePostLedger, publishedPosts } from "../src/lib/social/ledger";
import { checkSubject } from "../src/lib/social/dedupe";
import { isPublishableDestination, STANDING_ASSETS } from "../src/lib/social/links";
import { assetInsights } from "../src/lib/social/asset-facts";
import { readXCredentials } from "../src/lib/social/platforms/x";
import { readLinkedInCredentials } from "../src/lib/social/platforms/linkedin";
import { PLATFORMS } from "../src/lib/social/types";

const DEFAULT_LEDGER = "src/lib/generated/social-posted.json";

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
  let raw: string | null = null;
  try {
    raw = readFileSync(ledgerPath, "utf8");
  } catch {
    raw = null;
  }
  const ledger = parsePostLedger(raw);

  console.log("\n── Ledger");
  if (!ledger) {
    problems.push(`Ledger at ${ledgerPath} is unreadable — publishing would refuse to run.`);
    console.log(`  UNREADABLE: ${ledgerPath}`);
  } else {
    const published = publishedPosts(ledger);
    console.log(`  ${ledgerPath}`);
    console.log(`  ${ledger.posts.length} row(s), ${published.length} published`);
    if (raw === null) console.log("  (file does not exist yet — normal before the first run)");
  }

  // ---- credentials, per platform, independently -----------------------------
  console.log("\n── Credentials");
  const x = readXCredentials();
  const linkedin = readLinkedInCredentials();
  // "configured" means four non-empty strings are present. It does NOT mean X
  // accepts them — that needs a live call, which this script deliberately does
  // not make. `npm run social:verify-x` is the check that answers it.
  console.log(`  X        : ${x ? "configured (presence only — run social:verify-x to prove it authenticates)" : "NOT configured — X will skip"}`);
  console.log(`  LinkedIn : ${linkedin ? "configured" : "NOT configured — LinkedIn will skip"}`);
  // Report the key the CONFIGURED provider actually needs, not a hardcoded one.
  // A preflight that says "key present" about a provider the run will not use is
  // worse than saying nothing.
  const provider = process.env.SOCIAL_ENGINE || DEFAULT_PROVIDER;
  const engineKey = provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  const engineModel =
    process.env.SOCIAL_MODEL || DEFAULT_MODEL_BY_PROVIDER[provider] || "(provider default)";
  console.log(
    `  Engine   : ${provider} / ${engineModel} — ${
      process.env[engineKey] ? `${engineKey} present` : `${engineKey} MISSING — live runs cannot generate copy`
    }`
  );
  if (!x && !linkedin) {
    notes.push("Neither platform is configured. Nothing could publish even with SOCIAL_POST_ENABLED=true.");
  }
  if (linkedin) {
    notes.push(
      "LinkedIn tokens expire on a fixed cycle. When one does, LinkedIn skips with SKIPPED_CREDENTIAL_EXPIRED and X keeps running — renew LINKEDIN_ACCESS_TOKEN."
    );
  }

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
    const staleDays = Math.round(
      (Date.parse(`${parts.date}T00:00:00Z`) - Date.parse(`${newest}T00:00:00Z`)) / 86_400_000
    );
    if (staleDays > 7) {
      notes.push(
        `The newest archived event is ${staleDays} days old. The morning slot will keep skipping until the data refresh runs.`
      );
    }
  }

  // ---- what each slot would do ---------------------------------------------
  console.log("\n── Today's slots");
  for (const slot of SLOTS) {
    const candidates = candidatesFor(slot, EVENT_INDEX, parts.date);
    const open = currentSlot(now)?.id === slot.id;

    let available = 0;
    if (ledger) {
      for (const c of candidates) {
        const anyPlatform = PLATFORMS.some(
          (p) => checkSubject(ledger, c.subjectId, c.supportedAngles, p, c.deepLink, now, c.pool).ok
        );
        if (anyPlatform) available++;
      }
    }

    console.log(
      `  ${slot.id.padEnd(9)} ${String(slot.hour).padStart(2, "0")}:00  pool=${slot.pool.padEnd(9)} ` +
        `${candidates.length} candidate(s), ${available} available${open ? "   ← open now" : ""}`
    );
    if (candidates.length > 0) {
      console.log(`             top: ${candidates[0].label.slice(0, 78)}`);
    } else {
      console.log(`             nothing clears the bar — this slot would stay silent`);
    }
  }

  // ---- deep links -----------------------------------------------------------
  console.log("\n── Destinations");
  const bad: string[] = [];
  for (const slot of SLOTS) {
    for (const c of candidatesFor(slot, EVENT_INDEX, parts.date)) {
      if (!isPublishableDestination(c.deepLink)) bad.push(`${c.subjectId} → ${c.deepLink}`);
    }
  }
  if (bad.length) {
    problems.push(`${bad.length} candidate(s) resolve to an unpublishable destination.`);
    for (const b of bad.slice(0, 5)) console.log(`  BAD: ${b}`);
  } else {
    console.log("  All candidate destinations are specific pages.");
  }

  // ---- evening pool depth ---------------------------------------------------
  //
  // Depth is now a function of the DATA, not of the catalogue: an asset whose
  // underlying dataset supports nothing worth saying leaves the rotation, so a
  // failed refresh can quietly shrink the evening pool. Reporting the split is
  // how that shows up before it turns into a run of silent evenings.
  console.log("\n── Standing pool depth");
  const insights = STANDING_ASSETS.map((a) => ({ a, i: assetInsights(a.id, parts.date) }));
  const live = insights.filter((r) => r.i !== null);
  const numeric = live.filter((r) => r.i?.numeric);
  const dropped = insights.filter((r) => r.i === null);

  console.log(`  ${live.length} of ${STANDING_ASSETS.length} durable asset(s) in rotation`);
  console.log(`  ${numeric.length} carry grounded figures; ${live.length - numeric.length} qualify on a non-numeric insight`);
  for (const d of dropped) {
    console.log(`  DROPPED: ${d.a.id} — no grounded insight from its data today`);
  }
  if (dropped.length) {
    notes.push(
      `${dropped.length} standing asset(s) have no grounded insight and are out of the rotation. Check whether their source refresh succeeded.`
    );
  }
  if (live.length < 14) {
    notes.push(
      `Only ${live.length} standing assets are in rotation. With a 21-day subject cooldown the evening slot will skip often; add assets or restore a source to raise its hit rate.`
    );
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
  console.log(
    enabled
      ? "Publishing is ENABLED. A scheduled run in an open slot would post."
      : "Publishing is DISABLED. Runs will validate and withhold."
  );
}

main();
