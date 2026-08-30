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
        <StatRow>
          <Stat label="Tracked approvals" value={formatNumber(agg.totalApprovals)} sub={fiscalYearLabel(agg.fiscalYear)} />
          <Stat label="Avg offered wage" value={formatCurrency(agg.avgWage)} />
          <Stat label="Employers" value={String(agg.companies.length)} />
          <Stat label="BLS dev mean wage" value={agg.swWageMean ? formatCurrency(agg.swWageMean) : "—"} sub="Software developers" />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ChartCard
              title="Top H-1B employers"
              source={{ sourceName: "USCIS H-1B Employer Data Hub", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: agg.state.sourceUpdatedAt }}
            >
              {bars.length > 0 ? (
                <HorizontalBarChart data={bars} labelKey="label" valueKey="value" colorByIndex />
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

        <MethodologyNote>
          State H-1B figures attribute tracked employers to in-state worksites and are a curated subset, not
          a complete state total.
        </MethodologyNote>
      </div>
    </div>
  );
}
