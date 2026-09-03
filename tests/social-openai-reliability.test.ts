// =============================================================================
// THE COPY CALL MUST SURVIVE A SLOW ANSWER
//
// The first live morning window (2026-09-03) published nothing. The ledger
// recorded exactly why: one attempt, 120,008 ms, aborted by the engine's own
// deadline, zero tokens returned. The 34 successful attempts before it put the
// latency p90 at 90.7 s with 91–96% of every call's output tokens spent on
// reasoning — a distribution whose tail crosses a single 120 s deadline, which
// it had already done once on 2026-08-18.
//
// So these tests are about the transport, not the vendor and not the copy:
//
//   • A slow answer costs seconds, not the window: bounded retry.
//   • A wrong answer costs one call: a refusal, a bad key, a cap too small and
//     an unparseable body must never be asked twice.
//   • A platform that cannot publish is never written for, so no model tokens
//     are spent on a post nobody can read and no ledger row blames an engine
//     the platform never called.
//   • A retry cannot post twice, and neither can a re-run of the window.
//   • Copy that was validated and then failed to publish stays ready, so the
//     next window costs nothing.
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import {
  OpenAICopyEngine,
  EngineConfigurationError,
  DEFAULT_REASONING_EFFORT,
  MAX_TRANSPORT_ATTEMPTS,
  PER_ATTEMPT_TIMEOUT_MS,
  isTransientEngineError,
  resolveReasoningEffort,
  OpenAIHttpError,
} from "@/lib/social/providers/openai";
import { EngineRefusal } from "@/lib/social/providers/anthropic";
import { runSlot, targetPlatforms } from "@/lib/social/run";
import { SLOT_BY_ID, instantInWindow } from "@/lib/social/slots";
import { EMPTY_POST_LEDGER, publishedPosts, type PostLedger } from "@/lib/social/ledger";
import { EMPTY_QUEUE, type EditorialQueue } from "@/lib/social/queue";
import { StubCopyEngine } from "@/lib/social/providers/stub";
import { responseSchemaFor, buildUserPrompt } from "@/lib/social/prompt";
import { buildEventFacts } from "@/lib/social/facts";
import type { PublishResult, Publisher } from "@/lib/social/platforms/types";
import type { IndexedEvent } from "@/lib/event-index";
import type { CopyRequest, Platform, SlotOutcome } from "@/lib/social/types";

// -----------------------------------------------------------------------------
// FIXTURES
// -----------------------------------------------------------------------------

const EVENT: IndexedEvent = {
  id: "federal_register:2026-17726",
  title: "Rescission of Coordinated Enforcement Regulations",
  publishedAt: "2026-08-31",
  effectiveAt: "2026-09-30",
  scheduled: false,
  severity: "major",
  classification: "final_rule",
  sourceKey: "federal_register",
  sourceUrl: "https://www.federalregister.gov/documents/2026/08/31/2026-17726/x",
  summary:
    "The Department of Labor (Department) is rescinding the regulations that established formal procedures for coordination of enforcement activities among the Wage and Hour Division, Occupational Safety and Health Administration and Employment and Training Administration with respect to migrant and seasonal farmworkers.",
  entityIds: ["agency:dol", "topic:enforcement"],
};

const TODAY = "2026-09-03";

function request(over: Partial<CopyRequest> = {}): CopyRequest {
  return {
    facts: buildEventFacts(EVENT, undefined, TODAY, "what_changed"),
    slot: SLOT_BY_ID.get("morning")!,
    angle: "what_changed",
    contentType: "what_changed",
    structures: ["what_changed", "direct"],
    avoidOpenings: [],
    ...over,
  };
}

