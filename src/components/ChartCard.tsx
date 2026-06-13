import { SourceBadge } from "./SourceBadge";
import { Tooltip } from "./Tooltip";

/** Titled panel wrapper for a chart, table, or any dashboard widget. */
export function ChartCard({
  title,
  subtitle,
  tooltip,
  source,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  tooltip?: string;
  source?: { sourceName: string; sourceUrl: string; sourceUpdatedAt: string };
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel panel-pad ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            {tooltip ? <Tooltip text={tooltip} /> : null}
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
