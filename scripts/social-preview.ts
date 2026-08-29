// =============================================================================
// scripts/social-preview.ts — what the next slots would choose, and why
//
//   npm run social:preview
//   npm run social:preview -- --from=2026-08-30 --slots=3 \
//       --ledger=src/lib/generated/social-posted.json
//
// An EDITORIAL preview, not a dry run. social:simulate already exercises the
// whole pipeline including the copy engine; this deliberately stops one step
// short and answers the question a person actually asks before trusting an
// unattended publisher:
//
//     "What is it about to post, why did that win, and what did it beat?"
//
// So it prints, per slot: the subject, the reader-value score with the signals
// that produced it, the content category and the editorial treatment, the
// destination — and then the runners-up with the margin and the reason each one
// lost. No API key is needed and no model is called, because every one of those
// decisions is made by deterministic code before the engine is reached. That is
// the same property that makes the quality bar a cost control.
//
// It writes nothing and publishes nothing. There is no --live.
// =============================================================================

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EVENT_INDEX } from "../src/lib/event-index";
import { candidatesFor } from "../src/lib/social/select";
import { explainSelection } from "../src/lib/social/run";
import { SLOTS } from "../src/lib/social/slots";
import { CATEGORY_LABEL, type ContentCategory } from "../src/lib/social/categories";
import {
  TREATMENT_LABEL,
  TREATMENT_BRIEF,
  type EditorialTreatment,
} from "../src/lib/social/reader-value";
import { bannedOpeningLines } from "../src/lib/social/dedupe";
import {
  EMPTY_POST_LEDGER,
  parsePostLedger,
  publishedPosts,
  type PostLedger,
  type PostRecord,
} from "../src/lib/social/ledger";
import { xBudget } from "../src/lib/social/prompt";
import type { Candidate } from "../src/lib/social/types";

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

/** How many runners-up to explain. Enough to see the shape of the decision. */
const ALTERNATIVES_SHOWN = 4;

interface SlotPreview {
  localDate: string;
  slot: string;
  hour: number;
  pool: string;
  poolSize: number;
  decision: "WOULD PUBLISH" | "SILENT";
  reason: string;
  selected: {
    subjectId: string;
    label: string;
    category: string;
    categoryId: ContentCategory;
    treatment: string;
    treatmentId: EditorialTreatment;
    treatmentBrief: string;
    angle: string;
    topicKey: string;
    topicFamily: string;
    readerValue: number;
    readerValueReason: string;
    hooks: string[];
    score: number;
    adjustedScore: number;
    scoreExplain: string;
    rotationExplain: string;
    deepLink: string;
    effectiveAt: string | null;
    publishedAt: string | null;
    classification: string | null;
    proseBudget: { min: number; max: number; link: number };
  } | null;
  alternatives: {
    subjectId: string;
    label: string;
    category: string;
    readerValue: number;
    adjustedScore: number;
    lostBy: number;
    why: string;
  }[];
  blocked: { subjectId: string; label: string; reason: string }[];
}

/**
 * Why this candidate lost, in one sentence a person can check.
 *
 * Ordered by what actually decided it: a different category band is a decision
 * about KIND and dominates everything else, so it is named first; then reader
 * value, then the repetition penalties, then the residual.
 */
function whyItLost(winner: Candidate, loser: Candidate, penaltyExplain: string): string {
  const parts: string[] = [];

  if (loser.category !== winner.category) {
    parts.push(
      `"${CATEGORY_LABEL[loser.category]}" sits below ` +
        `"${CATEGORY_LABEL[winner.category]}" by a whole band`
    );
  }
  if (loser.readerValue.score < winner.readerValue.score) {
    parts.push(
      `reader value ${loser.readerValue.score}/100 against ${winner.readerValue.score}/100` +
        (loser.readerValue.lowValue.length
          ? ` (${loser.readerValue.lowValue.join(", ")})`
          : "")
    );
  }
  if (penaltyExplain && penaltyExplain !== "no repetition penalty") {
    parts.push(`repetition: ${penaltyExplain}`);
  }
  return parts.length ? parts.join("; ") : "lower intrinsic score on the same footing";
}

