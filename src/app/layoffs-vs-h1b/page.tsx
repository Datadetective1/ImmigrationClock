import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { AdSlot } from "@/components/AdSlot";
import { MethodologyNote } from "@/components/MethodologyNote";
import { GroupedBarChart } from "@/components/charts/Charts";
import { DownloadCsvButton } from "@/components/DownloadCsvButton";
import { layoffsVsSponsorship, LAST_COMPLETE_FY } from "@/lib/data";
import { layoffsVsH1bData } from "@/lib/chart-data";
import { UPDATED } from "@/lib/sample-data";
import { formatNumber, formatCurrency, fiscalYearLabel } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Layoffs vs H-1B Sponsorship",
  description:
    "Compare WARN layoff notices with H-1B sponsorship at the same employers — presented side-by-side, without claiming causation.",
  path: "/layoffs-vs-h1b",
  keywords: ["layoffs vs H-1B", "WARN notices", "H-1B sponsorship", "worker replacement"],
});

export default function LayoffsVsH1bPage() {
  const rows = layoffsVsSponsorship();
  const chart = layoffsVsH1bData();
  const totalLayoffs = rows.reduce((s, r) => s + r.layoffs, 0);
  const totalApprovals = rows.reduce((s, r) => s + r.approvals, 0);
  const withBoth = rows.filter((r) => r.layoffs > 0 && r.approvals > 0).length;

  const csvRows = rows.map((r) => ({
    employer: r.name,
    h1b_approvals: r.approvals,
    layoffs_warn: r.layoffs,
    avg_offered_wage_usd: r.avgWage,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Jobs & Workforce"
        title="Layoffs vs H-1B sponsorship"
        description="A side-by-side view of public layoff notices and H-1B sponsorship at the same employers. This comparison raises questions; it does not establish cause."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/layoffs-vs-h1b", label: "Layoffs vs H-1B" },
        ]}
        share
      >
        <StatRow>
          <Stat label="Tracked layoffs" value={formatNumber(totalLayoffs)} sub="Employees (WARN)" />
          <Stat label="Tracked H-1B approvals" value={formatNumber(totalApprovals)} sub={fiscalYearLabel(LAST_COMPLETE_FY)} />
          <Stat label="Employers in both datasets" value={String(withBoth)} tooltip="Appearing in both does not imply one caused the other." />
          <Stat label="Employers tracked" value={String(rows.length)} />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <MethodologyNote variant="warning">
          The most important caveat on this page: a company can lay off workers in one division and sponsor
          H-1B workers in another, in different roles, cities, and years. WARN notices say nothing about who
          was hired afterward. <span className="font-semibold text-white">Do not read these bars as replacement.</span>
        </MethodologyNote>

        <ChartCard
          title="H-1B approvals vs WARN layoffs by employer"
          subtitle={`H-1B approvals (${fiscalYearLabel(LAST_COMPLETE_FY)}) and tracked WARN layoff totals`}
          source={{ sourceName: "USCIS + DOL + State WARN portals", sourceUrl: "https://www.dol.gov/agencies/eta/layoffs/warn", sourceUpdatedAt: UPDATED.warn_layoffs }}
          actions={<DownloadCsvButton rows={csvRows} filename="layoffs-vs-h1b" />}
        >
          <GroupedBarChart
            data={chart}
            xKey="label"
            series={[
              { key: "H-1B approvals", label: "H-1B approvals", color: "#38bdf8" },
              { key: "Layoffs (WARN)", label: "Layoffs (WARN)", color: "#f43f5e" },
            ]}
            height={340}
          />
        </ChartCard>

        <AdSlot format="in-content" />

        <ChartCard title="Employer comparison table">
          <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 font-medium">Employer</th>
                  <th className="px-4 py-3 font-medium">H-1B approvals</th>
                  <th className="px-4 py-3 font-medium">Layoffs (WARN)</th>
                  <th className="px-4 py-3 font-medium">Avg offered wage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.slug} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      <Link href={`/company/${r.slug}`} className="font-medium text-white hover:text-accent-soft">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-accent-soft">{formatNumber(r.approvals)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-status-red">{formatNumber(r.layoffs)}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{formatCurrency(r.avgWage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <div className="panel panel-pad text-sm leading-relaxed text-slate-300">
          <h2 className="mb-2 text-base font-semibold text-white">How to read this responsibly</h2>
          <ul className="list-inside list-disc space-y-1.5 text-slate-300">
            <li>Layoffs and sponsorship are reported on different calendars (calendar year vs fiscal year).</li>
            <li>H-1B approvals include both new and continuing workers already in their roles.</li>
            <li>No dataset here records whether a laid-off worker was replaced, or by whom.</li>
            <li>Correlation in these bars is not causation. Treat it as a prompt for questions, not a verdict.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
