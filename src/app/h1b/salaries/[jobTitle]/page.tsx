import { notFound } from "next/navigation";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { AdSlot } from "@/components/AdSlot";
import { MethodologyNote } from "@/components/MethodologyNote";
import { HorizontalBarChart } from "@/components/charts/Charts";
import { companies, UPDATED } from "@/lib/sample-data";
import { SALARY_JOB_TITLES } from "@/lib/seo-pages";
import { LAST_COMPLETE_FY } from "@/lib/data";
import { formatCurrency, formatNumber, slugify, titleCaseFromSlug } from "@/lib/format";

export function generateStaticParams() {
  return SALARY_JOB_TITLES.map((t) => ({ jobTitle: t.slug }));
}

function resolveTitle(slug: string) {
  return SALARY_JOB_TITLES.find((t) => t.slug === slug)?.title ?? titleCaseFromSlug(slug);
}

export function generateMetadata({ params }: { params: { jobTitle: string } }) {
  const title = resolveTitle(params.jobTitle);
  return buildMetadata({
    title: `${title} — H-1B Salaries`,
    description: `Average H-1B offered wages and sponsoring employers for ${title}, based on DOL LCA disclosure data.`,
    path: `/h1b/salaries/${params.jobTitle}`,
    keywords: [`${title} H-1B salary`, "offered wage", "LCA wage", title],
  });
}

export default function SalaryPage({ params }: { params: { jobTitle: string } }) {
  const title = resolveTitle(params.jobTitle);

  const matches = companies
    .map((c) => {
      const jt = c.topJobTitles.find((t) => slugify(t.title) === params.jobTitle);
      if (!jt) return null;
      const yr = c.years.find((y) => y.fiscalYear === LAST_COMPLETE_FY)!;
      return {
        slug: c.slug,
        name: c.name,
        avgWage: jt.avgWage,
        approxFilings: Math.round((yr.initialApprovals + yr.continuingApprovals) * jt.share),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.avgWage - a.avgWage);

  if (matches.length === 0) notFound();

  const avgWage = Math.round(matches.reduce((s, m) => s + m.avgWage, 0) / matches.length);
  const minWage = Math.min(...matches.map((m) => m.avgWage));
  const maxWage = Math.max(...matches.map((m) => m.avgWage));
  const totalFilings = matches.reduce((s, m) => s + m.approxFilings, 0);

  return (
    <div>
      <PageHeader
        eyebrow="H-1B Salaries"
        title={`${title} — H-1B offered wages`}
        description={`Average offered wages and sponsoring employers for ${title}, from DOL Labor Condition Application disclosures.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/h1b/top-sponsors", label: "H-1B" },
          { href: `/h1b/salaries/${params.jobTitle}`, label: title },
        ]}
        share
      >
        <StatRow>
          <Stat label="Average offered wage" value={formatCurrency(avgWage)} sub="Across tracked sponsors" />
          <Stat label="Lowest tracked" value={formatCurrency(minWage)} />
          <Stat label="Highest tracked" value={formatCurrency(maxWage)} />
          <Stat label="Approx filings" value={formatNumber(totalFilings)} sub="Tracked employers" />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <ChartCard
          title={`Offered wage by employer — ${title}`}
          source={{ sourceName: "DOL OFLC Disclosure Data", sourceUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance", sourceUpdatedAt: UPDATED.dol_lca }}
        >
          <HorizontalBarChart
            data={matches.map((m) => ({ label: m.name.split(" ")[0], value: m.avgWage }))}
            labelKey="label"
            valueKey="value"
            currency
            colorByIndex
            height={Math.max(220, matches.length * 38)}
          />
        </ChartCard>

        <AdSlot format="in-content" />

        <ChartCard title="Sponsoring employers" subtitle={`Average offered wage for ${title}`}>
          <ul className="divide-y divide-white/5">
            {matches.map((m) => (
              <li key={m.slug} className="flex items-center justify-between py-2.5">
                <Link href={`/company/${m.slug}`} className="text-sm text-slate-200 hover:text-accent-soft">
                  {m.name}
                </Link>
                <span className="flex items-center gap-4">
                  <span className="font-mono text-xs text-slate-500">~{formatNumber(m.approxFilings)} filings</span>
                  <span className="font-mono text-sm tabular-nums text-accent-soft">{formatCurrency(m.avgWage)}</span>
                </span>
              </li>
            ))}
          </ul>
        </ChartCard>

        <MethodologyNote>
          Offered wages come from Labor Condition Applications, which state what an employer commits to pay.
          They are not the same as actual paid salaries, and LCA filings are not H-1B approvals.
        </MethodologyNote>
      </div>
    </div>
  );
}
