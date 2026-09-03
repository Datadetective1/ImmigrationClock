// =============================================================================
// scripts/social-preview.ts — what the next windows would choose, and why
//
//   npm run social:preview
//   npm run social:preview -- --from=2026-09-02 --windows=6 \
//       --ledger=src/lib/generated/social-posted.json
//
// An EDITORIAL preview, not a dry run. social:simulate exercises the whole
// pipeline including the copy engine; this stops one step short and answers
// the question a person asks before trusting an unattended publisher:
//
//     "What is it about to post, why did that win, and what did it beat?"
//
// Per window it prints the cadence decision (which tiers may publish), the
// winner with its content type, shape options, reader value and share URL, the
// runners-up with the margin and the reason each lost, and what was blocked
// before ranking. No model is called; every decision shown is made by
// deterministic code. It writes nothing and publishes nothing.
// =============================================================================

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EVENT_INDEX } from "../src/lib/event-index";
import { candidatesFor } from "../src/lib/social/select";
import { explainSelection } from "../src/lib/social/run";
import { SLOTS, instantInWindow } from "../src/lib/social/slots";
import { decideCadence } from "../src/lib/social/cadence";
import { CATEGORY_LABEL } from "../src/lib/social/categories";
import { CONTENT_TYPE_LABEL } from "../src/lib/social/content-types";
import { bannedOpeningLines } from "../src/lib/social/dedupe";
import {
  EMPTY_POST_LEDGER,
  parsePostLedger,
  publishedPosts,
  type PostLedger,
  type PostRecord,
} from "../src/lib/social/ledger";
import type { Candidate } from "../src/lib/social/types";

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const ALTERNATIVES_SHOWN = 4;

function whyItLost(winner: Candidate, loser: Candidate, penaltyExplain: string): string {
  const parts: string[] = [];
  if (loser.tier !== winner.tier) parts.push(`tier "${loser.tier}" against "${winner.tier}"`);
  if (loser.category !== winner.category) {
    parts.push(`"${CATEGORY_LABEL[loser.category]}" sits below "${CATEGORY_LABEL[winner.category]}"`);
  }
  if (loser.readerValue.score < winner.readerValue.score) {
    parts.push(`reader value ${loser.readerValue.score}/100 against ${winner.readerValue.score}/100`);
  }
  if (penaltyExplain && penaltyExplain !== "no repetition penalty") parts.push(`repetition: ${penaltyExplain}`);
  return parts.length ? parts.join("; ") : "lower intrinsic score on the same footing";
}

