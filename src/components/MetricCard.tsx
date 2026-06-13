import Link from "next/link";
import { AnimatedCounter } from "./AnimatedCounter";
import { TrendBadge } from "./TrendBadge";
import { SourceBadge } from "./SourceBadge";
import { Tooltip } from "./Tooltip";
import type { Metric, StatusLevel } from "@/lib/types";

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

export function MetricCard({ metric }: { metric: Metric }) {
  const isCurrency = metric.unit === "USD";

  // The whole card is clickable via a stretched link on the title, so the
  // SourceBadge anchor stays a sibling (no invalid nested <a> / hydration error).
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
        {metric.trend !== "FLAT" ? (
          <span className="relative z-20">
            <TrendBadge trend={metric.trend} pct={metric.trendPct} />
          </span>
        ) : null}
      </div>

      <div className="mt-3">
        {metric.display ? (
          <div className="stat-value truncate" title={metric.display}>
            {metric.display}
          </div>
        ) : (
          <div className="stat-value">
            <AnimatedCounter value={metric.value} prefix={isCurrency ? "$" : ""} />
          </div>
        )}
        {metric.display && metric.value > 0 ? (
          <div className="mt-1 font-mono text-sm text-slate-400">
            <AnimatedCounter value={metric.value} />{" "}
            <span className="text-slate-500">{metric.unit}</span>
          </div>
        ) : metric.unit && !isCurrency ? (
          <div className="mt-1 text-xs text-slate-500">{metric.unit}</div>
        ) : null}
      </div>

      <div className="relative z-20 mt-4">
        <SourceBadge
          sourceName={metric.sourceName}
          sourceUrl={metric.sourceUrl}
          sourceUpdatedAt={metric.sourceUpdatedAt}
          paceEstimated={metric.paceEstimated}
        />
      </div>
    </div>
  );
}
