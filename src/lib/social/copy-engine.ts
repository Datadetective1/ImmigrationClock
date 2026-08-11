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
//   anthropic   the real engine — Claude, model from SOCIAL_MODEL
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
import { TranscriptCopyEngine } from "./providers/transcript";

export const DEFAULT_MODEL = "claude-opus-5";

export interface EngineOptions {
  /** "anthropic" (default) or "transcript". */
  provider?: string;
  /** Path to the transcript file, when the transcript provider is selected. */
  transcriptPath?: string;
}

export function createCopyEngine(opts: EngineOptions = {}): CopyEngine {
  const provider = opts.provider ?? process.env.SOCIAL_ENGINE ?? "anthropic";

  switch (provider) {
    case "transcript":
      if (!opts.transcriptPath) {
        throw new Error("transcript engine requires a transcript file path");
      }
      return new TranscriptCopyEngine(opts.transcriptPath);

    case "anthropic": {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) {
        throw new Error(
          "ANTHROPIC_API_KEY is not set. Live publishing requires it; use --engine=transcript for an offline dry run."
        );
      }
      return new AnthropicCopyEngine({
        apiKey: key,
        model: process.env.SOCIAL_MODEL || DEFAULT_MODEL,
      });
    }

    default:
      throw new Error(`Unknown copy engine provider: ${provider}`);
  }
}

export { AnthropicCopyEngine, TranscriptCopyEngine };
