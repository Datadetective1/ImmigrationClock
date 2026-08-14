// =============================================================================
// scripts/social-rotation-report.ts — seven days of SELECTION, no model calls
//
//   npm run social:rotation -- --from=2026-08-15 --days=7
//
// Runs the real selection stack — pools, scoring, angles, rotation penalties,
// same-day variety, cooldowns — across a simulated calendar, carrying the ledger
// forward exactly as the runner does. It stops short of the copy engine, so it
// costs nothing and needs no credentials.
//
// That is the point: rotation is a DETERMINISTIC question. Whether the feed
// repeats itself is decided before a single word is generated, and this report
// shows that decision — including, crucially, what was turned away and why.
// =============================================================================

import { EVENT_INDEX } from "../src/lib/event-index";
import { SLOTS } from "../src/lib/social/slots";
import { candidatesFor } from "../src/lib/social/select";
import { explainRotation } from "../src/lib/social/run";
import { describeVisual } from "../src/lib/social/visuals";
import {
  EMPTY_POST_LEDGER,
  appendRecords,
  type PostLedger,
  type PostRecord,
} from "../src/lib/social/ledger";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const FROM = arg("from", new Date().toISOString().slice(0, 10));
const DAYS = Number(arg("days", "7"));

let ledger: PostLedger = EMPTY_POST_LEDGER;
const chosenRows: {
  date: string;
  slot: string;
  subject: string;
  subjectId: string;
  family: string;
  angle: string;
  destination: string;
  visual: string;
  base: number;
  adjusted: number;
  why: string;
}[] = [];
const rejectedRows: { date: string; slot: string; label: string; family: string; reason: string }[] = [];
let skipped = 0;

for (let d = 0; d < DAYS; d++) {
  const date = new Date(Date.parse(`${FROM}T00:00:00Z`) + d * 86_400_000)
    .toISOString()
    .slice(0, 10);

  for (const slot of SLOTS) {
    const at = new Date(`${date}T${String(slot.hour + 5).padStart(2, "0")}:05:00Z`);
    const candidates = candidatesFor(slot, EVENT_INDEX, date);
    const { chosen, rejections } = explainRotation(candidates, ledger, at, date);

    for (const r of rejections.slice(0, 4)) {
      rejectedRows.push({
        date,
        slot: slot.id,
        label: r.label.slice(0, 54),
        family: r.topicFamily,
        reason: r.reason,
      });
    }

    if (!chosen) {
      skipped++;
      chosenRows.push({
        date,
        slot: slot.id,
        subject: "— SKIPPED (nothing survived the gates)",
        subjectId: "",
        family: "",
        angle: "",
        destination: "",
        visual: "",
        base: 0,
        adjusted: 0,
        why: `${candidates.length} candidate(s) considered`,
      });
      continue;
    }

    const { candidate, angle, rotation } = chosen;
    chosenRows.push({
      date,
      slot: slot.id,
      subject: candidate.label.slice(0, 62),
      subjectId: candidate.subjectId,
      family: candidate.topicFamily,
      angle,
      destination: candidate.deepLink,
      visual: candidate.visual ? candidate.visual.kind : "—",
      base: Math.round(candidate.score),
      adjusted: Math.round(rotation.adjustedScore),
      why: rotation.explain,
    });

    // Carry forward as POSTED so the next slot sees this one, exactly as the
    // live ledger would.
    const row: PostRecord = {
      localDate: date,
      localTime: `${slot.hour}:05`,
      runAtUtc: at.toISOString(),
      slot: slot.id,
      pool: slot.pool,
      platform: "x",
      decision: "POSTED",
      reason: "simulated selection",
      subjectId: candidate.subjectId,
      subjectLabel: candidate.label,
      angle,
      score: candidate.score,
      text: null,
      deepLink: candidate.deepLink,
      externalId: null,
      externalUrl: null,
      model: "selection-only",
      promptVersion: null,
      validatorVersion: null,
      factsHash: null,
      approvalId: null,
      approvedBy: null,
      topicKey: candidate.topicKey,
      topicFamily: candidate.topicFamily,
      adjustedScore: rotation.adjustedScore,
      rotationExplain: rotation.explain,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      attempts: null,
    };
    ledger = appendRecords(ledger, [row]);
  }
}

// -----------------------------------------------------------------------------

const rule = "═".repeat(112);
console.log(rule);
console.log(`SEVEN-DAY SELECTION — ${FROM}, ${DAYS} days, ${DAYS * 3} slots (deterministic; no model calls)`);
console.log(rule);

let lastDate = "";
for (const r of chosenRows) {
  if (r.date !== lastDate) {
    console.log(`\n── ${r.date}`);
    lastDate = r.date;
  }
  if (!r.subjectId) {
    console.log(`   ${r.slot.padEnd(10)} ${r.subject}  (${r.why})`);
    continue;
  }
  console.log(`   ${r.slot.padEnd(10)} ${r.subject}`);
  console.log(
    `   ${" ".repeat(10)} family=${r.family.padEnd(14)} angle=${r.angle.padEnd(22)} visual=${r.visual}`
  );
  console.log(`   ${" ".repeat(10)} → ${r.destination}`);
  console.log(
    `   ${" ".repeat(10)} score ${r.base} → ${r.adjusted}   [${r.why}]`
  );
}

console.log(`\n${rule}`);
console.log("REJECTED FOR REPETITION OR FATIGUE (first few per slot)");
console.log(rule);
for (const r of rejectedRows) {
  console.log(`${r.date} ${r.slot.padEnd(10)} ${r.label.padEnd(56)} ${r.family.padEnd(14)} ${r.reason}`);
}

console.log(`\n${rule}`);
console.log("SUMMARY");
console.log(rule);

const posted = chosenRows.filter((r) => r.subjectId);
const subjects = new Set(posted.map((r) => r.subjectId));
const families = posted.map((r) => r.family);
const familyCounts = families.reduce<Record<string, number>>((a, f) => ((a[f] = (a[f] ?? 0) + 1), a), {});
const destinations = new Set(posted.map((r) => r.destination));

console.log(`Slots evaluated        : ${DAYS * 3}`);
console.log(`Selected               : ${posted.length}`);
console.log(`Skipped                : ${skipped}`);
console.log(`Distinct subjects      : ${subjects.size} of ${posted.length}`);
console.log(`Distinct destinations  : ${destinations.size} of ${posted.length}`);
console.log(`Distinct families      : ${Object.keys(familyCounts).length}`);
console.log(`Rejected for fatigue   : ${rejectedRows.length}`);
console.log(`With a visual          : ${posted.filter((r) => r.visual !== "—").length} of ${posted.length}`);

console.log(`\nFamily spread:`);
for (const [f, n] of Object.entries(familyCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${f.padEnd(16)} ${"█".repeat(n)} ${n}`);
}

console.log(`\nDays whose three slots were all different families:`);
const byDate = new Map<string, string[]>();
for (const r of posted) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.family]);
for (const [date, fams] of byDate) {
  const distinct = new Set(fams).size;
  console.log(`  ${date}  ${distinct}/${fams.length} distinct  ${distinct === fams.length ? "✓" : "←"}  ${fams.join(", ")}`);
}

const repeats = [...subjects].filter(
  (s) => posted.filter((r) => r.subjectId === s).length > 1
);
console.log(`\nSubjects appearing more than once: ${repeats.length}`);
for (const s of repeats) {
  const days = posted.filter((r) => r.subjectId === s).map((r) => r.date);
  console.log(`  ${s} on ${days.join(", ")}`);
}
