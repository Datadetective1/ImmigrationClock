// =============================================================================
// scripts/social-approve.ts — the exact-copy approval path
//
//   npm run social:propose -- --slot=evening
//   npm run social:show    -- --file=approvals/2026-08-09-evening.json
//   npm run social:approve -- --file=... --by="Name" --digest=<from show> --platforms=x
//
// Three verbs, three commands, three separate human decisions. Splitting them is
// the point: the operator who reads the copy must come back with the digest they
// read, which is what binds an approval to a specific reading of a specific file.
//
// PROPOSE MAKES THE ONLY MODEL CALL IN THIS FLOW.
// It runs the real pipeline — selection, scoring, angle, subject dedupe,
// generation, validation, wording dedupe — and writes the result to a file
// instead of publishing it. Nothing here can post: no publisher is constructed
// and `live` is never true.
//
// THE LEDGER IS NOT WRITTEN BY THIS SCRIPT.
// Proposing is not an attempt to publish, and recording it as one would consume
// cooldowns for a post that may never be approved. The ledger is written by
// social-post.ts, on publication, exactly as on the unattended path.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EVENT_INDEX } from "../src/lib/event-index";
import { candidatesFor } from "../src/lib/social/select";
import { SLOT_BY_ID, currentSlot, chicagoParts } from "../src/lib/social/slots";
import { createCopyEngine } from "../src/lib/social/copy-engine";
import { checkSubject, checkWording } from "../src/lib/social/dedupe";
import { validatePost } from "../src/lib/social/validate";
import { PROMPT_VERSION } from "../src/lib/social/prompt";
import { hashFacts } from "../src/lib/social/run";
import { parsePostLedger, recentOpenings } from "../src/lib/social/ledger";
import {
  approveEnvelope,
  buildApproval,
  parseApproval,
  recomputeDigest,
  serializeApproval,
  MAX_APPROVAL_AGE_HOURS,
  type ApprovalEnvelope,
} from "../src/lib/social/approval";
import { PLATFORMS, type Platform, type SlotId, type ValidationResult } from "../src/lib/social/types";

const DEFAULT_LEDGER = "src/lib/generated/social-posted.json";
const DEFAULT_DIR = "approvals";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exitCode = 1;
  throw new Error(message);
}

function readLedger() {
  const path = resolve(process.env.SOCIAL_POST_LEDGER || DEFAULT_LEDGER);
  let raw: string | null = null;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    raw = null;
  }
  const ledger = parsePostLedger(raw);
  if (!ledger) fail(`The post ledger at ${path} is unreadable. Refusing to run.`);
  return ledger;
}

function loadEnvelope(): { path: string; envelope: ApprovalEnvelope } {
  const file = arg("file");
  if (!file) fail("--file=<path to the approval envelope> is required.");
  const path = resolve(file as string);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    fail(`Cannot read ${path}`);
  }
  const envelope = parseApproval(raw);
  if (!envelope) fail(`${path} is not a readable approval envelope of the current version.`);
  return { path, envelope };
}

// -----------------------------------------------------------------------------
// PROPOSE
// -----------------------------------------------------------------------------

