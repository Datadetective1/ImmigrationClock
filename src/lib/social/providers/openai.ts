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
//
// WHY THIS CALL IS BOUNDED AND RETRIED (2026-09-03)
// ------------------------------------------------
// The first live morning window published nothing. The ledger recorded the
// reason precisely: one attempt, 120,008 ms, aborted by this file's own
// deadline, zero tokens returned. Not an outage — the request ran to the
// deadline and was cut off.
//
// The 34 successful attempts in the ledger say why. Latency was min 22.9 s,
// median 50.5 s, p90 90.7 s, max 109.1 s, and 91–96% of every call's output
// tokens were REASONING tokens: 2,496 to 7,040 of them, to write a post of at
// most 275 characters. No `reasoning` field was ever sent, so GPT-5 used its
// default effort on a prompt built to make a model deliberate — a long
// instruction stack, a dozen hard negative constraints, a character band to
// land in. A distribution whose p90 sits at 90 s against a single 120 s
// deadline with no retry loses a window every so often, and had already lost
// one on 2026-08-18 the same way.
//
// Three changes, in the order they matter:
//
//   1. `reasoning.effort` is stated rather than defaulted. This copy is written
//      from a CLOSED fact set that the pipeline has already verified; the model
//      chooses a shape and phrases sentences. That is not a task that wants
//      thousands of thinking tokens, and the validator — not the model's
//      deliberation — is what keeps a wrong fact off the account.
//   2. The deadline is per ATTEMPT, and there are two of them. A transient
//      timeout now costs a few seconds, not the window.
//   3. Copy is generated only for platforms that can actually publish. Every
//      call used to write a LinkedIn post of up to 1,300 characters as well,
//      against a second set of constraints, and throw it away when LinkedIn
//      had no credential.
//
// What is NOT changed: the prompt, the schema, the validator, MAX_OUTPUT_TOKENS
// (a ceiling, not a spend), and the rule that a failure ends the slot.
// =============================================================================

import { SYSTEM_PROMPT, buildUserPrompt, responseSchemaFor } from "../prompt";
import type { CopyEngine, CopyRequest, EngineResult, EngineUsage, GeneratedCopy, Platform } from "../types";
import { EngineRefusal } from "./anthropic";

/**
 * The engine is misconfigured, as distinct from unreachable.
 *
 * Kept separate so the runner can record a decision a human can act on. An
 * outage is waited out; a cap that is too small is a code change, and burning a
 * billed reasoning pass every slot while the logs say "engine unavailable" is
 * how that goes unnoticed for a week. Never retried: a second identical call
 * would be billed and fail identically.
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

/** An HTTP answer that was not 2xx. Carries the status so retry can judge it. */
export class OpenAIHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "OpenAIHttpError";
    this.status = status;
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
 * The rest is reasoning. 12,000 leaves roughly 11,000 for it, which is an order
 * of magnitude over what this task should need and still a real ceiling. It is
 * a CAP, not a spend — a typical call bills far less — and its only job is to
 * stop a runaway from being unbounded while never truncating an honest reply.
 * Unchanged when the effort was lowered: a ceiling that is never reached costs
 * nothing, and lowering it is how the incomplete-response fault came back.
 */
export const MAX_OUTPUT_TOKENS = 12_000;

/**
 * How hard the model should think about a post it writes from verified facts.
 *
 * "low", not the API default. Reasoning was 91–96% of every recorded call's
 * output tokens and is what put the p90 latency at 90 seconds. The work here is
 * choosing one of a handful of offered shapes and phrasing sentences from a
 * closed fact set — the facts are already verified upstream, and the validator
 * grounds every figure, date, quotation and URL afterwards whatever the model
 * does. Neither of those depends on how long the model deliberates.
 *
 * `SOCIAL_REASONING_EFFORT` overrides it without a deploy if a run of copy ever
 * comes back worse; the validator would catch that as rising skip rates first.
 */
export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "low";

export function resolveReasoningEffort(
  raw: string | undefined = process.env.SOCIAL_REASONING_EFFORT
): ReasoningEffort {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "minimal" || value === "low" || value === "medium" || value === "high"
    ? value
    : DEFAULT_REASONING_EFFORT;
}

