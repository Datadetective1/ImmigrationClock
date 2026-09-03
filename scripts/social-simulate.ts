// =============================================================================
// scripts/social-simulate.ts — days of windows, the real pipeline, no network
//
//   npm run social:simulate -- --from=2026-09-02 --days=7 --engine=stub
//   npm run social:simulate -- --from=2026-09-02 --days=7 --engine=openai --ledger=src/lib/generated/social-posted.json
//   npm run social:simulate -- --days=3 --engine=transcript --transcript=fixtures/social-transcript.json
//
// Runs the REAL pipeline — selection, cadence, queue, rotation, dedupe,
// validator and ledger — over a simulated calendar, three windows a day, with
// the ledger and the queue carried forward from window to window so cooldowns
// and the cadence policy behave exactly as they would in life.
//
// Nothing is published: runSlot() is called with `publishers: {}` and
// `live: false`, so there is no client to publish through whatever the
// environment says. With `--engine=stub` no network call is made either.
//
// THE STUB ENGINE
// ---------------
// Writes copy from the fact set in the shape it is offered, choosing the shape
// the account used least recently. It is a planning tool for exercising the
// deterministic layers — cadence, variety, the queue — on a machine with no
// API key. It is not the voice, it lives in this script rather than in src/,
// and it can never be reached from the production entry point.
// =============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { EVENT_INDEX } from "../src/lib/event-index";
import { runSlot } from "../src/lib/social/run";
import { SLOTS, instantInWindow } from "../src/lib/social/slots";
import { createCopyEngine } from "../src/lib/social/copy-engine";
import {
  EMPTY_POST_LEDGER,
  parsePostLedger,
  publishedPosts,
  spendBySlot,
  type PostLedger,
} from "../src/lib/social/ledger";
import { EMPTY_QUEUE, summarizeQueue, type EditorialQueue } from "../src/lib/social/queue";
import { openingConstruction, similarity } from "../src/lib/social/dedupe";
import { StubCopyEngine } from "../src/lib/social/providers/stub";
import type { CopyEngine, CopyRequest, EngineResult, SlotOutcome } from "../src/lib/social/types";
import type { IndexedEvent } from "../src/lib/event-index";

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

/** Wraps the real engine to capture every request. */
class RecordingEngine implements CopyEngine {
  readonly id: string;
  readonly requests: { key: string; request: CopyRequest }[] = [];
  constructor(private readonly inner: CopyEngine) {
    this.id = inner.id;
  }
  async generate(req: CopyRequest): Promise<EngineResult> {
    this.requests.push({ key: `${req.facts.subjectId}::${req.contentType ?? req.angle}`, request: req });
    return this.inner.generate(req);
  }
}

