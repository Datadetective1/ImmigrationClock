import { notFound } from "next/navigation";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { companies, companyBySlug } from "@/lib/sample-data";
import { companyTotals, companyTrend, LAST_COMPLETE_FY } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { AdSlot } from "@/components/AdSlot";
import { TrendLineChart } from "@/components/charts/Charts";
import { SourceBadge } from "@/components/SourceBadge";
import {
  formatNumber,
  formatCurrency,
  formatRate,
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
    description: `Public records: ${company.name} H-1B approvals, denials, approval rate, offered wages, top job titles, worksites, and layoffs.`,
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
  const layoffTotal = company.layoffs.reduce((s, l) => s + l.employeesAffected, 0);
  const approvalsPct =
    prev && prev.approvals ? ((latest.approvals - prev.approvals) / prev.approvals) * 100 : 0;

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

        <AdSlot format="in-content" />

        <ChartCard
          title="Public layoff notices (WARN)"
          subtitle={layoffTotal > 0 ? `${formatNumber(layoffTotal)} employees across tracked notices` : "No tracked WARN notices"}
          source={{ sourceName: "State WARN Act Layoff Notices", sourceUrl: "https://www.dol.gov/agencies/eta/layoffs/warn", sourceUpdatedAt: company.sourceUpdatedAt }}
        >
          {company.layoffs.length > 0 ? (
            <ul className="divide-y divide-white/5">
              {company.layoffs.map((l) => (
                <li key={l.year} className="flex items-center justify-between py-2.5">
                  <span className="text-sm text-slate-200">Calendar year {l.year}</span>
                  <span className="flex items-center gap-4">
                    <span className="text-xs text-slate-500">{l.events} notice{l.events === 1 ? "" : "s"}</span>
                    <span className="font-mono text-sm tabular-nums text-status-red">{formatNumber(l.employeesAffected)}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No public WARN layoff notices are tracked for this employer in the current window.</p>
          )}
        </ChartCard>

        <MethodologyNote variant="warning">
          Visa sponsorship volume and layoff notices are reported independently. A company appearing in
          both datasets does not establish that H-1B sponsorship caused any layoff.
        </MethodologyNote>

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
