import Link from "next/link";
import { AnimatedCounter } from "./AnimatedCounter";
import { TrendBadge } from "./TrendBadge";
import { SourceBadge } from "./SourceBadge";
import { Tooltip } from "./Tooltip";
import { FreshnessBadge } from "./FreshnessBadge";
import { ProvenanceTag } from "./ProvenanceTag";
import { Sparkline } from "./Sparkline";
import { formatCompact } from "@/lib/format";
import type { Metric, MetricPeriod, StatusLevel } from "@/lib/types";

export type CardMode = "latest" | "complete" | "trend";

const STATUS_RING: Record<StatusLevel, string> = {
  GREEN: "before:bg-status-green",
  AMBER: "before:bg-status-amber",
  RED: "before:bg-status-red",
};
const STATUS_GLOW: Record<StatusLevel, string> = {
  GREEN: "hover:shadow-[0_0_0_1px_rgba(34,197,94,0.25)]",
  AMBER: "hover:shadow-[0_0_0_1px_rgba(245,158,11,0.3)]",
  RED: "hover:shadow-[0_0_0_1px_rgba(244,63,94,0.35)]",
};

function activePeriod(metric: Metric, mode: CardMode): MetricPeriod {
  if (mode === "complete" && metric.lastComplete) return metric.lastComplete;
  return {
    value: metric.value,
    display: metric.display,
    fiscalYear: metric.fiscalYear,
    periodLabel: metric.periodLabel,
    completeness: metric.completeness,
    provenance: metric.provenance,
    sourceUpdatedAt: metric.sourceUpdatedAt,
  };
}

export function MetricCard({ metric, mode = "latest" }: { metric: Metric; mode?: CardMode }) {
  const period = activePeriod(metric, mode);
  const isCurrency = metric.unit === "USD";
  const showTrendView = mode === "trend" && metric.spark && metric.spark.length > 1;

  const heading = metric.href ? (
    <h3 className="text-xs font-medium leading-snug text-slate-400">
      <Link
        href={metric.href}
        className="transition-colors after:absolute after:inset-0 hover:text-slate-200 focus:outline-none focus-visible:text-accent-soft"
      >
        {metric.label}
      </Link>
    </h3>
  ) : (
    <h3 className="text-xs font-medium leading-snug text-slate-400">{metric.label}</h3>
  );

  return (
    <div
      className={`panel panel-pad group relative h-full overflow-hidden rounded-2xl transition-shadow ${STATUS_GLOW[metric.status]} before:absolute before:left-0 before:top-0 before:z-10 before:h-full before:w-1 ${STATUS_RING[metric.status]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {heading}
          <span className="relative z-20">
            <Tooltip text={metric.tooltip} />
          </span>
        </div>
        {metric.trend !== "FLAT" && !showTrendView ? (
          <span className="relative z-20">
            <TrendBadge trend={metric.trend} pct={metric.trendPct} />
          </span>
        ) : null}
      </div>

      {/* Period phrase + freshness badge + provenance tag */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[11px] font-medium text-slate-500">
          {showTrendView ? "5-year trend" : period.periodLabel}
        </span>
        <FreshnessBadge completeness={period.completeness} className="relative z-20" />
        {!showTrendView ? (
          <ProvenanceTag provenance={period.provenance} className="relative z-20" />
        ) : null}
      </div>

      <div className="mt-3">
        {showTrendView ? (
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="font-mono text-2xl font-semibold tabular-nums text-white">
                {period.display ?? (isCurrency ? "$" : "") + formatCompact(period.value)}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {metric.spark![0].label}–{metric.spark![metric.spark!.length - 1].label}
              </div>
            </div>
            <Sparkline points={metric.spark!} />
          </div>
        ) : period.display ? (
          <div className="stat-value truncate" title={period.display}>
            {period.display}
          </div>
        ) : (
          <div className="stat-value">
            <AnimatedCounter value={period.value} prefix={isCurrency ? "$" : ""} />
          </div>
        )}
        {!showTrendView && period.display && period.value > 0 ? (
          <div className="mt-1 font-mono text-sm text-slate-400">
            <AnimatedCounter value={period.value} /> <span className="text-slate-500">{metric.unit}</span>
          </div>
        ) : !showTrendView && metric.unit && !isCurrency && !period.display ? (
          <div className="mt-1 text-xs text-slate-500">{metric.unit}</div>
        ) : null}
      </div>

      <div className="relative z-20 mt-4">
        <SourceBadge
          sourceName={metric.sourceName}
          sourceUrl={metric.sourceUrl}
          sourceUpdatedAt={period.sourceUpdatedAt}
          paceEstimated={metric.paceEstimated && period.completeness !== "complete"}
        />
      </div>
    </div>
  );
}