async function main() {
  const from = arg("from") ?? new Date().toISOString().slice(0, 10);
  const days = Number(arg("days", "7"));
  const emitPath = arg("emit-requests");
  const outPath = arg("out");
  const firingsPerWindow = Number(arg("firings", "1"));
  // X only, by default: that is what production publishes to. Passing both
  // platforms would let LinkedIn's empty history make subjects eligible that X
  // cannot post, which is the ghost the live path no longer has.
  const platforms = (arg("platforms", "x") as string).split(",").map((p) => p.trim()) as ("x" | "linkedin")[];

  const provider = arg("engine", "stub");
  const inner =
    provider === "stub"
      ? new StubCopyEngine()
      : createCopyEngine({
          provider,
          transcriptPath: arg("transcript") ? resolve(arg("transcript") as string) : undefined,
        });
  const engine = new RecordingEngine(inner);

  let events: IndexedEvent[] = EVENT_INDEX;
  const eventsPath = arg("events");
  if (eventsPath) {
    const parsed = JSON.parse(readFileSync(resolve(eventsPath), "utf8")) as { events: IndexedEvent[] } | IndexedEvent[];
    events = Array.isArray(parsed) ? parsed : parsed.events;
    console.log(`Archive from ${eventsPath}: ${events.length} event(s).\n`);
  }

  // START FROM REAL HISTORY WHEN ASKED. An empty ledger makes a preview lie in
  // the most flattering direction: every rotation penalty reads zero.
  let ledger: PostLedger = EMPTY_POST_LEDGER;
  const ledgerPath = arg("ledger");
  if (ledgerPath) {
    const parsed = parsePostLedger(readFileSync(resolve(ledgerPath), "utf8"));
    if (!parsed) throw new Error(`Ledger at ${ledgerPath} is unreadable — refusing to simulate against unknown history.`);
    ledger = parsed;
    console.log(
      `Starting from ${ledgerPath}: ${parsed.posts.length} row(s), ${publishedPosts(parsed).length} published. Rotation and cadence will see this history.\n`
    );
  }
  let queue: EditorialQueue = EMPTY_QUEUE;

  const outcomes: SlotOutcome[] = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(Date.parse(`${from}T00:00:00Z`) + d * 86_400_000).toISOString().slice(0, 10);

    for (const slot of SLOTS) {
      for (let firing = 0; firing < firingsPerWindow; firing++) {
        // Later firings land later in the window, the way a delayed cron does:
        // one an hour, then the last hour repeating, minutes staggered.
        const at = instantInWindow(date, slot, 5 + ((firing * 17) % 50), firing);

        const result = await runSlot({ slot, events, ledger, engine, publishers: {}, now: at, live: false, queue, platforms });

        // CARRY THE LEDGER FORWARD AS IF IT HAD PUBLISHED. The dedupe queries
        // count only POSTED, which is right in production and would make a
        // simulation prove nothing — so the carried ledger promotes DRY_RUN to
        // POSTED, while the outcome shown to the reader keeps saying DRY_RUN.
        ledger = {
          version: result.ledger.version,
          posts: result.ledger.posts.map((p) => (p.decision === "DRY_RUN" ? { ...p, decision: "POSTED" as const } : p)),
        };
        queue = result.queue;
        outcomes.push(result.outcome);
      }
    }
  }

  render(outcomes, ledger, queue);

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
            contentType: request.contentType,
            structures: request.structures,
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
    writeFileSync(resolve(outPath), `${JSON.stringify({ outcomes, ledger, queue }, null, 2)}\n`, "utf8");
    console.log(`Wrote simulation detail → ${outPath}`);
  }
}

// -----------------------------------------------------------------------------

