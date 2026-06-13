"use client";

import { useState } from "react";
import { MetricCard, type CardMode } from "./MetricCard";
import type { Metric } from "@/lib/types";

const MODES: { key: CardMode; label: string }[] = [
  { key: "latest", label: "Latest available" },
  { key: "complete", label: "Last complete FY" },
  { key: "trend", label: "5-year trend" },
];

/** Responsive grid of live metric counters with a freshness view toggle. */
export function DashboardGrid({ metrics }: { metrics: Metric[] }) {
  const [mode, setMode] = useState<CardMode>("latest");

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-slate-500">View:</span>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m.key ? "bg-accent text-ink-950" : "text-slate-300 hover:text-white"
              }`}
              aria-pressed={mode === m.key}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {metrics.map((m) => (
          <MetricCard key={m.key} metric={m} mode={mode} />
        ))}
      </div>
    </div>
  );
}
