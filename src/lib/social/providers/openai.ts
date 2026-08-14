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
import type { CopyEngine, CopyRequest, EngineResult, GeneratedCopy } from "../types";
import { EngineRefusal } from "./anthropic";

const ENDPOINT = "https://api.openai.com/v1/responses";

/**
 * Published rates, USD per million tokens. Used only for the ledger's cost
 * column, and a missing entry falls back rather than throwing — a wrong cost
 * estimate must never be the reason a slot fails.
 */
const RATES: Record<string, { input: number; output: number }> = {
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
};

const FALLBACK_RATE = { input: 1.25, output: 10 };

/**
 * Generous relative to the ~1,500 characters of copy requested.
 *
 * On a reasoning model this cap covers reasoning tokens as well as the visible
 * answer, so a tight value does not save money — reasoning is billed either way
 * — it just truncates the reply and produces an empty `output_text`.
 */
const MAX_OUTPUT_TOKENS = 4000;

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
  usage?: { input_tokens?: number; output_tokens?: number };
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

    if (payload.status === "incomplete") {
      const reason = payload.incomplete_details?.reason ?? "unspecified";
      throw new Error(`OpenAI response was incomplete (${reason})`);
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

    const rate = RATES[this.model] ?? FALLBACK_RATE;
    const inputTokens = payload.usage?.input_tokens ?? 0;
    const outputTokens = payload.usage?.output_tokens ?? 0;

    return {
      copy,
      usage: {
        // The model that actually answered, which a snapshot alias makes
        // different from the one we asked for.
        model: payload.model ?? this.model,
        inputTokens,
        outputTokens,
        costUsd: (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output,
      },
    };
  }
}
