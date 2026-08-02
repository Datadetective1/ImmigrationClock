import { notFound } from "next/navigation";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { companies, companyBySlug } from "@/lib/dataset";
import { companyTotals, companyTrend, LAST_COMPLETE_FY } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { Faq, type FaqItem } from "@/components/Faq";
import { TrendLineChart } from "@/components/charts/Charts";
import { SourceBadge } from "@/components/SourceBadge";
import { ProvenanceTag } from "@/components/ProvenanceTag";
import { warnForEmployer } from "@/lib/warn";
import { WARN_COVERAGE_SENTENCE, WARN_SOURCE } from "@/lib/warn-summary";
import {
  formatNumber,
  formatCurrency,
  formatRate,
  formatDate,
  fiscalYearLabel,
} from "@/lib/format";

export function generateStaticParams() {
  return companies.map((c) => ({ slug: c.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const company = companyBySlug[params.slug];
  if (!company) return buildMetadata({ title: "Employer not found", description: "", path: `/company/${params.slug}` });
  return buildMetadata({
    title: `${company.name} — H-1B & Workforce Data`,
    description: `Public records: ${company.name} H-1B approvals, denials, approval rate, offered wages, top job titles, worksites, and any state-filed WARN layoff notices.`,
    path: `/company/${company.slug}`,
    keywords: [company.name, "H-1B sponsor", "visa sponsorship", company.industry],
  });
}

export default function CompanyPage({ params }: { params: { slug: string } }) {
  const company = companyBySlug[params.slug];
  if (!company) notFound();

  const latest = companyTotals(company, LAST_COMPLETE_FY)!;
  const prev = companyTotals(company, LAST_COMPLETE_FY - 1);
  const trend = companyTrend(company);
  const approvalsTrendData = trend.map((t) => ({
    label: fiscalYearLabel(t.fiscalYear),
    Approvals: t.approvals,
    Denials: t.denials,
  }));
  const wageTrendData = trend.map((t) => ({
    label: fiscalYearLabel(t.fiscalYear),
    "Avg offered wage": t.avgWage,
  }));
  // Real WARN notices filed under this employer's name, matched through the
  // shared normalizer. Null when the employer has no notice in the covered
  // states — which is not the same as "this employer had no layoffs".
  const warn = warnForEmployer(company.name);
  const approvalsPct =
    prev && prev.approvals ? ((latest.approvals - prev.approvals) / prev.approvals) * 100 : 0;

  const topRoles = company.topJobTitles.slice(0, 3).map((t) => t.title);
  const faqItems: FaqItem[] = [
    {
      q: `Does ${company.name} sponsor H-1B visas?`,
      a: `Yes. ${company.name} had ${formatNumber(latest.approvals)} H-1B petition approvals in ${fiscalYearLabel(
        LAST_COMPLETE_FY
      )} (${formatNumber(latest.denials)} denials, a ${formatRate(latest.approvalRate)} approval rate), based on USCIS and Department of Labor records. Past sponsorship does not guarantee any individual petition will be approved.`,
    },
    {
      q: `What is the average H-1B salary at ${company.name}?`,
      a: `The average offered wage in ${company.name}'s H-1B labor condition applications was ${formatCurrency(
        latest.avgOfferedWage
      )}, from Department of Labor LCA disclosure data for ${fiscalYearLabel(LAST_COMPLETE_FY)}.`,
    },
  ];
  if (topRoles.length) {
    faqItems.push({
      q: `What jobs does ${company.name} sponsor for H-1B?`,
      a: `${company.name}'s most-sponsored H-1B job titles include ${topRoles.join(", ")}.`,
    });
  }

  return (
    <div>
      <PageHeader
        eyebrow="Employer profile"
        title={company.name}
        description={`${company.industry} · Headquarters: ${company.headquartersCity}, ${company.stateCode}`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/h1b/top-sponsors", label: "H-1B sponsors" },
          { href: `/company/${company.slug}`, label: company.name },
        ]}
        share
      >
        <StatRow>
          <Stat
            label={`H-1B approvals (${fiscalYearLabel(LAST_COMPLETE_FY)})`}
            value={formatNumber(latest.approvals)}
            tooltip="Initial + continuing approvals in the latest complete fiscal year."
            trend={approvalsPct > 1.5 ? "UP" : approvalsPct < -1.5 ? "DOWN" : "FLAT"}
            trendPct={approvalsPct}
          />
          <Stat label="H-1B denials" value={formatNumber(latest.denials)} sub="Initial + continuing" />
          <Stat label="Approval rate" value={formatRate(latest.approvalRate)} tooltip="Approvals ÷ (approvals + denials)." />
          <Stat label="Avg offered wage" value={formatCurrency(latest.avgOfferedWage)} sub="DOL LCA disclosure data" />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <p className="max-w-3xl rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm leading-relaxed text-slate-300">
          Public records show how this employer uses visa sponsorship and how its workforce footprint has
          changed over time. The figures below combine USCIS petition outcomes, Department of Labor wage
          disclosures, and public layoff notices.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="H-1B approvals &amp; denials"
            subtitle="Year-over-year sponsorship trend"
            source={company}
          >
            <TrendLineChart
              data={approvalsTrendData}
              xKey="label"
              series={[
                { key: "Approvals", label: "Approvals", color: "#38bdf8" },
                { key: "Denials", label: "Denials", color: "#f43f5e" },
              ]}
            />
          </ChartCard>
          <ChartCard
            title="Average offered wage"
            subtitle="LCA-disclosed annual wage"
            source={{ sourceName: "DOL OFLC Disclosure Data", sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance", sourceUpdatedAt: company.sourceUpdatedAt }}
          >
            <TrendLineChart
              data={wageTrendData}
              xKey="label"
              series={[{ key: "Avg offered wage", label: "Avg offered wage", color: "#22c55e" }]}
              currency
            />
          </ChartCard>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Top sponsored job titles" subtitle={`Share of H-1B filings · ${fiscalYearLabel(LAST_COMPLETE_FY)}`}>
            <ul className="divide-y divide-white/5">
              {company.topJobTitles.map((t) => (
                <li key={t.title} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-slate-200">{t.title}</span>
                  <span className="flex items-center gap-4">
                    <span className="font-mono text-xs text-slate-500">{Math.round(t.share * 100)}%</span>
                    <span className="font-mono text-sm tabular-nums text-accent-soft">{formatCurrency(t.avgWage)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </ChartCard>
          <ChartCard title="Top worksite cities" subtitle="Where filings are concentrated">
            <ul className="divide-y divide-white/5">
              {company.topWorksites.map((w) => (
                <li key={`${w.city}-${w.stateCode}`} className="flex items-center justify-between py-2.5">
                  <Link href={`/state/${w.stateCode}`} className="text-sm text-slate-200 hover:text-accent-soft">
                    {w.city}, {w.stateCode}
                  </Link>
                  <span className="font-mono text-xs text-slate-500">{Math.round(w.share * 100)}%</span>
                </li>
              ))}
            </ul>
          </ChartCard>
        </div>



        <ChartCard
          title="Public layoff notices (WARN)"
          subtitle={
            warn
              ? `${formatNumber(warn.summary.employees)} employees across ${formatNumber(
                  warn.summary.notices
                )} state-filed notice${warn.summary.notices === 1 ? "" : "s"} (${warn.summary.states.join(", ")})`
              : "No WARN notice found for this employer in the covered states"
          }
          source={WARN_SOURCE}
        >
          {warn ? (
            <>
              <div className="mb-3">
                <ProvenanceTag provenance="reported" />
              </div>
              <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
                      <th className="px-3 py-2 font-medium">Notice date</th>
                      <th className="px-3 py-2 font-medium">Location</th>
                      <th className="px-3 py-2 font-medium text-right">Employees</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warn.notices.slice(0, 8).map((n, i) => (
                      <tr key={`${n.noticeDate ?? n.effectiveDate}-${i}`} className="border-b border-white/5 last:border-0">
                        <td className="px-3 py-2 font-mono tabular-nums text-slate-300">
                          {n.noticeDate ? formatDate(n.noticeDate) : n.effectiveDate ? `eff. ${formatDate(n.effectiveDate)}` : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-400">{[n.city, n.state].filter(Boolean).join(", ")}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-status-red">
                          {n.employees > 0 ? formatNumber(n.employees) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-soft hover:underline">
                            {n.state} ↗
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {warn.notices.length > 8 ? (
                <p className="mt-3 text-xs text-slate-500">
                  Showing 8 of {formatNumber(warn.notices.length)} notices. See the{" "}
                  <Link href="/layoffs" className="link-accent">full live layoffs feed</Link>.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm leading-relaxed text-slate-400">
              No WARN notice filed under this employer&rsquo;s name appears in our feed.{" "}
              {WARN_COVERAGE_SENTENCE} An absence here is not evidence that no layoffs occurred.
            </p>
          )}
        </ChartCard>

        <MethodologyNote variant="warning">
          Visa sponsorship volume and layoff notices are reported independently, by different agencies, on
          different calendars. An employer appearing in both datasets does not establish that H-1B
          sponsorship caused any layoff, and the datasets do not identify the immigration status of
          affected workers.
        </MethodologyNote>

        <Faq items={faqItems} />

        <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <span className="text-xs uppercase tracking-wider text-slate-500">Sources &amp; last refresh</span>
          <SourceBadge {...company} />
          {company.website ? (
            <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-xs link-accent">
              {company.website}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
