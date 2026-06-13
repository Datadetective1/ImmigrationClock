import type { SparkPoint } from "@/lib/types";

/**
 * Tiny inline SVG sparkline. Incomplete (YTD/preliminary) points are drawn
 * hollow and the trailing segment to them is dashed/lighter.
 */
export function Sparkline({
  points,
  width = 132,
  height = 40,
}: {
  points: SparkPoint[];
  width?: number;
  height?: number;
}) {
  if (!points || points.length < 2) return null;
  const pad = 3;
  const vals = points.map((p) => p.value);
  const max = Math.max(...vals);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const step = (width - 2 * pad) / (points.length - 1);
  const xy = points.map((p, i) => {
    const x = pad + i * step;
    const y = height - pad - ((p.value - min) / range) * (height - 2 * pad);
    return { x, y, partial: p.partial };
  });

  const solid: typeof xy = [];
  const dashed: typeof xy = [];
  for (let i = 0; i < xy.length; i++) {
    if (xy[i].partial || (i > 0 && xy[i - 1].partial)) {
      if (dashed.length === 0 && i > 0) dashed.push(xy[i - 1]);
      dashed.push(xy[i]);
    } else {
      solid.push(xy[i]);
    }
  }
  const toPath = (pts: typeof xy) =>
    pts.map((c, i) => `${i ? "L" : "M"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {solid.length > 1 ? (
        <path d={toPath(solid)} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
      {dashed.length > 1 ? (
        <path d={toPath(dashed)} fill="none" stroke="#7dd3fc" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
      ) : null}
      {xy.map((c, i) =>
        c.partial ? (
          <circle key={i} cx={c.x} cy={c.y} r="2.4" fill="#0a0e1a" stroke="#7dd3fc" strokeWidth="1.5" />
        ) : i === xy.length - 1 ? (
          <circle key={i} cx={c.x} cy={c.y} r="2.4" fill="#38bdf8" />
        ) : null
      )}
    </svg>
  );
}
