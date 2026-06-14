import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { countries } from "@/lib/dataset";
import { countryAggregate } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { AdSlot } from "@/components/AdSlot";
import { MethodologyNote } from "@/components/MethodologyNote";
import { TrendLineChart } from "@/components/charts/Charts";
import { formatNumber, fiscalYearLabel } from "@/lib/format";

export function generateStaticParams() {
  return countries.map((c) => ({ countrySlug: c.slug }));
}

export function generateMetadata({ params }: { params: { countrySlug: string } }) {
  const agg = countryAggregate(params.countrySlug);
  if (!agg) return buildMetadata({ title: "Country not found", description: "", path: `/country/${params.countrySlug}` });
  return buildMetadata({
    title: `${agg.country.name} — U.S. Visa & Immigration Data`,
    description: `H-1B and F-1 visa issuances, year-over-year trends, and public enforcement data by nationality for ${agg.country.name}.`,
    path: `/country/${agg.country.slug}`,
    keywords: [agg.country.name, "visa issuance", "F-1 students", "H-1B by country"],
  });
}

export default function CountryPage({ params }: { params: { countrySlug: string } }) {
  const agg = countryAggregate(params.countrySlug);
  if (!agg) notFound();

  const series = agg.series.map((s) => ({
    label: fiscalYearLabel(s.fiscalYear),
    "H-1B visas": s.h1b,
    "F-1 visas": s.f1,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Country profile"
        title={agg.country.name}
        description={`${agg.country.region} · U.S. visa issuance trends and, where public, enforcement data by nationality.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/visa/f1-student-visas", label: "Visas" },
          { href: `/country/${agg.country.slug}`, label: agg.country.name },
        ]}
        share
      >
        <StatRow>
          <Stat label="H-1B visas" value={agg.h1b ? formatNumber(agg.h1b.issued) : "—"} sub={fiscalYearLabel(agg.h1b?.fiscalYear ?? 0)} />
          <Stat label="F-1 student visas" value={agg.f1 ? formatNumber(agg.f1.issued) : "—"} sub="Latest complete FY" />
          <Stat label="Border encounters" value={agg.cbp ? formatNumber(agg.cbp.totalEncounters) : "—"} tooltip="CBP nationwide encounters of this nationality, where publicly reported." />
          <Stat label="Removals" value={agg.ice ? formatNumber(agg.ice.removals) : "—"} tooltip="Removals of this nationality, where publicly reported." />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <ChartCard
          title="Visa issuance by fiscal year"
          subtitle={`Estimated H-1B and F-1 issuances to nationals of ${agg.country.name}`}
          tooltip="Country-level estimates apportion national State Department totals by this country's share of visa flow."
          source={{ sourceName: "Department of State Visa Statistics", sourceUrl: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html", sourceUpdatedAt: agg.country.sourceUpdatedAt }}
        >
          <TrendLineChart
            data={series}
            xKey="label"
            series={[
              { key: "H-1B visas", label: "H-1B visas", color: "#38bdf8" },
              { key: "F-1 visas", label: "F-1 visas", color: "#f59e0b" },
            ]}
            height={300}
          />
        </ChartCard>

        <AdSlot format="in-content" />

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Border encounters by nationality"
            tooltip="An encounter is an event, not a unique person, and is not a deportation."
            source={{ sourceName: "CBP Nationwide Encounters", sourceUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters", sourceUpdatedAt: agg.country.sourceUpdatedAt }}
          >
            {agg.cbp ? (
              <StatRow>
                <Stat label="Total encounters" value={formatNumber(agg.cbp.totalEncounters)} />
                <Stat label="Single adults" value={formatNumber(agg.cbp.singleAdults)} />
                <Stat label="Family units" value={formatNumber(agg.cbp.familyUnits)} />
                <Stat label="Unaccompanied minors" value={formatNumber(agg.cbp.unaccompaniedMinors)} />
              </StatRow>
            ) : (
              <p className="text-sm text-slate-400">No nationality-level encounter data published for this country.</p>
            )}
          </ChartCard>
          <ChartCard
            title="Enforcement by nationality"
            tooltip="Removals are not the same as arrests or detention counts."
            source={{ sourceName: "ICE / DHS statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: agg.country.sourceUpdatedAt }}
          >
            {agg.ice ? (
              <StatRow>
                <Stat label="Removals" value={formatNumber(agg.ice.removals)} />
                <Stat label="Arrests" value={formatNumber(agg.ice.arrests)} />
              </StatRow>
            ) : (
              <p className="text-sm text-slate-400">No nationality-level enforcement data published for this country.</p>
            )}
          </ChartCard>
        </div>

        <MethodologyNote>
          Country pages mix multiple datasets that use different definitions and reporting calendars.
          Visa issuances (State Department) differ from petition approvals (USCIS), and enforcement counts
          describe events involving people of a given nationality &mdash; not the same individuals across
          datasets.
        </MethodologyNote>
      </div>
    </div>
  );
}
