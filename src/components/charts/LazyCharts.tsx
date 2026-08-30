"use client";

// =============================================================================
// LAZY CHARTS — the same three charts, off the critical path
//
// WHY THIS FILE EXISTS
// --------------------
// recharts is 391 kB raw / 100.6 kB gzipped, and it was in the First Load JS
// graph of ten routes: every entity page (/company, /country, /state,
// /h1b/state, /h1b/salaries), /h1b/top-sponsors, /visa/f1-student-visas,
// /border/encounters, /immigration/enforcement-trends and /layoffs-vs-h1b.
// Those pages all sat at 200-207 kB First Load against an 87.5 kB baseline.
//
// It contributed NOTHING to the prerendered HTML. ResponsiveContainer cannot
// know its size on the server, so the static document contains exactly this:
//
//   <div style="width:100%;height:300px">
//     <div class="recharts-responsive-container" style="..."></div>
//   </div>
//
// An empty box. So the whole page — breadcrumbs, headline figures, tables,
// source links, the archive panel — was inert behind a 100 kB download that
// painted nothing until it finished. Measured cold on a throttled iPhone 13
// (4x CPU, 1.6 Mbps), the first chart pixel landed at 2.6-3.1 s regardless.
//
// WHAT THIS CHANGES, AND WHAT IT DOES NOT
// ---------------------------------------
// No visualization is removed and no chart is replaced with a worse one. The
// charts render exactly as before, from the same components with the same
// props. Only WHEN the library loads changes: ssr:false + dynamic() moves
// recharts into its own chunk fetched after the page is interactive, instead of
// blocking it. The reader gets a usable page first and the chart a moment
// later, rather than neither for three seconds.
//
// The placeholder below occupies the same height the chart will, so nothing
// moves when it arrives — the reserved box already existed, this just stops it
// being blank and unexplained.
// =============================================================================

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { ChartMarker, SeriesDef } from "./Charts";
import { ChartData, type DataColumn } from "./ChartData";

export type { ChartMarker, SeriesDef };

/**
 * Reserved space, sized to the chart that will replace it.
 *
 * `height` is the same number passed to the real component, so the swap is a
 * repaint rather than a reflow. Announced politely rather than hidden: a screen
 * reader user should know something is still arriving, not meet silence.
 */
function ChartSkeleton({ height }: { height: number }) {
  return (
    <>
      {/* Without JavaScript the chart never arrives, so a placeholder that says
          "Loading chart…" is a promise the page cannot keep — it sat there
          permanently. Hiding it for those readers leaves the data disclosure
          below, which is real information rather than a stuck spinner. A
          <noscript> block is inert when scripts run, so the placeholder still
          behaves normally for everyone else. */}
      <noscript>
        {/* eslint-disable-next-line react/no-danger */}
        <style dangerouslySetInnerHTML={{ __html: ".ic-chart-skeleton{display:none}" }} />
      </noscript>
      <div
        style={{ width: "100%", height }}
        className="ic-chart-skeleton flex items-center justify-center rounded-xl border border-white/5 bg-white/[0.02]"
        role="status"
        aria-live="polite"
      >
        <span className="text-xs text-slate-500">Loading chart…</span>
      </div>
    </>
  );
}

/**
 * Chart plus the numbers behind it.
 *
 * Every chart goes through here, so no route can ship a picture with no readable
 * values by forgetting to opt in. `data` is not passed twice: the table is
 * derived from the array the chart is already plotting, which is also why the
 * two can never disagree.
 *
 * `hideData` exists for the pages that already print these figures elsewhere —
 * /layoffs-vs-h1b, /h1b/salaries/*, /state/*, /h1b/state/* were measured at 100%
 * visible before any of this. Repeating them there would be duplication, which
 * is the thing to avoid, not more coverage.
 */
function WithData({
  height,
  rows,
  columns,
  caption,
  hideData,
  children,
}: {
  height: number;
  rows: Record<string, number | string | boolean>[];
  columns: DataColumn[];
  caption?: string;
  hideData?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <Deferred height={height}>{children}</Deferred>
      {hideData ? null : <ChartData rows={rows} columns={columns} caption={caption} />}
    </>
  );
}

