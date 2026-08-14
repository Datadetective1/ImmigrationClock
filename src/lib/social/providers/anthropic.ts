// =============================================================================
// ANTHROPIC COPY ENGINE — the only production provider
//
// Claude, via the official SDK. Model comes from SOCIAL_MODEL and defaults to
// claude-opus-5.
//
// WHY OPUS RATHER THAN A CHEAPER TIER
// -----------------------------------
// Volume is ~3 calls a day, so the difference between tiers is a few dollars a
// month. The failure this system exists to prevent is not a clumsy sentence, it
// is a plausible-sounding sentence that over-claims what a federal agency did,
// published unattended, on an account whose only asset is being believed. That
// is precisely the failure surface where model capability pays, and a few
// dollars is not a reason to buy more of it.
//
// REQUEST SHAPE NOTES
// -------------------
// • Thinking is ON by default on Opus 5 — omitting the parameter runs adaptive.
//   max_tokens caps thinking PLUS output, which is why it is far larger than the
//   ~1,500 characters of copy actually being requested.
// • temperature / top_p / top_k are rejected by this model family. Variety comes
//   from the prompt and from the recent-openings list, not from sampling.
// • output_config.format constrains the response to the schema, so there is no
//   prose to strip and no parsing step that could mis-slice a reply.
// • Server-side fallbacks are opted into: a safety-classifier refusal is a
//   normal HTTP 200 with stop_reason "refusal", and "default" routing re-runs
//   the request on Anthropic's recommended substitute rather than handing us an
//   empty content array. Immigration-policy copy is not a category these
//   classifiers target, but enforcement and border content sits close enough to
//   adjacent domains that the cheap insurance is worth taking.
//
// UNVERIFIED AGAINST A LIVE ENDPOINT
// ----------------------------------
// This file has never made a real request: the machine it was written on has no
// ANTHROPIC_API_KEY. The shapes follow current documentation, but the first live
// run should be a single manual dispatch watched by a human, not the cron. See
// docs/social.md §"First live run".
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, RESPONSE_SCHEMA, buildUserPrompt } from "../prompt";
import type { CopyEngine, CopyRequest, EngineResult, GeneratedCopy } from "../types";

/** Published rates, USD per million tokens. Used only for the ledger's cost column. */
const RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

const FALLBACK_RATE = { input: 5, output: 25 };

/**
 * Generous relative to the ~1,500 characters of copy requested, because on this
 * model the cap covers thinking as well as output. A tight value here does not
 * save money — thinking is billed either way — it just truncates the answer.
 */
const MAX_TOKENS = 4000;

/**
 * The subset of the response this engine reads.
 *
 * Declared locally because the installed SDK's `BetaMessage` predates the
 * `stop_details` and server-side-fallback fields. Narrow on purpose: if a field
 * is not listed here, this file does not depend on it.
 */
interface BetaMessageLike {
  stop_reason: string | null;
  stop_details?: { category?: string } | null;
  content?: { type: string; text?: string }[];
  usage: { input_tokens?: number; output_tokens?: number };
  model?: string;
}

export interface AnthropicEngineOptions {
  apiKey: string;
  model: string;
  /** Overridable for tests. */
  client?: Anthropic;
}

export class AnthropicCopyEngine implements CopyEngine {
  readonly id: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicEngineOptions) {
    this.model = opts.model;
    this.id = `anthropic:${opts.model}`;
    this.client =
      opts.client ??
      new Anthropic({
        apiKey: opts.apiKey,
        // Three slots a day; a slow response is not worth failing a slot over,
        // but a hung one must not hold the runner for the default ten minutes.
        timeout: 120_000,
        maxRetries: 2,
      });
  }

  async generate(req: CopyRequest): Promise<EngineResult> {
    // `output_config` and `fallbacks` are newer than the installed SDK's
    // typings, so the call is made through a narrowed signature rather than
    // suppressed field by field. The shape below is the wire contract; the cast
    // is about the types being behind, not about the request being unusual.
    const create = this.client.beta.messages.create.bind(this.client.beta.messages) as unknown as (
      params: Record<string, unknown>
    ) => Promise<BetaMessageLike>;

    const response = await create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(req) }],
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: RESPONSE_SCHEMA },
      },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    // stop_reason must be read before content: a refusal returns HTTP 200 with
    // an empty content array, and indexing into it would throw a TypeError that
    // reads like a bug rather than a policy outcome.
    if (response.stop_reason === "refusal") {
      const category = response.stop_details?.category ?? "unspecified";
      throw new EngineRefusal(`Model declined to generate copy (category: ${category})`);
    }

    const text = (response.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();

    if (!text) {
      throw new Error(`Empty response from ${this.model} (stop_reason: ${response.stop_reason})`);
    }

    let copy: GeneratedCopy;
    try {
      copy = JSON.parse(text) as GeneratedCopy;
    } catch {
      throw new Error(`Response was not valid JSON despite the schema constraint: ${text.slice(0, 200)}`);
    }

    if (typeof copy.x !== "string" || typeof copy.linkedin !== "string") {
      throw new Error("Response is missing a platform variant");
    }

    const rate = RATES[this.model] ?? FALLBACK_RATE;
    const inputTokens = response.usage.input_tokens ?? 0;
    const outputTokens = response.usage.output_tokens ?? 0;

    return {
      copy,
      usage: {
        // The model that actually answered, which is not necessarily the one we
        // asked for once fallbacks are in play.
        model: response.model ?? this.model,
        // Neither of these providers reports a cache or reasoning split, so
        // they report zero rather than a guess.
        cachedInputTokens: 0,
        reasoningTokens: 0,
        totalTokens: null,
        inputTokens,
        outputTokens,
        costUsd: (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output,
      },
    };
  }
}

/** A policy refusal, distinct from a transport failure. Both end the slot. */
export class EngineRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineRefusal";
  }
}
