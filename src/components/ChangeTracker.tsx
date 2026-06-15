import { Sparkline } from "./Sparkline";
import { ProvenanceTag } from "./ProvenanceTag";
import { cbpLatestChange, cbpYtdSpark, cbpMonthlyInflows } from "@/lib/history";
import { formatNumber, formatCompact } from "@/lib/format";

/**
 * "What changed" panel built from the historical archive: the most recent
 * month's border-encounter inflow vs the month before, plus a sparkline of how
 * the fiscal year has built up. All real, reported CBP figures.
 */
export function ChangeTracker({ compact = false }: { compact?: boolean }) {
  const change = cbpLatestChange();
  if (!change || change.latestInflow == null) return null;

  const spark = cbpYtdSpark();
  const inflows = cbpMonthlyInflows().slice(-6);
  // Treat sub-1% month-over-month moves as "about level" so we never show "−0%".
  const up = change.inflowDeltaPct != null && change.inflowDeltaPct >= 1;
  const slow = change.inflowDeltaPct != null && change.inflowDeltaPct <= -1;
  const showPct = change.inflowDeltaPct != null && Math.abs(change.inflowDeltaPct) >= 1;
  const maxInflow = Math.max(...inflows.map((i) => i.inflow), 1);

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-status-green/60 to-transparent" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow mb-1 text-status-green">Change tracking · {change.latestPeriod}</div>
          <h2 className="text-lg font-bold text-white sm:text-xl">
            {formatNumber(change.latestInflow)} border encounters added in {change.latestPeriod.split(" ")[0]}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {change.prevInflow != null ? (
              <>
                {up ? "Up" : slow ? "Down" : "About level"} from {formatNumber(change.prevInflow)} the month before
                {showPct
                  ? ` (${change.inflowDeltaPct! >= 0 ? "+" : "−"}${Math.abs(change.inflowDeltaPct!).toFixed(0)}% month over month)`
                  : ""}
                . FY total so far: {formatNumber(change.cumulative)}.
              </>
            ) : (
              <>FY total so far: {formatNumber(change.cumulative)}.</>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ProvenanceTag provenance="reported" />
          <Sparkline points={spark} width={150} height={44} />
          <span className="text-[10px] text-slate-500">FY YTD buildup</span>
        </div>
      </div>

      {!compact && inflows.length > 1 ? (
        <div className="mt-5">
          <div className="eyebrow mb-2 text-slate-500">Encounters added each month</div>
          <div className="space-y-1.5">
            {inflows.map((m) => (
              <div key={m.period} className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-[11px] font-medium text-slate-400">{m.month}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent/70 to-status-green/70"
                    style={{ width: `${Math.max(4, (m.inflow / maxInflow) * 100)}%` }}
                  />
                </div>
                <span className="w-14 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-300">
                  {formatCompact(m.inflow)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Built from {change.points} monthly CBP releases archived over time. Each month&rsquo;s figure is a
        reported nationwide total; an encounter is an event, not a person.
      </p>
    </section>
  );
}
