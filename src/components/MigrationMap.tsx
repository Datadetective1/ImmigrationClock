"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProvenanceTag } from "./ProvenanceTag";
import {
  VISA_CLASSES,
  CLASS_META,
  USA,
  MAP_W,
  MAP_H,
  mapFlows,
  type MapVisaClass,
  type MapNode,
} from "@/lib/migration-map";
import { formatNumber, formatCompact } from "@/lib/format";

// Dot radius scaled by volume (sqrt so area ~ count), clamped for legibility.
function radius(issued: number): number {
  return Math.max(5, Math.min(34, 4 + Math.sqrt(issued) / 14));
}

// Curved path from an origin node to the U.S. anchor (lifted control point).
function arcPath(n: MapNode): string {
  const mx = (n.x + USA.x) / 2;
  const my = (n.y + USA.y) / 2;
  const dist = Math.hypot(n.x - USA.x, n.y - USA.y);
  const cy = my - dist * 0.28;
  return `M ${n.x} ${n.y} Q ${mx} ${cy} ${USA.x} ${USA.y}`;
}

export function MigrationMap({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [cls, setCls] = useState<MapVisaClass>("H-1B");
  const [hover, setHover] = useState<string | null>(null);
  // Respect the visitor's reduced-motion preference (disables the traveling dots).
  const [motion, setMotion] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setMotion(!mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const nodes = mapFlows(cls);
  const meta = CLASS_META[cls];
  const max = nodes[0]?.issued ?? 1;

  // Graticule lines every 30°.
  const vLines = Array.from({ length: 11 }, (_, i) => ((i + 1) * MAP_W) / 12);
  const hLines = Array.from({ length: 5 }, (_, i) => ((i + 1) * MAP_H) / 6);

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-accent/60 to-transparent" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1 text-accent">Origins</div>
          <h3 className="text-base font-bold text-white sm:text-lg">Where America&rsquo;s immigrants come from</h3>
          <p className="mt-0.5 text-sm text-slate-400">{meta.blurb}</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5" role="tablist" aria-label="Visa type">
          {VISA_CLASSES.map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === cls}
              onClick={() => setCls(c)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                c === cls ? "bg-accent text-ink-950" : "text-slate-300 hover:text-white"
              }`}
            >
              {CLASS_META[c].tab}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-4 grid gap-4 ${embedded ? "" : "lg:grid-cols-[1.6fr_1fr]"}`}>
        {/* Map */}
        <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-950/60">
          <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="h-auto w-full" role="img" aria-label={`Flow map of ${meta.label} origin countries, FY data`}>
            <defs>
              <radialGradient id="usGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#070b16" />
            {/* graticule */}
            {vLines.map((x) => (
              <line key={`v${x}`} x1={x} y1={0} x2={x} y2={MAP_H} stroke="#ffffff" strokeOpacity="0.04" />
            ))}
            {hLines.map((y) => (
              <line key={`h${y}`} x1={0} y1={y} x2={MAP_W} y2={y} stroke="#ffffff" strokeOpacity="0.04" />
            ))}

            {/* arcs origin -> US, with a glowing dot streaming toward the U.S. */}
            {nodes.map((n, i) => {
              const d = arcPath(n);
              const dim = hover && hover !== n.slug;
              const weight = n.issued / max;
              const dur = 2.2 + (1 - weight) * 2.6; // bigger flows move a touch faster
              return (
                <g key={`arc-${n.slug}`}>
                  <path
                    d={d}
                    fill="none"
                    stroke="#38bdf8"
                    strokeOpacity={dim ? 0.1 : 0.45}
                    strokeWidth={1 + weight * 5}
                    strokeLinecap="round"
                    className="flow-arc"
                  />
                  {motion ? (
                    <circle r={2.5 + weight * 3} fill="#bae6fd" opacity={dim ? 0.2 : 0.95}>
                      <animateMotion path={d} dur={`${dur}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0;0.95;0.95;0" dur={`${dur}s`} begin={`${i * 0.3}s`} repeatCount="indefinite" />
                    </circle>
                  ) : null}
                </g>
              );
            })}

            {/* US destination */}
            <circle cx={USA.x} cy={USA.y} r="46" fill="url(#usGlow)" />
            <circle cx={USA.x} cy={USA.y} r="6" fill="#38bdf8">
              <animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite" />
            </circle>
            <text x={USA.x} y={USA.y - 14} textAnchor="middle" fill="#e2e8f0" fontSize="13" fontWeight="700">
              United States
            </text>

            {/* origin countries */}
            {nodes.map((n) => {
              const r = radius(n.issued);
              const east = n.lon > -30; // label side
              const active = hover === n.slug;
              return (
                <g
                  key={n.slug}
                  className="cursor-pointer"
                  onMouseEnter={() => setHover(n.slug)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => router.push(`/country/${n.slug}`)}
                  role="link"
                  aria-label={`${n.name}: ${formatNumber(n.issued)} ${cls}. Open country page.`}
                >
                  <title>{`${n.name} — ${formatNumber(n.issued)} ${cls} (${Math.round(n.share * 100)}%)`}</title>
                  <circle cx={n.x} cy={n.y} r={r} fill="#f59e0b" fillOpacity={active ? 0.95 : 0.7} stroke="#fde68a" strokeOpacity={active ? 1 : 0.4} />
                  <text
                    x={east ? n.x + r + 4 : n.x - r - 4}
                    y={n.y + 4}
                    textAnchor={east ? "start" : "end"}
                    fill="#e2e8f0"
                    fontSize="12"
                    fontWeight="600"
                  >
                    {n.name}
                    <tspan fill="#94a3b8" fontWeight="400">{`  ${formatCompact(n.issued)}`}</tspan>
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Ranked list (accessible + clickable to monetized country pages) */}
        <div>
          <ul className="divide-y divide-white/5 rounded-xl border border-white/10 bg-white/[0.02]">
            {nodes.map((n, i) => (
              <li key={n.slug}>
                <Link
                  href={`/country/${n.slug}`}
                  onMouseEnter={() => setHover(n.slug)}
                  onMouseLeave={() => setHover(null)}
                  className={`flex items-center gap-3 px-3 py-2 transition-colors ${hover === n.slug ? "bg-white/5" : "hover:bg-white/5"}`}
                >
                  <span className="w-4 shrink-0 font-mono text-xs text-slate-500">{i + 1}</span>
                  <span className="flex-1 truncate text-sm text-slate-200">{n.name}</span>
                  <span className="font-mono text-sm tabular-nums text-white">{formatNumber(n.issued)}</span>
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-slate-500">{Math.round(n.share * 100)}%</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-1 text-[11px] text-slate-500">Tap a country for its full visa &amp; remittance picture.</p>
        </div>
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-slate-500">
        <ProvenanceTag provenance={meta.provenance} />
        Animated visualization of the latest annual data ({meta.label}). The motion is illustrative —
        this is reported/estimated annual data, <strong className="text-slate-400">not live tracking</strong>, and we never
        track individuals. <Link href="/methodology" className="link-accent">Methodology →</Link>
      </p>
    </section>
  );
}
