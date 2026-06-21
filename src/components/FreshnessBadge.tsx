import type { Completeness } from "@/lib/types";

// Color is carried by a small dot only; the pill itself stays neutral so it
// doesn't compete with the number it describes.
const META: Record<Completeness, { label: string; dot: string }> = {
  complete: { label: "Complete", dot: "bg-status-green" },
  ytd: { label: "YTD", dot: "bg-accent" },
  preliminary: { label: "Preliminary", dot: "bg-status-amber" },
  point_in_time: { label: "Point-in-time", dot: "bg-fuchsia-400" },
  estimated: { label: "Est. pace", dot: "bg-status-amber" },
};

/** "Data Freshness" pill describing how complete a metric's latest period is. */
export function FreshnessBadge({
  completeness,
  className = "",
}: {
  completeness: Completeness;
  className?: string;
}) {
  const m = META[completeness];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400 ${className}`}
      title={`Data freshness: ${m.label}`}
    >
      <span className={`h-1 w-1 rounded-full ${m.dot}`} aria-hidden />
      {m.label}
    </span>
  );
}

export function freshnessLabel(completeness: Completeness): string {
  return META[completeness].label;
}
