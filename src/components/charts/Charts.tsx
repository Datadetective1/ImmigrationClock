"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
  Cell,
  ReferenceLine,
} from "recharts";

const PALETTE = ["#38bdf8", "#f43f5e", "#f59e0b", "#22c55e", "#a78bfa", "#34d399"];

/** Optional event markers overlaid on a time-series chart (x = category value). */
export interface ChartMarker {
  x: string;
  label: string;
}
function renderMarkers(markers?: ChartMarker[]) {
  if (!markers || markers.length === 0) return null;
  return markers.map((m) => (
    <ReferenceLine
      key={`${m.x}-${m.label}`}
      x={m.x}
      stroke="#64748b"
      strokeDasharray="4 3"
      label={{ value: m.label, position: "insideTopRight", fill: "#94a3b8", fontSize: 9 }}
    />
  ));
}

function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

const axisProps = {
  stroke: "#334155",
  tick: { fill: "#94a3b8", fontSize: 11 },
  tickLine: false,
};

export interface SeriesDef {
  key: string;
  label: string;
  color?: string;
}

export function TrendLineChart({
  data,
  xKey,
  series,
  height = 260,
  currency = false,
  markers,
}: {
  data: Record<string, number | string | boolean>[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  currency?: boolean;
  markers?: ChartMarker[];
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => (currency ? `$${compact(Number(v))}` : compact(Number(v)))} width={48} />
          <RTooltip
            formatter={(v: number) => (currency ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString())}
            contentStyle={{ background: "#0f1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
            labelStyle={{ color: "#e2e8f0" }}
          />
          {renderMarkers(markers)}
          {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function GroupedBarChart({
  data,
  xKey,
  series,
  height = 260,
  currency = false,
  markers,
}: {
  data: Record<string, number | string | boolean>[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  currency?: boolean;
  markers?: ChartMarker[];
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps} />
          <YAxis {...axisProps} tickFormatter={(v) => (currency ? `$${compact(Number(v))}` : compact(Number(v)))} width={48} />
          <RTooltip
            formatter={(v: number) => (currency ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString())}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#0f1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
            labelStyle={{ color: "#e2e8f0" }}
          />
          {renderMarkers(markers)}
          {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={s.color ?? PALETTE[i % PALETTE.length]}
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalBarChart({
  data,
  labelKey,
  valueKey,
  height = 280,
  currency = false,
  colorByIndex = false,
}: {
  data: Record<string, number | string | boolean>[];
  labelKey: string;
  valueKey: string;
  height?: number;
  currency?: boolean;
  colorByIndex?: boolean;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={(v) => (currency ? `$${compact(Number(v))}` : compact(Number(v)))} />
          <YAxis type="category" dataKey={labelKey} {...axisProps} width={130} />
          <RTooltip
            formatter={(v: number) => (currency ? `$${Number(v).toLocaleString()}` : Number(v).toLocaleString())}
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            contentStyle={{ background: "#0f1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
            labelStyle={{ color: "#e2e8f0" }}
          />
          <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} maxBarSize={26}>
            {data.map((_, i) => (
              <Cell key={i} fill={colorByIndex ? PALETTE[i % PALETTE.length] : "#38bdf8"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
