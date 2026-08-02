import { Tooltip } from "./Tooltip";
import { TrendBadge } from "./TrendBadge";
import { ProvenanceTag } from "./ProvenanceTag";
import type { TrendDirection, Provenance } from "@/lib/types";

/**
 * Small KPI block used in headers and summary rows.
 *
 * `provenance` renders the integrity tag inline. Pass it on any figure that is
 * not a straight reported number so a modeled value can never be mistaken for a
 * published one at a glance.
 */
export function Stat({
  label,
  value,
  sub,
  tooltip,
  trend,
  trendPct,
  provenance,
}: {
  label: string;
  value: string;
  sub?: string;
  tooltip?: string;
  trend?: TrendDirection;
  trendPct?: number;
  provenance?: Provenance;
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
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        {sub ? <span className="text-xs text-slate-500">{sub}</span> : null}
        {provenance ? <ProvenanceTag provenance={provenance} /> : null}
      </div>
    </div>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}
