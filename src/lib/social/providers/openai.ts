// =============================================================================
// OPENAI COPY ENGINE — the production provider while Anthropic is unavailable
//
// Swapped in at the seam that already existed for exactly this. `CopyEngine` has
// one method, and everything upstream of it — selection, scoring, rotation,
// fatigue, the ledger, dedupe, the validator, the schedule — is untouched. This
// file changes WHO writes the sentence and nothing about which sentence is asked
// for or whether it may be published.
//
// THE PROMPT IS CARRIED OVER VERBATIM
// ----------------------------------
// SYSTEM_PROMPT and buildUserPrompt() are imported unchanged from prompt.ts, and
// RESPONSE_SCHEMA is the same object the Anthropic engine constrained against.
// That is deliberate: the editorial identity work (prompt/4 — the time
// dimension, the TIMING block, the permitted-attribution list) is the part most
// at risk from a provider migration, and re-tuning it for a new model would
// invalidate everything we validated. If OpenAI writes worse copy under the same
// prompt, the validator catches it and the slot skips, which is the behaviour we
// already trust.
//
// RAW FETCH RATHER THAN THE SDK
// ----------------------------
// The two platform adapters already speak HTTP directly, npm's optional-peer
// resolution has bitten this repository once already, and the Responses call is
// one POST with one JSON body. A dependency here would buy nothing and could
// fail a CI install.
//
// STRUCTURED OUTPUT IS A TRUST CONTROL, NOT A CONVENIENCE
// ------------------------------------------------------
// `text.format` with `strict: true` means there is no prose around the JSON to
// strip and no parsing step that could mis-slice a reply. RESPONSE_SCHEMA
// already satisfies strict mode's requirements — every property required,
// additionalProperties false — so it transfers without modification.
// =============================================================================

import { SYSTEM_PROMPT, RESPONSE_SCHEMA, buildUserPrompt } from "../prompt";
import type { CopyEngine, CopyRequest, EngineResult, EngineUsage, GeneratedCopy } from "../types";
import { EngineRefusal } from "./anthropic";

/**
 * The engine is misconfigured, as distinct from unreachable.
 *
 * Kept separate so the runner can record a decision a human can act on. An
 * outage is waited out; a cap that is too small is a code change, and burning a
 * billed reasoning pass every slot while the logs say "engine unavailable" is
 * how that goes unnoticed for a week.
 */
export class EngineConfigurationError extends Error {
  /**
   * What the failed call cost.
   *
   * A max_output_tokens exhaustion is BILLED — the reasoning pass happened. The
   * usage rides along so the runner can record it rather than losing real spend
   * to an exception.
   */
  readonly usage: EngineUsage | null;

  constructor(message: string, usage: EngineUsage | null = null) {
    super(message);
    this.name = "EngineConfigurationError";
    this.usage = usage;
  }
}

const ENDPOINT = "https://api.openai.com/v1/responses";

/**
 * Published rates, USD per million tokens. Used only for the ledger's cost
 * column, and a missing entry falls back rather than throwing — a wrong cost
 * estimate must never be the reason a slot fails.
 */
export const RATES: Record<string, { input: number; output: number }> = {
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};

export const FALLBACK_RATE = { input: 1.25, output: 10 };

/** Published rate for a model, or the fallback. Never throws. */
export function rateFor(model: string): { input: number; output: number } {
  return RATES[model] ?? FALLBACK_RATE;
}

/**
 * The cap on reasoning PLUS visible output.
 *
 * 4,000 was wrong, and wrong in the most expensive way available: GPT-5 spends
 * reasoning tokens against this same budget, exhausted it before emitting any
 * JSON, and returned `status: "incomplete"`. Every slot was billed for a full
 * reasoning pass and then discarded the result.
 *
 * Sized from the schema rather than guessed:
 *
 *   x         ≤   275 chars
 *   linkedin  ≤ 1,300 chars
 *   deepLink  ~    60 chars
 *   JSON envelope + escaping        ~   100 chars
 *   ────────────────────────────────────────────
 *   ~1,735 chars ≈ 550 tokens of VISIBLE output. Round to 800 for headroom.
 *
 * The rest is reasoning. This prompt is a long instruction stack with a dozen
 * hard negative constraints and a character band to hit, which is exactly the
 * shape that makes a reasoning model think for a while — a few thousand tokens
 * is normal and occasionally more.
 *
 * 12,000 leaves roughly 11,000 for reasoning: about an order of magnitude over
 * what this task should need, and still a real ceiling. It is a CAP, not a
 * spend — a typical call bills far less — and its only job is to stop a
 * runaway from being unbounded while never truncating an honest one.
 */
export const MAX_OUTPUT_TOKENS = 12_000;