/** A well-formed Responses reply. */
function okBody(over: Record<string, unknown> = {}) {
  return {
    model: "gpt-5-2025-08-07",
    status: "completed",
    output: [
      {
        type: "message",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({
              x: "USCIS just reversed a policy. https://immigrationclock.com/x",
              linkedin: "A longer post for LinkedIn. https://immigrationclock.com/x",
              deepLink: "https://immigrationclock.com/x",
              structure: "what_changed",
              headline: "A headline",
              ...over,
            }),
          },
        ],
      },
    ],
    usage: {
      input_tokens: 2100,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 900,
      output_tokens_details: { reasoning_tokens: 400 },
      total_tokens: 3000,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** The abort AbortSignal.timeout() raises, by name and message. */
function timeoutError(): Error {
  const err = new Error("The operation was aborted due to timeout");
  err.name = "TimeoutError";
  return err;
}

/** An engine whose transport is scripted, with no wall-clock cost for a retry. */
function engineWith(steps: (() => Promise<Response>)[], logs: string[] = []) {
  let call = 0;
  const fetchImpl = vi.fn(async () => {
    const step = steps[Math.min(call, steps.length - 1)];
    call++;
    return step();
  });
  const engine = new OpenAICopyEngine({
    apiKey: "test-key-not-real",
    model: "gpt-5",
    fetchImpl: fetchImpl as unknown as typeof fetch,
    sleepImpl: async () => undefined,
    logImpl: (line) => logs.push(line),
  });
  return { engine, fetchImpl, logs };
}

const succeed = () => async () => jsonResponse(okBody());
const timeOut = () => async () => {
  throw timeoutError();
};
const httpStatus = (status: number) => async () => jsonResponse({ error: { message: "no" } }, status);

// -----------------------------------------------------------------------------
// A–D: THE RETRY
// -----------------------------------------------------------------------------

describe("A. the first request succeeds", () => {
  it("returns the copy after one call, and says so", async () => {
    const { engine, fetchImpl, logs } = engineWith([succeed()]);
    const result = await engine.generate(request());

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.copy.x).toContain("USCIS just reversed a policy");
    expect(result.usage.reasoningTokens).toBe(400);
    expect(logs.join("\n")).toMatch(/attempt 1\/2: success in \d+ ms/);
    expect(logs.join("\n")).toMatch(new RegExp(`reasoning ${DEFAULT_REASONING_EFFORT}`));
  });

  it("states the reasoning effort rather than defaulting it, and keeps the schema strict", async () => {
    const { engine, fetchImpl } = engineWith([succeed()]);
    const req = request();
    await engine.generate(req);

    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.reasoning).toEqual({ effort: DEFAULT_REASONING_EFFORT });
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema).toEqual(responseSchemaFor(req));
    expect(body.store).toBe(false);
  });

  it("does not log the prompt, the key or the copy", async () => {
    const { engine, logs } = engineWith([succeed()]);
    await engine.generate(request());
    const all = logs.join("\n");
    expect(all).not.toContain("test-key-not-real");
    expect(all).not.toContain("USCIS just reversed");
    expect(all).not.toMatch(/ESTABLISHED FACTS|PLATFORM BRIEFS/);
  });
});

