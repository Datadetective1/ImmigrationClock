// =============================================================================
// USAGE INSTRUMENTATION
//
// The bug this exists to prevent already happened twice, in two directions:
//
//   • The runner overwrote `usage` on every attempt, so a slot that regenerated
//     was billed twice and reported once. Spend you cannot see is spend you
//     cannot control.
//   • The "engine calls" metric counted distinct localDate::slot — SLOTS, not
//     API requests — and was therefore blind to retries by construction.
//
// So the properties pinned here are about arithmetic honesty rather than
// features: every attempt survives, retries are visible, subsets are not
// double-counted, and a two-platform slot does not report twice the spend.
// =============================================================================

import { describe, it, expect } from "vitest";
import { runSlot } from "@/lib/social/run";
import { spendBySlot } from "@/lib/social/ledger";
import { EngineConfigurationError } from "@/lib/social/providers/openai";
import { SLOT_BY_ID } from "@/lib/social/slots";
import { EMPTY_POST_LEDGER } from "@/lib/social/ledger";
import type { CopyEngine, CopyRequest, EngineResult, EngineUsage } from "@/lib/social/types";
import type { IndexedEvent } from "@/lib/event-index";

const NOW = new Date("2026-08-14T14:05:00.000Z"); // 09:05 America/Chicago
const LINK = "https://immigrationclock.com/what-changed?q=public%20charge%20ground%20inadmissibility";

const EVENTS: IndexedEvent[] = [
  {
    id: "federal_register:x1",
    title: "Public Charge Ground of Inadmissibility",
    publishedAt: "2026-08-13",
    effectiveAt: "2026-09-18",
    scheduled: false,
    severity: "major",
    classification: "final_rule",
    sourceKey: "federal_register",
    sourceUrl: "https://www.federalregister.gov/documents/x1",
    summary:
      "DHS is amending the fee and eligibility requirements that apply to all benefit requests, changing filing requirements for every applicant and petitioner.",
    entityIds: ["agency:dhs", "topic:policy-changes"],
  } as unknown as IndexedEvent,
];

function usage(over: Partial<EngineUsage> = {}): EngineUsage {
  return {
    model: "gpt-5-2026-01-01",
    inputTokens: 2300,
    cachedInputTokens: 1100,
    outputTokens: 5000,
    reasoningTokens: 4700,
    totalTokens: 7300,
    costUsd: 0.0529,
    ...over,
  };
}

/** Copy that passes the validator, so the first attempt succeeds. */
const good = (req: CopyRequest) => ({
  x: `DHS is amending the fee requirements for benefit requests. The change takes effect on 2026-09-18. ${req.facts.deepLink}`,
  linkedin: [
    "DHS is amending the fee and eligibility requirements that apply to benefit requests, and the change takes effect on 2026-09-18.",
    "",
    "Until that date the existing requirements are the ones in force, which is the distinction that usually gets lost when a rule is reported on the day it publishes.",
    "",
    "It reaches every applicant and petitioner filing a covered benefit request.",
    "",
    req.facts.deepLink,
  ].join("\n"),
  deepLink: req.facts.deepLink,
});

/** Copy the validator rejects — an invented figure — forcing a regeneration. */
const bad = (req: CopyRequest) => ({
  ...good(req),
  x: `DHS is amending fee requirements across 8,412 categories of benefit request. ${req.facts.deepLink}`,
});

class ScriptedEngine implements CopyEngine {
  readonly id = "openai:gpt-5";
  calls = 0;
  constructor(
    private readonly script: ((req: CopyRequest) => ReturnType<typeof good>)[],
    private readonly usages: EngineUsage[]
  ) {}
  async generate(req: CopyRequest): Promise<EngineResult> {
    const i = this.calls++;
    return { copy: this.script[i](req), usage: this.usages[i] };
  }
}

const run = (engine: CopyEngine) =>
  runSlot({
    slot: SLOT_BY_ID.get("morning")!,
    events: EVENTS,
    ledger: EMPTY_POST_LEDGER,
    engine,
    publishers: {},
    now: NOW,
    live: false,
  });

// -----------------------------------------------------------------------------

