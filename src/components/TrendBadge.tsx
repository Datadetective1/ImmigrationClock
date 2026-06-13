import { formatPercent } from "@/lib/format";
import type { TrendDirection } from "@/lib/types";

const STYLES: Record<TrendDirection, { cls: string; arrow: string; label: string }> = {
  UP: { cls: "text-status-red bg-status-red/10 border-status-red/20", arrow: "▲", label: "up" },
  DOWN: { cls: "text-status-green bg-status-green/10 border-status-green/20", arrow: "▼", label: "down" },
  FLAT: { cls: "text-slate-300 bg-white/5 border-white/10", arrow: "▬", label: "flat" },
};

/**
 * Trend arrow + percentage. `neutralColors` flips the semantics so "up" is not
 * implicitly bad/good — used where direction carries no judgement.
 */
export function TrendBadge({
  trend,
  pct,
  neutralColors = false,
}: {
  trend: TrendDirection;
  pct?: number;
  neutralColors?: boolean;
}) {
  const s = STYLES[trend];
  const cls = neutralColors ? "text-slate-300 bg-white/5 border-white/10" : s.cls;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}
      aria-label={`Trend ${s.label}${pct !== undefined ? ` ${pct.toFixed(1)} percent` : ""}`}
    >
      <span aria-hidden>{s.arrow}</span>
      {pct !== undefined ? formatPercent(pct) : s.label}
    </span>
  );
}