export interface OpenAIEngineOptions {
  apiKey: string;
  model: string;
  /** Overridable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

/** The subset of the Responses payload this engine reads. Narrow on purpose. */
interface ResponsesPayload {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: {
    type: string;
    content?: { type: string; text?: string; refusal?: string }[];
  }[];
  usage?: {
    input_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens?: number;
    output_tokens_details?: { reasoning_tokens?: number };
    total_tokens?: number;
  };
}

export class OpenAICopyEngine implements CopyEngine {
  readonly id: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: OpenAIEngineOptions) {
    this.model = opts.model;
    this.id = `openai:${opts.model}`;
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Everything the API reported about what this call cost.
   *
   * `cached_tokens` is a subset of `input_tokens` and `reasoning_tokens` a
   * subset of `output_tokens` — neither is added on top, and both are billed
   * (cached input at a discount, reasoning at the full output rate). Cost is
   * computed on the totals, which is what the invoice does.
   */
  private usageFrom(payload: ResponsesPayload): EngineUsage {
    const rate = rateFor(this.model);
    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;
    return {
      // The model that actually answered, which a snapshot alias makes
      // different from the one we asked for.
      model: payload.model ?? this.model,
      inputTokens,
      cachedInputTokens: payload.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens,
      reasoningTokens: payload.usage?.output_tokens_details?.reasoning_tokens ?? 0,
      totalTokens: payload.usage?.total_tokens ?? null,
      costUsd: (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output,
    };
  }

  async generate(req: CopyRequest): Promise<EngineResult> {
    const response = await this.fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        // The system prompt goes in as its own turn rather than as
        // `instructions`, so the cacheable prefix stays byte-identical to what
        // the Anthropic engine sent and the two are comparable.
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(req) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "immigrationclock_social_copy",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        // Nothing about this task benefits from stored state, and a publication
        // pipeline should not leave copies of its drafts on a vendor by default.
        store: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI returned HTTP ${response.status}: ${body.replace(/\s+/g, " ").slice(0, 300)}`
      );
    }

    const payload = (await response.json()) as ResponsesPayload;

    // A refusal arrives as a normal 200 with a `refusal` content part. Reading
    // it before the text matters: indexing past it would throw a TypeError that
    // reads like a bug rather than a policy outcome.
    const refusal = (payload.output ?? [])
      .flatMap((item) => item.content ?? [])
      .find((part) => part.type === "refusal")?.refusal;
    if (refusal) {
      throw new EngineRefusal(`Model declined to generate copy: ${refusal.slice(0, 200)}`);
    }

    // AN INCOMPLETE RESPONSE IS A CONFIGURATION FAULT, NOT AN OUTAGE.
    //
    // Both end the slot, but they need different responses from a human: an
    // outage resolves itself and a cap that is too small never will. It also
    // BILLS — the reasoning pass happened — so it must be loud rather than
    // folded into the same bucket as a network error.
    if (payload.status === "incomplete") {
      const reason = payload.incomplete_details?.reason ?? "unspecified";
      const inTok = payload.usage?.input_tokens ?? 0;
      const outTok = payload.usage?.output_tokens ?? 0;
      const reasoningTok = payload.usage?.output_tokens_details?.reasoning_tokens;

      const diagnostic =
        `OpenAI response was incomplete (${reason}). ` +
        `input_tokens=${inTok} output_tokens=${outTok} ` +
        `reasoning_tokens=${reasoningTok ?? "not reported"} ` +
        `max_output_tokens=${MAX_OUTPUT_TOKENS} model=${payload.model ?? this.model}`;

      if (reason === "max_output_tokens") {
        throw new EngineConfigurationError(
          `${diagnostic} — the token budget was exhausted before the model emitted its JSON. ` +
            `This call was billed and discarded. Raise MAX_OUTPUT_TOKENS in providers/openai.ts, ` +
            `or set SOCIAL_MODEL to a model that reasons less on this prompt.`,
          this.usageFrom(payload)
        );
      }
      throw new Error(diagnostic);
    }

    const text = (payload.output ?? [])
      .flatMap((item) => item.content ?? [])
      .filter((part) => part.type === "output_text")
      .map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!text) {
      throw new Error(`Empty response from ${this.model} (status: ${payload.status ?? "unknown"})`);
    }

    let copy: GeneratedCopy;
    try {
      copy = JSON.parse(text) as GeneratedCopy;
    } catch {
      throw new Error(
        `Response was not valid JSON despite the schema constraint: ${text.slice(0, 200)}`
      );
    }

    if (typeof copy.x !== "string" || typeof copy.linkedin !== "string") {
      throw new Error("Response is missing a platform variant");
    }

    return { copy, usage: this.usageFrom(payload) };
  }
}
