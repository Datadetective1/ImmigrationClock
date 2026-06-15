import { reportingLagRows } from "@/lib/refresh";
import { formatDate } from "@/lib/format";

/** "≈ current", "~9 months behind", etc. */
function lagPhrase(live: boolean, lagMonths: number | null): { text: string; cls: string } {
  if (lagMonths == null) return { text: "—", cls: "text-slate-500" };
  if (lagMonths <= 1) return { text: live ? "Current" : "≈ current", cls: "text-status-green" };
  if (lagMonths <= 4) return { text: `~${lagMonths} months behind`, cls: "text-status-amber" };
  return { text: `~${lagMonths} months behind`, cls: "text-status-red" };
}

/**
 * Plain-English reporting-lag explainer. Shows, per source, whether it is a live
 * machine-readable feed or curated/manual, how current the newest data is, and
 * the honesty labels — so users understand why (e.g.) visa data lags CBP/WARN.
 */
export function ReportingLag({ only, compact = false }: { only?: string[]; compact?: boolean }) {
  let rows = reportingLagRows();
  if (only) rows = rows.filter((r) => only.includes(r.key));
  rows.sort((a, b) => Number(b.live) - Number(a.live) || (a.lagMonths ?? 99) - (b.lagMonths ?? 99));

  return (
    <div className="space-y-4">
      {!compact ? (
        <p className="text-sm leading-relaxed text-slate-300">
          Official immigration data is published on a delay — some sources monthly, others only once a
          year. Where an agency offers a machine-readable feed we fetch it{" "}
          <strong className="text-white">live at build time</strong>; the rest we keep as the{" "}
          <strong className="text-white">latest official published figures</strong>, clearly labelled and
          never presented as more current than they are.
        </p>
      ) : null}

      <ul className="space-y-2.5">
        {rows.map((r) => {
          const lag = lagPhrase(r.live, r.lagMonths);
          return (
            <li key={r.key} className="panel panel-pad">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-white">{r.name}</span>
                    {r.live ? (
                      <span className="rounded-md border border-status-green/25 bg-status-green/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-green">
                        Live feed{r.liveScope ? ` · ${r.liveScope}` : ""}
                      </span>
                    ) : (
                      <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Curated · delayed
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {r.agency} · updates {r.cadence}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-sm font-semibold ${lag.cls}`}>{lag.text}</div>
                  <div className="text-[11px] text-slate-500">
                    Latest: {r.latestPeriod}
                    {r.dataThrough ? ` · through ${formatDate(r.dataThrough)}` : ""}
                  </div>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {r.labels.map((l) => (
                  <span
                    key={l}
                    className="rounded-md border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
                  >
                    {l}
                  </span>
                ))}
              </div>

              {r.note ? (
                <p className="mt-2.5 text-[12px] leading-relaxed text-slate-400">{r.note}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
