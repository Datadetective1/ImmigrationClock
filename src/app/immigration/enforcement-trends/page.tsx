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
import { iceByFy, DETENTION_NOW } from "@/lib/sample-data";
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
  const fy = LAST_COMPLETE_FY; // FY2024 — latest full-year report
  const cur = iceByFy[fy];
  const prev = iceByFy[fy - 1];
  const prelim = iceByFy[CURRENT_FY]; // FY2025 (preliminary)
  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

  return (
    <div>
      <PageHeader
        eyebrow="Enforcement Pressure"
        title="Immigration enforcement trends"
        description="Arrests, removals, and detention reported by ICE and DHS. FY2024 is the latest full-year report; FY2025 figures are preliminary."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/immigration/enforcement-trends", label: "Enforcement" },
        ]}
        share
      >
        <StatRow>
          <Stat
            label={`ICE arrests · ${fiscalYearLabel(fy)}`}
            value={formatNumber(cur.arrests)}
            sub="Latest full-year report"
            trend={pct(cur.arrests, prev.arrests) > 1.5 ? "UP" : pct(cur.arrests, prev.arrests) < -1.5 ? "DOWN" : "FLAT"}
            trendPct={pct(cur.arrests, prev.arrests)}
          />
          <Stat
            label={`Removals · ${fiscalYearLabel(fy)}`}
            value={formatNumber(cur.removals)}
            sub="Highest in over a decade"
            trend={pct(cur.removals, prev.removals) > 1.5 ? "UP" : "FLAT"}
            trendPct={pct(cur.removals, prev.removals)}
          />
          <Stat label="Detention (current)" value={formatNumber(DETENTION_NOW.value)} sub={`As of ${DETENTION_NOW.asOf}`} tooltip="Point-in-time figure, not a running total." />
          <Stat label={`Removals · ${fiscalYearLabel(CURRENT_FY)} (prelim.)`} value={formatNumber(prelim.removals)} sub="Preliminary" />
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
