import Link from "next/link";
import { ProvenanceTag } from "./ProvenanceTag";
import { SourceBadge } from "./SourceBadge";
import { ShareButton } from "./ShareButton";
import type { Insight } from "@/lib/types";

const GROUP: Record<Insight["group"], { label: string; bar: string; text: string }> = {
  enforcement: { label: "Enforcement", bar: "from-status-red/60", text: "text-status-red" },
  border: { label: "Border", bar: "from-status-green/60", text: "text-status-green" },
  visa: { label: "Visas", bar: "from-accent/60", text: "text-accent" },
  workforce: { label: "Workforce", bar: "from-status-amber/60", text: "text-status-amber" },
};

/**
 * A single auto-generated insight: a punchy stat + plain-language claim + "why
 * it matters", with an integrity label, source, and share button. Colored by
 * topic (not by good/bad) so direction carries no judgement.
 */
export function InsightCard({ insight }: { insight: Insight }) {
  const g = GROUP[insight.group];
  const shareText = `${insight.headline} — via ImmigrationClock`;

  return (
    <article className="panel relative flex h-full flex-col gap-3 overflow-hidden p-5 sm:p-6">
      <div className={`absolute left-0 top-0 h-1 w-full bg-gradient-to-r ${g.bar} to-transparent`} />

      <div className="flex items-center justify-between gap-2">
        <span className={`eyebrow ${g.text}`}>{g.label}</span>
        <ProvenanceTag provenance={insight.provenance} />
      </div>

      <div className="flex items-baseline gap-3">
        <span className={`font-mono text-4xl font-extrabold tabular-nums ${g.text}`}>
          {insight.stat}
        </span>
        <span className="text-[11px] font-medium text-slate-500">{insight.periodLabel}</span>
      </div>

      <h3 className="text-base font-bold leading-snug text-white">{insight.headline}</h3>

      <p className="text-sm leading-relaxed text-slate-300">{insight.detail}</p>

      <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
        <div className="eyebrow mb-1 text-slate-500">Why it matters</div>
        <p className="text-[13px] leading-relaxed text-slate-400">{insight.whyItMatters}</p>
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
        <SourceBadge
          sourceName={insight.sourceName}
          sourceUrl={insight.sourceUrl}
          sourceUpdatedAt={insight.sourceUpdatedAt}
        />
        <div className="flex items-center gap-2">
          {insight.href ? (
            <Link
              href={insight.href}
              className="text-xs font-semibold text-accent transition-colors hover:text-accent-soft"
            >
              Explore →
            </Link>
          ) : null}
          <ShareButton title={insight.headline} text={shareText} path={insight.href ?? "/insights"} compact />
        </div>
      </div>
    </article>
  );
}
