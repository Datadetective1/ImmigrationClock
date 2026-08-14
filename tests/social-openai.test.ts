// =============================================================================
// THE OPENAI COPY ENGINE
//
// A provider migration is the moment when everything the trust layer depends on
// can quietly stop being true, because the failure looks like "it still returns
// copy". So these tests are about the seam, not about the vendor:
//
//   • The PROMPT must transfer byte-identically. The editorial identity work
//     (prompt/4 — the time dimension, the TIMING block, the permitted-attribution
//     list) is what makes this account ImmigrationClock rather than a news feed,
//     and re-tuning it for a new model would invalidate everything validated so
//     far. If OpenAI writes worse copy under the same prompt, the validator
//     catches it and the slot skips.
//
//   • Structured output must stay CONSTRAINED. Free-form prose around the JSON
//     is how a preamble leaks into a post.
//
//   • Every failure mode must end the slot, not produce something. A refusal, an
//     HTTP error, a truncated reply and a malformed body must all throw — the
//     runner turns that into SKIPPED_ENGINE_UNAVAILABLE, which is the correct
//     outcome and the one the system was built around.
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import {
  OpenAICopyEngine,
  EngineConfigurationError,
  MAX_OUTPUT_TOKENS,
  rateFor,
} from "@/lib/social/providers/openai";
import { EngineRefusal } from "@/lib/social/providers/anthropic";
import { createCopyEngine, DEFAULT_PROVIDER, DEFAULT_MODEL_BY_PROVIDER } from "@/lib/social/copy-engine";
import { SYSTEM_PROMPT, RESPONSE_SCHEMA, buildUserPrompt } from "@/lib/social/prompt";
import { buildEventFacts } from "@/lib/social/facts";
import { SLOT_BY_ID } from "@/lib/social/slots";
import type { IndexedEvent } from "@/lib/event-index";
import type { CopyRequest } from "@/lib/social/types";

const EVENT = {
  id: "federal_register:x1",
  title: "Fee Adjustment for Certain Immigration Benefit Requests",
  publishedAt: "2026-08-10",
  effectiveAt: "2026-09-18",
  scheduled: false,
  severity: "major",
  classification: "final_rule",
  sourceKey: "federal_register",
  sourceUrl: "https://www.federalregister.gov/documents/x1",
  summary: "USCIS is adjusting the fees that apply to certain benefit requests.",
  entityIds: ["agency:uscis", "visa:h-1b"],
} as unknown as IndexedEvent;

const REQUEST: CopyRequest = {
  facts: buildEventFacts(EVENT, "/what-changed?q=fee", "2026-08-13"),
  slot: SLOT_BY_ID.get("morning")!,
  angle: "breaking_change",
  avoidOpenings: [],
};

const GOOD_COPY = {
  x: "A fee change takes effect on 2026-09-18. https://immigrationclock.com/what-changed?q=fee",
  linkedin: "A fee change takes effect on 2026-09-18.",
  deepLink: "https://immigrationclock.com/what-changed?q=fee",
};

function stub(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const impl = vi.fn(async (url: string | URL | Request, opts?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(opts?.body ?? "{}")),
      headers: (opts?.headers ?? {}) as Record<string, string>,
    });
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      json: async () => payload,
      text: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)),
    } as Response;
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

const ok = (copy: unknown = GOOD_COPY, extra: Record<string, unknown> = {}) => ({
  model: "gpt-5-2026-01-01",
  status: "completed",
  output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(copy) }] }],
  usage: { input_tokens: 1200, output_tokens: 400 },
  ...extra,
});

const engine = (impl: typeof fetch) =>
  new OpenAICopyEngine({ apiKey: "sk-test", model: "gpt-5", fetchImpl: impl });

// -----------------------------------------------------------------------------

