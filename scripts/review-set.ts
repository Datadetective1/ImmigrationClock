// =============================================================================
// scripts/review-set.ts — record one human decision about one record
//
//   npm run review:set -- <record-id> --status approved --verified 2026-09-03
//   npm run review:set -- <record-id> --status draft --note "effective date wrong"
//   npm run review:set -- <record-id> --status auto --verified 2026-09-03
//
// WHY IT TAKES ONE RECORD AND NO WILDCARD
// ---------------------------------------
// Approving a record is a person saying they read it against its source and it
// describes the document correctly. That claim cannot be made in bulk, so this
// command cannot make it in bulk: there is no --all, no glob, no file of ids.
// A hundred approvals is a hundred readings, and if that is too slow then the
// honest answer is that a hundred records are unreviewed, which is what the
// scorecard already reports.
//
// It also refuses to approve a record that fails the store's own validation,
// because a human approval on top of malformed data is worse than no approval:
// it launders the defect.
//
// WHAT IT WRITES
//   reviewStatus    approved | draft | auto
//   lastVerifiedAt  the date given, which must be today or earlier
//   limitations     the note, appended, when one is given
//
// A NOTE ON REGENERATION. events.json is written by scripts/build-events.ts,
// which fetches from the government sources. A rebuild can overwrite a decision
// recorded here. Until review state lives outside the generated file, re-check
// approvals after any pipeline run — the command prints this reminder itself.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateEvent, type ImmigrationEvent } from "../src/domains/graph/events";

const PATH = resolve("src/lib/generated/events.json");
const TODAY = new Date().toISOString().slice(0, 10);

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? null) : null;
}

const id = process.argv[2];
const status = arg("status");
const verified = arg("verified");
const note = arg("note");

const VALID = ["approved", "draft", "auto"];

if (!id || id.startsWith("--")) {
  console.error("usage: npm run review:set -- <record-id> --status approved|draft|auto [--verified YYYY-MM-DD] [--note \"...\"]");
  process.exit(1);
}
if (!status || !VALID.includes(status)) {
  console.error(`--status must be one of: ${VALID.join(", ")}`);
  process.exit(1);
}
if (verified && !/^\d{4}-\d{2}-\d{2}$/.test(verified)) {
  console.error("--verified must be YYYY-MM-DD");
  process.exit(1);
}
if (verified && verified > TODAY) {
  console.error(`--verified is in the future (${verified}). A verification date says when someone actually looked.`);
  process.exit(1);
}
if (status === "draft" && !note) {
  console.error("--note is required with --status draft. A record held back without a stated reason is a mystery for the next person.");
  process.exit(1);
}

const file = JSON.parse(readFileSync(PATH, "utf8")) as {
  events: (ImmigrationEvent & Record<string, unknown>)[];
  [k: string]: unknown;
};

const record = file.events.find((e) => e.id === id);
if (!record) {
  console.error(`No record has id "${id}". Run: npm run review:queue`);
  process.exit(1);
}

const before = {
  reviewStatus: record.reviewStatus,
  lastVerifiedAt: record.lastVerifiedAt,
  limitations: [...(record.limitations ?? [])],
};

record.reviewStatus = status as ImmigrationEvent["reviewStatus"];
if (verified) record.lastVerifiedAt = verified;
if (note) {
  record.limitations = [...(record.limitations ?? []), `Review note (${verified ?? TODAY}): ${note}`];
}

// A human decision must not be recorded on top of data the store itself
// rejects. Approving malformed data launders the defect.
const errors = validateEvent(record as ImmigrationEvent);
if (errors.length > 0) {
  console.error(`\nRefusing to write. This record does not pass validation:`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(`\nFix the data first, then record the decision.`);
  process.exit(1);
}

writeFileSync(PATH, `${JSON.stringify(file, null, 2)}\n`);

console.log(`\n${record.id}`);
console.log(`  reviewStatus    ${before.reviewStatus} → ${record.reviewStatus}`);
if (verified) console.log(`  lastVerifiedAt  ${before.lastVerifiedAt ?? "(none)"} → ${record.lastVerifiedAt}`);
if (note) console.log(`  limitations     ${before.limitations.length} → ${record.limitations!.length} (note appended)`);
console.log(`\nWritten to ${PATH}.`);
if (status === "draft") {
  console.log(`This record is now hidden from the site, the API, the feed and the newsletter.`);
}
console.log(`\nRemember: a pipeline run (npm run prebuild) regenerates this file and can`);
console.log(`overwrite the decision. Re-check approvals after a refresh.\n`);