describe("B. the first request times out and the second succeeds", () => {
  it("retries once and returns the copy", async () => {
    const { engine, fetchImpl, logs } = engineWith([timeOut(), succeed()]);
    const result = await engine.generate(request());

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.copy.x).toContain("USCIS just reversed a policy");
    const all = logs.join("\n");
    expect(all).toMatch(/attempt 1\/2: timeout after \d+ ms — retrying in \d+ ms/);
    expect(all).toMatch(/attempt 2\/2: success/);
  });

  it("retries a 429 and a 5xx for the same reason", async () => {
    for (const status of [429, 500, 503]) {
      const { engine, fetchImpl } = engineWith([httpStatus(status), succeed()]);
      await expect(engine.generate(request())).resolves.toBeTruthy();
      expect(fetchImpl, `HTTP ${status}`).toHaveBeenCalledTimes(2);
    }
  });

  it("retries a dropped socket", async () => {
    const network = () => async () => {
      throw new TypeError("fetch failed");
    };
    const { engine, fetchImpl } = engineWith([network(), succeed()]);
    await expect(engine.generate(request())).resolves.toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("C. every attempt times out", () => {
  it("gives up after the bounded number of attempts and says how long each took", async () => {
    const { engine, fetchImpl, logs } = engineWith([timeOut()]);
    await expect(engine.generate(request())).rejects.toThrow(/attempt\(s\) failed.*timeout/s);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_TRANSPORT_ATTEMPTS);
    expect(logs.join("\n")).toMatch(/attempts exhausted/);
  });

  it("keeps the attempt count and the deadline bounded well inside the workflow's 15 minutes", () => {
    expect(MAX_TRANSPORT_ATTEMPTS).toBe(2);
    expect(PER_ATTEMPT_TIMEOUT_MS).toBe(90_000);
    // Worst case: every attempt runs to the deadline, plus backoff.
    expect(MAX_TRANSPORT_ATTEMPTS * PER_ATTEMPT_TIMEOUT_MS + 10_000).toBeLessThan(15 * 60_000);
  });
});

describe("D. a failure a second call cannot fix is never retried", () => {
  it("does not retry an authentication or a bad-request answer", async () => {
    for (const status of [400, 401, 403, 404]) {
      const { engine, fetchImpl } = engineWith([httpStatus(status)]);
      await expect(engine.generate(request()), `HTTP ${status}`).rejects.toThrow(OpenAIHttpError);
      expect(fetchImpl, `HTTP ${status}`).toHaveBeenCalledTimes(1);
    }
  });

  it("does not retry a refusal", async () => {
    const refusal = () => async () =>
      jsonResponse({
        status: "completed",
        output: [{ type: "message", content: [{ type: "refusal", refusal: "I can't help with that" }] }],
      });
    const { engine, fetchImpl } = engineWith([refusal()]);
    await expect(engine.generate(request())).rejects.toThrow(EngineRefusal);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a token budget that was exhausted — the call was billed", async () => {
    const incomplete = () => async () =>
      jsonResponse({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        usage: { input_tokens: 2100, output_tokens: 12_000, output_tokens_details: { reasoning_tokens: 11_800 } },
      });
    const { engine, fetchImpl } = engineWith([incomplete()]);
    await expect(engine.generate(request())).rejects.toThrow(EngineConfigurationError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry a body that did not parse", async () => {
    const garbage = () => async () =>
      jsonResponse({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "Here you go: {" }] }],
      });
    const { engine, fetchImpl } = engineWith([garbage()]);
    await expect(engine.generate(request())).rejects.toThrow(/not valid JSON/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies each failure the same way in isolation", () => {
    expect(isTransientEngineError(timeoutError())).toBe(true);
    expect(isTransientEngineError(new OpenAIHttpError(429, "rate limited"))).toBe(true);
    expect(isTransientEngineError(new OpenAIHttpError(502, "bad gateway"))).toBe(true);
    expect(isTransientEngineError(new OpenAIHttpError(401, "unauthorised"))).toBe(false);
    expect(isTransientEngineError(new OpenAIHttpError(400, "bad request"))).toBe(false);
    expect(isTransientEngineError(new EngineRefusal("declined"))).toBe(false);
    expect(isTransientEngineError(new EngineConfigurationError("cap too small"))).toBe(false);
    expect(isTransientEngineError(new Error("Response is missing the x variant"))).toBe(false);
  });

  it("takes the reasoning effort from the environment only when it is one of the four", () => {
    expect(resolveReasoningEffort("minimal")).toBe("minimal");
    expect(resolveReasoningEffort("HIGH")).toBe("high");
    expect(resolveReasoningEffort("")).toBe(DEFAULT_REASONING_EFFORT);
    expect(resolveReasoningEffort("aggressive")).toBe(DEFAULT_REASONING_EFFORT);
    expect(resolveReasoningEffort(undefined)).toBe(DEFAULT_REASONING_EFFORT);
  });
});

// -----------------------------------------------------------------------------
// E–F: WHAT THE MODEL IS ASKED TO WRITE
// -----------------------------------------------------------------------------

