import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { RefreshStatusTable } from "@/components/RefreshStatusTable";
import { Stat, StatRow } from "@/components/Stat";
import { refreshRows } from "@/lib/refresh";
import { formatNumber } from "@/lib/format";

export const metadata = {
  ...buildMetadata({
    title: "Data refresh status",
    description: "Ingestion status for every public dataset powering ImmigrationClock.",
    path: "/admin/refresh-status",
  }),
  robots: { index: false, follow: false },
};

export default function RefreshStatusPage() {
  const rows = refreshRows();
  const automated = rows.filter((r) => r.ingestion !== "curated" && r.ingestion !== "planned");
  const ok = automated.filter((r) => r.status === "SUCCESS").length;
  const failed = rows.filter((r) => r.status === "FAILED" || r.status === "PARTIAL").length;
  const curated = rows.filter((r) => r.ingestion === "curated").length;
  const totalRows = rows.reduce((s, r) => s + r.rowCount, 0);
  const staleChecks = rows.filter((r) => (r.monthsSinceVerified ?? 0) >= 6).length;

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Data refresh status"
        description="Operational view of every source in the registry: how its data reaches the site, when it was last fetched, and when a human last verified it. Sources with no automated pipeline are shown as pending rather than healthy — there is no run outcome to report."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/admin/refresh-status", label: "Refresh status" },
        ]}
      >
        <StatRow>
          <Stat label="Sources in registry" value={String(rows.length)} />
          <Stat
            label="Automated & healthy"
            value={`${ok}/${automated.length}`}
            sub="Pipelines that ran successfully"
            tooltip="Counts only sources with an automated pipeline. Curated sources have no run to succeed or fail."
          />
          <Stat
            label="Curated (manual)"
            value={String(curated)}
            sub="Hand-transcribed from published reports"
            tooltip="No automated fetch runs for these. They are updated by hand from the agency's published report."
          />
          <Stat
            label="Verification overdue"
            value={String(staleChecks)}
            sub="Not checked in 6+ months"
            tooltip="Sources whose URL, shape, and cadence have not been confirmed by a human recently."
          />
          <Stat label="Total rows" value={formatNumber(totalRows)} sub="Across all datasets" />
          <Stat label="Failing" value={String(failed)} sub="Needs attention" />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-6 py-10">
        <RefreshStatusTable rows={rows} />

        <div className="panel panel-pad text-sm leading-relaxed text-slate-400">
          <p>
            <span className="font-semibold text-white">How this updates: </span>
            Machine-ingested sources are fetched by{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-accent-soft">npm run prebuild</code> on every
            deploy, and refreshed on a schedule by two GitHub Actions workflows — a daily data refresh and a
            twice-weekly WARN scrape. Both commit only when the underlying data genuinely changed.
          </p>
          <p className="mt-3">
            <span className="font-semibold text-white">The four dates are not the same thing. </span>
            <span className="text-slate-300">Source updated</span> is when the agency published.{" "}
            <span className="text-slate-300">Last refresh</span> is when our pipeline pulled it.{" "}
            <span className="text-slate-300">Last verified</span> is when a human last confirmed the source URL,
            shape, and cadence are still what we claim — it cannot be automated, so it is attested in the source
            registry and shown here honestly, including when it is overdue.
          </p>
          <p className="mt-3">
            <span className="font-semibold text-white">Curated sources. </span>
            Several agencies publish only PDFs or reports with no machine-readable feed. Those figures are
            transcribed by hand and marked <code className="rounded bg-white/5 px-1.5 py-0.5 text-accent-soft">curated</code>.
            They show as <span className="text-slate-300">PENDING</span> rather than healthy, because no
            automated check ran that could have succeeded.
          </p>
        </div>
      </div>
    </div>
  );
}
