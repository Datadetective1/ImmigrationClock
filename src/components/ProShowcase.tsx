// =============================================================================
// THE PRO PAGE'S PRODUCT SHOTS
//
// Two cards that show what a subscriber gets, each built by the real code from
// the latest official data (src/lib/pro-showcase.ts). Labelled "Example" and
// dated, so nobody mistakes them for their own case. Server component.
// =============================================================================

import Link from "next/link";
import { FORECAST_PATH } from "@/lib/visa-bulletin";
import type { AlertExample, ForecastExample } from "@/lib/pro-showcase";

function Trail({ points }: { points: ForecastExample["trail"] }) {
  const w = 240;
  const h = 56;
  const pad = 4;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const step = (w - 2 * pad) / (points.length - 1);
  const xy = points.map((p, i) => [pad + i * step, h - pad - ((p.value - min) / range) * (h - 2 * pad)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-14 w-full" role="img" aria-label="Final action date over recent bulletins">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className="text-accent" />
      <circle cx={lx} cy={ly} r="3.5" className="fill-accent" />
    </svg>
  );
}

export function ForecastExampleCard({ ex }: { ex: ForecastExample }) {
  const cols = [
    { k: "Earliest", v: ex.earliest, strong: false },
    { k: "Likely", v: ex.likely, strong: true },
    { k: "Latest", v: ex.latest, strong: false },
  ];
  return (
    <article className="panel panel-pad flex flex-col" aria-labelledby="show-forecast">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Forecast by month</p>
      <h3 id="show-forecast" className="mt-1 text-base font-bold text-white">
        The month, not just the year
      </h3>
      <p className="mt-1 text-xs text-slate-400">
        Example: {ex.label}, priority date {ex.priorityDate}
      </p>

      <div className="mt-4 flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-xs">
        <span className="text-slate-500">Free answer</span>
        <span className="font-medium text-slate-300">{ex.freeAnswer}</span>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-lg border border-accent/30 bg-accent/[0.05] p-2">
        {cols.map((c) => (
          <div key={c.k} className={`rounded-md px-2 py-2 text-center ${c.strong ? "bg-accent/10" : ""}`}>
            <span className="block text-[10px] uppercase tracking-wide text-slate-500">{c.k}</span>
            <span className={`mt-0.5 block text-sm tabular-nums ${c.strong ? "font-bold text-accent" : "font-semibold text-white"}`}>
              {c.v}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Trail points={ex.trail} />
        <p className="text-[11px] text-slate-500">
          The final action date across {ex.trail.length} official bulletins, to {ex.asOf}.
        </p>
      </div>

      <Link href={FORECAST_PATH} className="link-accent mt-auto pt-3 text-sm font-medium">
        Try it with your date &rarr;
      </Link>
    </article>
  );
}

export function AlertExampleCard({ ex }: { ex: AlertExample }) {
  return (
    <article className="panel panel-pad flex flex-col" aria-labelledby="show-alert">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">Email alerts</p>
      <h3 id="show-alert" className="mt-1 text-base font-bold text-white">
        Told the day it moves
      </h3>
      <p className="mt-1 text-xs text-slate-400">Example: the alert Pro builds for anyone {ex.following.replace("Following", "following")}, from this month&apos;s bulletin.</p>

      <div className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/15 text-[11px] font-bold text-accent" aria-hidden>
            IC
          </span>
          <span className="min-w-0 text-xs">
            <span className="block font-semibold text-white">ImmigrationClock</span>
            <span className="block truncate text-slate-500">{ex.following}</span>
          </span>
        </div>
        <div className="px-3 py-3">
          <p className="text-sm font-semibold text-white">{ex.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{ex.detail}</p>
          <p className="mt-2 text-[11px] text-slate-500">Source: {ex.source}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-slate-400">
        <li>New Visa Bulletin for your category</li>
        <li>New rules and notices on what you follow</li>
        <li>Checked daily. Nothing sent when nothing changed.</li>
      </ul>
    </article>
  );
}
