// =============================================================================
// scripts/review-record.ts — the review sheet for one record
//
//   npm run review:record -- <record-id-or-short-id>
//
// WHY THIS EXISTS AS A COMMAND
// ----------------------------
// The review workflow was documented and had never been used, and the reason
// is visible the moment you try: reviewing a record meant opening a 32,000-line
// generated JSON file, finding the right object, and reading classification
// entries by eye. That is not a workflow, it is an invitation to skip the step.
//
// This prints everything a reviewer needs to make the four judgements that
// matter — dates, instrument type, classifications, limitations — with the
// evidence quote beside each claim, and then prints the exact command that
// records the decision.
//
// IT DECIDES NOTHING. It is read-only. The decision is made by a person and
// applied by review-set.ts, which is a separate command precisely so that
// looking at a record and approving it cannot be the same keystroke.
// =============================================================================

import { EVENTS } from "../src/lib/event-store";
import { shortHash } from "../src/lib/share";
import { isStrong } from "../src/domains/graph/classification";
import type { ImmigrationEvent } from "../src/domains/graph/events";

const ARG = process.argv[2];
if (!ARG) {
  console.error("usage: npm run review:record -- <record-id-or-short-id>");
  process.exit(1);
}

const ALL = EVENTS as unknown as ImmigrationEvent[];
const TODAY = new Date().toISOString().slice(0, 10);

const record =
  ALL.find((e) => e.id === ARG) ??
  ALL.find((e) => shortHash(e.id) === ARG) ??
  ALL.find((e) => e.id.endsWith(ARG));

if (!record) {
  console.error(`No record matches "${ARG}".`);
  console.error("Use the full record id, the six-character short id, or the trailing document number.");
  process.exit(1);
}

const rule = "─".repeat(78);
const wrap = (text: string, indent = 4): string => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + w).length > 74 - indent) {
      lines.push(line.trimEnd());
      line = "";
    }
    line += `${w} `;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.map((l) => `${" ".repeat(indent)}${l}`).join("\n");
};

console.log(rule);
console.log(`REVIEW SHEET · ${record.id}`);
console.log(rule);

console.log(`\nTITLE`);
console.log(wrap(record.title));
console.log(`\nSUMMARY`);
console.log(wrap(record.summary ?? "(none)"));

console.log(`\nWHAT THE RECORD CLAIMS`);
console.log(`  source          ${record.sourceKey}`);
console.log(`  instrument      ${record.classification}`);
console.log(`  severity        ${record.severity}   (editorial, ours, not the source's)`);
console.log(`  published       ${record.publishedAt}`);
console.log(
  `  effective       ${record.effectiveAt ?? "null — the document states none, and none was guessed"}`
);
console.log(`  data through    ${record.dataThrough ?? "(not a data release)"}`);
console.log(`  last verified   ${record.lastVerifiedAt ?? "(never)"}`);
console.log(`  review status   ${record.reviewStatus}`);

console.log(`\nCHECK 1 — DATES. Does the document state this effective date?`);
console.log(`  ${record.sourceUrl}`);
if (record.sourceDataUrl) console.log(`  ${record.sourceDataUrl}`);
if (record.classification === "proposed_rule" && record.effectiveAt) {
  console.log(`  ⚠ A proposed rule must not carry an effective date. This one does.`);
}

console.log(`\nCHECK 2 — INSTRUMENT. Is "${record.classification}" what this document is?`);
console.log(`  A proposal recorded as a final rule tells a reader they have an`);
console.log(`  obligation they do not have.`);

console.log(`\nCHECK 3 — CLASSIFICATIONS. For each, read the quote and ask:`);
console.log(`  is the document ABOUT this, or does it merely mention it?`);

const dimensions = ["visaCategories", "countries", "forms", "processes"] as const;
let anyClassification = false;
for (const dimension of dimensions) {
  const list = (record.impact as Record<string, unknown> | undefined)?.[dimension] as
    | { entityId: string; evidence?: string; method?: string; relation?: string; confidence: number }[]
    | undefined;
  if (!list?.length) continue;
  anyClassification = true;
  console.log(`\n  ${dimension}`);
  for (const c of list) {
    const strength = isStrong(c.method) ? "STRONG — shown by default" : "weak — hidden unless asked for";
    console.log(`    ${c.entityId}`);
    console.log(`      method    ${c.method ?? "(ungraded)"}  ${strength}`);
    if (c.relation) console.log(`      relation  ${c.relation}`);
    console.log(`      evidence:`);
    console.log(wrap(`"${c.evidence ?? "(none — this is a defect, report it)"}"`, 8));
  }
}
if (!anyClassification) {
  console.log(`\n  (none)  — an empty list here means the document names none in its own`);
  console.log(`           words, which is a legitimate answer, not a gap to fill.`);
}

console.log(`\nCHECK 4 — LIMITATIONS. Does the record say what it does NOT cover?`);
if ((record.limitations ?? []).length === 0) {
  console.log(`  (none recorded)`);
} else {
  for (const l of record.limitations ?? []) console.log(wrap(`• ${l}`));
}

console.log(`\n${rule}`);
console.log(`YOUR DECISION — run ONE of these. Nothing is recorded until you do.`);
console.log(rule);
console.log(`\n  Everything checks out:`);
console.log(`    npm run review:set -- ${record.id} --status approved --verified ${TODAY}`);
console.log(`\n  Something is wrong and should not be public while you work it out:`);
console.log(`    npm run review:set -- ${record.id} --status draft --note "what is wrong"`);
console.log(`\n  You looked and want to record that, without standing behind it:`);
console.log(`    npm run review:set -- ${record.id} --status auto --verified ${TODAY}`);
console.log(`\nApproving says a person read this record against its source and it`);
console.log(`describes the document correctly. It does not say the document has been`);
console.log(`interpreted, and it is not legal advice.\n`);
