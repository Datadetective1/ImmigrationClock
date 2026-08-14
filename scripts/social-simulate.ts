// =============================================================================
// scripts/social-simulate.ts — seven consecutive days, twenty-one slots
//
//   npm run social:simulate -- --from=2026-08-11 --days=7 \
//       --engine=transcript --transcript=fixtures/social-transcript.json
//
// Runs the REAL pipeline — the same selection, scoring, angle choice, dedupe,
// validator and ledger that production uses — over a simulated calendar, with
// the ledger carried forward from slot to slot so cooldowns behave exactly as
// they would in life.
//
// Nothing is published and no network call is made when the transcript engine is
// used. `--emit-requests` writes out every fact set the engine was asked about,
// which is how a transcript gets authored in the first place: run once, see what
// the selector actually chose, write copy for those subjects, run again.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EVENT_INDEX } from "../src/lib/event-index";
import { runSlot } from "../src/lib/social/run";
import { SLOTS } from "../src/lib/social/slots";
import { createCopyEngine } from "../src/lib/social/copy-engine";
import {
  EMPTY_POST_LEDGER,
  parsePostLedger,
  publishedPosts,
  type PostLedger,
} from "../src/lib/social/ledger";
import { similarity } from "../src/lib/social/dedupe";
import { rateFor } from "../src/lib/social/providers/openai";
import { DEFAULT_MODEL_BY_PROVIDER } from "../src/lib/social/copy-engine";
import type { CopyEngine, CopyRequest, EngineResult, SlotOutcome } from "../src/lib/social/types";

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

/**
 * PLAN ENGINE — mechanical placeholder copy, for discovering the slot sequence.
 *
 * Selection and cooldowns depend on what got published, and what gets published
 * depends on copy existing. That circularity makes the first pass useless: with
 * no copy, nothing publishes, no cooldown engages, and every day picks the same
 * subject.
 *
 * So this engine emits valid-but-obviously-placeholder copy assembled from the
 * fact set. Run once with it to learn which 21 subjects and angles the selector
 * actually reaches, write real copy for exactly those, then run again for real.
 * It is a planning tool and lives in this script rather than in src/ — it must
 * never be reachable from the production entry point.
 */
class PlanCopyEngine implements CopyEngine {
  readonly id = "plan:placeholder";

  async generate(req: CopyRequest): Promise<EngineResult> {
    const f = req.facts;
    // The validator's framing rules apply to placeholder copy too — that is the
    // point of them. Satisfying them here is what lets the plan pass reach the
    // same publish/skip decisions the real copy will.
    const kind = f.classification === "proposed_rule" ? "Proposed rule" : "Record";
    const title = f.title.length > 120 ? `${f.title.slice(0, 117)}...` : f.title;

    const x = `${kind}: ${title} — ${f.sourceName}. ${f.deepLink}`;

    const body = [
      `${kind}: ${title}`,
      "",
      f.summary,
      "",
      f.entities.length
        ? `Recorded against: ${f.entities.join(", ")}.`
        : `Published by ${f.sourceName}.`,
      `Tracked by ImmigrationClock from ${f.sourceName}, with the underlying document linked in full.`,
      "",
      f.deepLink,
    ].join("\n");

    // Pad to the LinkedIn floor with neutral, grounded filler rather than
    // letting a short placeholder fail for a reason the real copy will not.
    const padded =
      body.length >= 300
        ? body
        : body.replace(
            f.deepLink,
            `ImmigrationClock records changes like this one with their source, classification and date, so the original document is always one click away.\n\n${f.deepLink}`
          );

    return {
      copy: { x: x.slice(0, 275), linkedin: padded, deepLink: f.deepLink },
      usage: { model: this.id, inputTokens: 0, outputTokens: 0, costUsd: 0 },
    };
  }
}

/**
 * Wraps the real engine to capture every request.
 *
 * Recording on the way IN rather than on success means a slot whose copy does
 * not exist yet still tells you what it wanted — which is the whole point of the
 * first pass.
 */
class RecordingEngine implements CopyEngine {
  readonly id: string;
  readonly requests: { key: string; request: CopyRequest }[] = [];

  constructor(private readonly inner: CopyEngine) {
    this.id = inner.id;
  }

  async generate(req: CopyRequest): Promise<EngineResult> {
    this.requests.push({ key: `${req.facts.subjectId}::${req.angle}`, request: req });
    return this.inner.generate(req);
  }
}