function main() {
  const from = arg("from") ?? new Date().toISOString().slice(0, 10);
  const slotCount = Number(arg("slots", "3"));
  const jsonOut = arg("json");

  let ledger: PostLedger = EMPTY_POST_LEDGER;
  const ledgerPath = arg("ledger", "src/lib/generated/social-posted.json");
  if (ledgerPath) {
    const parsed = parsePostLedger(readFileSync(resolve(ledgerPath), "utf8"));
    if (!parsed) {
      throw new Error(
        `Ledger at ${ledgerPath} is unreadable — refusing to preview against unknown history.`
      );
    }
    ledger = parsed;
  }

  const rule = "═".repeat(78);
  console.log(rule);
  console.log(`EDITORIAL PREVIEW — the next ${slotCount} publishing opportunit${slotCount === 1 ? "y" : "ies"}`);
  console.log(rule);
  console.log(`Archive        : ${EVENT_INDEX.length} recorded changes`);
  console.log(
    `Ledger         : ${ledgerPath} — ${ledger.posts.length} row(s), ${publishedPosts(ledger).length} published`
  );
  const banned = bannedOpeningLines(ledger, ["x", "linkedin"]);
  console.log(`Opening frames : ${banned.length ? `${banned.length} refused` : "none over-used"}`);
  for (const line of banned) console.log(`                 ${line}`);
  console.log(`No model is called. Every decision below is made by deterministic code.\n`);

  const previews: SlotPreview[] = [];

  // Walk forward slot by slot from `from`, carrying nothing forward: this is a
  // preview of what TODAY's data supports, not a simulation of a week.
  let produced = 0;
  for (let d = 0; produced < slotCount && d < 14; d++) {
    const date = new Date(Date.parse(`${from}T00:00:00Z`) + d * 86_400_000)
      .toISOString()
      .slice(0, 10);

    for (const slot of SLOTS) {
      if (produced >= slotCount) break;
      const at = new Date(`${date}T${String(slot.hour + 5).padStart(2, "0")}:05:00Z`);

      const candidates = candidatesFor(slot, EVENT_INDEX, date);
      const { chosen, ranked, rejections } = explainSelection(candidates, ledger, at, date);

      const preview: SlotPreview = {
        localDate: date,
        slot: slot.id,
        hour: slot.hour,
        pool: slot.pool,
        poolSize: candidates.length,
        decision: chosen ? "WOULD PUBLISH" : "SILENT",
        reason: chosen
          ? "a candidate cleared every editorial gate"
          : candidates.length === 0
            ? `nothing in the ${slot.pool} pool cleared the reader-value floor`
            : "every candidate was inside a cooldown or repeated today's topic",
        selected: null,
        alternatives: [],
        blocked: rejections.slice(0, ALTERNATIVES_SHOWN).map((r) => ({
          subjectId: r.subjectId,
          label: r.label,
          reason: r.reason,
        })),
      };

      if (chosen) {
        const c = chosen.candidate;
        const b = xBudget(c.facts);
        preview.selected = {
          subjectId: c.subjectId,
          label: c.label,
          category: CATEGORY_LABEL[c.category],
          categoryId: c.category,
          treatment: TREATMENT_LABEL[c.treatment],
          treatmentId: c.treatment,
          treatmentBrief: TREATMENT_BRIEF[c.treatment],
          angle: chosen.angle,
          topicKey: c.topicKey,
          topicFamily: c.topicFamily,
          readerValue: c.readerValue.score,
          readerValueReason: c.readerValue.reason,
          hooks: c.readerValue.hooks,
          score: c.score,
          adjustedScore: chosen.rotation.adjustedScore,
          scoreExplain: c.scoreExplain,
          rotationExplain: chosen.rotation.explain,
          deepLink: c.deepLink,
          effectiveAt: c.facts.effectiveAt,
          publishedAt: c.facts.publishedAt,
          classification: c.facts.classification,
          proseBudget: { min: b.proseMin, max: b.proseMax, link: b.linkChars },
        };

        preview.alternatives = ranked
          .filter((r) => r.candidate.subjectId !== c.subjectId && r.rotation.eligible)
          .slice(0, ALTERNATIVES_SHOWN)
          .map((r) => ({
            subjectId: r.candidate.subjectId,
            label: r.candidate.label,
            category: CATEGORY_LABEL[r.candidate.category],
            readerValue: r.candidate.readerValue.score,
            adjustedScore: r.rotation.adjustedScore,
            lostBy: chosen.rotation.adjustedScore - r.rotation.adjustedScore,
            why: whyItLost(c, r.candidate, r.rotation.explain),
          }));
      }

      previews.push(preview);
      produced++;

      // CARRY THE SELECTION FORWARD AS IF IT HAD PUBLISHED.
      //
      // Without this, all three slots preview against the same committed ledger
      // and can pick the same subject three times — which is not what would
      // happen, because the morning post would be in the ledger by 3pm and the
      // 7-day subject block and same-day topic variety would both fire.
      //
      // Everything downstream of selection is still real: this only supplies the
      // one fact a preview cannot know, which is that the earlier slot went out.
      // A slot the validator would have rejected is therefore shown as having
      // consumed its subject, which errs toward showing MORE variety than
      // production might deliver — the safe direction for a preview to be wrong.
      if (chosen) {
        ledger = {
          version: ledger.version,
          posts: [...ledger.posts, previewRecord(preview, at)],
        };
      }
    }
  }

  for (const p of previews) render(p);

  if (jsonOut) {
    mkdirSync(dirname(resolve(jsonOut)), { recursive: true });
    writeFileSync(resolve(jsonOut), `${JSON.stringify(previews, null, 2)}\n`, "utf8");
    console.log(`\nWrote preview detail → ${jsonOut}`);
  }
}

