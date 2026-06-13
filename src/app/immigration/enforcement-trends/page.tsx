import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { AdSlot } from "@/components/AdSlot";
import { MethodologyNote } from "@/components/MethodologyNote";
import { TrendLineChart, GroupedBarChart, HorizontalBarChart } from "@/components/charts/Charts";
import { StateMap } from "@/components/StateMap";
import {
  enforcementChartData,
  enforcementCriminalSplit,
  enforcementStateData,
  enforcementCountryData,
} from "@/lib/chart-data";
import { iceByFy } from "@/lib/sample-data";
import { LAST_COMPLETE_FY, CURRENT_FY } from "@/lib/data";
import { formatNumber, fiscalYearLabel } from "@/lib/format";
import { UPDATED } from "@/lib/sample-data";

export const metadata = buildMetadata({
  title: "Immigration Enforcement Trends",
  description:
    "ICE arrests, removals, and detention population by fiscal year, plus criminal vs non-criminal breakdowns and state and nationality slices.",
  path: "/immigration/enforcement-trends",
  keywords: ["ICE arrests", "deportations", "removals", "detention population"],
});

export default function EnforcementTrendsPage() {
  const yearly = enforcementChartData();
  const criminal = enforcementCriminalSplit();
  const byState = enforcementStateData();
  const byCountry = enforcementCountryData();
  const now = iceByFy[CURRENT_FY];
  const prev = iceByFy[LAST_COMPLETE_FY];
  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
  const annualizedArrests = Math.round(now.arrests / (8 / 12));

  return (
    <div>
      <PageHeader
        eyebrow="Enforcement Pressure"
        title="Immigration enforcement trends"
        description="Arrests, removals, and detention reported by ICE and DHS. Current-year totals are partial; projected full-year pace is shown where useful."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/immigration/enforcement-trends", label: "Enforcement" },
        ]}
        share
      >
        <StatRow>
          <Stat
            label="Arrests (FY to date)"
            value={formatNumber(now.arrests)}
            sub={`Projected ${formatNumber(annualizedArrests)} full year`}
            trend={pct(annualizedArrests, prev.arrests) > 1.5 ? "UP" : "FLAT"}
            trendPct={pct(annualizedArrests, prev.arrests)}
          />
          <Stat label="Removals (FY to date)" value={formatNumber(now.removals)} sub={fiscalYearLabel(CURRENT_FY)} />
          <Stat label="Avg daily detention" value={formatNumber(now.detentionAvgDaily)} tooltip="Point-in-time average, not a running total." />
          <Stat label="Criminal share of arrests" value={`${Math.round((prev.criminalArrests / prev.arrests) * 100)}%`} sub={fiscalYearLabel(LAST_COMPLETE_FY)} />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Arrests &amp; removals by fiscal year"
            tooltip="Arrests are not removals — see methodology."
            source={{ sourceName: "ICE Enforcement and Removal Statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_stats }}
          >
            <TrendLineChart
              data={yearly}
              xKey="label"
              series={[
                { key: "Arrests", label: "Arrests", color: "#f43f5e" },
                { key: "Removals", label: "Removals", color: "#f59e0b" },
              ]}
            />
          </ChartCard>
          <ChartCard
            title="Criminal vs non-criminal arrests"
            tooltip="Criminality classification as reported by ICE; categories change over time."
            source={{ sourceName: "ICE Enforcement and Removal Statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_stats }}
          >
            <GroupedBarChart
              data={criminal}
              xKey="label"
              series={[
                { key: "Criminal", label: "Criminal", color: "#38bdf8" },
                { key: "Non-criminal", label: "Non-criminal", color: "#a78bfa" },
              ]}
            />
          </ChartCard>
        </div>

        <ChartCard
          title="ICE arrests by state"
          subtitle={`Latest complete fiscal year (${fiscalYearLabel(LAST_COMPLETE_FY)})`}
          source={{ sourceName: "ICE / DHS statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_stats }}
        >
          <StateMap data={byState} label="Arrests by state" unit="" />
        </ChartCard>

        <AdSlot format="in-content" />

        <ChartCard
          title="Removals by nationality"
          subtitle="Where publicly reported"
          tooltip="Removals describe events involving people of a given nationality — not the same individuals across datasets."
          source={{ sourceName: "ICE / DHS statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_stats }}
        >
          <HorizontalBarChart data={byCountry} labelKey="label" valueKey="value" colorByIndex height={320} />
        </ChartCard>

        <MethodologyNote>
          Arrests, removals, and detention measure different things on different calendars. Rising arrests
          do not mechanically translate into proportional removals, and detention is a snapshot rather than
          a flow.
        </MethodologyNote>
      </div>
    </div>
  );
}
