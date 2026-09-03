// =============================================================================
// TRANSCRIPT COPY ENGINE — replay, for dry runs without credentials
//
// Reads pre-generated copy from a JSON file keyed by subject and angle. Every
// other stage of the pipeline — selection, scoring, angle choice, dedupe,
// validation, ledger — runs as the real production code. Only the network call
// is replaced.
//
// This exists so the system can be inspected end to end on a machine with no
// ANTHROPIC_API_KEY, and so a simulation is reproducible: the same transcript
// and the same archive produce the same 21 slots every time, which a live model
// cannot promise.
//
// IT IS NOT A FALLBACK. createCopyEngine() only returns it when explicitly
// asked, and its id is stamped into every ledger row it produces, so a
// simulation cannot be mistaken for a production run by anyone reading the
// ledger later.
// =============================================================================

import { readFileSync } from "node:fs";
import type { CopyEngine, CopyRequest, EngineResult, GeneratedCopy } from "../types";

/** `${subjectId}::${angle}` → copy. */
export type Transcript = Record<string, GeneratedCopy>;

export function transcriptKey(subjectId: string, angle: string): string {
  return `${subjectId}::${angle}`;
}

export class TranscriptCopyEngine implements CopyEngine {
  readonly id: string;
  private readonly entries: Transcript;

  constructor(path: string) {
    this.id = `transcript:${path.split(/[\\/]/).pop()}`;
    const raw = readFileSync(path, "utf8");
    const parsed = JSON.parse(raw) as { entries?: Transcript } | Transcript;
    this.entries = ("entries" in parsed ? parsed.entries : parsed) as Transcript;
  }

  async generate(req: CopyRequest): Promise<EngineResult> {
    // Keyed by content type first (the second design's identity), then by
    // angle, so fixtures written for the first design still replay.
    const byType = transcriptKey(req.facts.subjectId, req.contentType ?? req.facts.contentType ?? "breaking_change");
    const byAngle = transcriptKey(req.facts.subjectId, req.angle);
    const copy = this.entries[byType] ?? this.entries[byAngle];
    if (!copy) {
      throw new Error(`No transcript entry for ${byType} (or ${byAngle})`);
    }
    return {
      copy,
      usage: {
        model: this.id,
        // Neither of these providers reports a cache or reasoning split, so
        // they report zero rather than a guess.
        cachedInputTokens: 0,
        reasoningTokens: 0,
        totalTokens: null,
        // Token counts are estimated so the simulation's cost column is
        // meaningful, and labelled as an estimate wherever it is printed.
        inputTokens: estimateTokens(req),
        outputTokens: Math.ceil((copy.x.length + copy.linkedin.length) / 4) + 400,
        costUsd: 0,
      },
    };
  }

  has(subjectId: string, angleOrType: string): boolean {
    return Boolean(this.entries[transcriptKey(subjectId, angleOrType)]);
  }
}

/** ~4 characters per token, plus the fixed system prompt. Good enough for a budget line. */
function estimateTokens(req: CopyRequest): number {
  const factsChars =
    req.facts.title.length +
    req.facts.summary.length +
    req.facts.notes.join(" ").length +
    req.facts.entities.join(" ").length +
    req.facts.allowedUrls.join(" ").length +
    req.avoidOpenings.join(" ").length;
  const SYSTEM_PROMPT_TOKENS = 520;
  const PLATFORM_BRIEF_TOKENS = 340;
  return SYSTEM_PROMPT_TOKENS + PLATFORM_BRIEF_TOKENS + Math.ceil(factsChars / 4);
}