describe("E. a platform with no credential is never written for", () => {
  it("drops LinkedIn from the schema and the brief when only X can publish", () => {
    const req = request({ platforms: ["x"] });
    const schema = responseSchemaFor(req) as { properties: Record<string, unknown>; required: string[] };

    expect(Object.keys(schema.properties)).not.toContain("linkedin");
    expect(schema.required).not.toContain("linkedin");
    expect(schema.required).toContain("x");

    const prompt = buildUserPrompt(req);
    expect(prompt).not.toMatch(/LinkedIn \(/);
    expect(prompt).toMatch(/X — THE BUDGET/);
  });

  it("keeps both when the run can publish to both", () => {
    const schema = responseSchemaFor(request({ platforms: ["x", "linkedin"] })) as { required: string[] };
    expect(schema.required).toContain("linkedin");
    expect(buildUserPrompt(request({ platforms: ["x", "linkedin"] }))).toMatch(/LinkedIn \(/);
    // And when the caller names none, which is what a full dry run does.
    expect((responseSchemaFor(request()) as { required: string[] }).required).toContain("linkedin");
  });

  it("accepts a reply with no LinkedIn variant when none was asked for", async () => {
    const { engine } = engineWith([
      async () =>
        jsonResponse({
          ...okBody(),
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    x: "Only the X post. https://immigrationclock.com/x",
                    deepLink: "https://immigrationclock.com/x",
                    structure: "what_changed",
                    headline: "A headline",
                  }),
                },
              ],
            },
          ],
        }),
    ]);
    const result = await engine.generate(request({ platforms: ["x"] }));
    expect(result.copy.x).toContain("Only the X post");
    expect(result.copy.linkedin).toBe("");
  });

  it("asks the engine for X alone on a live run with no LinkedIn credential", async () => {
    const seen: CopyRequest[] = [];
    class Recorder extends StubCopyEngine {
      async generate(req: CopyRequest) {
        seen.push(req);
        return super.generate(req);
      }
    }
    const publishers = { x: new StubPublisher("x", [OK]) };
    const result = await runSlot({
      slot: SLOT_BY_ID.get("morning")!,
      events: [EVENT],
      ledger: EMPTY_POST_LEDGER,
      engine: new Recorder(),
      publishers,
      now: instantInWindow(TODAY, SLOT_BY_ID.get("morning")!),
      live: true,
      queue: EMPTY_QUEUE,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].platforms).toEqual(["x"]);
    expect(targetPlatforms({ live: true, publishers })).toEqual(["x"]);

    // And the LinkedIn row says what is actually true about LinkedIn.
    const linkedin = result.outcome.platforms.find((p) => p.platform === "linkedin")!;
    expect(linkedin.decision).toBe("SKIPPED_CREDENTIAL_EXPIRED");
    expect(linkedin.reason).toMatch(/no usable linkedin credential/i);
    expect(linkedin.text).toBeNull();
  });

  it("blames the engine only on the platform that called it", async () => {
    // The 2026-09-03 shape exactly: X reaches the engine, the engine times
    // out, and LinkedIn — which has no credential — must not read as though a
    // model call was spent on it.
    class Failing extends StubCopyEngine {
      async generate(): Promise<never> {
        throw new Error("2 attempt(s) failed: timeout after 90008 ms; timeout after 90011 ms.");
      }
    }
    const result = await runSlot({
      slot: SLOT_BY_ID.get("morning")!,
      events: [EVENT],
      ledger: EMPTY_POST_LEDGER,
      engine: new Failing(),
      publishers: { x: new StubPublisher("x", [OK]) },
      now: instantInWindow(TODAY, SLOT_BY_ID.get("morning")!),
      live: true,
      queue: EMPTY_QUEUE,
    });

    const x = result.outcome.platforms.find((p) => p.platform === "x")!;
    const linkedin = result.outcome.platforms.find((p) => p.platform === "linkedin")!;
    expect(x.decision).toBe("SKIPPED_ENGINE_UNAVAILABLE");
    expect(x.reason).toMatch(/timeout/);
    expect(linkedin.decision).toBe("SKIPPED_CREDENTIAL_EXPIRED");
    expect(linkedin.reason).not.toMatch(/timeout|engine/i);
  });
});

