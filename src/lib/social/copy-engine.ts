// =============================================================================
// COPY ENGINE — the provider seam
//
// One interface, one method. The seam exists so that changing model or vendor is
// a configuration change rather than an architecture change. It does NOT exist
// to host a registry of interchangeable providers, and it should not grow one
// until there is a second provider anyone actually intends to run.
//
// Two implementations ship:
//
//   openai      the real engine — model from SOCIAL_MODEL, default gpt-5
//   anthropic   the previous engine — Claude. Kept, not deleted: the Anthropic
//               organization is unavailable, which is a different thing from
//               the integration being wrong, and SOCIAL_ENGINE=anthropic
//               restores it in one variable when access returns.
//   transcript  replays copy from a file, for dry runs and simulations on a
//               machine with no credentials
//
// The transcript engine is not a fallback. If the real engine is unavailable
// during a live run the slot skips, because a second, rarely-exercised voice
// that ships only when nobody is watching is worse than silence. It is selected
// explicitly, by flag, and it stamps its own id into the ledger so a simulation
// can never be mistaken for a production run.
// =============================================================================

import type { CopyEngine } from "./types";
import { AnthropicCopyEngine } from "./providers/anthropic";
import { OpenAICopyEngine } from "./providers/openai";
import { TranscriptCopyEngine } from "./providers/transcript";

/**
 * The production provider.
 *
 * OpenAI while the Anthropic organization is unavailable. The seam is what made
 * this a configuration change rather than an architecture one: `CopyEngine` has
 * one method, every gate around it is untouched, and the prompt and response
 * schema transferred verbatim.
 */
export const DEFAULT_PROVIDER = "openai";

/** Default model per provider. Overridden by SOCIAL_MODEL. */
export const DEFAULT_MODEL_BY_PROVIDER: Record<string, string> = {
  openai: "gpt-5",
  anthropic: "claude-opus-5",
};

/** Back-compat alias. The Anthropic default, kept so nothing importing it breaks. */
export const DEFAULT_MODEL = DEFAULT_MODEL_BY_PROVIDER.anthropic;

/** Every provider name this seam accepts. The one place the spellings live. */
export const KNOWN_PROVIDERS = ["openai", "anthropic", "transcript"] as const;
export type ProviderName = (typeof KNOWN_PROVIDERS)[number];

export function isKnownProvider(provider: string): provider is ProviderName {
  return (KNOWN_PROVIDERS as readonly string[]).includes(provider);
}

/**
 * WHICH PROVIDER A RUN USES — the one resolution rule, blank-safe.
 *
 * This used to be `opts.provider ?? process.env.SOCIAL_ENGINE ?? DEFAULT_PROVIDER`,
 * and `??` was the bug. It falls back on null and undefined only, and an UNSET
 * GitHub repository variable does not arrive as either: `SOCIAL_ENGINE: ${{
 * vars.SOCIAL_ENGINE }}` renders as the EMPTY STRING, so the variable is present
 * in the environment with no value. The empty string is not nullish, so it won a
 * `??` chain outright and reached the switch below as "", which matched no case
 * and threw `Unknown copy engine provider: ` with nothing after the colon.
 *
 * It failed only in production, which is what made it confusing: a dry run
 * passes `--engine=openai` explicitly, and preflight already used `||` here, so
 * the two paths a human actually watches both resolved correctly while the
 * scheduled live run — the only one reading a bare, empty SOCIAL_ENGINE — did
 * not. The same empty-string trap is documented for SOCIAL_POST_ENABLED in
 * tests/social-workflow.test.ts; this is the second instance of it.
 *
 * Blank now means "not configured" and resolves to DEFAULT_PROVIDER, which is
 * openai. It never resolves to anthropic implicitly: that requires someone to
 * write SOCIAL_ENGINE=anthropic.
 */
export function resolveProvider(
  explicit?: string,
  // Deliberately a plain record rather than NodeJS.ProcessEnv: this project's
  // ProcessEnv requires NODE_ENV, which would force every caller wanting to test
  // one variable to construct a whole environment.
  env: Record<string, string | undefined> = process.env
): string {
  const chosen = (explicit ?? "").trim() || (env.SOCIAL_ENGINE ?? "").trim();
  return chosen || DEFAULT_PROVIDER;
}

/** The API key each provider needs, for messages that name the missing one. */
export const KEY_BY_PROVIDER: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

export interface EngineOptions {
  /** "openai" (default), "anthropic", or "transcript". */
  provider?: string;
  /** Path to the transcript file, when the transcript provider is selected. */
  transcriptPath?: string;
}

export function createCopyEngine(opts: EngineOptions = {}): CopyEngine {
  const provider = resolveProvider(opts.provider);

  switch (provider) {
    case "transcript":
      if (!opts.transcriptPath) {
        throw new Error("transcript engine requires a transcript file path");
      }
      return new TranscriptCopyEngine(opts.transcriptPath);

    case "openai": {
      const key = process.env.OPENAI_API_KEY;
      if (!key) {
        throw new Error(
          "OPENAI_API_KEY is not set. Live publishing requires it; use --engine=transcript for an offline dry run."
        );
      }
      return new OpenAICopyEngine({
        apiKey: key,
        model: process.env.SOCIAL_MODEL || DEFAULT_MODEL_BY_PROVIDER.openai,
      });
    }

    case "anthropic": {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set. Live publishing requires it; use --engine=transcript for an offline dry run."
        );
      }
      return new AnthropicCopyEngine({
        apiKey: key,
        model: process.env.SOCIAL_MODEL || DEFAULT_MODEL_BY_PROVIDER.anthropic,
      });
    }

    default:
      // Quoted, and with the source named. The unquoted form of this message is
      // what shipped, and a blank value made it read as a truncated sentence
      // rather than as "the value is empty" — the diagnosis cost more than the
      // fix did.
      throw new Error(
        `Unknown copy engine provider: "${provider}" ` +
          `(SOCIAL_ENGINE=${JSON.stringify(process.env.SOCIAL_ENGINE ?? null)}). ` +
          `Known providers: ${KNOWN_PROVIDERS.join(", ")}.`
      );
  }
}

export { AnthropicCopyEngine, OpenAICopyEngine, TranscriptCopyEngine };
