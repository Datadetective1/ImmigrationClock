import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { AdSlot } from "@/components/AdSlot";
import { MethodologyNote } from "@/components/MethodologyNote";
import { TrendLineChart, HorizontalBarChart } from "@/components/charts/Charts";
import { visaChartData, visaSeriesDefs, visaCountryData } from "@/lib/chart-data";
import { visaSeries } from "@/lib/data";
import { LAST_COMPLETE_FY, CURRENT_FY } from "@/lib/data";
import { UPDATED } from "@/lib/sample-data";
import { formatNumber, fiscalYearLabel } from "@/lib/format";

export const metadata = buildMetadata({
  title: "F-1 Student Visas & Visa Flow",
  description:
    "F-1 academic student, J-1 exchange, H-1B, employment-based, and family-based visa issuances by fiscal year and country.",
  path: "/visa/f1-student-visas",
  keywords: ["F-1 student visas", "J-1", "visa issuance", "international students"],
});

const SOURCE = {
  sourceName: "Department of State Visa Statistics",
  sourceUrl: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html",
  sourceUpdatedAt: UPDATED.dos_visa,
};

export default function VisaFlowPage() {
  const visa = visaChartData();
  const defs = visaSeriesDefs();
  const f1Country = visaCountryData("F-1");
  const h1bCountry = visaCountryData("H-1B");

  const f1Now = visaSeries("F-1").find((r) => r.fiscalYear === CURRENT_FY)!;
  const f1Prev = visaSeries("F-1").find((r) => r.fiscalYear === LAST_COMPLETE_FY)!;
  const j1Prev = visaSeries("J-1").find((r) => r.fiscalYear === LAST_COMPLETE_FY)!;
  const h1bPrev = visaSeries("H-1B").find((r) => r.fiscalYear === LAST_COMPLETE_FY)!;
  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
  const annualizedF1 = Math.round(f1Now.issued / (8 / 12));

  return (
    <div>
      <PageHeader
        eyebrow="Visa Flow"
        title="F-1 student visas & legal immigration"
        description="Department of State visa issuances by class and country. State Department issuances differ from USCIS petition approvals."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/visa/f1-student-visas", label: "Visas" },
        ]}
        share
      >
        <StatRow>
          <Stat
            label="F-1 issued (FY to date)"
            value={formatNumber(f1Now.issued)}
            sub={`Projected ${formatNumber(annualizedF1)} full year`}
            trend={pct(annualizedF1, f1Prev.issued) > 1.5 ? "UP" : "FLAT"}
            trendPct={pct(annualizedF1, f1Prev.issued)}
          />
          <Stat label="J-1 exchange (last FY)" value={formatNumber(j1Prev.issued)} sub={fiscalYearLabel(LAST_COMPLETE_FY)} />
          <Stat label="H-1B issued (last FY)" value={formatNumber(h1bPrev.issued)} sub="State Dept issuances" />
          <Stat label="F-1 last full year" value={formatNumber(f1Prev.issued)} sub={fiscalYearLabel(LAST_COMPLETE_FY)} />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <ChartCard
          title="Visa issuances by class and fiscal year"
          subtitle="H-1B, F-1 students, J-1 exchange, employment-based and family-based immigrant visas"
          tooltip="Counts reflect visas issued at consulates, not petitions approved by USCIS."
          source={SOURCE}
        >
          <TrendLineChart data={visa} xKey="label" series={defs} height={320} />
        </ChartCard>

        <AdSlot format="in-content" />

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="F-1 student visas by country"
            subtitle={fiscalYearLabel(LAST_COMPLETE_FY)}
            source={SOURCE}
          >
            <HorizontalBarChart data={f1Country} labelKey="label" valueKey="value" colorByIndex height={320} />
          </ChartCard>
          <ChartCard
            title="H-1B visas by country"
            subtitle={fiscalYearLabel(LAST_COMPLETE_FY)}
            source={SOURCE}
          >
            <HorizontalBarChart data={h1bCountry} labelKey="label" valueKey="value" colorByIndex height={320} />
          </ChartCard>
        </div>

        <MethodologyNote>
          Visa issuances are counted by the State Department when a visa is granted abroad. A person may
          hold an approved USCIS petition without a same-year visa issuance, so these series will not match
          USCIS approval counts.
        </MethodologyNote>
      </div>
    </div>
  );
}
