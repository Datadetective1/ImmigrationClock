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
  const ok = rows.filter((r) => r.status === "SUCCESS").length;
  const failed = rows.filter((r) => r.status === "FAILED").length;
  const totalRows = rows.reduce((s, r) => s + r.rowCount, 0);

  return (
    <div>
      <PageHeader
        eyebrow="Admin"
        title="Data refresh status"
        description="Operational view of the ingestion pipeline. Each row maps to a Python ingestion script and a DataSource record in the database."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/admin/refresh-status", label: "Refresh status" },
        ]}
      >
        <StatRow>
          <Stat label="Sources tracked" value={String(rows.length)} />
          <Stat label="Healthy" value={String(ok)} sub="Last run succeeded" />
          <Stat label="Failed" value={String(failed)} sub="Needs attention" />
          <Stat label="Total rows" value={formatNumber(totalRows)} sub="Across all datasets" />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-6 py-10">
        <RefreshStatusTable rows={rows} />

        <div className="panel panel-pad text-sm leading-relaxed text-slate-400">
          <p>
            <span className="font-semibold text-white">How this updates: </span>
            The Python scripts in <code className="rounded bg-white/5 px-1.5 py-0.5 text-accent-soft">/data_pipeline</code>{" "}
            download each public dataset, normalize it, and write rows plus a{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-accent-soft">RefreshLog</code> entry. Run them
            with <code className="rounded bg-white/5 px-1.5 py-0.5 text-accent-soft">python data_pipeline/run_all_ingestions.py</code>{" "}
            or schedule them (cron / GitHub Actions / Vercel Cron). In the MVP this view reflects the bundled
            sample dataset.
          </p>
        </div>
      </div>
    </div>
  );
}
