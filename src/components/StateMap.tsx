import Link from "next/link";
import { formatCompact } from "@/lib/format";

export interface StateDatum {
  code: string;
  name: string;
  value: number;
}

/**
 * Map placeholder: a heat-tile grid of states colored by intensity. A real
 * SVG/Mapbox choropleth can drop in later with the same data shape.
 */
export function StateMap({
  data,
  label,
  unit = "",
}: {
  data: StateDatum[];
  label: string;
  unit?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-slate-500">{label}</span>
        <span className="rounded-md border border-dashed border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-600">
          Map placeholder
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {data.map((d) => {
          const intensity = d.value / max;
          return (
            <Link
              key={d.code}
              href={`/state/${d.code}`}
              className="group relative overflow-hidden rounded-xl border border-white/5 p-3 transition-transform hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, rgba(56,189,248,${0.08 + intensity * 0.5}), rgba(244,63,94,${intensity * 0.18}))`,
              }}
            >
              <div className="font-mono text-lg font-bold text-white">{d.code}</div>
              <div className="truncate text-[11px] text-slate-300">{d.name}</div>
              <div className="mt-1 font-mono text-sm tabular-nums text-accent-soft">
                {formatCompact(d.value)}
                {unit ? <span className="ml-1 text-[10px] text-slate-400">{unit}</span> : null}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
