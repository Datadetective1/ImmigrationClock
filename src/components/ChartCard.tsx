import { SourceBadge } from "./SourceBadge";
import { Tooltip } from "./Tooltip";
import { ProvenanceTag } from "./ProvenanceTag";
import type { Provenance } from "@/lib/types";

/**
 * Titled panel wrapper for a chart, table, or any dashboard widget.
 *
 * Pass `provenance` on any card whose figures are not straight reported agency
 * numbers. A chart of apportioned values must say so on the card itself — a
 * source badge alone implies the agency published the breakdown being shown.
 */
export function ChartCard({
  title,
  subtitle,
  tooltip,
  source,
  provenance,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  tooltip?: string;
  source?: { sourceName: string; sourceUrl: string; sourceUpdatedAt: string };
  provenance?: Provenance;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel panel-pad ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {tooltip ? <Tooltip text={tooltip} /> : null}
            {provenance ? <ProvenanceTag provenance={provenance} /> : null}
          </div>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
      {source ? (
        <div className="mt-4 border-t border-white/5 pt-3">
          <SourceBadge {...source} />
        </div>
      ) : null}
    </section>
  );
}
