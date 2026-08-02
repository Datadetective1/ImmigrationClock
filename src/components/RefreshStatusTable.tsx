import { formatDate, formatNumber } from "@/lib/format";
import { FreshnessBadge } from "./FreshnessBadge";
import type { RefreshRow, RefreshStatus } from "@/lib/types";

const STATUS_STYLE: Record<RefreshStatus, string> = {
  SUCCESS: "text-status-green bg-status-green/10 border-status-green/20",
  PARTIAL: "text-status-amber bg-status-amber/10 border-status-amber/20",
  FAILED: "text-status-red bg-status-red/10 border-status-red/20",
  PENDING: "text-slate-300 bg-white/5 border-white/10",
};

// A curated source reports PENDING rather than SUCCESS: no pipeline ran, so there
// is no automated outcome to claim. Saying SUCCESS would imply a check that never
// happened.
const INGESTION_STYLE: Record<string, string> = {
  "live-api": "border-status-green/20 bg-status-green/10 text-status-green",
  "live-file": "border-status-green/20 bg-status-green/10 text-status-green",
  "scheduled-scrape": "border-accent/20 bg-accent/10 text-accent-soft",
  curated: "border-white/10 bg-white/5 text-slate-400",
  planned: "border-white/10 bg-white/5 text-slate-500",
};
const INGESTION_LABEL: Record<string, string> = {
  "live-api": "Fetched from a machine-readable API on every build.",
  "live-file": "Fetched from a published machine-readable file on every build.",
  "scheduled-scrape": "Scraped on a schedule; the build reads a committed snapshot.",
  curated: "Hand-transcribed from the agency's published report. No automated fetch runs.",
  planned: "Registered as a source we intend to cover. Not ingested yet.",
};

export function RefreshStatusTable({ rows }: { rows: RefreshRow[] }) {
  return (
    <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Latest period</th>
            <th className="px-4 py-3 font-medium">Completeness</th>
            <th className="px-4 py-3 font-medium">How it arrives</th>
            <th className="px-4 py-3 font-medium">Source updated</th>
            <th className="px-4 py-3 font-medium">Last refresh</th>
            <th className="px-4 py-3 font-medium">Last verified</th>
            <th className="px-4 py-3 font-medium">Rows</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-white/5 align-top last:border-0 hover:bg-white/[0.03]">
              <td className="px-4 py-3">
                <div className="font-medium text-white">{r.name}</div>
                <div className="text-xs capitalize text-slate-500">{r.agency} · {r.cadence}</div>
                {r.errorMessage ? (
                  <div className="mt-1 text-xs text-status-red">{r.errorMessage}</div>
                ) : null}
              </td>
              <td className="px-4 py-3 font-medium text-slate-200">{r.latestPeriod}</td>
              <td className="px-4 py-3">
                <FreshnessBadge completeness={r.completeness} />
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                    INGESTION_STYLE[r.ingestion] ?? "border-white/10 bg-white/5 text-slate-300"
                  }`}
                  title={INGESTION_LABEL[r.ingestion] ?? r.ingestion}
                >
                  {r.ingestion}
                </span>
                {r.tier === "third-party" ? (
                  <div className="mt-1 text-xs font-semibold text-status-amber">Not a government source</div>
                ) : null}
              </td>
              <td className="px-4 py-3 text-slate-300">{formatDate(r.sourceUpdatedAt)}</td>
              <td className="px-4 py-3 text-slate-300">{formatDate(r.lastRefreshAt)}</td>
              <td className="px-4 py-3">
                <div className="text-slate-300">{formatDate(r.lastVerifiedAt)}</div>
                {r.monthsSinceVerified != null ? (
                  <div
                    className={`text-xs ${
                      r.monthsSinceVerified >= 6 ? "text-status-amber" : "text-slate-500"
                    }`}
                  >
                    {r.monthsSinceVerified === 0
                      ? "this month"
                      : `${r.monthsSinceVerified} mo ago`}
                  </div>
                ) : null}
              </td>
              <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatNumber(r.rowCount)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}>
                  {r.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
