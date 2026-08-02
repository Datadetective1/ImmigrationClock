"use client";

import { useState } from "react";
import Link from "next/link";
import { ProvenanceTag } from "./ProvenanceTag";
import type { PersonaSummary } from "@/lib/relevance";
import type { ResolvedPartner } from "@/lib/partners";

/**
 * "What does this mean for me?" — the visitor picks their situation and gets a
 * tailored, data-driven summary. Data context, not advice (disclaimer below).
 *
 * `resourcesByPersona` (optional) maps each persona key to the partner services
 * most relevant to that situation, rendered right where intent is highest.
 */
export function PersonaRelevance({
  personas,
  resourcesByPersona,
}: {
  personas: PersonaSummary[];
  resourcesByPersona?: Record<string, ResolvedPartner[]>;
}) {
  const [active, setActive] = useState(personas[0]?.key);
  const current = personas.find((p) => p.key === active) ?? personas[0];
  if (!current) return null;

  const resources = resourcesByPersona?.[current.key] ?? [];

  return (
    <div className="space-y-6">
    <section className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-accent/60 to-transparent" />
      <div className="eyebrow mb-1 text-accent">Personal relevance</div>
      <h2 className="text-lg font-bold text-white sm:text-xl">What does this mean for you?</h2>
      <p className="mt-1 text-sm text-slate-400">Pick your situation:</p>

      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Choose your situation">
        {personas.map((p) => (
          <button
            key={p.key}
            role="tab"
            aria-selected={p.key === active}
            type="button"
            onClick={() => setActive(p.key)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              p.key === active
                ? "border-accent/40 bg-accent/15 text-white"
                : "border-white/10 bg-white/5 text-slate-300 hover:border-accent/30 hover:text-white"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <h3 className="text-base font-semibold text-white">{current.question}</h3>
        <ul className="mt-3 space-y-2.5">
          {current.points.map((pt, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-300">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
              <span>
                {pt.text} <ProvenanceTag provenance={pt.provenance} className="ml-0.5 align-middle" />
              </span>
            </li>
          ))}
        </ul>

        {current.links.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {current.links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:border-accent/40 hover:text-accent-soft"
              >
                {l.label} →
              </Link>
            ))}
          </div>
        ) : null}
      </div>

      <p className="mt-4 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-slate-500">
        Data context, <strong className="text-slate-400">not legal advice</strong> — for your own case, consult
        a qualified professional.
      </p>
    </section>

    </div>
  );
}