describe("the prompt transfers unchanged", () => {
  it("sends the exact SYSTEM_PROMPT and buildUserPrompt output", async () => {
    const { impl, calls } = stub(ok());
    await engine(impl).generate(REQUEST);

    const input = calls[0].body.input as { role: string; content: string }[];
    expect(input[0]).toEqual({ role: "system", content: SYSTEM_PROMPT });
    expect(input[1]).toEqual({ role: "user", content: buildUserPrompt(REQUEST) });
  });

  it("carries the editorial identity work into the request", async () => {
    const { impl, calls } = stub(ok());
    await engine(impl).generate(REQUEST);
    const sent = JSON.stringify(calls[0].body);
    expect(sent).toContain("TIME DIMENSION");
    expect(sent).toContain("TIMING — the part this account exists for");
    expect(sent).toContain("PERMITTED ATTRIBUTION");
  });

  it("constrains the response to the same schema, strictly", async () => {
    const { impl, calls } = stub(ok());
    await engine(impl).generate(REQUEST);
    const format = (calls[0].body.text as { format: Record<string, unknown> }).format;
    expect(format.type).toBe("json_schema");
    expect(format.strict).toBe(true);
    expect(format.schema).toEqual(RESPONSE_SCHEMA);
  });

  it("uses the Responses API and does not store drafts on the vendor", async () => {
    const { impl, calls } = stub(ok());
    await engine(impl).generate(REQUEST);
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0].body.store).toBe(false);
  });

  it("authenticates with a bearer token and never puts the key in the body", async () => {
    const { impl, calls } = stub(ok());
    await engine(impl).generate(REQUEST);
    expect(calls[0].headers.Authorization).toBe("Bearer sk-test");
    expect(JSON.stringify(calls[0].body)).not.toContain("sk-test");
  });
});

describe("a good response", () => {
  it("returns the parsed copy and real token usage", async () => {
    const { impl } = stub(ok());
    const result = await engine(impl).generate(REQUEST);
    expect(result.copy).toEqual(GOOD_COPY);
    expect(result.usage.inputTokens).toBe(1200);
    expect(result.usage.outputTokens).toBe(400);
    expect(result.usage.costUsd).toBeGreaterThan(0);
  });

  it("records the model that actually answered, not the alias asked for", async () => {
    const { impl } = stub(ok());
    const result = await engine(impl).generate(REQUEST);
    expect(result.usage.model).toBe("gpt-5-2026-01-01");
  });

  it("stamps a provider-qualified id into the ledger", () => {
    expect(engine(stub(ok()).impl).id).toBe("openai:gpt-5");
  });
});

describe("every failure ends the slot", () => {
  it("throws a refusal as a refusal, distinct from a transport failure", async () => {
    const { impl } = stub({
      status: "completed",
      output: [{ type: "message", content: [{ type: "refusal", refusal: "I can't help with that." }] }],
    });
    await expect(engine(impl).generate(REQUEST)).rejects.toBeInstanceOf(EngineRefusal);
  });

  it("throws on a non-2xx, surfacing the status", async () => {
    const { impl } = stub({ error: { message: "insufficient_quota" } }, { ok: false, status: 429 });
    await expect(engine(impl).generate(REQUEST)).rejects.toThrow(/HTTP 429/);
  });

  it("throws when the reply was truncated rather than publishing half a post", async () => {
    const { impl } = stub({
      status: "incomplete",
      incomplete_details: { reason: "content_filter" },
      output: [],
    });
    await expect(engine(impl).generate(REQUEST)).rejects.toThrow(/incomplete \(content_filter\)/);
  });

  it("throws on an empty output", async () => {
    const { impl } = stub({ status: "completed", output: [] });
    await expect(engine(impl).generate(REQUEST)).rejects.toThrow(/Empty response/);
  });

  it("throws when the body is not JSON despite the schema", async () => {
    const { impl } = stub({
      status: "completed",
      output: [{ type: "message", content: [{ type: "output_text", text: "Here you go: {" }] }],
    });
    await expect(engine(impl).generate(REQUEST)).rejects.toThrow(/not valid JSON/);
  });

  it("throws when a platform variant is missing", async () => {
    const { impl } = stub(ok({ x: "only x", deepLink: "u" }));
    await expect(engine(impl).generate(REQUEST)).rejects.toThrow(/missing a platform variant/);
  });

  it("never falls back to a template — there is no second voice", async () => {
    const { impl } = stub({ error: "boom" }, { ok: false, status: 500 });
    await expect(engine(impl).generate(REQUEST)).rejects.toThrow();
  });
});

// -----------------------------------------------------------------------------
// THE REGRESSION THAT COST REAL MONEY
//
// The first authenticated run failed all three slots with
// "OpenAI response was incomplete (max_output_tokens)". GPT-5 spends reasoning
// tokens against the SAME budget as visible output, and the cap was 4,000 — so
// every slot paid for a full reasoning pass and then discarded it, while the
// ledger recorded the generic SKIPPED_ENGINE_UNAVAILABLE and made it look like
// an outage.
//
// Two properties have to hold forever after: the cap has to be big enough, and
// exhausting it has to be LOUD and specifically diagnosable.
// -----------------------------------------------------------------------------

