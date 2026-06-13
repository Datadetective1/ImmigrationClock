import { formatDate, formatNumber } from "@/lib/format";
import type { RefreshRow, RefreshStatus } from "@/lib/types";

const STATUS_STYLE: Record<RefreshStatus, string> = {
  SUCCESS: "text-status-green bg-status-green/10 border-status-green/20",
  PARTIAL: "text-status-amber bg-status-amber/10 border-status-amber/20",
  FAILED: "text-status-red bg-status-red/10 border-status-red/20",
  PENDING: "text-slate-300 bg-white/5 border-white/10",
};

export function RefreshStatusTable({ rows }: { rows: RefreshRow[] }) {
  return (
    <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Cadence</th>
            <th className="px-4 py-3 font-medium">Last refresh</th>
            <th className="px-4 py-3 font-medium">Rows</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Next scheduled</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-white/5 align-top last:border-0 hover:bg-white/[0.03]">
              <td className="px-4 py-3">
                <div className="font-medium text-white">{r.name}</div>
                <div className="text-xs text-slate-500">{r.agency}</div>
                {r.errorMessage ? (
                  <div className="mt-1 text-xs text-status-red">{r.errorMessage}</div>
                ) : null}
              </td>
              <td className="px-4 py-3 capitalize text-slate-300">{r.cadence}</td>
              <td className="px-4 py-3 text-slate-300">{formatDate(r.lastRefreshAt)}</td>
              <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatNumber(r.rowCount)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                  {r.status}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-300">{formatDate(r.nextRefreshAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
