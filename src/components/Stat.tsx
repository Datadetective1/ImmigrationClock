import { Tooltip } from "./Tooltip";
import { TrendBadge } from "./TrendBadge";
import type { TrendDirection } from "@/lib/types";

/** Small KPI block used in headers and summary rows. */
export function Stat({
  label,
  value,
  sub,
  tooltip,
  trend,
  trendPct,
}: {
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
  trend?: TrendDirection;
  trendPct?: number;
}) {
  return (
    <div className="panel panel-pad">
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        {tooltip ? <Tooltip text={tooltip} /> : null}
      </div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums text-white">{value}</span>
        {trend ? <TrendBadge trend={trend} pct={trendPct} /> : null}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}
