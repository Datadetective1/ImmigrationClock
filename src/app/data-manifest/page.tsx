import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { FreshnessBadge } from "@/components/FreshnessBadge";
import { dataManifest, REFRESH_STATUS } from "@/lib/refresh";
import { formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Data Manifest",
  description:
    "Live status of every data source powering ImmigrationClock: refresh status, last updated, and whether it is auto-fetched or manually maintained.",
  path: "/data-manifest",
});

function dt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC"
  );
}

const STATUS_STYLE: Record<string, string> = {
  ok: "text-status-green bg-status-green/10 border-status-green/25",
  stale: "text-status-red bg-status-red/10 border-status-red/25",
  manual: "text-slate-400 bg-white/5 border-white/10",
};

export default function DataManifestPage() {
  const rows = dataManifest();
  const auto = rows.filter((r) => r.auto).length;
  const failing = rows.filter((r) => r.status === "stale").length;

  return (
    <div>
      <PageHeader
        eyebrow="About the data"
        title="Data manifest"
        description="Every source behind the dashboard: refresh status, when it was last updated, and whether it is auto-fetched at build time or maintained from the latest published release."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/data-manifest", label: "Data manifest" },
        ]}
      >
        <StatRow>
          <Stat label="Pipeline last ran" value={formatDate(REFRESH_STATUS.generatedAt)} sub="This build" />
          <Stat label="Overall status" value={REFRESH_STATUS.ok ? "Healthy" : "Errors"} sub={`${REFRESH_STATUS.errors.length} error(s)`} />
          <Stat label="Auto-fetched" value={String(auto)} sub={`of ${rows.length} sources`} />
          <Stat label="Failing feeds" value={String(failing)} sub="Stale / unreachable" />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-6 py-10">
        {REFRESH_STATUS.errors.length > 0 ? (
          <div className="rounded-xl border border-status-red/30 bg-status-red/5 p-4 text-sm text-status-red">
            <span className="font-semibold">Last refresh logged {REFRESH_STATUS.errors.length} error(s):</span>
            <ul className="mt-1 list-inside list-disc">
              {REFRESH_STATUS.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Auto / manual</th>
                <th className="px-4 py-3 font-medium">Refresh status</th>
                <th className="px-4 py-3 font-medium">Latest period</th>
                <th className="px-4 py-3 font-medium">Source last updated</th>
                <th className="px-4 py-3 font-medium">Last fetched</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-white/5 align-top last:border-0 hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.agency}</div>
                    {r.lastError ? <div className="mt-1 text-xs text-status-red">{r.lastError}</div> : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.auto ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-status-green/25 bg-status-green/10 px-2 py-0.5 text-xs font-semibold text-status-green">
                        Auto-fetch
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-medium text-slate-400">
                        Manual
                      </span>
                    )}
                    <div className="mt-1 text-[11px] text-slate-500">{r.feed}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${STATUS_STYLE[r.status] ?? STATUS_STYLE.manual}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-200">{r.latestPeriod}</div>
                    <FreshnessBadge completeness={r.completeness} className="mt-1" />
                  </td>
                  <td className="px-4 py-3 text-slate-300">{r.sourceUpdatedAt ? formatDate(r.sourceUpdatedAt) : "—"}</td>
                  <td className="px-4 py-3 text-slate-400">{dt(r.lastFetchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs leading-relaxed text-slate-500">
          <span className="font-semibold text-slate-300">Auto-fetch</span> sources are pulled directly from a
          machine-readable feed every time the site builds (with a real fetch timestamp).{" "}
          <span className="font-semibold text-slate-300">Manual</span> sources have no stable public API yet, so
          they are maintained from the agency&rsquo;s latest published release plus clearly-labelled projections.
          A machine-readable version of this manifest is available at{" "}
          <a href="/data-manifest.json" className="link-accent" target="_blank" rel="noopener noreferrer">
            /data-manifest.json
          </a>
          . See <Link href="/data" className="link-accent">Data &amp; freshness</Link> for what the labels mean.
        </p>
      </div>
    </div>
  );
}
