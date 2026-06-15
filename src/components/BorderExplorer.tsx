"use client";

import { useState } from "react";
import { ChartCard } from "./ChartCard";
import { GroupedBarChart, type ChartMarker } from "./charts/Charts";

type Border = "southwest" | "northern" | "nationwide";
type Row = Record<string, number | string | boolean>;

const BORDERS: { key: Border; label: string }[] = [
  { key: "southwest", label: "Southwest" },
  { key: "northern", label: "Northern" },
  { key: "nationwide", label: "Nationwide" },
];

export function BorderExplorer({
  yearly,
  demographics,
  source,
  markers,
}: {
  yearly: Record<Border, Row[]>;
  demographics: Record<Border, Row[]>;
  source: { sourceName: string; sourceUrl: string; sourceUpdatedAt: string };
  markers?: ChartMarker[];
}) {
  const [border, setBorder] = useState<Border>("southwest");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-500">Border sector:</span>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {BORDERS.map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={() => setBorder(b.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                border === b.key ? "bg-accent text-ink-950" : "text-slate-300 hover:text-white"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title={`${BORDERS.find((b) => b.key === border)!.label} encounters by fiscal year`}
          tooltip="An encounter is an event, not a unique person, and is not a deportation."
          source={source}
        >
          <GroupedBarChart
            data={yearly[border]}
            xKey="label"
            series={[{ key: "Encounters", label: "Encounters", color: "#38bdf8" }]}
            markers={markers}
          />
        </ChartCard>
        <ChartCard title="Encounters by demographic" subtitle="Single adults, family units, minors" source={source}>
          <GroupedBarChart
            data={demographics[border]}
            xKey="label"
            series={[
              { key: "Single adults", label: "Single adults", color: "#38bdf8" },
              { key: "Family units", label: "Family units", color: "#a78bfa" },
              { key: "Unaccompanied minors", label: "Minors", color: "#f59e0b" },
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}