/**
 * The deadline for ONE attempt, and how many attempts there are.
 *
 * 90 s is above the p90 of the recorded latencies (90.7 s) at the OLD default
 * effort, so it does not chop an honest slow reply even before the effort
 * reduction; two attempts then make a lost window need two slow replies in a
 * row rather than one. Worst case is 90 + backoff + 90 ≈ 183 s of model time
 * inside a job that allows 900 s and whose whole failing run took 164 s, so
 * nothing here can push the workflow into its own timeout.
 */
export const PER_ATTEMPT_TIMEOUT_MS = 90_000;
export const MAX_TRANSPORT_ATTEMPTS = 2;
export const RETRY_BASE_BACKOFF_MS = 2_000;

/**
 * Is this worth a second identical call?
 *
 * Only conditions that a retry could plausibly clear: a deadline reached, a
 * rate limit, a 5xx, a socket that failed. Everything else is the same answer
 * twice — a refusal, a bad request, a missing or wrong key, a cap too small, a
 * reply that did not parse. Those throw on the first attempt, which is what
 * keeps a misconfiguration loud instead of doubling its bill.
 */
export function isTransientEngineError(err: unknown): boolean {
  if (err instanceof EngineRefusal || err instanceof EngineConfigurationError) return false;
  if (err instanceof OpenAIHttpError) return err.status === 429 || err.status >= 500;
  const e = err as { name?: string; message?: string } | null;
  if (!e) return false;
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  return /fetch failed|network|socket|ECONNRESET|ETIMEDOUT|EAI_AGAIN|terminated/i.test(e.message ?? "");
}

/** A short, safe description of a failure for the log. Never a prompt or a key. */
function describeFailure(err: unknown): string {
  if (err instanceof OpenAIHttpError) return `HTTP ${err.status}`;
  const e = err as { name?: string; message?: string };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "timeout";
  return (e?.message ?? "unknown error").replace(/\s+/g, " ").slice(0, 120);
}

export interface OpenAIEngineOptions {
  apiKey: string;
  model: string;
  /** Overridable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Overridable for tests, so a retry costs no wall-clock. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Overridable for tests. Defaults to console.log. Never receives a prompt or a key. */
  logImpl?: (line: string) => void;
  /** Overridable for tests. Defaults to resolveReasoningEffort(). */
  reasoningEffort?: ReasoningEffort;
  /** Overridable for tests. Defaults to PER_ATTEMPT_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Overridable for tests. Defaults to MAX_TRANSPORT_ATTEMPTS. */
  maxAttempts?: number;
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

const ALL_PLATFORMS: Platform[] = ["x", "linkedin"];

export class OpenAICopyEngine implements CopyEngine {
  readonly id: string;
  private readonly model: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number) => Promise<void>;
  private readonly logImpl: (line: string) => void;
  private readonly reasoningEffort: ReasoningEffort;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;

