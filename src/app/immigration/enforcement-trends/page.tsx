import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { TrendLineChart, GroupedBarChart, HorizontalBarChart } from "@/components/charts/LazyCharts";
import { StateMap } from "@/components/StateMap";
import { DataStatus } from "@/components/DataStatus";
import {
  enforcementChartData,
  enforcementCriminalSplit,
  enforcementStateData,
  enforcementCountryData,
} from "@/lib/chart-data";
import { iceByFy, DETENTION_NOW, pointInTimeAge } from "@/lib/dataset";
import { LATEST_COMPLETE_FY, CURRENT_FY } from "@/lib/data";
import { formatNumber, fiscalYearLabel } from "@/lib/format";
import { UPDATED } from "@/lib/dataset";

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
  const detentionAge = pointInTimeAge(DETENTION_NOW.asOf, DETENTION_NOW.staleAfterDays);
  const complete = iceByFy[LATEST_COMPLETE_FY]; // FY2025 — last complete year
  const ytd = iceByFy[CURRENT_FY]; // FY2026 — year-to-date
  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);
  const projArrests = Math.round(ytd.arrests / (8.5 / 12));

  return (
    <div>
      <PageHeader
        eyebrow="Enforcement Pressure"
        title="Immigration enforcement trends"
        description="Arrests, removals, and detention reported by ICE and DHS. FY2026 figures are year-to-date; FY2025 is the last complete year; detention is point-in-time."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/immigration/enforcement-trends", label: "Enforcement" },
        ]}
        share
      >
        <StatRow>
          <Stat
            label={`ICE arrests · ${fiscalYearLabel(CURRENT_FY)} YTD`}
            value={formatNumber(ytd.arrests)}
            sub={`~${formatNumber(projArrests)} projected pace`}
            trend={pct(projArrests, complete.arrests) > 1.5 ? "UP" : pct(projArrests, complete.arrests) < -1.5 ? "DOWN" : "FLAT"}
            trendPct={pct(projArrests, complete.arrests)}
          />
          <Stat
            label={`Removals · ${fiscalYearLabel(CURRENT_FY)} YTD`}
            value={formatNumber(ytd.removals)}
            sub="Year-to-date"
          />
          <Stat
            label="Detention (point-in-time)"
            value={formatNumber(DETENTION_NOW.value)}
            sub={
              detentionAge.stale
                ? `As of ${DETENTION_NOW.asOf} · ${detentionAge.days} days old`
                : `As of ${DETENTION_NOW.asOf}`
            }
            tooltip={
              "A snapshot of one specific day, not a running total, and not addable to arrests or removals." +
              (detentionAge.stale
                ? " ICE has very likely published newer figures since this snapshot — treat it as dated."
                : "")
            }
          />
          <Stat label={`Removals · ${fiscalYearLabel(LATEST_COMPLETE_FY)}`} value={formatNumber(complete.removals)} sub="Last complete year" />
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
            dataCaption="ICE arrests, removals and detention by fiscal year"
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
            dataCaption="ICE enforcement actions by fiscal year"
            />
          </ChartCard>
        </div>

        <ChartCard
          title="ICE arrests by state"
          subtitle={`Latest complete fiscal year (${fiscalYearLabel(LATEST_COMPLETE_FY)}) — apportioned, not published by state`}
          tooltip="ICE does not publish arrests broken down by state. This distributes the reported national fiscal-year total across states using our own activity weights. Use it to compare relative scale, not as an official state count."
          provenance="modeled"
          source={{ sourceName: "ICE / DHS statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_stats }}
        >
          <StateMap data={byState} label="Arrests by state" unit="" />
        </ChartCard>


        <ChartCard
          title="Removals by nationality"
          subtitle="Apportioned from the reported national total"
          tooltip="Removals describe events involving people of a given nationality — not the same individuals across datasets. This split is apportioned from the reported national total using our own country weights; ICE does not publish this breakdown at this granularity."
          provenance="modeled"
          source={{ sourceName: "ICE / DHS statistics", sourceUrl: "https://www.ice.gov/statistics", sourceUpdatedAt: UPDATED.ice_stats }}
        >
          <HorizontalBarChart
            data={byCountry}
            labelKey="label"
            valueKey="value"
            colorByIndex
            height={320}
            valueLabel="Removals"
            dataCaption="ICE removals by country of citizenship"
          />
        </ChartCard>

        <DataStatus
          sourceKey="ice_stats"
          surface="enforcement"
          provenance="modeled"
          publishedAt={UPDATED.ice_stats}
        />

        <MethodologyNote>
          Arrests, removals, and detention measure different things on different calendars. Rising arrests
          do not mechanically translate into proportional removals, and detention is a snapshot rather than
          a flow.
        </MethodologyNote>
      </div>
    </div>
  );
}