describe("one attempt", () => {
  it("records the full usage detail the provider reported", async () => {
    const engine = new ScriptedEngine([good], [usage()]);
    const r = await run(engine);

    expect(r.outcome.attempts).toHaveLength(1);
    const a = r.outcome.attempts[0];
    expect(a.slot).toBe("morning");
    expect(a.attempt).toBe(1);
    expect(a.model).toBe("gpt-5-2026-01-01");
    expect(a.ok).toBe(true);
    expect(a.inputTokens).toBe(2300);
    expect(a.cachedInputTokens).toBe(1100);
    expect(a.outputTokens).toBe(5000);
    expect(a.reasoningTokens).toBe(4700);
    expect(a.totalTokens).toBe(7300);
    expect(a.costUsd).toBeCloseTo(0.0529, 4);
    expect(a.validation).toBe("pass");
    expect(a.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("puts the attempts on every ledger row for the slot", async () => {
    const r = await run(new ScriptedEngine([good], [usage()]));
    for (const row of r.records) {
      expect(row.attempts).toHaveLength(1);
    }
  });
});

describe("a retry is billed, and must be visible", () => {
  it("keeps BOTH attempts rather than overwriting", async () => {
    // The exact regression: the runner used to do `usage = generated.usage`, so
    // the rejected first call vanished from the record while still being billed.
    const engine = new ScriptedEngine(
      [bad, good],
      [usage({ outputTokens: 6000, reasoningTokens: 5800, costUsd: 0.0629 }), usage()]
    );
    const r = await run(engine);

    expect(engine.calls).toBe(2);
    expect(r.outcome.attempts).toHaveLength(2);
    expect(r.outcome.attempts[0].attempt).toBe(1);
    expect(r.outcome.attempts[1].attempt).toBe(2);
  });

  it("records WHY the first attempt was rejected", async () => {
    const r = await run(
      new ScriptedEngine([bad, good], [usage(), usage()])
    );
    expect(r.outcome.attempts[0].ok).toBe(false);
    expect(r.outcome.attempts[0].validation).toMatch(/8412/);
    expect(r.outcome.attempts[1].ok).toBe(true);
    expect(r.outcome.attempts[1].validation).toBe("pass");
  });

  it("counts the discarded attempt's spend in the slot total", async () => {
    const r = await run(
      new ScriptedEngine([bad, good], [usage({ costUsd: 0.06 }), usage({ costUsd: 0.05 })])
    );
    const [spend] = spendBySlot(r.ledger);
    expect(spend.apiCalls).toBe(2);
    expect(spend.retries).toBe(1);
    expect(spend.costUsd).toBeCloseTo(0.11, 4);
    // The per-post column still shows the WINNING attempt, which is correct —
    // it describes what published. The slot total is what it cost to get there.
    expect(r.records[0].costUsd).toBeCloseTo(0.05, 4);
  });

  it("sums tokens across attempts, not just the winner", async () => {
    const r = await run(
      new ScriptedEngine(
        [bad, good],
        [usage({ inputTokens: 2300, outputTokens: 6000, reasoningTokens: 5800, cachedInputTokens: 0 }), usage()]
      )
    );
    const [spend] = spendBySlot(r.ledger);
    expect(spend.inputTokens).toBe(4600);
    expect(spend.outputTokens).toBe(11000);
    expect(spend.reasoningTokens).toBe(10500);
    expect(spend.cachedInputTokens).toBe(1100);
  });
});

describe("a failed call is still a call", () => {
  it("records an exhausted token budget with the tokens it burned", async () => {
    const engine: CopyEngine = {
      id: "openai:gpt-5",
      async generate() {
        throw new EngineConfigurationError(
          "OpenAI response was incomplete (max_output_tokens)",
          usage({ outputTokens: 12000, reasoningTokens: 12000, costUsd: 0.1229 })
        );
      },
    };
    const r = await run(engine);

    expect(r.outcome.attempts).toHaveLength(1);
    const a = r.outcome.attempts[0];
    expect(a.ok).toBe(false);
    expect(a.validation).toBeNull();
    expect(a.error).toMatch(/max_output_tokens/);
    // The whole point: the call was billed, so its cost is not lost.
    expect(a.costUsd).toBeCloseTo(0.1229, 4);
    expect(a.reasoningTokens).toBe(12000);
    expect(spendBySlot(r.ledger)[0].costUsd).toBeCloseTo(0.1229, 4);
  });

  it("records a transport failure as zero spend, not as invented spend", async () => {
    const engine: CopyEngine = {
      id: "openai:gpt-5",
      async generate() {
        throw new Error("getaddrinfo ENOTFOUND api.openai.com");
      },
    };
    const r = await run(engine);
    const a = r.outcome.attempts[0];
    expect(a.ok).toBe(false);
    expect(a.costUsd).toBe(0);
    expect(a.inputTokens).toBe(0);
  });
});

describe("aggregation does not double-count", () => {
  it("counts a two-platform slot once", async () => {
    // Both rows of a slot carry the same attempts array. Summing rows would
    // report twice the real spend, which is why spendBySlot keys on the slot.
    const r = await run(new ScriptedEngine([good], [usage({ costUsd: 0.05 })]));
    expect(r.records.length).toBe(2);
    const spend = spendBySlot(r.ledger);
    expect(spend).toHaveLength(1);
    expect(spend[0].costUsd).toBeCloseTo(0.05, 4);
  });

  it("reports no spend for a slot that never called the API", async () => {
    // A slot skipped before generation costs nothing and must not appear.
    const r = await runSlot({
      slot: SLOT_BY_ID.get("morning")!,
      events: [],
      ledger: EMPTY_POST_LEDGER,
      engine: new ScriptedEngine([good], [usage()]),
      publishers: {},
      now: NOW,
      live: false,
    });
    expect(r.outcome.attempts).toEqual([]);
    expect(spendBySlot(r.ledger)).toEqual([]);
  });

  it("treats reasoning and cached tokens as SUBSETS, never as additions", async () => {
    const r = await run(new ScriptedEngine([good], [usage()]));
    const [spend] = spendBySlot(r.ledger);
    // 4,700 of 5,000 output tokens are reasoning — the visible post is the rest.
    expect(spend.reasoningTokens).toBeLessThanOrEqual(spend.outputTokens);
    expect(spend.cachedInputTokens).toBeLessThanOrEqual(spend.inputTokens);
    expect(spend.outputTokens - spend.reasoningTokens).toBe(300);
    expect(spend.inputTokens - spend.cachedInputTokens).toBe(1200);
  });
});
