import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { BorderExplorer } from "@/components/BorderExplorer";
import { ChangeTracker } from "@/components/ChangeTracker";
import { borderChartMarkers } from "@/lib/events";
import { GroupedBarChart, HorizontalBarChart } from "@/components/charts/Charts";
import { DataStatus } from "@/components/DataStatus";
import {
  borderYearlyData,
  borderDemographicsData,
  borderMonthlyData,
  borderCountryData,
} from "@/lib/chart-data";
import { cbpRows, UPDATED } from "@/lib/dataset";
import { LATEST_COMPLETE_FY, CURRENT_FY } from "@/lib/data";
import { formatNumber, fiscalYearLabel } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Border Encounters",
  description:
    "CBP southwest, northern, and nationwide encounters by fiscal year and month, with family unit, single adult, and unaccompanied minor breakdowns.",
  path: "/border/encounters",
  keywords: ["border encounters", "CBP", "southwest border", "family units"],
});

const SOURCE = {
  sourceName: "CBP Nationwide Encounters",
  sourceUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
  sourceUpdatedAt: UPDATED.cbp_encounters,
};

export default function BorderEncountersPage() {
  const swNow = cbpRows.find((r) => r.fiscalYear === CURRENT_FY && r.border === "southwest")!;
  const natNow = cbpRows.find((r) => r.fiscalYear === CURRENT_FY && r.border === "nationwide")!;
  const natPrev = cbpRows.find((r) => r.fiscalYear === LATEST_COMPLETE_FY && r.border === "nationwide")!;

  const yearly = {
    southwest: borderYearlyData("southwest"),
    northern: borderYearlyData("northern"),
    nationwide: borderYearlyData("nationwide"),
  };
  const demographics = {
    southwest: borderDemographicsData("southwest"),
    northern: borderDemographicsData("northern"),
    nationwide: borderDemographicsData("nationwide"),
  };
  const monthly = borderMonthlyData();
  const byCountry = borderCountryData();

  return (
    <div>
      <PageHeader
        eyebrow="Border Activity"
        title="Border encounters"
        description="Customs and Border Protection encounters across the southwest and northern borders and nationwide. Filter by sector below."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/border/encounters", label: "Border" },
        ]}
        share
      >
        <StatRow>
          <Stat label={`Nationwide · ${fiscalYearLabel(CURRENT_FY)} YTD`} value={formatNumber(natNow.totalEncounters)} sub="Year-to-date" />
          <Stat label={`SW apprehensions · ${fiscalYearLabel(CURRENT_FY)} YTD`} value={formatNumber(swNow.totalEncounters)} sub="Multi-decade lows" />
          <Stat label={`Nationwide · ${fiscalYearLabel(LATEST_COMPLETE_FY)}`} value={formatNumber(natPrev.totalEncounters)} sub="Last complete year" />
          <Stat label={`Family units · ${fiscalYearLabel(LATEST_COMPLETE_FY)}`} value={formatNumber(natPrev.familyUnits)} />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <ChangeTracker />

        <BorderExplorer yearly={yearly} demographics={demographics} source={SOURCE} markers={borderChartMarkers()} />

        <ChartCard
          title="Monthly southwest encounters"
          subtitle={`Last complete fiscal year and ${fiscalYearLabel(CURRENT_FY)} to date`}
          source={SOURCE}
        >
          <GroupedBarChart
            data={monthly}
            xKey="label"
            series={[{ key: "Encounters", label: "Encounters", color: "#38bdf8" }]}
            height={300}
          />
        </ChartCard>


        <ChartCard
          title="Encounters by citizenship"
          subtitle={`Nationwide · ${fiscalYearLabel(LATEST_COMPLETE_FY)} — apportioned from the reported total`}
          tooltip="Encounters are events, not unique people. This citizenship split is apportioned from the reported nationwide total using our own country weights, so it shows relative scale rather than CBP's own published nationality counts."
          provenance="modeled"
          source={SOURCE}
        >
          <HorizontalBarChart data={byCountry} labelKey="label" valueKey="value" colorByIndex height={320} />
        </ChartCard>

        <DataStatus
          sourceKey="cbp_encounters"
          surface="border"
          provenance="reported"
          publishedAt={UPDATED.cbp_encounters}
        />

        <MethodologyNote>
          Encounters count events at or near the border, including repeat encounters of the same person.
          They are not deportations and not a measure of unique individuals. Sector and citizenship detail
          follow CBP&rsquo;s published categories.
        </MethodologyNote>
      </div>
    </div>
  );
}
