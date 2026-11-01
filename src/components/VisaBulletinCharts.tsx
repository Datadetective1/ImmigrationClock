"use client";

// The full month: one table at a time, switched by two small toggles, each
// cell with an arrow for how it moved since the month before.

import { useState } from "react";
import {
  CHARGEABILITY,
  CHARGEABILITY_SHORT,
  ROW_HINT,
  ROW_LABEL,
  cutoffFor,
  formatCutoff,
  movement,
  rowsFor,
  type Bulletin,
  type ChartKind,
  type Movement,
  type Section,
} from "@/lib/visa-bulletin";

function MoveMark({ move }: { move: Movement }) {
  switch (move.kind) {
    case "ahead":
      return (
        <span className="block text-[11px] font-semibold text-status-green">
          <span aria-hidden>▲ </span>
          <span className="sr-only">moved ahead </span>
          {move.gap}
        </span>
      );
    case "back":
      return (
        <span className="block text-[11px] font-semibold text-status-red">
          <span aria-hidden>▼ </span>
          <span className="sr-only">moved back </span>
          {move.gap}
        </span>
      );
    case "now-current":
      return <span className="block text-[11px] font-semibold text-status-green">now current</span>;
    case "now-unavailable":
      return <span className="block text-[11px] font-semibold text-status-red">now unavailable</span>;
    case "now-dated":
      return <span className="block text-[11px] font-semibold text-status-amber">now dated</span>;
    default:
      return null;
  }
}

function Toggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-white/15 p-0.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`min-h-[36px] rounded-md px-3 text-sm font-semibold transition-colors ${
            value === v ? "bg-accent/20 text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function VisaBulletinCharts({ bulletin, previous }: { bulletin: Bulletin; previous: Bulletin | null }) {
  const [section, setSection] = useState<Section>("employment");
  const [chart, setChart] = useState<ChartKind>("finalAction");

  return (
    <section id="charts" aria-labelledby="charts-heading" className="panel p-4 sm:p-6">
      <h2 id="charts-heading" className="text-lg font-bold text-white sm:text-xl">
        All {bulletin.label} dates
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Toggle
          label="Green card type"
          value={section}
          onChange={setSection}
          options={[
            ["employment", "Employment"],
            ["family", "Family"],
          ]}
        />
        <Toggle
          label="Chart"
          value={chart}
          onChange={setChart}
          options={[
            ["finalAction", "Final action"],
            ["filing", "Filing"],
          ]}
        />
      </div>

      <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Category
              </th>
              {CHARGEABILITY.map((c) => (
                <th key={c} scope="col" className="px-2 py-2 font-semibold">
                  {CHARGEABILITY_SHORT[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsFor(section).map((row) => (
              <tr key={row} className="border-t border-white/5 align-top">
                <th scope="row" className="py-2.5 pr-3 text-left">
                  <span className="block font-semibold text-white">{ROW_LABEL[row]}</span>
                  <span className="block text-xs font-normal text-slate-500">{ROW_HINT[row]}</span>
                </th>
                {CHARGEABILITY.map((c) => {
                  const cur = cutoffFor(bulletin, section, chart, row, c);
                  const prev = previous ? cutoffFor(previous, section, chart, row, c) : undefined;
                  return (
                    <td key={c} className="px-2 py-2.5 tabular-nums text-slate-200">
                      {formatCutoff(cur)}
                      <MoveMark move={movement(prev, cur)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {previous ? (
        <p className="mt-3 text-xs text-slate-500">Arrows compare with the {previous.label} bulletin.</p>
      ) : null}
    </section>
  );
}
