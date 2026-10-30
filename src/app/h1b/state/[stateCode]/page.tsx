import { notFound } from "next/navigation";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { states } from "@/lib/dataset";
import { stateAggregate } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { HorizontalBarChart } from "@/components/charts/LazyCharts";
import { formatNumber, formatCurrency, fiscalYearLabel } from "@/lib/format";

export function generateStaticParams() {
  return states.map((s) => ({ stateCode: s.code }));
}

export function generateMetadata({ params }: { params: { stateCode: string } }) {
  const agg = stateAggregate(params.stateCode);
  if (!agg) return buildMetadata({ title: "State not found", description: "", path: `/h1b/state/${params.stateCode}` });
  return buildMetadata({
    title: `H-1B Sponsorship in ${agg.state.name}`,
    description: `Top H-1B employers, sponsored occupations, and average offered wages in ${agg.state.name}.`,
    path: `/h1b/state/${agg.state.code}`,
    keywords: [`H-1B ${agg.state.name}`, "H-1B employers", "offered wage by state"],
  });
}

export default function H1bStatePage({ params }: { params: { stateCode: string } }) {
  const agg = stateAggregate(params.stateCode);
  if (!agg) notFound();

  // The employer data is a curated list of large sponsors, so some states,
  // Florida and Illinois among them, have none with a worksite there. Those
  // pages used to read "0 approvals, $0 wage" as if that were the state's
  // figure. Now they say what is missing and where to look instead.
  const empty = agg.companies.length === 0;
  const bars = agg.companies.slice(0, 8).map((c) => ({ label: c.name.split(" ")[0], value: c.approvals }));

  return (
    <div>
      <PageHeader
        eyebrow="H-1B by state"
        title={`H-1B sponsorship in ${agg.state.name}`}
        description={`Tracked H-1B employers, occupations, and offered wages for ${agg.state.name} (${fiscalYearLabel(agg.fiscalYear)}).`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/h1b/top-sponsors", label: "H-1B" },
          { href: `/h1b/state/${agg.state.code}`, label: agg.state.name },
        ]}
        share
      >
        {empty ? null : (
        <StatRow>
          <Stat label="Tracked approvals" value={formatNumber(agg.totalApprovals)} sub={fiscalYearLabel(agg.fiscalYear)} />
          <Stat label="Avg offered wage" value={formatCurrency(agg.avgWage)} />
          <Stat label="Employers" value={String(agg.companies.length)} />
          <Stat label="BLS dev mean wage" value={agg.swWageMean ? formatCurrency(agg.swWageMean) : "—"} sub="Software developers" />
        </StatRow>
        )}
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        {empty ? (
          <section className="panel panel-pad">
            <h2 className="section-title">No tracked sponsors with worksites in {agg.state.name} yet</h2>
            <p className="mt-2 text-sm text-slate-300">
              These state pages are built from a curated list of large H-1B employers, and none of them
              lists a worksite here. That is a gap in our list, not a count of zero for the state.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/h1b/employers"
                className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-semibold text-ink-950 hover:bg-accent-soft"
              >
                Browse the full H-1B employer directory
              </Link>
              <Link href={`/state/${agg.state.code}`} className="text-sm font-medium link-accent">
                Full {agg.state.name} profile
              </Link>
              <Link href="/h1b/top-sponsors" className="text-sm font-medium link-accent">
                Top sponsors nationwide
              </Link>
            </div>
          </section>
        ) : (
        <>
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ChartCard
              title="Top H-1B employers"
              source={{ sourceName: "USCIS H-1B Employer Data Hub", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: agg.state.sourceUpdatedAt }}
            >
              {bars.length > 0 ? (
                <HorizontalBarChart
                  data={bars}
                  labelKey="label"
                  valueKey="value"
                  colorByIndex
                  valueLabel="H-1B approvals"
                  dataCaption={`Top H-1B employers with worksites in ${agg.state.name}`}
                />
              ) : (
                <p className="text-sm text-slate-400">No tracked employers with worksites here.</p>
              )}
            </ChartCard>
          </div>
          <div className="lg:col-span-2">
            <ChartCard title="Top sponsored occupations">
              <ol className="space-y-2">
                {agg.topOccupations.map((occ, i) => (
                  <li key={occ} className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-500">{i + 1}</span>
                    <span className="text-sm text-slate-200">{occ}</span>
                  </li>
                ))}
              </ol>
              <Link href={`/state/${agg.state.code}`} className="mt-4 inline-block text-sm link-accent">
                Full {agg.state.name} profile →
              </Link>
            </ChartCard>
          </div>
        </div>


        <ChartCard title="Employer detail">
          <ul className="divide-y divide-white/5">
            {agg.companies.map((c) => (
              <li key={c.slug} className="flex items-center justify-between py-2.5">
                <Link href={`/company/${c.slug}`} className="text-sm text-slate-200 hover:text-accent-soft">
                  {c.name}
                </Link>
                <span className="flex items-center gap-4">
                  <span className="font-mono text-sm tabular-nums text-white">{formatNumber(c.approvals)}</span>
                  <span className="font-mono text-xs text-slate-500">{formatCurrency(c.avgWage)}</span>
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>
        </>
        )}

        <MethodologyNote>
          State H-1B figures attribute tracked employers to in-state worksites and are a curated subset, not
          a complete state total.
        </MethodologyNote>
      </div>
    </div>
  );
}
