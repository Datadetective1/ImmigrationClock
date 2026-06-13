import type { Completeness } from "@/lib/types";

const META: Record<Completeness, { label: string; cls: string }> = {
  complete: { label: "Complete", cls: "text-status-green bg-status-green/10 border-status-green/25" },
  ytd: { label: "YTD", cls: "text-accent bg-accent/10 border-accent/25" },
  preliminary: { label: "Preliminary", cls: "text-status-amber bg-status-amber/10 border-status-amber/25" },
  point_in_time: { label: "Point-in-time", cls: "text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-400/25" },
  estimated: { label: "Est. pace", cls: "text-status-amber bg-status-amber/10 border-status-amber/25" },
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
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.cls} ${className}`}
      title={`Data freshness: ${m.label}`}
    >
      <span className="h-1 w-1 rounded-full bg-current" aria-hidden />
      {m.label}
    </span>
  );
}

export function freshnessLabel(completeness: Completeness): string {
  return META[completeness].label;
}
