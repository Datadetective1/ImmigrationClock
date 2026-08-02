import { notFound } from "next/navigation";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { states } from "@/lib/dataset";
import { stateAggregate } from "@/lib/data";
import { noticesForState } from "@/lib/warn";
import {
  warnCoversState,
  warnLatestDateLabel,
  WARN_COVERAGE_SENTENCE,
  WARN_SOURCE,
  WARN_SUMMARY,
} from "@/lib/warn-summary";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { Faq, type FaqItem } from "@/components/Faq";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ProvenanceTag } from "@/components/ProvenanceTag";
import { SourceBadge } from "@/components/SourceBadge";
import { RelevanceCard } from "@/components/RelevanceCard";
import { HorizontalBarChart } from "@/components/charts/Charts";
import { stateRelevance } from "@/lib/relevance";
import { formatNumber, formatCurrency, formatDate, fiscalYearLabel } from "@/lib/format";

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

  // Real WARN notices filed in this state. `covered` distinguishes "this state
  // has no machine-readable feed yet" from "this state filed nothing" — the page
  // must never render the first case as if it were the second.
  const warnCovered = warnCoversState(agg.state.code);
  const warnNotices = warnCovered ? noticesForState(agg.state.code, 8) : [];

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
          {/* A curated subset with no worksite here means WE have no profile for
              this state — not that the state has no H-1B sponsorship. Render "—"
              rather than a 0 or $0 that would read as a factual claim. */}
          <Stat
            label="Tracked H-1B approvals"
            value={agg.totalApprovals > 0 ? formatNumber(agg.totalApprovals) : "—"}
            sub={agg.totalApprovals > 0 ? "Curated employer subset" : "No curated profile for this state"}
            provenance={agg.totalApprovals > 0 ? "modeled" : undefined}
            tooltip="Approvals attributable to a curated set of large sponsors by their published worksite shares. Not a complete state total, and not a figure USCIS publishes by state. A dash means none of the curated employers has a worksite here — not that the state has no H-1B sponsorship. Search the full directory for that."
          />
          <Stat
            label="Avg offered wage"
            value={agg.avgWage > 0 ? formatCurrency(agg.avgWage) : "—"}
            sub={agg.avgWage > 0 ? "Tracked employers" : "No curated profile for this state"}
            provenance={agg.avgWage > 0 ? "modeled" : undefined}
            tooltip="Average of offered wages across the same curated employer subset, derived from DOL LCA disclosure averages. Not a state-wide average wage."
          />
          <Stat
            label="ICE arrests"
            value={agg.ice ? formatNumber(agg.ice.arrests) : "—"}
            sub={fiscalYearLabel(agg.fiscalYear)}
            provenance="modeled"
            tooltip="ICE does not publish arrests by state. This apportions the national FY total using the state's share of tracked activity — a modeled figure, not an official state count. See methodology."
          />
          <Stat
            label="Layoffs (WARN)"
            value={agg.warnState ? formatNumber(agg.warnState.employeesTotal) : "No feed"}
            sub={agg.warnState ? `${formatNumber(agg.warnState.noticeCount)} notices` : "State has no open-data feed"}
            provenance={agg.warnState ? "reported" : undefined}
            tooltip={
              agg.warnState
                ? `Employees covered by every WARN notice this state has filed in our feed, back to ${agg.warnState.latestNotice ? "the earliest published notice" : "the start of the feed"}. Each notice links to the state portal.`
                : WARN_COVERAGE_SENTENCE
            }
          />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        {agg.warnState ? (
          <section className="panel relative overflow-hidden p-5 sm:p-6">
            <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-status-amber/60 to-transparent" />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="eyebrow mb-1 text-status-amber">Layoff notices · {agg.warnState.agency}</div>
                <h2 className="text-lg font-bold text-white sm:text-xl">
                  {formatNumber(agg.warnState.employeesTotal)} employees across{" "}
                  {formatNumber(agg.warnState.noticeCount)} WARN notices in {agg.state.name}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Real notices filed with the state and republished from its open-data portal.
                  {agg.warnState.latestNotice
                    ? ` ${warnLatestDateLabel(agg.warnState)}: ${formatDate(agg.warnState.latestNotice)}.`
                    : null}
                  {agg.warnState.dateBasis === "effective"
                    ? " This state publishes the layoff effective date rather than the filing date, so dates here can fall in the future."
                    : null}
                </p>
              </div>
              <ProvenanceTag provenance="reported" />
            </div>
            <ul className="mt-4 divide-y divide-white/5">
              {warnNotices.map((n, i) => (
                <li key={`${n.employer}-${i}`} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 text-sm text-slate-200">
                    <span className="mr-2 font-mono text-xs text-slate-500">
                      {n.noticeDate ? formatDate(n.noticeDate) : n.effectiveDate ? `eff. ${formatDate(n.effectiveDate)}` : "—"}
                    </span>
                    {n.employer}
                    {n.city ? <span className="ml-2 text-xs text-slate-500">{n.city}</span> : null}
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-status-red">
                    {n.employees > 0 ? formatNumber(n.employees) : "—"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {/* "Updated" is when WE last ingested the feed, never the latest
                  record's date — which for effective-date states is in the future. */}
              <SourceBadge
                sourceName={agg.warnState.agency}
                sourceUrl={agg.warnState.pageUrl}
                sourceUpdatedAt={WARN_SUMMARY.generatedAt.slice(0, 10)}
              />
              <Link href="/layoffs" className="text-xs font-semibold text-accent hover:text-accent-soft">
                Full WARN feed →
              </Link>
            </div>
          </section>
        ) : (
          <section className="panel panel-pad">
            <div className="eyebrow mb-1">Layoff notices · WARN</div>
            <p className="text-sm leading-relaxed text-slate-400">
              {agg.state.name} does not yet publish WARN notices in a machine-readable format we can ingest,
              so we show none here rather than estimating them. {WARN_COVERAGE_SENTENCE}{" "}
              <Link href="/layoffs" className="link-accent">See the states we do cover →</Link>
            </p>
          </section>
        )}

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
            title="WARN notices by year"
            subtitle={agg.warnState ? "Employees covered by notices filed each calendar year" : undefined}
            source={{
              sourceName: agg.warnState?.agency ?? WARN_SOURCE.sourceName,
              sourceUrl: agg.warnState?.pageUrl ?? WARN_SOURCE.sourceUrl,
              sourceUpdatedAt: WARN_SOURCE.sourceUpdatedAt,
            }}
          >
            {agg.warnYears.length > 0 ? (
              <ul className="divide-y divide-white/5">
                {[...agg.warnYears].reverse().slice(0, 8).map((y) => (
                  <li key={y.year} className="flex items-center justify-between py-2.5">
                    <span className="text-sm text-slate-200">{y.year}</span>
                    <span className="flex items-center gap-4">
                      <span className="text-xs text-slate-500">
                        {formatNumber(y.notices)} notice{y.notices === 1 ? "" : "s"}
                      </span>
                      <span className="font-mono text-sm tabular-nums text-status-red">
                        {formatNumber(y.employees)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm leading-relaxed text-slate-400">
                No WARN feed is available for {agg.state.name} yet, so no yearly totals are shown.
              </p>
            )}
          </ChartCard>
        </div>

        <Faq items={faqItems} heading={`${stateName} H-1B & immigration: common questions`} />

        <MethodologyNote>
          <strong className="text-slate-200">Reported vs modeled on this page.</strong> WARN notices are
          reported records: each one was filed with a state agency and links back to that agency&rsquo;s
          portal. The H-1B, wage, and ICE figures are <em>modeled</em> — neither USCIS nor ICE publishes
          these breakdowns by state, so we apportion national totals using our own weights and label every
          such figure. Modeled figures are illustrative of scale, not official state counts.{" "}
          {WARN_COVERAGE_SENTENCE} Enforcement and layoff figures come from separate public datasets and
          should not be combined to imply causation.{" "}
          <Link href="/methodology" className="link-accent">Full methodology →</Link>
        </MethodologyNote>
      </div>
    </div>
  );
}
