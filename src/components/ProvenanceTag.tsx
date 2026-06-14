import type { Provenance } from "@/lib/types";

const META: Record<Provenance, { label: string; cls: string; icon: string; title: string }> = {
  reported: {
    label: "Reported",
    icon: "✓",
    cls: "text-status-green",
    title: "A real figure published by the source agency.",
  },
  projected: {
    label: "Projected",
    icon: "≈",
    cls: "text-status-amber",
    title: "A projection computed from reported data — not an official figure.",
  },
  estimated: {
    label: "Estimated",
    icon: "~",
    cls: "text-slate-400",
    title: "Derived/apportioned from reported totals — an estimate, not an official figure.",
  },
};

/**
 * Integrity tag: is this number Reported (real, published), Projected (modeled),
 * or Estimated (apportioned)? Visually distinct from the freshness badge so the
 * two are never confused.
 */
export function ProvenanceTag({ provenance, className = "" }: { provenance: Provenance; className?: string }) {
  const m = META[provenance];
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide ${m.cls} ${className}`}
      title={m.title}
    >
      <span aria-hidden className="text-[11px] leading-none">{m.icon}</span>
      {m.label}
    </span>
  );
}