describe("F. X stays eligible", () => {
  it("publishes on X when X has a credential", async () => {
    const x = new StubPublisher("x", [OK]);
    const result = await runSlot({
      slot: SLOT_BY_ID.get("morning")!,
      events: [EVENT],
      ledger: EMPTY_POST_LEDGER,
      engine: new StubCopyEngine(),
      publishers: { x },
      now: instantInWindow(TODAY, SLOT_BY_ID.get("morning")!),
      live: true,
      queue: EMPTY_QUEUE,
    });

    expect(targetPlatforms({ live: true, publishers: { x } })).toContain("x");
    expect(result.outcome.platforms.find((p) => p.platform === "x")!.decision).toBe("POSTED");
    expect(x.posts).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------
// G–H: NOTHING IS PAID FOR TWICE, AND NOTHING IS POSTED TWICE
// -----------------------------------------------------------------------------

class StubPublisher implements Publisher {
  posts: string[] = [];
  constructor(readonly platform: Platform, private readonly results: PublishResult[]) {}
  async publish(text: string): Promise<PublishResult> {
    this.posts.push(text);
    return this.results.length > 1 ? this.results.shift()! : this.results[0];
  }
}

const OK: PublishResult = {
  ok: true,
  credentialProblem: false,
  error: null,
  externalId: "1",
  externalUrl: "https://x.com/i/web/status/1",
};
const DOWN: PublishResult = {
  ok: false,
  credentialProblem: false,
  code: "other",
  error: "X returned HTTP 503",
  externalId: null,
  externalUrl: null,
};

async function window(
  state: { ledger: PostLedger; queue: EditorialQueue },
  slotId: "morning" | "afternoon",
  publishers: Partial<Record<Platform, Publisher>>,
  engine: StubCopyEngine
): Promise<{ outcome: SlotOutcome; state: { ledger: PostLedger; queue: EditorialQueue } }> {
  const slot = SLOT_BY_ID.get(slotId)!;
  const result = await runSlot({
    slot,
    events: [EVENT],
    ledger: state.ledger,
    engine,
    publishers,
    now: instantInWindow(TODAY, slot),
    live: true,
    queue: state.queue,
  });
  return { outcome: result.outcome, state: { ledger: result.ledger, queue: result.queue } };
}

class CountingStub extends StubCopyEngine {
  calls = 0;
  async generate(req: CopyRequest) {
    this.calls++;
    return super.generate(req);
  }
}

describe("G. validated copy outlives a failed publish", () => {
  it("stays ready after a 503 and the next window publishes it without another model call", async () => {
    const engine = new CountingStub();
    const first = await window({ ledger: EMPTY_POST_LEDGER, queue: EMPTY_QUEUE }, "morning", { x: new StubPublisher("x", [DOWN]) }, engine);

    expect(first.outcome.platforms.find((p) => p.platform === "x")!.decision).toBe("SKIPPED_PUBLISH_FAILED");
    expect(engine.calls).toBe(1);
    const ready = first.state.queue.items.find(
      (i) => i.subjectId === first.outcome.subjectId && i.contentType === first.outcome.contentType
    )!;
    expect(ready.status).toBe("ready");
    expect(ready.suggestedPost?.x).toBeTruthy();

    const afternoon = new StubPublisher("x", [OK]);
    const second = await window(first.state, "afternoon", { x: afternoon }, engine);

    expect(second.outcome.platforms.find((p) => p.platform === "x")!.decision).toBe("POSTED");
    expect(engine.calls, "the stored copy was reused, not regenerated").toBe(1);
    expect(second.outcome.usage?.model).toBe("queue:ready");
    expect(afternoon.posts[0]).toBe(ready.suggestedPost?.x);
  });
});

describe("H. a window publishes once", () => {
  it("refuses a second post in a window that already published, and spends nothing", async () => {
    const engine = new CountingStub();
    const first = await window({ ledger: EMPTY_POST_LEDGER, queue: EMPTY_QUEUE }, "morning", { x: new StubPublisher("x", [OK]) }, engine);
    expect(first.outcome.platforms.find((p) => p.platform === "x")!.decision).toBe("POSTED");
    const callsAfterFirst = engine.calls;

    const again = new StubPublisher("x", [OK]);
    const second = await window(first.state, "morning", { x: again }, engine);

    expect(second.outcome.platforms.find((p) => p.platform === "x")!.decision).toBe("SKIPPED_DUPLICATE");
    expect(second.outcome.platforms.find((p) => p.platform === "x")!.reason).toMatch(/already published/);
    expect(again.posts, "nothing reached the publisher").toHaveLength(0);
    expect(engine.calls, "no model call for a window already filled").toBe(callsAfterFirst);
    expect(publishedPosts(second.state.ledger).filter((p) => p.platform === "x")).toHaveLength(1);
  });

  it("cannot double-post from a transport retry: the retry is before publication", async () => {
    // Two transport attempts, one publish. The retry loop lives inside the
    // engine and can only produce a candidate string; publication happens once,
    // after validation, in the run.
    const { engine, fetchImpl } = engineWith([timeOut(), succeed()]);
    await engine.generate(request({ platforms: ["x"] }));
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const publisher = new StubPublisher("x", [OK]);
    const result = await runSlot({
      slot: SLOT_BY_ID.get("morning")!,
      events: [EVENT],
      ledger: EMPTY_POST_LEDGER,
      engine: new StubCopyEngine(),
      publishers: { x: publisher },
      now: instantInWindow(TODAY, SLOT_BY_ID.get("morning")!),
      live: true,
      queue: EMPTY_QUEUE,
    });
    expect(publisher.posts).toHaveLength(1);
    expect(publishedPosts(result.ledger).filter((p) => p.decision === "POSTED" && p.platform === "x")).toHaveLength(1);
  });
});