async function main() {
  const from = arg("from") ?? new Date().toISOString().slice(0, 10);
  const days = Number(arg("days", "7"));
  const emitPath = arg("emit-requests");
  const outPath = arg("out");

  const provider = arg("engine", "transcript");
  const inner =
    provider === "plan"
      ? new PlanCopyEngine()
      : createCopyEngine({
          provider,
          transcriptPath: arg("transcript") ? resolve(arg("transcript") as string) : undefined,
        });
  const engine = new RecordingEngine(inner);

  // START FROM REAL HISTORY WHEN ASKED.
  //
  // An empty ledger makes a one-day preview lie in the most flattering
  // direction: every rotation penalty reads zero, because there is nothing to
  // have repeated. Production reads the committed ledger and therefore knows
  // that three subjects went out this week. `--ledger=` closes that gap, and the
  // simulator still WRITES nothing — it carries its copy forward in memory.
  let ledger: PostLedger = EMPTY_POST_LEDGER;
  const ledgerPath = arg("ledger");
  if (ledgerPath) {
    const raw = readFileSync(resolve(ledgerPath), "utf8");
    const parsed = parsePostLedger(raw);
    if (!parsed) {
      throw new Error(`Ledger at ${ledgerPath} is unreadable — refusing to simulate against unknown history.`);
    }
    ledger = parsed;
    console.log(
      `Starting from ${ledgerPath}: ${parsed.posts.length} row(s), ` +
        `${publishedPosts(parsed).length} published. Rotation will see this history.
`
    );
  }

  const outcomes: SlotOutcome[] = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(Date.parse(`${from}T00:00:00Z`) + d * 86_400_000)
      .toISOString()
      .slice(0, 10);

    for (const slot of SLOTS) {
      // Noon UTC + the slot's Chicago hour lands the instant inside the right
      // local day regardless of which offset is in force that week.
      const at = new Date(`${date}T${String(slot.hour + 5).padStart(2, "0")}:05:00Z`);

      const result = await runSlot({
        slot,
        events: EVENT_INDEX,
        ledger,
        engine,
        publishers: {},
        now: at,
        live: false,
      });

      // CARRY THE LEDGER FORWARD AS IF IT HAD PUBLISHED.
      //
      // The dedupe queries only count decision === "POSTED", which is correct in
      // production: a dry run must not consume a subject that a later live run
      // should still be able to use. But inside a simulation it would mean no
      // cooldown ever engages, every day picks the same top-scoring subject, and
      // the whole exercise proves nothing. So the carried ledger promotes
      // DRY_RUN to POSTED, while the outcome shown to the reader keeps saying
      // DRY_RUN — which is what actually happened.
      ledger = {
        version: result.ledger.version,
        posts: result.ledger.posts.map((p) =>
          p.decision === "DRY_RUN" ? { ...p, decision: "POSTED" as const } : p
        ),
      };
      outcomes.push(result.outcome);
    }
  }

  render(outcomes, ledger);

  if (emitPath) {
    mkdirSync(dirname(resolve(emitPath)), { recursive: true });
    writeFileSync(
      resolve(emitPath),
      `${JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          requests: engine.requests.map(({ key, request }) => ({
            key,
            slot: request.slot.id,
            angle: request.angle,
            facts: request.facts,
          })),
        },
        null,
        2
      )}\n`,
      "utf8"
    );
    console.log(`\nWrote ${engine.requests.length} copy request(s) → ${emitPath}`);
  }

  if (outPath) {
    mkdirSync(dirname(resolve(outPath)), { recursive: true });
    writeFileSync(resolve(outPath), `${JSON.stringify({ outcomes, ledger }, null, 2)}\n`, "utf8");
    console.log(`Wrote simulation detail → ${outPath}`);
  }
}

// -----------------------------------------------------------------------------