function render(outcomes: SlotOutcome[], ledger: PostLedger, queue: EditorialQueue) {
  const rule = "═".repeat(78);

  for (const o of outcomes) {
    console.log(`\n${rule}`);
    console.log(`${o.localDate}  ${o.localTime} CT   ${o.slot.toUpperCase().padEnd(9)}`);
    console.log(rule);
    if (o.cadenceExplain) console.log(`Cadence        : ${o.cadenceExplain}`);
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
    console.log(`Content type   : ${o.contentType} (${o.tier})`);
    console.log(`Shape          : ${o.structure ?? "unspecified"}`);
    console.log(`Reader value   : ${o.readerValueExplain ?? "—"}`);
    console.log(`Category       : ${o.category ?? "—"}`);
    console.log(`Score          : ${o.score}   [${o.scoreExplain}]`);
    console.log(`Share URL      : ${o.shareUrl}`);
    console.log(
      `Validator      : ${!o.validator ? "— (never ran)" : o.validator.ok ? "PASS" : `FAIL — ${o.validator.failures.join("; ")}`}`
    );
    console.log(
      `Dedupe         : ${o.dedupe ? `${o.dedupe.ok ? "distinct" : "BLOCKED"} (max sim ${o.dedupe.maxSimilarity.toFixed(2)})` : "n/a"}`
    );

    for (const p of o.platforms) {
      console.log(`\n  ${p.platform.toUpperCase()} → ${p.decision}`);
      if (p.decision !== "DRY_RUN" && p.decision !== "POSTED") console.log(`  ${p.reason}`);
      if (p.text) {
        console.log("");
        console.log(p.text.split("\n").map((l) => `    ${l}`).join("\n"));
        console.log(`    [${p.text.length} chars]`);
      }
    }
  }

  // ---- THE FEED, AS A READER WOULD SEE IT ------------------------------------
  const wouldPost = outcomes.filter((o) => o.platforms.some((p) => p.decision === "DRY_RUN" || p.decision === "POSTED"));
  console.log(`\n\n${rule}`);
  console.log("THE FEED — every X post in order, as a reader would scroll it");
  console.log(rule);
  for (const o of wouldPost) {
    const x = o.platforms.find((p) => p.platform === "x")?.text;
    if (!x) continue;
    console.log(`\n[${o.localDate} ${o.slot} · ${o.contentType} · ${o.structure ?? "?"}]`);
    console.log(x.split("\n").map((l) => `  ${l}`).join("\n"));
  }

  // ---- summary --------------------------------------------------------------
  console.log(`\n\n${rule}`);
  console.log("SUMMARY");
  console.log(rule);

  const skipped = outcomes.filter((o) => !wouldPost.includes(o));
  const daysSeen = new Set(outcomes.map((o) => o.localDate)).size || 1;

  console.log(`Windows evaluated          : ${outcomes.length} over ${daysSeen} day(s)`);
  console.log(`Windows that would publish : ${wouldPost.length}  (${(wouldPost.length / daysSeen).toFixed(2)} posts/day)`);
  console.log(`Windows skipped            : ${skipped.length}`);

  const perDay = tally(wouldPost.map((o) => o.localDate));
  const quietDays = daysSeen - Object.keys(perDay).length;
  console.log(`Days with 0 / 1 / 2 / 3 posts: ${quietDays} / ${count(perDay, 1)} / ${count(perDay, 2)} / ${count(perDay, 3)}`);

  console.log(`\nBy content type:`);
  for (const [t, n] of Object.entries(tally(wouldPost.map((o) => o.contentType ?? "—"))).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(18)} ${n}`);
  }

  console.log(`\nBy shape:`);
  for (const [t, n] of Object.entries(tally(wouldPost.map((o) => o.structure ?? "—"))).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(18)} ${n}`);
  }

  const openings = tally(
    wouldPost.map((o) => openingConstruction(o.platforms.find((p) => p.platform === "x")?.text ?? ""))
  );
  const repeatedOpenings = Object.entries(openings).filter(([k, n]) => k && n > 1);
  console.log(`\nDistinct opening constructions: ${Object.keys(openings).length} of ${wouldPost.length}`);
  for (const [k, n] of repeatedOpenings) console.log(`  "${k}…" × ${n}`);

  const skipReasons: Record<string, number> = {};
  for (const o of skipped) {
    const d = o.platforms[0]?.decision ?? "UNKNOWN";
    skipReasons[d] = (skipReasons[d] ?? 0) + 1;
  }
  console.log(`\nSkip reasons:`);
  for (const [reason, n] of Object.entries(skipReasons)) console.log(`  ${reason.padEnd(32)} ${n}`);

  const subjects = wouldPost.map((o) => o.subjectId as string);
  const subjectCounts = tally(subjects);
  const repeatedSubjects = Object.entries(subjectCounts).filter(([, n]) => n > 1);
  console.log(`\nDistinct subjects          : ${Object.keys(subjectCounts).length} of ${subjects.length}`);
  for (const [s, n] of repeatedSubjects) console.log(`  ${s} × ${n}`);

  const urls = wouldPost.map((o) => o.deepLink as string);
  const urlCounts = tally(urls);
  console.log(`Distinct destinations      : ${Object.keys(urlCounts).length} of ${urls.length}`);

  for (const platform of ["x", "linkedin"] as const) {
    const texts = wouldPost.map((o) => o.platforms.find((p) => p.platform === platform)?.text).filter((t): t is string => Boolean(t));
    let max = 0, sum = 0, pairs = 0;
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const s = similarity(texts[i], texts[j]);
        max = Math.max(max, s);
        sum += s;
        pairs++;
      }
    }
    console.log(
      `\n${platform.toUpperCase()} wording: ${texts.length} posts · mean pairwise similarity ${pairs ? (sum / pairs).toFixed(3) : "n/a"} · max ${max.toFixed(3)}`
    );
  }

  const q = summarizeQueue(queue);
  console.log(`\nQueue at the end: ${queue.items.length} item(s) — ready ${q.ready}, scheduled ${q.scheduled}, verified ${q.verified}, published ${q.published}, rejected ${q.rejected}, superseded ${q.superseded}`);

  const spend = spendBySlot(ledger);
  const apiCalls = spend.reduce((n, s) => n + s.apiCalls, 0);
  const cost = spend.reduce((n, s) => n + s.costUsd, 0);
  console.log(`API calls: ${apiCalls} · recorded cost $${cost.toFixed(4)} (zero for the stub and transcript engines)`);
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) out[v] = (out[v] ?? 0) + 1;
  return out;
}

function count(perDay: Record<string, number>, n: number): number {
  return Object.values(perDay).filter((v) => v === n).length;
}

main().catch((err) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
