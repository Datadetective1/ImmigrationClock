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

  const f1Cur = visaSeries("F-1").find((r) => r.fiscalYear === LAST_COMPLETE_FY)!; // FY2024
  const f1Older = visaSeries("F-1").find((r) => r.fiscalYear === LAST_COMPLETE_FY - 1)!; // FY2023
  const f1Prelim = visaSeries("F-1").find((r) => r.fiscalYear === CURRENT_FY)!; // FY2025
  const j1Cur = visaSeries("J-1").find((r) => r.fiscalYear === LAST_COMPLETE_FY)!;
  const h1bCur = visaSeries("H-1B").find((r) => r.fiscalYear === LAST_COMPLETE_FY)!;
  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

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
            label={`F-1 issued · ${fiscalYearLabel(LAST_COMPLETE_FY)}`}
            value={formatNumber(f1Cur.issued)}
            sub="Department of State"
            trend={pct(f1Cur.issued, f1Older.issued) > 1.5 ? "UP" : pct(f1Cur.issued, f1Older.issued) < -1.5 ? "DOWN" : "FLAT"}
            trendPct={pct(f1Cur.issued, f1Older.issued)}
          />
          <Stat label={`J-1 exchange · ${fiscalYearLabel(LAST_COMPLETE_FY)}`} value={formatNumber(j1Cur.issued)} sub="State Dept issuances" />
          <Stat label={`H-1B issued · ${fiscalYearLabel(LAST_COMPLETE_FY)}`} value={formatNumber(h1bCur.issued)} sub="State Dept issuances" />
          <Stat label={`F-1 · ${fiscalYearLabel(CURRENT_FY)} (prelim.)`} value={formatNumber(f1Prelim.issued)} sub="Preliminary" />
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
