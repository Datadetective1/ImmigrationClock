import { MetricCard } from "./MetricCard";
import type { Metric } from "@/lib/types";

/** Responsive grid of live metric counters (1→2→3→4 columns). */
export function DashboardGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {metrics.map((m) => (
        <MetricCard key={m.key} metric={m} />
      ))}
    </div>
  );
}