function render(outcomes: SlotOutcome[], ledger: PostLedger) {
  const rule = "═".repeat(78);

  for (const o of outcomes) {
    console.log(`\n${rule}`);
    console.log(
      `${o.localDate}  ${o.localTime} CT   ${o.slot.toUpperCase().padEnd(9)} pool=${o.pool}`
    );
    console.log(rule);

    console.log(`Candidate pool : ${o.poolSize} considered`);

    if (!o.subjectId) {
      const p = o.platforms[0];
      console.log(`Selected       : —`);
      console.log(`Decision       : ${p?.decision}`);
      console.log(`Reason         : ${p?.reason}`);
      continue;
    }

    console.log(`Selected       : ${o.subjectLabel}`);
    console.log(`Subject id     : ${o.subjectId}`);
    console.log(`Angle          : ${o.angle}`);
    console.log(`Score          : ${o.score}   [${o.scoreExplain}]`);
    console.log(`Destination    : ${o.deepLink}`);
    console.log(
      `Validator      : ${
        !o.validator
          ? "— (never ran)"
          : o.validator.ok
            ? "PASS"
            : `FAIL — ${o.validator.failures.join("; ")}`
      }`
    );
    console.log(
      `Dedupe         : ${o.dedupe ? `${o.dedupe.ok ? "distinct" : "BLOCKED"} (max sim ${o.dedupe.maxSimilarity.toFixed(2)})` : "n/a"}`
    );

    for (const p of o.platforms) {
      console.log(`\n  ${p.platform.toUpperCase()} → ${p.decision}`);
      if (p.decision !== "DRY_RUN" && p.decision !== "POSTED") {
        console.log(`  ${p.reason}`);
      }
      if (p.text) {
        console.log("");
        console.log(p.text.split("\n").map((l) => `    ${l}`).join("\n"));
        console.log(`    [${p.text.length} chars]`);
      }
    }
  }

  // ---- summary --------------------------------------------------------------
  console.log(`\n\n${rule}`);
  console.log("SUMMARY");
  console.log(rule);

  const slots = outcomes.length;
  const wouldPost = outcomes.filter((o) =>
    o.platforms.some((p) => p.decision === "DRY_RUN" || p.decision === "POSTED")
  );
  const skipped = outcomes.filter((o) => !wouldPost.includes(o));

  console.log(`Slots evaluated            : ${slots}`);
  console.log(`Slots that would publish   : ${wouldPost.length}`);
  console.log(`Slots skipped              : ${skipped.length}`);

  const byPool: Record<string, number> = {};
  for (const o of wouldPost) byPool[o.pool] = (byPool[o.pool] ?? 0) + 1;
  console.log(`\nBy pool:`);
  for (const [pool, n] of Object.entries(byPool)) console.log(`  ${pool.padEnd(10)} ${n}`);

  const skipReasons: Record<string, number> = {};
  for (const o of skipped) {
    const d = o.platforms[0]?.decision ?? "UNKNOWN";
    skipReasons[d] = (skipReasons[d] ?? 0) + 1;
  }
  console.log(`\nSkip reasons:`);
  for (const [reason, n] of Object.entries(skipReasons)) console.log(`  ${reason.padEnd(32)} ${n}`);

  // Repetition
  const subjects = wouldPost.map((o) => o.subjectId as string);
  const subjectCounts = tally(subjects);
  const repeatedSubjects = Object.entries(subjectCounts).filter(([, n]) => n > 1);

  const urls = wouldPost.map((o) => o.deepLink as string);
  const urlCounts = tally(urls);
  const repeatedUrls = Object.entries(urlCounts).filter(([, n]) => n > 1);

  console.log(`\nDistinct subjects          : ${Object.keys(subjectCounts).length} of ${subjects.length}`);
  console.log(`Subjects appearing twice+  : ${repeatedSubjects.length}`);
  for (const [s, n] of repeatedSubjects) console.log(`  ${s} × ${n}`);
  console.log(`Distinct destinations      : ${Object.keys(urlCounts).length} of ${urls.length}`);
  console.log(`Destinations reused        : ${repeatedUrls.length}`);
  for (const [u, n] of repeatedUrls) console.log(`  ${u} × ${n}`);

  const validationFailures = outcomes.filter((o) => o.validator && !o.validator.ok);
  console.log(`\nValidation failures        : ${validationFailures.length}`);
  for (const v of validationFailures) {
    console.log(`  ${v.localDate} ${v.slot}: ${v.validator?.failures.join("; ")}`);
  }

  // Wording similarity across everything that would ship, per platform.
  for (const platform of ["x", "linkedin"] as const) {
    const texts = wouldPost
      .map((o) => o.platforms.find((p) => p.platform === platform)?.text)
      .filter((t): t is string => Boolean(t));
    let max = 0;
    let sum = 0;
    let pairs = 0;
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const s = similarity(texts[i], texts[j]);
        max = Math.max(max, s);
        sum += s;
        pairs++;
      }
    }
    console.log(
      `\n${platform.toUpperCase()} wording: ${texts.length} posts · mean pairwise similarity ${
        pairs ? (sum / pairs).toFixed(3) : "n/a"
      } · max ${max.toFixed(3)}`
    );
  }

  const cost = ledger.posts.reduce((acc, p) => acc + (p.costUsd ?? 0), 0);
  const inTok = ledger.posts.reduce((acc, p) => acc + (p.inputTokens ?? 0), 0) / 2;
  const outTok = ledger.posts.reduce((acc, p) => acc + (p.outputTokens ?? 0), 0) / 2;
  const calls = new Set(
    publishedPosts(ledger).concat(ledger.posts.filter((p) => p.decision === "DRY_RUN"))
      .map((p) => `${p.localDate}::${p.slot}`)
  ).size;

  console.log(`\nEngine calls               : ${calls}`);
  console.log(`Tokens (est.)              : ${Math.round(inTok)} in / ${Math.round(outTok)} out`);
  // Price at the model that ACTUALLY answered, not at a hardcoded rate. The
  // line said "Opus 5 rates" for several runs after the provider moved to
  // OpenAI, which is the kind of stale label that gets read as a fact.
  const answered = ledger.posts.find((p) => p.model && !p.model.startsWith("transcript:"))?.model;
  const priced = answered ?? process.env.SOCIAL_MODEL ?? DEFAULT_MODEL_BY_PROVIDER.openai;
  const rate = rateFor(priced);
  const week = (inTok / 1_000_000) * rate.input + (outTok / 1_000_000) * rate.output;

  console.log(
    `Cost at ${priced} rates`.padEnd(27) +
      `: $${week.toFixed(4)} for this week ($${rate.input}/$${rate.output} per M in/out)`
  );
  console.log(`Projected monthly          : $${(week * (30 / 7)).toFixed(2)}`);
  console.log(`Ledger rows written        : ${ledger.posts.length}`);
  if (cost === 0) {
    console.log(
      `\n(Cost above is computed from ESTIMATED token counts — this run used the\n transcript engine and made no API calls.)`
    );
  }
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
