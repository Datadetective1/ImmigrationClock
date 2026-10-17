// =============================================================================
// STAGE PILL — where a document stands, in words, shape and colour
//
// Words carry the meaning; the mark's shape repeats it for a quick scan and
// for readers who do not distinguish the colours. Colour comes from the theme
// tokens, so it works in light and dark. Built on stageOf() (src/lib/stage.ts):
// it never says "in force".
// =============================================================================

import type { Stage, StageKind } from "@/lib/stage";

const TONE: Record<StageKind, { text: string; mark: string }> = {
  // Open ring: not final.
  proposed: { text: "text-fuchsia-300 border-fuchsia-300/40 bg-fuchsia-300/10", mark: "rounded-full border-2 border-current" },
  // Half-filled: final, its stated date still ahead.
  final_ahead: { text: "text-status-amber border-status-amber/40 bg-status-amber/10", mark: "rounded-full border-2 border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]" },
  // Filled: final, its stated date has passed.
  final_date_passed: { text: "text-status-green border-status-green/40 bg-status-green/10", mark: "rounded-full bg-current" },
  final_undated: { text: "text-slate-300 border-white/15 bg-white/5", mark: "rounded-full bg-current" },
  // Square: an agency's own communication, not a rule.
  announcement: { text: "text-accent border-accent/40 bg-accent/10", mark: "rounded-[2px] bg-current" },
  // Diamond: a court.
  court: { text: "text-slate-300 border-white/15 bg-white/5", mark: "rotate-45 rounded-[1px] bg-current" },
  legislative: { text: "text-slate-300 border-white/15 bg-white/5", mark: "rounded-[2px] border-2 border-current" },
  data: { text: "text-slate-300 border-white/15 bg-white/5", mark: "rounded-[2px] border-2 border-current" },
  correction: { text: "text-slate-400 border-white/10 bg-white/5", mark: "rounded-full border-2 border-dashed border-current" },
  deadline: { text: "text-slate-300 border-white/15 bg-white/5", mark: "rounded-[2px] border-2 border-current" },
};

export function StagePill({ stage, className = "" }: { stage: Stage; className?: string }) {
  const tone = TONE[stage.kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone.text} ${className}`}
    >
      <span aria-hidden className={`inline-block h-2 w-2 shrink-0 ${tone.mark}`} />
      {stage.label}
      {stage.amended ? <span className="font-normal opacity-80">· amended later</span> : null}
    </span>
  );
}
