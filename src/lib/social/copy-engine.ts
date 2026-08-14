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

export interface EngineOptions {
  /** "openai" (default), "anthropic", or "transcript". */
  provider?: string;
  /** Path to the transcript file, when the transcript provider is selected. */
  transcriptPath?: string;
}

export function createCopyEngine(opts: EngineOptions = {}): CopyEngine {
  const provider = opts.provider ?? process.env.SOCIAL_ENGINE ?? DEFAULT_PROVIDER;

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
      throw new Error(`Unknown copy engine provider: ${provider}`);
  }
}

export { AnthropicCopyEngine, OpenAICopyEngine, TranscriptCopyEngine };
