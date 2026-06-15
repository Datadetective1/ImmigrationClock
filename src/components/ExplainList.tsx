"use client";

import { useState } from "react";
import type { Explainer, ExplainGroup } from "@/lib/explainers";

type Level = "simple" | "technical" | "methodology";

const LEVELS: { key: Level; label: string; hint: string }[] = [
  { key: "simple", label: "Simple", hint: "Plain English" },
  { key: "technical", label: "Technical", hint: "Precise definition" },
  { key: "methodology", label: "Methodology", hint: "How we measure it" },
];

const GROUP: Record<ExplainGroup, { label: string; cls: string }> = {
  border: { label: "Border", cls: "text-status-green" },
  enforcement: { label: "Enforcement", cls: "text-status-red" },
  visa: { label: "Visas", cls: "text-status-amber" },
  workforce: { label: "Workforce", cls: "text-accent" },
  data: { label: "Reading the data", cls: "text-fuchsia-300" },
};

/**
 * Reading-level toggle (Simple / Technical / Methodology) applied to every
 * concept card at once — the "explain like I'm 15" layer that widens the
 * audience without dumbing down the technical or methodology versions.
 */
export function ExplainList({ items }: { items: Explainer[] }) {
  const [level, setLevel] = useState<Level>("simple");
  const active = LEVELS.find((l) => l.key === level)!;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wider text-slate-500">Reading level:</span>
        <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLevel(l.key)}
              aria-pressed={level === l.key}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                level === l.key ? "bg-accent text-ink-950" : "text-slate-300 hover:text-white"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">{active.hint}</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const g = GROUP[item.group];
          return (
            <div key={item.key} className="panel panel-pad">
              <div className={`eyebrow mb-1 ${g.cls}`}>{g.label}</div>
              <h3 className="text-base font-bold text-white">{item.term}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{item[level]}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
