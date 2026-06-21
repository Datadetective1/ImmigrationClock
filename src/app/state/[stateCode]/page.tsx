import { notFound } from "next/navigation";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { states, WARN_LIVE } from "@/lib/dataset";
import { stateAggregate } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { AdSlot } from "@/components/AdSlot";
import { ResourcePanel } from "@/components/ResourcePanel";
import { Faq, type FaqItem } from "@/components/Faq";
import { partnersByIds } from "@/lib/partners";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ProvenanceTag } from "@/components/ProvenanceTag";
import { SourceBadge } from "@/components/SourceBadge";
import { RelevanceCard } from "@/components/RelevanceCard";
import { HorizontalBarChart } from "@/components/charts/Charts";
import { stateRelevance } from "@/lib/relevance";
import { formatNumber, formatCurrency, fiscalYearLabel } from "@/lib/format";

export function generateStaticParams() {
  return states.map((s) => ({ stateCode: s.code }));
}

export function generateMetadata({ params }: { params: { stateCode: string } }) {
  const agg = stateAggregate(params.stateCode);
  if (!agg) return buildMetadata({ title: "State not found", description: "", path: `/state/${params.stateCode}` });
  return buildMetadata({
    title: `${agg.state.name} — Immigration & Workforce Data`,
    description: `H-1B sponsorship, top employers, offered wages, layoffs, and enforcement metrics for ${agg.state.name}.`,
    path: `/state/${agg.state.code}`,
    keywords: [agg.state.name, "H-1B by state", "layoffs", "ICE arrests"],
  });
}