describe("running out of output budget", () => {
  const exhausted = () =>
    stub({
      model: "gpt-5-2026-01-01",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [],
      usage: {
        input_tokens: 2400,
        output_tokens: 12000,
        output_tokens_details: { reasoning_tokens: 12000 },
      },
    });

  it("is a CONFIGURATION error, not a generic engine failure", async () => {
    const { impl } = exhausted();
    await expect(engine(impl).generate(REQUEST)).rejects.toBeInstanceOf(EngineConfigurationError);
  });

  it("reports every number needed to size the cap correctly", async () => {
    const { impl } = exhausted();
    const err = (await engine(impl).generate(REQUEST).catch((e: unknown) => e)) as Error;
    const msg = err.message;
    expect(msg).toContain("max_output_tokens");
    expect(msg).toContain("input_tokens=2400");
    expect(msg).toContain("output_tokens=12000");
    expect(msg).toContain("reasoning_tokens=12000");
    expect(msg).toContain(`max_output_tokens=${MAX_OUTPUT_TOKENS}`);
    expect(msg).toContain("gpt-5-2026-01-01");
  });

  it("says the call was billed, and what to change", async () => {
    const { impl } = exhausted();
    const err = (await engine(impl).generate(REQUEST).catch((e: unknown) => e)) as Error;
    expect(err.message).toMatch(/billed and discarded/);
    expect(err.message).toMatch(/Raise MAX_OUTPUT_TOKENS|SOCIAL_MODEL/);
  });

  it("says so plainly when the API does not report reasoning tokens", async () => {
    const { impl } = stub({
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [],
      usage: { input_tokens: 2400, output_tokens: 4000 },
    });
    const err = (await engine(impl).generate(REQUEST).catch((e: unknown) => e)) as Error;
    expect(err.message).toContain("reasoning_tokens=not reported");
  });

  it("sends a cap large enough for reasoning plus the whole schema", async () => {
    // Visible output is ~1,735 characters at the schema's limits — roughly 550
    // tokens. Anything near that leaves no room to think, which is exactly how
    // the 4,000 cap failed.
    const { impl, calls } = stub(ok());
    await engine(impl).generate(REQUEST);
    expect(calls[0].body.max_output_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(8000);
    // Still a real ceiling rather than "make it enormous".
    expect(MAX_OUTPUT_TOKENS).toBeLessThanOrEqual(32000);
  });

  it("distinguishes a misconfiguration from an outage at the type level", async () => {
    const { impl } = stub({ error: "gateway" }, { ok: false, status: 502 });
    const outage = await engine(impl).generate(REQUEST).catch((e: unknown) => e);
    expect(outage).not.toBeInstanceOf(EngineConfigurationError);
  });
});

describe("cost reporting prices the model that answered", () => {
  it("knows the configured models' rates", () => {
    expect(rateFor("gpt-5")).toEqual({ input: 1.25, output: 10 });
    expect(rateFor("gpt-5-mini")).toEqual({ input: 0.25, output: 2 });
  });

  it("falls back rather than throwing on an unknown model", () => {
    // A wrong cost estimate must never be the reason a slot fails.
    expect(() => rateFor("gpt-6-unreleased")).not.toThrow();
    expect(rateFor("gpt-6-unreleased").input).toBeGreaterThan(0);
  });

  it("does not price OpenAI usage at Anthropic rates", () => {
    expect(rateFor("gpt-5").output).not.toBe(25);
  });
});

describe("the provider seam", () => {
  it("defaults to OpenAI", () => {
    expect(DEFAULT_PROVIDER).toBe("openai");
    expect(DEFAULT_MODEL_BY_PROVIDER.openai).toBe("gpt-5");
  });

  it("requires the OpenAI key and says which one is missing", () => {
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => createCopyEngine({ provider: "openai" })).toThrow(/OPENAI_API_KEY is not set/);
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });

  it("keeps Anthropic reachable in one variable, for when access returns", () => {
    expect(DEFAULT_MODEL_BY_PROVIDER.anthropic).toBe("claude-opus-5");
    const saved = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect(() => createCopyEngine({ provider: "anthropic" })).toThrow(/ANTHROPIC_API_KEY is not set/);
    } finally {
      if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("still refuses an unknown provider rather than guessing", () => {
    expect(() => createCopyEngine({ provider: "llama" })).toThrow(/Unknown copy engine provider/);
  });
});