async function propose() {
  const now = new Date();
  const parts = chicagoParts(now);
  const forced = arg("slot") as SlotId | undefined;
  const slot = forced ? SLOT_BY_ID.get(forced) : currentSlot(now);
  if (!slot) {
    fail(
      forced
        ? `Unknown slot "${forced}". Use morning, afternoon or evening.`
        : `${parts.time} America/Chicago is not a slot. Pass --slot= to choose one.`
    );
  }

  const ledger = readLedger();
  const engine = createCopyEngine({
    provider: arg("engine"),
    transcriptPath: arg("transcript") ? resolve(arg("transcript") as string) : undefined,
  });

  // Selection and subject dedupe, exactly as the unattended path runs them. A
  // proposal for a subject that is on cooldown would be a proposal that can
  // never be published.
  const candidates = candidatesFor(slot, EVENT_INDEX, parts.date);
  if (candidates.length === 0) fail(`Nothing in the ${slot.pool} pool clears the bar for ${parts.date}.`);

  let chosen: { candidate: (typeof candidates)[number]; angle: (typeof candidates)[number]["supportedAngles"][number]; platforms: Platform[] } | null = null;
  for (const candidate of candidates) {
    const perPlatform = new Map<Platform, string[]>();
    for (const platform of PLATFORMS) {
      const check = checkSubject(
        ledger,
        candidate.subjectId,
        candidate.supportedAngles,
        platform,
        candidate.deepLink,
        now,
        candidate.pool
      );
      if (check.ok) perPlatform.set(platform, check.availableAngles);
    }
    if (perPlatform.size === 0) continue;
    for (const angle of candidate.supportedAngles) {
      const platforms = PLATFORMS.filter((p) => perPlatform.get(p)?.includes(angle));
      if (platforms.length) {
        chosen = { candidate, angle, platforms };
        break;
      }
    }
    if (chosen) break;
  }
  if (!chosen) fail(`Every candidate in the ${slot.pool} pool is on cooldown or already used.`);

  const { candidate, angle } = chosen;

  console.log(`Generating ${slot.id} copy for ${candidate.label} (${angle}) …`);
  const generated = await engine.generate({
    facts: candidate.facts,
    slot,
    angle,
    avoidOpenings: recentOpenings(ledger, "x", 12),
  });

  const validation = {
    x: validatePost(generated.copy.x, "x", candidate.facts),
    linkedin: validatePost(generated.copy.linkedin, "linkedin", candidate.facts),
  } satisfies Record<Platform, ValidationResult>;

  // The wording check too, so a proposal that would be blocked as a near-repeat
  // is visible now rather than at publication.
  const wording = {
    x: checkWording(ledger, generated.copy.x, "x"),
    linkedin: checkWording(ledger, generated.copy.linkedin, "linkedin"),
  };

  const envelope = buildApproval({
    candidate,
    angle,
    slot: slot.id,
    copy: generated.copy,
    facts: candidate.facts,
    factsHash: hashFacts(candidate.facts),
    usage: generated.usage,
    validation,
    promptVersion: PROMPT_VERSION,
    now,
  });

  const out = resolve(arg("out") ?? `${DEFAULT_DIR}/${parts.date}-${slot.id}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, serializeApproval(envelope), "utf8");

  render(envelope, wording);
  console.log(`\nWritten to ${out}`);
  console.log(`\nNothing has been published and the ledger was not written.`);
  console.log(`Next: npm run social:show -- --file=${arg("out") ?? `${DEFAULT_DIR}/${parts.date}-${slot.id}.json`}`);
}

// -----------------------------------------------------------------------------
// SHOW
// -----------------------------------------------------------------------------

function show() {
  const { path, envelope } = loadEnvelope();
  const actual = recomputeDigest(envelope);

  render(envelope, null);

  console.log(`\nFile          : ${path}`);
  console.log(`Recorded digest: ${envelope.contentDigest}`);
  console.log(`Recomputed     : ${actual}`);
  if (actual !== envelope.contentDigest) {
    console.log(`\n✗ MODIFIED. This file has changed since it was written. Do not approve it.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Integrity      : intact`);

  if (envelope.approval) {
    console.log(
      `\nAlready approved by ${envelope.approval.approvedBy} at ${envelope.approval.approvedAtUtc} for ${envelope.approval.platforms.join(", ")}.`
    );
    return;
  }

  console.log(`\nThe full fact set every figure above came from:`);
  for (const p of envelope.facts.dataPoints) console.log(`  · ${p}`);
  if (envelope.facts.figures.length) {
    console.log(`  numbers permitted: ${envelope.facts.figures.join(", ")}`);
  }
  console.log(`  caveats:`);
  for (const n of envelope.facts.notes) console.log(`    - ${n}`);

  console.log(`\nIf every word of the above is correct, approve it with:`);
  console.log(
    `\n  npm run social:approve -- --file=${path} --by="Your Name" --digest=${actual} --platforms=x,linkedin\n`
  );
}

// -----------------------------------------------------------------------------
// APPROVE
// -----------------------------------------------------------------------------

function approve() {
  const { path, envelope } = loadEnvelope();
  const by = arg("by");
  const digest = arg("digest");
  const platforms = (arg("platforms") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as Platform[];

  if (!by) fail(`--by="Your Name" is required. An approval with no approver is not an approval.`);
  if (!digest) fail(`--digest=<value printed by social:show> is required.`);
  for (const p of platforms) {
    if (!PLATFORMS.includes(p)) fail(`Unknown platform "${p}". Use x, linkedin, or both.`);
  }

  const result = approveEnvelope(envelope, {
    approvedBy: by,
    platforms,
    note: arg("note"),
    confirmedDigest: digest,
    now: new Date(),
  });
  if (!result.ok) fail(result.reason);

  writeFileSync(path, serializeApproval(result.envelope), "utf8");
  console.log(`\n✓ Approved by ${by} for ${platforms.join(", ")}.`);
  console.log(`  ${path}`);
  console.log(
    `\n  Publishable for ${MAX_APPROVAL_AGE_HOURS}h from generation, on ${envelope.localDate} America/Chicago only.`
  );
  console.log(`\nStill nothing published. To publish this exact copy:`);
  console.log(`\n  npm run social:post -- --approved=${path} --live\n`);
  console.log(`That requires SOCIAL_POST_ENABLED=true as well, and re-runs every check.`);
}

// -----------------------------------------------------------------------------

function render(
  e: ApprovalEnvelope,
  wording: { x: { ok: boolean; maxSimilarity: number }; linkedin: { ok: boolean; maxSimilarity: number } } | null
) {
  const line = "─".repeat(72);
  console.log(`\n${line}`);
  console.log(`${e.localDate} · ${e.slot.toUpperCase()} · pool=${e.pool} · ${e.model}`);
  console.log(line);
  console.log(`Subject : ${e.subjectLabel}`);
  console.log(`Id      : ${e.subjectId}`);
  console.log(`Angle   : ${e.angle}`);
  console.log(`Score   : ${e.score}  (${e.scoreExplain})`);
  console.log(`Link    : ${e.deepLink}`);
  console.log(`Facts   : ${e.factsHash}`);

  for (const p of PLATFORMS) {
    const v = e.validationAtGeneration[p];
    console.log(`\n── ${p.toUpperCase()} — validator ${v?.ok ? "PASS" : "FAIL"}`);
    for (const f of v?.failures ?? []) console.log(`   ✗ ${f}`);
    if (wording) {
      console.log(
        `   wording: ${wording[p].ok ? "distinct" : "TOO SIMILAR"} (max ${wording[p].maxSimilarity.toFixed(2)})`
      );
    }
    console.log("");
    console.log(e.copy[p].split("\n").map((l) => `   │ ${l}`).join("\n"));
    console.log(`   └ ${e.copy[p].length} characters`);
  }

  console.log(
    `\nTokens: ${e.usage.inputTokens} in / ${e.usage.outputTokens} out · $${e.usage.costUsd.toFixed(4)}`
  );
}

async function main() {
  const verb = process.argv[2];
  switch (verb) {
    case "propose":
      return propose();
    case "show":
      return show();
    case "approve":
      return approve();
    default:
      fail(`Usage: social-approve.ts <propose|show|approve> [--flags]`);
  }
}

main().catch((err) => {
  if (process.exitCode !== 1) {
    console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
});