function main() {
  const from = arg("from") ?? new Date().toISOString().slice(0, 10);
  const windowCount = Number(arg("windows", arg("slots", "3")));
  const jsonOut = arg("json");

  let ledger: PostLedger = EMPTY_POST_LEDGER;
  const ledgerPath = arg("ledger", "src/lib/generated/social-posted.json");
  if (ledgerPath) {
    let raw: string | null = null;
    try {
      raw = readFileSync(resolve(ledgerPath), "utf8");
    } catch {
      raw = null;
    }
    const parsed = parsePostLedger(raw);
    if (!parsed) throw new Error(`Ledger at ${ledgerPath} is unreadable — refusing to preview against unknown history.`);
    ledger = parsed;
  }

  const rule = "═".repeat(78);
  console.log(rule);
  console.log(`EDITORIAL PREVIEW — the next ${windowCount} publishing window${windowCount === 1 ? "" : "s"}`);
  console.log(rule);
  console.log(`Archive        : ${EVENT_INDEX.length} recorded changes`);
  console.log(`Ledger         : ${ledgerPath} — ${ledger.posts.length} row(s), ${publishedPosts(ledger).length} published`);
  const banned = bannedOpeningLines(ledger, ["x"]);
  console.log(`Opening frames : ${banned.length ? `${banned.length} refused` : "none over-used"}`);
  for (const line of banned) console.log(`                 ${line}`);
  console.log(`No model is called. Every decision below is made by deterministic code.\n`);

  const previews: unknown[] = [];
  let produced = 0;

  for (let d = 0; produced < windowCount && d < 14; d++) {
    const date = new Date(Date.parse(`${from}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

    for (const slot of SLOTS) {
      if (produced >= windowCount) break;
      const at = instantInWindow(date, slot);

      const cadence = decideCadence({ ledger, platform: "x", slot, localDate: date, now: at });
      const all = candidatesFor(EVENT_INDEX, date);
      const inTier = cadence.blocked ? [] : all.filter((c) => cadence.allowedTiers.includes(c.tier));
      const { chosen, ranked, rejections } = explainSelection(inTier, ledger, at, date, ["x"]);

      console.log(`\n${rule}`);
      console.log(`${date}  ${slot.hours[0]}:00–${slot.hours[1]}:59 CT   ${slot.id.toUpperCase().padEnd(9)} candidates=${all.length} in allowed tiers=${inTier.length}   → ${chosen ? "WOULD PUBLISH" : "SILENT"}`);
      console.log(rule);
      console.log(`CADENCE        : ${cadence.explain}`);

      if (!chosen) {
        console.log(
          `REASON         : ${
            cadence.blocked
              ? "the cadence policy blocked this window"
              : inTier.length === 0
                ? "nothing in a tier this window may publish"
                : "every candidate was inside a cooldown or repeated today's topic"
          }`
        );
        const byTier = tally(all.map((c) => c.tier));
        console.log(`BY TIER        : ${Object.entries(byTier).map(([t, n]) => `${t} ${n}`).join(" · ")}`);
        for (const r of rejections.slice(0, ALTERNATIVES_SHOWN)) console.log(`  · ${r.label.slice(0, 60)} — ${r.reason}`);
        previews.push({ date, slot: slot.id, decision: "SILENT", cadence: cadence.explain });
        produced++;
        continue;
      }

      const c = chosen.candidate;
      console.log(`SUBJECT        : ${c.label}`);
      console.log(`                 ${c.subjectId}`);
      console.log(`CONTENT TYPE   : ${CONTENT_TYPE_LABEL[c.contentType]} (${c.tier})`);
      console.log(`SHAPES OFFERED : ${c.structures.join(", ")}`);
      console.log(`READER VALUE   : ${c.readerValue.reason}`);
      console.log(`CATEGORY       : ${CATEGORY_LABEL[c.category]}`);
      console.log(`SHARE URL      : ${c.facts.shareUrl ?? c.facts.deepLink}`);
      console.log(`TIMING         : published ${c.facts.publishedAt ?? "—"} · effective ${c.facts.effectiveAt ?? "none recorded"} · ${c.facts.classification ?? "—"}`);
      console.log(`SCORE          : ${c.score.toFixed(1)} → ${chosen.rotation.adjustedScore.toFixed(1)} after rotation`);
      console.log(`                 ${c.scoreExplain}`);
      console.log(`                 rotation: ${chosen.rotation.explain}`);
      if (c.facts.implications?.length) {
        console.log(`IMPLICATIONS   :`);
        for (const i of c.facts.implications) console.log(`  · ${i}`);
      }

      const alternatives = ranked
        .filter((r) => r.candidate.subjectId !== c.subjectId && r.rotation.eligible)
        .slice(0, ALTERNATIVES_SHOWN);
      if (alternatives.length) {
        console.log(`\nREJECTED ALTERNATIVES — what this beat, and by how much`);
        for (const a of alternatives) {
          console.log(`  · ${a.candidate.label.slice(0, 64)} [${a.candidate.contentType}]`);
          console.log(`      lost by ${(chosen.rotation.adjustedScore - a.rotation.adjustedScore).toFixed(0)} — ${whyItLost(c, a.candidate, a.rotation.explain)}`);
        }
      }
      if (rejections.length) {
        console.log(`\nBLOCKED BEFORE RANKING:`);
        for (const b of rejections.slice(0, ALTERNATIVES_SHOWN)) console.log(`  · ${b.label.slice(0, 60)} — ${b.reason}`);
      }

      previews.push({
        date,
        slot: slot.id,
        decision: "WOULD PUBLISH",
        cadence: cadence.explain,
        subjectId: c.subjectId,
        contentType: c.contentType,
        tier: c.tier,
        structures: c.structures,
        shareUrl: c.facts.shareUrl,
        score: c.score,
        adjustedScore: chosen.rotation.adjustedScore,
      });
      produced++;

      // CARRY THE SELECTION FORWARD AS IF IT HAD PUBLISHED, so the later windows
      // see the cadence and cooldowns the real run would.
      ledger = { version: ledger.version, posts: [...ledger.posts, previewRecord(c, slot.id, chosen.angle, date, at)] };
    }
  }

  if (jsonOut) {
    mkdirSync(dirname(resolve(jsonOut)), { recursive: true });
    writeFileSync(resolve(jsonOut), `${JSON.stringify(previews, null, 2)}\n`, "utf8");
    console.log(`\nWrote preview detail → ${jsonOut}`);
  }
}

function previewRecord(c: Candidate, slot: PostRecord["slot"], angle: PostRecord["angle"], date: string, at: Date): PostRecord {
  return {
    localDate: date,
    localTime: `${String(at.getUTCHours()).padStart(2, "0")}:05`,
    runAtUtc: at.toISOString(),
    slot,
    pool: c.pool,
    platform: "x",
    decision: "POSTED",
    reason: "preview: assumed published",
    subjectId: c.subjectId,
    subjectLabel: c.label,
    angle,
    score: c.score,
    text: null,
    deepLink: c.deepLink,
    externalId: null,
    externalUrl: null,
    model: "preview",
    promptVersion: null,
    validatorVersion: null,
    factsHash: null,
    approvalId: null,
    approvedBy: null,
    topicKey: c.topicKey,
    topicFamily: c.topicFamily,
    category: c.category,
    readerValue: c.readerValue.score,
    readerValueExplain: c.readerValue.reason,
    treatment: c.treatment,
    contentType: c.contentType,
    tier: c.tier,
    structure: null,
    storyKey: c.storyKey,
    shareUrl: c.facts.shareUrl ?? null,
    cadenceExplain: null,
    adjustedScore: null,
    rotationExplain: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    attempts: null,
  };
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

try {
  main();
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
