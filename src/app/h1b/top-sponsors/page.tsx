import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { AdSlot } from "@/components/AdSlot";
import { ResourcePanel } from "@/components/ResourcePanel";
import { partnersForPersona } from "@/lib/partners";
import { MethodologyNote } from "@/components/MethodologyNote";
import { EmployerTable } from "@/components/EmployerTable";
import { RelevanceCard } from "@/components/RelevanceCard";
import { HorizontalBarChart } from "@/components/charts/Charts";
import { employerRelevance } from "@/lib/relevance";
import { topSponsors, topOccupationsBySponsorship, LAST_COMPLETE_FY } from "@/lib/data";
import { states, UPDATED } from "@/lib/dataset";
import { formatNumber, formatCurrency, formatRate, fiscalYearLabel, slugify } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Top H-1B Sponsors",
  description:
    "The employers filing the most H-1B petitions, with approvals, denials, approval rates, and average offered wages. Sortable and downloadable.",
  path: "/h1b/top-sponsors",
  keywords: ["top H-1B sponsors", "H-1B employers", "visa sponsorship", "H-1B approval rate"],
});

export default function TopSponsorsPage() {
  const sponsors = topSponsors(LAST_COMPLETE_FY);
  const totalApprovals = sponsors.reduce((s, c) => s + c.approvals, 0);
  const wAvg = Math.round(
    sponsors.reduce((s, c) => s + c.avgWage * c.approvals, 0) / totalApprovals
  );
  const avgRate =
    sponsors.reduce((s, c) => s + c.approvalRate, 0) / sponsors.length;
  const occupations = topOccupationsBySponsorship().slice(0, 8);

  return (
    <div>
      <PageHeader
        eyebrow="Jobs, Wages & Sponsorship"
        title="Top H-1B sponsors"
        description={`Tracked employers ranked by H-1B approvals for ${fiscalYearLabel(LAST_COMPLETE_FY)}. Sponsorship volume alone does not indicate displacement of U.S. workers.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/h1b/top-sponsors", label: "Top H-1B sponsors" },
        ]}
        share
      >
        <StatRow>
          <Stat label="Tracked approvals" value={formatNumber(totalApprovals)} sub={fiscalYearLabel(LAST_COMPLETE_FY)} />
          <Stat label="Weighted avg wage" value={formatCurrency(wAvg)} sub="Offered wage" />
          <Stat label="Avg approval rate" value={formatRate(avgRate)} />
          <Stat label="Employers tracked" value={String(sponsors.length)} />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <Link
          href="/h1b/employers"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/20 bg-accent/[0.05] px-4 py-3 text-sm transition-colors hover:border-accent/40"
        >
          <span className="text-slate-200">
            Looking for a specific employer? Search the{" "}
            <strong className="text-white">full directory of thousands of H-1B sponsors</strong>.
          </span>
          <span className="shrink-0 font-semibold text-accent">Open employer directory →</span>
        </Link>

        <RelevanceCard summaries={[employerRelevance()]} />

        <ChartCard title="Tracked H-1B employers" subtitle="Sort by any column. Download as CSV.">
          <EmployerTable rows={sponsors} filename={`h1b-top-sponsors-${LAST_COMPLETE_FY}`} />
        </ChartCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Most-sponsored occupations"
            subtitle="Approximate H-1B volume by job title"
            source={{ sourceName: "DOL OFLC Disclosure Data", sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance", sourceUpdatedAt: UPDATED.dol_lca }}
          >
            <HorizontalBarChart
              data={occupations.map((o) => ({ label: o.title, value: o.approxApprovals }))}
              labelKey="label"
              valueKey="value"
              colorByIndex
              height={300}
            />
          </ChartCard>
          <ChartCard title="Explore H-1B salaries by job title" subtitle="Average offered wage per occupation">
            <ul className="divide-y divide-white/5">
              {occupations.map((o) => (
                <li key={o.title} className="flex items-center justify-between py-2.5">
                  <Link href={`/h1b/salaries/${slugify(o.title)}`} className="text-sm text-slate-200 hover:text-accent-soft">
                    {o.title}
                  </Link>
                  <span className="font-mono text-sm tabular-nums text-accent-soft">{formatCurrency(o.avgWage)}</span>
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>

        <ResourcePanel
          partners={partnersForPersona("h1b-worker", 3)}
          placement="top-sponsors"
          title="On (or applying for) an H-1B?"
          subtitle="Legal help for petitions and transfers, U.S. tax filing, and moving money across borders."
        />

        <AdSlot format="in-content" />

        <ChartCard title="H-1B sponsorship by state" subtitle="Open a state for employer detail">
          <div className="flex flex-wrap gap-2">
            {states.map((s) => (
              <Link
                key={s.code}
                href={`/h1b/state/${s.code}`}
                className="chip transition-colors hover:border-accent/40 hover:text-accent-soft"
              >
                {s.name}
              </Link>
            ))}
          </div>
        </ChartCard>

        <MethodologyNote variant="warning">
          These employers are a tracked subset of all H-1B sponsors, not the entire national total. H-1B
          approvals are USCIS petition outcomes and differ from State Department visa issuances and from DOL
          LCA filings.
        </MethodologyNote>
      </div>
    </div>
  );
}