// ssr:false is the point: recharts renders an empty container on the server, so
// there is nothing to lose by skipping it, and skipping it is what keeps the
// library out of the page's initial JS.
const TrendLineChartImpl = dynamic(() => import("./Charts").then((m) => m.TrendLineChart), {
  ssr: false,
  loading: () => null,
});
const GroupedBarChartImpl = dynamic(() => import("./Charts").then((m) => m.GroupedBarChart), {
  ssr: false,
  loading: () => null,
});
const HorizontalBarChartImpl = dynamic(() => import("./Charts").then((m) => m.HorizontalBarChart), {
  ssr: false,
  loading: () => null,
});

/**
 * `loading` above returns null and the skeleton is rendered here instead,
 * because next/dynamic's own loading slot cannot see the caller's `height` —
 * and a placeholder of the wrong height reintroduces the layout shift this is
 * meant to avoid. `suppressHydrationWarning` is not needed: the server renders
 * the skeleton, and the client replaces it after mount.
 */
/** Shared by every chart: what the figures are, and whether to print them. */
interface DataProps {
  /** A short phrase naming the figures, e.g. "Estimated H-1B and F-1 issuances to India". */
  dataCaption?: string;
  /** Suppress the table where the page already shows these values. */
  hideData?: boolean;
}

type TrendLineProps = DataProps & {
  data: Record<string, number | string | boolean>[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  currency?: boolean;
  markers?: ChartMarker[];
};

/** The x-axis column plus one column per plotted series — the chart's own shape. */
function seriesColumns(xKey: string, series: SeriesDef[], currency?: boolean): DataColumn[] {
  return [
    { key: xKey, label: "Period" },
    ...series.map((s) => ({ key: s.key, label: s.label, numeric: true, currency })),
  ];
}

export function TrendLineChart({ dataCaption, hideData, ...props }: TrendLineProps) {
  return (
    <WithData
      height={props.height ?? 260}
      rows={props.data}
      columns={seriesColumns(props.xKey, props.series, props.currency)}
      caption={dataCaption}
      hideData={hideData}
    >
      <TrendLineChartImpl {...props} />
    </WithData>
  );
}

export function GroupedBarChart({ dataCaption, hideData, ...props }: TrendLineProps) {
  return (
    <WithData
      height={props.height ?? 260}
      rows={props.data}
      columns={seriesColumns(props.xKey, props.series, props.currency)}
      caption={dataCaption}
      hideData={hideData}
    >
      <GroupedBarChartImpl {...props} />
    </WithData>
  );
}

type HorizontalBarProps = DataProps & {
  data: Record<string, number | string | boolean>[];
  labelKey: string;
  valueKey: string;
  height?: number;
  currency?: boolean;
  colorByIndex?: boolean;
  /** Column heading for the value column. Defaults to the value key. */
  valueLabel?: string;
};

export function HorizontalBarChart({ dataCaption, hideData, valueLabel, ...props }: HorizontalBarProps) {
  return (
    <WithData
      height={props.height ?? 280}
      rows={props.data}
      columns={[
        { key: props.labelKey, label: "Name" },
        { key: props.valueKey, label: valueLabel ?? "Value", numeric: true, currency: props.currency },
      ]}
      caption={dataCaption}
      hideData={hideData}
    >
      <HorizontalBarChartImpl {...props} />
    </WithData>
  );
}

/**
 * Renders the skeleton until the browser has mounted, then the chart.
 *
 * Without the mount gate the server would render the dynamic component's null
 * loading slot and the reserved box would collapse to zero height on the very
 * first paint — a layout shift the old code did not have, since its empty
 * container was correctly sized. This keeps the reserved height at every stage.
 */
function Deferred({ height, children }: { height: number; children: React.ReactNode }) {
  const mounted = useMounted();
  if (!mounted) return <ChartSkeleton height={height} />;
  return <>{children}</>;
}

function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