/**
 * A synthetic POSTED row for a slot this preview assumed would publish.
 *
 * Carries only the fields the dedupe and rotation layers read, because those are
 * the only reason it exists. It is never written to disk — `main()` holds it in
 * memory for the remaining slots and drops it.
 */
function previewRecord(p: SlotPreview, at: Date): PostRecord {
  const s = p.selected!;
  return {
    localDate: p.localDate,
    localTime: `${String(p.hour).padStart(2, "0")}:05`,
    runAtUtc: at.toISOString(),
    slot: p.slot as PostRecord["slot"],
    pool: p.pool as PostRecord["pool"],
    platform: "x",
    decision: "POSTED",
    reason: "preview: assumed published",
    subjectId: s.subjectId,
    subjectLabel: s.label,
    angle: s.angle as PostRecord["angle"],
    score: s.score,
    text: null,
    deepLink: s.deepLink,
    externalId: null,
    externalUrl: null,
    model: "preview",
    promptVersion: null,
    validatorVersion: null,
    factsHash: null,
    approvalId: null,
    approvedBy: null,
    topicKey: s.topicKey,
    topicFamily: s.topicFamily,
    category: s.categoryId,
    readerValue: s.readerValue,
    readerValueExplain: s.readerValueReason,
    treatment: s.treatmentId,
    adjustedScore: s.adjustedScore,
    rotationExplain: s.rotationExplain,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    attempts: null,
  };
}

function render(p: SlotPreview) {
  const rule = "─".repeat(78);
  console.log(`\n${"═".repeat(78)}`);
  console.log(
    `${p.localDate}  ${String(p.hour).padStart(2, "0")}:00 CT   ${p.slot.toUpperCase().padEnd(9)} ` +
      `pool=${p.pool}  candidates=${p.poolSize}   → ${p.decision}`
  );
  console.log("═".repeat(78));

  if (!p.selected) {
    console.log(`Reason         : ${p.reason}`);
    if (p.blocked.length) {
      console.log(`\nTurned away:`);
      for (const b of p.blocked) console.log(`  · ${b.label.slice(0, 60)}\n      ${b.reason}`);
    }
    return;
  }

  const s = p.selected;
  console.log(`SUBJECT        : ${s.label}`);
  console.log(`                 ${s.subjectId}`);
  console.log(`READER VALUE   : ${s.readerValueReason}`);
  console.log(`CATEGORY       : ${s.category}`);
  console.log(`TREATMENT      : ${s.treatment}`);
  console.log(`ANGLE          : ${s.angle}`);
  console.log(`DESTINATION    : ${s.deepLink}`);
  console.log(
    `TIMING         : published ${s.publishedAt ?? "—"} · effective ${s.effectiveAt ?? "none recorded"} · ${s.classification ?? "—"}`
  );
  console.log(`SCORE          : ${s.score} → ${s.adjustedScore} after rotation`);
  console.log(`                 ${s.scoreExplain}`);
  console.log(`                 rotation: ${s.rotationExplain}`);
  console.log(
    `X PROSE BUDGET : ${s.proseBudget.min}–${s.proseBudget.max} chars (link is ${s.proseBudget.link})`
  );

  console.log(`\nWHY A READER WOULD CARE — what the copy engine is pointed at:`);
  for (const h of s.hooks) console.log(`  · ${h}`);

  console.log(`\nTREATMENT BRIEF:`);
  console.log(`  ${s.treatmentBrief.replace(/\. /g, ".\n  ")}`);

  if (p.alternatives.length) {
    console.log(`\n${rule}`);
    console.log(`REJECTED ALTERNATIVES — what this beat, and by how much`);
    console.log(rule);
    for (const a of p.alternatives) {
      console.log(`  · ${a.label.slice(0, 68)}`);
      console.log(`      ${a.category} · reader value ${a.readerValue}/100 · lost by ${a.lostBy}`);
      console.log(`      ${a.why}`);
    }
  }

  if (p.blocked.length) {
    console.log(`\nBLOCKED BEFORE RANKING:`);
    for (const b of p.blocked) console.log(`  · ${b.label.slice(0, 60)} — ${b.reason}`);
  }
}

try {
  main();
} catch (err) {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
}
