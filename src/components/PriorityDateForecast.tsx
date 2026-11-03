"use client";

// =============================================================================
// "WHEN WILL MY DATE BE CURRENT?" : the priority date forecast
//
// Everyone gets the answer in years. A Pro subscriber also gets the month
// range, the pace behind it and a chart of the line against their date. The
// date is sent to /api/forecast for this one answer and is not stored.
// =============================================================================

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CHARGEABILITY,
  CHARGEABILITY_LABEL,
  EMPLOYMENT_ROWS,
  FAMILY_ROWS,
  ROW_HINT,
  ROW_LABEL,
  formatCutoff,
  type Chargeability,
  type Cutoff,
  type Row,
  type Section,
} from "@/lib/visa-bulletin";
import { describePace, formatMonth } from "@/lib/visa-bulletin/forecast-format";
import type { Forecast, Pace } from "@/lib/visa-bulletin/forecast";

interface Answer {
  kind: Forecast["kind"];
  teaser: string;
  pro?: boolean;
  detail?: Forecast;
  history?: { month: string; cutoff: Cutoff }[];
}

const WINDOW_LABEL: Record<number, string> = { 12: "Past year", 24: "Past 2 years", 36: "Past 3 years" };

function toTime(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d ?? 1);
}

/** The line's history, the reader's date and the estimate, in one small SVG. */
function ForecastChart({ history, date, f }: { history: { month: string; cutoff: Cutoff }[]; date: string; f: Forecast }) {
  const dated = history.filter((h) => /^\d{4}-\d{2}-\d{2}$/.test(h.cutoff));
  if (dated.length < 2) return null;
  const W = 640;
  const H = 220;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const endMonth = f.kind === "estimate" ? (f.latest ?? f.likely) : dated[dated.length - 1].month;
  const xs = [toTime(`${dated[0].month}-01`), toTime(`${endMonth}-01`)];
  const ys = [...dated.map((h) => toTime(h.cutoff)), toTime(date)];
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (t: number) => pad.l + ((t - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
  const sy = (t: number) => H - pad.b - ((t - y0) / (y1 - y0 || 1)) * (H - pad.t - pad.b);
  const path = dated.map((h, i) => `${i ? "L" : "M"}${sx(toTime(`${h.month}-01`)).toFixed(1)} ${sy(toTime(h.cutoff)).toFixed(1)}`).join(" ");
  const last = dated[dated.length - 1];
  const yourY = sy(toTime(date));
  const yearTicks: number[] = [];
  for (let y = new Date(x0).getUTCFullYear() + 1; y <= new Date(x1).getUTCFullYear(); y++) yearTicks.push(Date.UTC(y, 0, 1));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img" aria-label="Final action date by bulletin month, with your priority date">
      {yearTicks.map((t) => (
        <g key={t}>
          <line x1={sx(t)} x2={sx(t)} y1={pad.t} y2={H - pad.b} stroke="currentColor" className="text-white/10" />
          <text x={sx(t)} y={H - 8} textAnchor="middle" className="fill-slate-500 text-[11px]">
            {new Date(t).getUTCFullYear()}
          </text>
        </g>
      ))}
      {f.kind === "estimate" ? (
        <rect
          x={sx(toTime(`${f.earliest}-01`))}
          width={Math.max(4, sx(toTime(`${f.latest ?? endMonth}-01`)) - sx(toTime(`${f.earliest}-01`)))}
          y={pad.t}
          height={H - pad.t - pad.b}
          className="fill-accent/10"
        />
      ) : null}
      <line x1={pad.l} x2={W - pad.r} y1={yourY} y2={yourY} strokeDasharray="4 4" className="stroke-status-amber" />
      <text x={pad.l + 4} y={yourY - 6} className="fill-status-amber text-[11px]">
        Your date
      </text>
      <path d={path} fill="none" strokeWidth={2.5} className="stroke-accent" />
      {f.kind === "estimate" ? (
        <line
          x1={sx(toTime(`${last.month}-01`))}
          y1={sy(toTime(last.cutoff))}
          x2={sx(toTime(`${f.likely}-01`))}
          y2={yourY}
          strokeDasharray="3 5"
          strokeWidth={2}
          className="stroke-accent/60"
        />
      ) : null}
    </svg>
  );
}

function PaceRow({ p }: { p: Pace }) {
  return (
    <li className="flex justify-between gap-3 border-t border-white/5 py-2 text-sm">
      <span className="text-slate-400">{WINDOW_LABEL[p.window] ?? `${p.window} months`}</span>
      <span className="text-right text-slate-200">{describePace(p)}</span>
    </li>
  );
}

export function PriorityDateForecast({ initial }: { initial?: { section?: Section; row?: Row; country?: Chargeability; date?: string } }) {
  const [section, setSection] = useState<Section>(initial?.section ?? "employment");
  const [row, setRow] = useState<Row>(initial?.row ?? "EB2");
  const [country, setCountry] = useState<Chargeability>(initial?.country ?? "all");
  const [date, setDate] = useState(initial?.date ?? "");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);

  // The bulletin page links here with its own choices filled in. Read after
  // hydration so the static HTML is the same for everyone.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const s = p.get("section");
    if (s !== "family" && s !== "employment") return;
    const r = p.get("row") ?? "";
    const c = p.get("country") ?? "";
    const dt = p.get("date") ?? "";
    setSection(s);
    if ((s === "family" ? FAMILY_ROWS : EMPLOYMENT_ROWS).includes(r as never)) setRow(r as Row);
    if ((CHARGEABILITY as readonly string[]).includes(c)) setCountry(c as Chargeability);
    if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) setDate(dt);
  }, []);

  useEffect(() => {
    if (!valid) {
      setAnswer(null);
      return;
    }
    const ctrl = new AbortController();
    const q = new URLSearchParams({ section, row, country, date });
    setError("");
    fetch(`/api/forecast?${q}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (Answer & { message?: string }) | null;
        if (!res.ok || !body) throw new Error(body?.message ?? "Could not get an estimate. Try again.");
        setAnswer(body);
      })
      .catch((e: Error) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => ctrl.abort();
  }, [section, row, country, date, valid]);

  const rows: readonly Row[] = section === "family" ? FAMILY_ROWS : EMPLOYMENT_ROWS;
  const field = "mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none";
  const d = answer?.detail;

  return (
    <section aria-labelledby="forecast-heading" className="panel p-4 sm:p-6">
      <h2 id="forecast-heading" className="text-lg font-bold text-white sm:text-xl">
        When will my date be current?
      </h2>

      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Green card type">
        {(["employment", "family"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={section === s}
            onClick={() => {
              setSection(s);
              setRow(s === "family" ? "F2A" : "EB2");
            }}
            className={`min-h-[40px] flex-1 rounded-lg border px-3 text-sm font-semibold transition-colors ${
              section === s ? "border-accent/60 bg-accent/15 text-white" : "border-white/15 text-slate-300 hover:text-white"
            }`}
          >
            {s === "employment" ? "Employment" : "Family"}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-slate-400">
          Category
          <select className={field} value={row} onChange={(e) => setRow(e.target.value as Row)}>
            {rows.map((r) => (
              <option key={r} value={r}>
                {ROW_LABEL[r]}: {ROW_HINT[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-400">
          Country of chargeability
          <select className={field} value={country} onChange={(e) => setCountry(e.target.value as Chargeability)}>
            {CHARGEABILITY.map((c) => (
              <option key={c} value={c}>
                {CHARGEABILITY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-400">
          Your priority date
          <input type="date" className={field} value={date} min="1980-01-01" max="2100-12-31" onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div aria-live="polite">
        {!valid ? (
          <p className="mt-4 rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400">
            Enter your priority date to see an estimate.
          </p>
        ) : error ? (
          <p className="mt-4 rounded-xl border border-status-red/40 bg-status-red/10 p-4 text-sm text-slate-200">{error}</p>
        ) : answer ? (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estimate</div>
            <p className="mt-1 text-2xl font-bold text-white">{answer.teaser}</p>

            {d && d.kind === "estimate" && !d.beyondHorizon ? (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-slate-400">Earliest</div>
                    <div className="text-base font-semibold text-white">{formatMonth(d.earliest)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Most likely</div>
                    <div className="text-base font-semibold text-accent">{formatMonth(d.likely)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-400">Latest</div>
                    <div className="text-base font-semibold text-white">{d.latest ? formatMonth(d.latest) : "Open ended"}</div>
                  </div>
                </div>
                {answer.history ? <ForecastChart history={answer.history} date={date} f={d} /> : null}
                <ul className="mt-3">
                  {d.paces.map((p) => (
                    <PaceRow key={p.window} p={p} />
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-400">
                  Final action date in {formatMonth(d.asOf)}: {formatCutoff(d.cutoff as Cutoff)}.
                </p>
              </>
            ) : null}

            {d && d.kind === "stalled" ? (
              <ul className="mt-3">
                {d.paces.map((p) => (
                  <PaceRow key={p.window} p={p} />
                ))}
              </ul>
            ) : null}

            {!answer.pro && answer.kind === "estimate" ? (
              <p className="mt-3 text-sm text-slate-300">
                <Link href="/pricing" className="font-semibold text-accent underline">
                  Pro
                </Link>{" "}
                shows the month range, the pace behind it and a chart of the line against your date.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="mt-4 text-xs text-slate-500">
        An estimate from how fast the official final action date has moved, not legal advice and not a promise. Bulletins can
        stall or move back.
      </p>
    </section>
  );
}
