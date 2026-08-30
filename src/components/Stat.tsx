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
      {/* flex-wrap, and a value that may shrink.
          StatRow is grid-cols-2 on a phone, so each cell is about 170px at
          360px wide. A long figure plus a trend badge did not fit, and neither
          child could give way: the row pushed past the cell, past the container,
          and the whole DOCUMENT scrolled sideways — 22px at 360px, 7px at 390px,
          measured on /visa/f1-student-visas, and latent on every Stat that pairs
          a long number with a trend. Wrapping drops the badge to its own line
          instead. */}
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="min-w-0 break-words font-mono text-2xl font-semibold tabular-nums text-white">
          {value}
        </span>
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