export default function StatePage({ params }: { params: { stateCode: string } }) {
  const agg = stateAggregate(params.stateCode);
  if (!agg) notFound();

  const employerBars = agg.companies.slice(0, 8).map((c) => ({
    label: c.name.split(" ")[0],
    value: c.approvals,
  }));

  // Real, live WARN data exists for Texas only (data.texas.gov).
  const warn = WARN_LIVE;
  const showWarnLive =
    agg.state.code === "TX" && warn.ok && warn.ytdTotal != null && (warn.recent?.length ?? 0) > 0;

  const stateName = agg.state.name;
  const topCos = agg.companies.slice(0, 3).map((c) => c.name);
  const faqItems: FaqItem[] = [];
  if (topCos.length) {
    faqItems.push({
      q: `Which employers sponsor H-1B visas in ${stateName}?`,
      a: `Tracked H-1B sponsors with worksites in ${stateName} include ${topCos.join(
        ", "
      )}. About ${formatNumber(agg.totalApprovals)} approvals are attributable to tracked employers in the state — a curated subset, not a complete state total.`,
    });
  }
  if (agg.avgWage) {
    faqItems.push({
      q: `What is the average H-1B salary in ${stateName}?`,
      a: `The average offered wage among tracked ${stateName} H-1B sponsors is ${formatCurrency(
        agg.avgWage
      )}, from Department of Labor LCA disclosures.`,
    });
  }
  faqItems.push({
    q: `How many H-1B workers are sponsored in ${stateName}?`,
    a: `Tracked employers account for about ${formatNumber(
      agg.totalApprovals
    )} H-1B approvals attributable to ${stateName} worksites in ${fiscalYearLabel(agg.fiscalYear)}.`,
  });

  return (
    <div>
      <PageHeader
        eyebrow="State profile"
        title={`${agg.state.name} (${agg.state.code})`}
        description={`${agg.state.region} region · H-1B sponsorship, wages, layoffs, and enforcement for ${fiscalYearLabel(agg.fiscalYear)}.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/h1b/top-sponsors", label: "H-1B" },
          { href: `/state/${agg.state.code}`, label: agg.state.name },
        ]}
        share
      >
        <StatRow>
          <Stat label="Tracked H-1B approvals" value={formatNumber(agg.totalApprovals)} tooltip="Approvals attributable to tracked employers and worksites in this state." />
          <Stat label="Avg offered wage" value={formatCurrency(agg.avgWage)} sub="Tracked employers" />
          <Stat label="ICE arrests" value={agg.ice ? formatNumber(agg.ice.arrests) : "—"} sub={fiscalYearLabel(agg.fiscalYear)} />
          <Stat label="Layoffs (WARN)" value={formatNumber(agg.layoffTotal)} sub="Employees affected" />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        {showWarnLive ? (
          <section className="panel relative overflow-hidden p-5 sm:p-6">
            <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-status-amber/60 to-transparent" />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="eyebrow mb-1 text-status-amber">Live · Texas Workforce Commission</div>
                <h2 className="text-lg font-bold text-white sm:text-xl">
                  {formatNumber(warn.ytdTotal ?? 0)} layoffs across {warn.ytdCount} WARN notices in {warn.ytdYear} so far
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Real Texas WARN notices, fetched from data.texas.gov. All of {warn.prevYear}:{" "}
                  {formatNumber(warn.prevTotal ?? 0)} layoffs across {warn.prevCount} notices.
                </p>
              </div>
              <ProvenanceTag provenance="reported" />
            </div>
            <ul className="mt-4 divide-y divide-white/5">
              {(warn.recent ?? []).slice(0, 6).map((n, i) => (
                <li key={`${n.employer}-${i}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 text-sm text-slate-200">
                    <span className="mr-2 font-mono text-xs text-slate-500">{n.noticeDate}</span>
                    {n.employer}
                    {n.city ? <span className="ml-2 text-xs text-slate-500">{n.city}</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-status-red">
                    {formatNumber(n.employees)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <SourceBadge
                sourceName={warn.sourceName ?? "Texas WARN Notices"}
                sourceUrl={warn.sourceUrl ?? "https://data.texas.gov/d/8w53-c4f6"}
                sourceUpdatedAt={warn.sourceUpdatedAt ?? agg.state.sourceUpdatedAt}
              />
            </div>
          </section>
        ) : null}

        <RelevanceCard summaries={stateRelevance(agg.state.code)} />

        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ChartCard
              title="Top H-1B employers in state"
              subtitle="By approvals attributable to in-state worksites"
              source={{ sourceName: "USCIS + DOL OFLC", sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub", sourceUpdatedAt: agg.state.sourceUpdatedAt }}
            >
              {employerBars.length > 0 ? (
                <HorizontalBarChart data={employerBars} labelKey="label" valueKey="value" colorByIndex />
              ) : (
                <p className="text-sm text-slate-400">No tracked employers with worksites in this state.</p>
              )}
            </ChartCard>
          </div>
          <div className="lg:col-span-2">
            <ChartCard title="Top sponsored occupations" subtitle="Among tracked employers">
              <ol className="space-y-2">
                {agg.topOccupations.map((occ, i) => (
                  <li key={occ} className="flex items-center gap-3">
                    <span className="font-mono text-xs text-slate-500">{i + 1}</span>
                    <span className="text-sm text-slate-200">{occ}</span>
                  </li>
                ))}
              </ol>
            </ChartCard>
          </div>
        </div>

        <ResourcePanel
          partners={partnersByIds(["attorney-match", "wise", "resident-tax"])}
          placement="state"
          title={`Newcomer services in ${agg.state.name}`}
          subtitle="Find legal help, file your U.S. taxes, and move money — services new arrivals most often need."
        />

        <AdSlot format="in-content" />

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Employer detail"
            subtitle={`${agg.companies.length} tracked employers`}
          >
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
          <ChartCard
            title="Recent layoff notices (WARN)"
            source={{ sourceName: "State WARN Act Layoff Notices", sourceUrl: "https://www.dol.gov/agencies/eta/layoffs/warn", sourceUpdatedAt: agg.state.sourceUpdatedAt }}
          >
            {agg.layoffs.length > 0 ? (
              <ul className="divide-y divide-white/5">
                {agg.layoffs.slice(0, 8).map((l, i) => (
                  <li key={`${l.employerName}-${i}`} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-slate-200">
                      {l.employerName}
                      {l.city ? <span className="ml-2 text-xs text-slate-500">{l.city}</span> : null}
                    </span>
                    <span className="font-mono text-sm tabular-nums text-status-red">{formatNumber(l.employeesAffected)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No tracked WARN notices for this state in the current window.</p>
            )}
          </ChartCard>
        </div>

        <Faq items={faqItems} heading={`${stateName} H-1B & immigration: common questions`} />

        <MethodologyNote>
          State-level H-1B figures attribute tracked employers to worksites and headquarters; they are a
          curated subset, not a complete state total. Enforcement and layoff figures come from separate
          public datasets and should not be combined to imply causation.
        </MethodologyNote>
      </div>
    </div>
  );
}
