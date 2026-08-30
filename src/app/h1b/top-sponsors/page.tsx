import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { EmployerTable } from "@/components/EmployerTable";
import { RelevanceCard } from "@/components/RelevanceCard";
import { HorizontalBarChart } from "@/components/charts/LazyCharts";
import { employerRelevance } from "@/lib/relevance";
import { topSponsors, topOccupationsBySponsorship, LAST_COMPLETE_FY } from "@/lib/data";
import { states, UPDATED } from "@/lib/dataset";
import { EMPLOYERS_META } from "@/lib/employers";
import { EntityChanges } from "@/components/EntityChanges";
import { entityId } from "@/domains/graph/entities";
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
          <Stat
            label="Tracked approvals"
            value={formatNumber(totalApprovals)}
            sub={`${fiscalYearLabel(LAST_COMPLETE_FY)} · ${sponsors.length} curated employers`}
            provenance="modeled"
            tooltip={`Approvals across a curated set of ${sponsors.length} large sponsors, anchored to published FY2024 rankings. Not a USCIS total and not the full directory.`}
          />
          <Stat
            label="Weighted avg wage"
            value={formatCurrency(wAvg)}
            sub="Offered wage"
            provenance="modeled"
            tooltip="Approval-weighted average across the same curated set, derived from DOL LCA disclosure averages."
          />
          <Stat label="Avg approval rate" value={formatRate(avgRate)} provenance="modeled" />
          <Stat label="Employers tracked" value={String(sponsors.length)} sub="Curated profiles" />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <MethodologyNote variant="warning">
          <strong className="text-slate-200">Two different USCIS products, two different years.</strong> This
          page ranks a curated set of {sponsors.length} large sponsors anchored to published{" "}
          {fiscalYearLabel(LAST_COMPLETE_FY)} rankings, with per-year detail modeled — that is why its figures
          carry a <em>Modeled</em> tag. The{" "}
          <Link href="/h1b/employers" className="link-accent">employer directory</Link> and every{" "}
          <Link href="/employer/amazon-com-services-llc" className="link-accent">employer page</Link> instead
          read the USCIS H-1B Employer Data Hub export directly, whose latest published year is FY
          {EMPLOYERS_META.fiscalYear} ({formatNumber(EMPLOYERS_META.nationalApprovals)} approvals across{" "}
          {formatNumber(EMPLOYERS_META.totalEmployers)} employers). The two sets will not add up to each
          other, and neither is wrong — they are different releases covering different years.
        </MethodologyNote>

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

        {/* The H-1B section hub showed sponsorship statistics and none of the
            27 recorded H-1B policy changes — the same gap EntityChanges was
            built to close on country and F-1 pages. Statistics describe what
            happened; a rule change is what may happen to the reader next. The
            entity link is the archive's own visa:h-1b tag, not a keyword
            guess. */}
        <EntityChanges entityId={entityId("visa", "H-1B")} label="H-1B" kind="visa" />

        <MethodologyNote variant="warning">
          These employers are a tracked subset of all H-1B sponsors, not the entire national total. H-1B
          approvals are USCIS petition outcomes and differ from State Department visa issuances and from DOL
          LCA filings.
        </MethodologyNote>
      </div>
    </div>
  );
}
