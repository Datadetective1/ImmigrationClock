import { ProvenanceTag } from "./ProvenanceTag";
import type { RelevanceSummary } from "@/lib/relevance";

/**
 * "What this means for you" — rule-based, audience-specific data context. Framed
 * strictly as data interpretation (direction/magnitude), never legal or
 * immigration advice; the footer disclaimer makes that explicit.
 */
export function RelevanceCard({
  summaries,
  title = "What this means for you",
}: {
  summaries: RelevanceSummary[];
  title?: string;
}) {
  if (!summaries.length) return null;

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-accent/60 to-transparent" />
      <div className="eyebrow mb-1 text-accent">Personal relevance</div>
      <h2 className="text-lg font-bold text-white sm:text-xl">{title}</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {summaries.map((s) => (
          <div key={s.audience} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <h3 className="text-sm font-semibold text-white">{s.audience}</h3>
            <ul className="mt-2 space-y-2">
              {s.points.map((p, i) => (
                <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-300">
                  <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
                  <span>
                    {p.text} <ProvenanceTag provenance={p.provenance} className="ml-0.5 align-middle" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-slate-500">
        This is data context only — <strong className="text-slate-400">not legal or immigration advice</strong>.
        Figures are labelled reported, projected, or estimated; for individual situations consult a qualified
        professional.
      </p>
    </section>
  );
}
