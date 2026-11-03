"use client";

// =============================================================================
// "WHERE IS MY DATE?" ON THE VISA BULLETIN PAGE
//
// The reader picks a category, a country of chargeability and their priority
// date, and sees where that date sits against both charts for the month. The
// comparison is the bulletin's own rule (earlier than the listed date) and
// nothing more. The estimate of when a date may be reached lives on
// /priority-date-forecast, linked below with the same choices filled in.
//
// Nothing is sent anywhere. The choice can be kept in this browser so next
// month's page opens with it filled in, the same way follows are kept.
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
  checkDate,
  cutoffFor,
  type Bulletin,
  type Chargeability,
  type ChartKind,
  type DateCheck,
  type Row,
  type Section,
  FORECAST_PATH,
} from "@/lib/visa-bulletin";

const STORE_KEY = "ic:visa-bulletin:my-date";

interface Saved {
  section: Section;
  row: Row;
  country: Chargeability;
  date: string;
}

function readSaved(): Saved | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Saved;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return null;
    return v;
  } catch {
    return null;
  }
}

const CHART_LABEL: Record<ChartKind, string> = {
  finalAction: "Final action date",
  filing: "Date for filing",
};

function Verdict({ chart, check }: { chart: ChartKind; check: DateCheck }) {
  let tone = "border-white/10 bg-white/[0.03]";
  let icon = "•";
  let headline = "";
  let detail = "";
  switch (check.kind) {
    case "current":
      tone = "border-status-green/40 bg-status-green/10";
      icon = "✓";
      headline = "Current";
      detail = "Every priority date is reached in this chart this month.";
      break;
    case "before-cutoff":
      tone = "border-status-green/40 bg-status-green/10";
      icon = "✓";
      headline = "Your date is reached";
      detail = `It is earlier than the listed date, ${check.cutoff}.`;
      break;
    case "after-cutoff":
      tone = "border-status-amber/40 bg-status-amber/10";
      icon = "⏳";
      headline = `${check.gap} to go`;
      detail = `The listed date is ${check.cutoff}. It has to pass your date first.`;
      break;
    case "unavailable":
      tone = "border-status-red/40 bg-status-red/10";
      icon = "✕";
      headline = "Unavailable";
      detail = "No numbers in this category this month.";
      break;
    case "not-listed":
      headline = "Not listed";
      detail = "The bulletin gives no date for this choice.";
      break;
  }
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{CHART_LABEL[chart]}</div>
      <div className="mt-1 flex items-center gap-2 text-lg font-bold text-white">
        <span aria-hidden>{icon}</span>
        {headline}
      </div>
      <p className="mt-1 text-sm text-slate-300">{detail}</p>
    </div>
  );
}

export function VisaBulletinChecker({ bulletin }: { bulletin: Bulletin }) {
  const [section, setSection] = useState<Section>("employment");
  const [row, setRow] = useState<Row>("EB2");
  const [country, setCountry] = useState<Chargeability>("all");
  const [date, setDate] = useState("");
  const [remember, setRemember] = useState(false);

  // Restore a saved choice after hydration, so the server HTML stays the same
  // for every reader.
  useEffect(() => {
    const s = readSaved();
    if (!s) return;
    setSection(s.section);
    setRow(s.row);
    setCountry(s.country);
    setDate(s.date);
    setRemember(true);
  }, []);

  useEffect(() => {
    try {
      if (remember && date) {
        window.localStorage.setItem(STORE_KEY, JSON.stringify({ section, row, country, date } satisfies Saved));
      } else if (!remember) {
        window.localStorage.removeItem(STORE_KEY);
      }
    } catch {
      // Private mode or storage blocked: the checker still works, it just forgets.
    }
  }, [remember, section, row, country, date]);

  const rows: readonly Row[] = section === "family" ? FAMILY_ROWS : EMPLOYMENT_ROWS;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);

  function pickSection(s: Section) {
    setSection(s);
    setRow(s === "family" ? "F2A" : "EB2");
  }

  const field = "mt-1 w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none";

  return (
    <section id="check" aria-labelledby="check-heading" className="panel p-4 sm:p-6">
      <div className="eyebrow mb-1 text-accent">Free check</div>
      <h2 id="check-heading" className="text-lg font-bold text-white sm:text-xl">
        Where is your date this month?
      </h2>

      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Green card type">
        {(["employment", "family"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={section === s}
            onClick={() => pickSection(s)}
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
          <input
            type="date"
            className={field}
            value={date}
            min="1990-01-01"
            max="2100-12-31"
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      </div>

      {valid ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-live="polite">
          {(["finalAction", "filing"] as const).map((chart) => (
            <Verdict
              key={chart}
              chart={chart}
              check={checkDate(date, cutoffFor(bulletin, section, chart, row, country))}
            />
          ))}
          <Link
            href={`${FORECAST_PATH}?${new URLSearchParams({ section, row, country, date })}`}
            className="text-sm font-semibold text-accent underline sm:col-span-2"
          >
            When might it be reached? See the forecast
          </Link>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400">
          Enter your priority date to see it against both charts for {bulletin.label}.
        </p>
      )}

      <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Remember on this device, so next month opens with your date
      </label>
      <p className="mt-1 text-xs text-slate-500">Kept in your browser only. We never see it.</p>
    </section>
  );
}
