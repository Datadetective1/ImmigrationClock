import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { GroupedBarChart } from "@/components/charts/LazyCharts";
import { DownloadCsvButton } from "@/components/DownloadCsvButton";
import { DataStatus } from "@/components/DataStatus";
import { warnH1bCrossLink, WARN_META } from "@/lib/warn";
import { WARN_COVERAGE_SENTENCE, WARN_SUMMARY, WARN_SOURCE } from "@/lib/warn-summary";
import { EMPLOYERS_META } from "@/lib/employers";
import { formatNumber, formatRate, formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Layoffs vs H-1B Sponsorship",
  description:
    "Compare WARN layoff notices with H-1B sponsorship at the same employers — presented side-by-side, without claiming causation.",
  path: "/layoffs-vs-h1b",
  image: ogImagePath("page", "layoffs-vs-h1b"),
  keywords: ["layoffs vs H-1B", "WARN notices", "H-1B sponsorship", "worker replacement"],
});

export default function LayoffsVsH1bPage() {
  // Live join: employers that appear in BOTH the real WARN feed and the USCIS
  // H-1B directory. This is the data no single-source layoff tracker can produce.
  // Every figure on this page comes from this join — there is no modeled layer.
  const crossLinked = warnH1bCrossLink();
  const totalCrossLayoffs = crossLinked.reduce((s, r) => s + r.layoffs, 0);
  const totalApprovals = crossLinked.reduce((s, r) => s + r.approvals, 0);

  // Chart the ten matched employers with the largest WARN totals. Labels use the
  // real employer name (truncated for the axis), not a first-word guess.
  const chart = [...crossLinked]
    .sort((a, b) => b.layoffs - a.layoffs)
    .slice(0, 10)
    .map((r) => ({
      label: r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name,
      "H-1B approvals": r.approvals,
      "Layoffs (WARN)": r.layoffs,
    }));

  const csvRows = crossLinked.map((r) => ({
    employer: r.name,
    states: r.states.join(" "),
    h1b_approvals: r.approvals,
    h1b_denials: r.denials,
    layoffs_warn: r.layoffs,
    warn_notices: r.notices,
    latest_notice: r.latestNotice ?? "",
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
          <Stat
            label="Employers in both datasets"
            value={String(crossLinked.length)}
            sub="Live WARN × USCIS H-1B"
            tooltip="Employers that appear in both the real WARN feed and the USCIS H-1B directory. Appearing in both does not imply one caused the other."
          />
          <Stat
            label="Their WARN layoffs"
            value={formatNumber(totalCrossLayoffs)}
            sub="Employees noticed"
            tooltip="Total employees covered by WARN notices filed by these matched employers, across the states in the feed."
          />
          <Stat
            label="Their H-1B approvals"
            value={formatNumber(totalApprovals)}
            sub={`FY${EMPLOYERS_META.fiscalYear} · USCIS`}
            tooltip="USCIS H-1B Employer Data Hub approvals for the same matched employers. Reported figures, not estimates."
          />
          <Stat
            label="WARN states covered"
            value={String(WARN_META.stateCount)}
            sub={WARN_SUMMARY.stateCodes.join(", ")}
            tooltip={WARN_COVERAGE_SENTENCE}
          />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <DataStatus
          sourceKey="warn_layoffs"
          surface="layoffs-vs-h1b"
          provenance="reported"
          dataThrough={WARN_SUMMARY.maxNoticeDate}
          refreshedAt={WARN_SUMMARY.generatedAt.slice(0, 10)}
        />

        <MethodologyNote variant="warning">
          The most important caveat on this page: a company can lay off workers in one division and sponsor
          H-1B workers in another, in different roles, cities, and years. WARN notices say nothing about who
          was hired afterward. <span className="font-semibold text-white">Do not read these bars as replacement.</span>
        </MethodologyNote>

        <ChartCard
          title="The ten matched employers with the largest WARN totals"
          subtitle={`Real WARN notice totals beside USCIS FY${EMPLOYERS_META.fiscalYear} H-1B approvals for the same employer. Both bars are reported figures.`}
          source={{
            sourceName: `USCIS H-1B Employer Data Hub + ${WARN_SOURCE.sourceName}`,
            sourceUrl: WARN_SOURCE.sourceUrl,
            sourceUpdatedAt: WARN_SOURCE.sourceUpdatedAt,
          }}
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
            // The full matched-employer table below carries these same columns for
            // every employer, not just the top ten — plus a CSV download.
            hideData
          />
        </ChartCard>


        <ChartCard
          title="Every employer in both datasets — live"
          subtitle={`Matched from ${formatNumber(WARN_META.noticeCount)} real WARN notices across ${WARN_META.stateCount} states against the USCIS H-1B employer directory. Sorted by H-1B approvals.`}
          source={{
            sourceName: "USCIS H-1B Employer Data Hub + State WARN portals",
            sourceUrl: WARN_SOURCE.sourceUrl,
            sourceUpdatedAt: WARN_SOURCE.sourceUpdatedAt,
          }}
          actions={<DownloadCsvButton rows={csvRows} filename="warn-x-h1b-employers" />}
        >
          {crossLinked.length === 0 ? (
            <p className="text-sm text-slate-400">No overlap in the current feed. Coverage grows as more states publish machine-readable WARN data.</p>
          ) : (
            <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-3 font-medium">Employer</th>
                    <th className="px-4 py-3 font-medium">States</th>
                    <th className="px-4 py-3 font-medium text-right">H-1B approvals</th>
                    <th className="px-4 py-3 font-medium text-right">Approval rate</th>
                    <th className="px-4 py-3 font-medium text-right">Layoffs (WARN)</th>
                    <th className="px-4 py-3 font-medium">Latest notice</th>
                  </tr>
                </thead>
                <tbody>
                  {crossLinked.map((r) => (
                    <tr key={r.h1bSlug} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <Link href={`/employer/${r.h1bSlug}`} className="font-medium text-white hover:text-accent-soft">
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{r.states.join(", ")}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-accent-soft">{formatNumber(r.approvals)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-300">{formatRate(r.approvalRate)}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-status-red">{formatNumber(r.layoffs)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-slate-500">{r.latestNotice ? formatDate(r.latestNotice) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>

        <div className="panel panel-pad text-sm leading-relaxed text-slate-300">
          <h2 className="mb-2 text-base font-semibold text-white">How to read this responsibly</h2>
          <ul className="list-inside list-disc space-y-1.5 text-slate-300">
            <li>Layoffs and sponsorship are reported on different calendars (calendar year vs fiscal year).</li>
            <li>H-1B approvals include both new and continuing workers already in their roles.</li>
            <li>No dataset here records whether a laid-off worker was replaced, or by whom.</li>
            <li>Correlation in these bars is not causation. Treat it as a prompt for questions, not a verdict.</li>
            <li>{WARN_COVERAGE_SENTENCE} An employer with no notice here may still have laid off workers in a state we don&rsquo;t yet cover.</li>
            <li>
              Employers are matched by a normalized name. Matching is best-effort — verify against the state
              portal link on any individual notice before relying on it.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