  constructor(opts: OpenAIEngineOptions) {
    this.model = opts.model;
    this.id = `openai:${opts.model}`;
    this.apiKey = opts.apiKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleepImpl = opts.sleepImpl ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.logImpl = opts.logImpl ?? ((line) => console.log(line));
    this.reasoningEffort = opts.reasoningEffort ?? resolveReasoningEffort();
    this.timeoutMs = opts.timeoutMs ?? PER_ATTEMPT_TIMEOUT_MS;
    this.maxAttempts = Math.max(1, opts.maxAttempts ?? MAX_TRANSPORT_ATTEMPTS);
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

  /**
   * Bounded retry around one request.
   *
   * The loop is strictly BEFORE anything is published: a retry can only produce
   * a candidate string, and publication happens once, later, after validation.
   * So no number of attempts here can post twice — and the window guard in
   * run.ts refuses a second post in the same window regardless.
   */
  async generate(req: CopyRequest): Promise<EngineResult> {
    const wanted = req.platforms?.length ? req.platforms : ALL_PLATFORMS;
    this.logImpl(
      `[social] copy engine: OpenAI / ${this.model} · reasoning ${this.reasoningEffort} · ` +
        `writing for ${wanted.join(", ")} · ${this.timeoutMs / 1000}s per attempt, up to ${this.maxAttempts}`
    );

    const failures: string[] = [];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const startedAt = Date.now();
      try {
        const result = await this.attempt(req, wanted);
        const ms = Date.now() - startedAt;
        const visible = Math.max(0, result.usage.outputTokens - result.usage.reasoningTokens);
        this.logImpl(
          `[social] attempt ${attempt}/${this.maxAttempts}: success in ${ms} ms · ` +
            `${result.usage.inputTokens} in / ${visible} visible + ${result.usage.reasoningTokens} reasoning out · ` +
            `$${result.usage.costUsd.toFixed(4)}`
        );
        return result;
      } catch (err) {
        const ms = Date.now() - startedAt;
        const why = describeFailure(err);
        failures.push(`${why} after ${ms} ms`);

        if (!isTransientEngineError(err)) {
          this.logImpl(`[social] attempt ${attempt}/${this.maxAttempts}: ${why} after ${ms} ms — not retryable`);
          throw err;
        }
        if (attempt === this.maxAttempts) {
          this.logImpl(`[social] attempt ${attempt}/${this.maxAttempts}: ${why} after ${ms} ms — attempts exhausted`);
          throw new Error(
            `${this.maxAttempts} attempt(s) failed: ${failures.join("; ")}. ` +
              `The copy engine did not answer within ${this.timeoutMs / 1000}s per attempt.`
          );
        }
        // Exponential with jitter, so two runners that fail together do not
        // return together. Tiny by design: the window is minutes wide and the
        // point is to survive a blip, not to wait out an outage.
        const backoff = Math.round(RETRY_BASE_BACKOFF_MS * 2 ** (attempt - 1) * (1 + Math.random() * 0.25));
        this.logImpl(
          `[social] attempt ${attempt}/${this.maxAttempts}: ${why} after ${ms} ms — retrying in ${backoff} ms`
        );
        await this.sleepImpl(backoff);
      }
    }

    // Unreachable: the loop either returns or throws.
    throw new Error("Copy engine exhausted its attempts without a result");
  }

  /** One request, one deadline, one parse. Throws; the caller decides about retrying. */
  private async attempt(req: CopyRequest, wanted: Platform[]): Promise<EngineResult> {
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
            // Narrowed per request twice over: `structure` is an enum of the
            // shapes this post was offered, and the platform variants are only
            // the ones this run can publish.
            schema: responseSchemaFor(req),
          },
        },
        // Stated, not defaulted. See DEFAULT_REASONING_EFFORT.
        reasoning: { effort: this.reasoningEffort },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        // Nothing about this task benefits from stored state, and a publication
        // pipeline should not leave copies of its drafts on a vendor by default.
        store: false,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new OpenAIHttpError(
        response.status,
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
    // folded into the same bucket as a network error, and it is never retried.
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
      // Any other incomplete reason keeps its original classification: the slot
      // ends as "engine unavailable". It is still never retried, because
      // nothing about the message says a second call would differ.
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

    let parsed: Partial<GeneratedCopy>;
    try {
      parsed = JSON.parse(text) as Partial<GeneratedCopy>;
    } catch {
      throw new Error(
        `Response was not valid JSON despite the schema constraint: ${text.slice(0, 200)}`
      );
    }

    // Only the platforms this run asked for must be present. A platform that
    // cannot publish was never written, and carries an empty string rather
    // than a post nobody will read — run.ts records it as "no credential", and
    // the validator never sees it because it is not among the relevant
    // platforms.
    for (const platform of wanted) {
      if (typeof parsed[platform] !== "string") {
        throw new Error(`Response is missing the ${platform} variant`);
      }
    }

    const copy: GeneratedCopy = {
      ...(parsed as GeneratedCopy),
      x: typeof parsed.x === "string" ? parsed.x : "",
      linkedin: typeof parsed.linkedin === "string" ? parsed.linkedin : "",
    };

    return { copy, usage: this.usageFrom(payload) };
  }
}
