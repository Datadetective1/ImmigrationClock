"use client";

// =============================================================================
// SITUATION HUB — /for-you, one situation at a time
//
// Every panel is in the HTML (inactive ones are `hidden`), so each situation's
// changes, deadlines and links are crawlable and work before JavaScript. The
// chips switch panels and keep ?s= in the URL, so the homepage can link
// straight to one.
//
// The data arrives built (lib/situation-hub.ts). This component decides
// nothing about relevance: it renders what the records say and labels it.
// =============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFollows } from "@/hooks/useFollows";
import { formatDate } from "@/lib/format";
import { ProvenanceTag } from "./ProvenanceTag";
import type { HubSituation } from "@/lib/situation-hub";

function FollowChips({ follows }: { follows: HubSituation["follows"] }) {
  const { follows: followed, toggle, hydrated } = useFollows();
  return (
    <div className="flex flex-wrap gap-2">
      {follows.map((f) => {
        const on = hydrated && followed.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(f.id)}
            className={`min-h-[36px] rounded-full border px-3 text-sm font-medium transition-colors ${
              on
                ? "border-accent/60 bg-accent/15 text-white"
                : "border-white/15 text-slate-300 hover:border-accent/40 hover:text-white"
            }`}
          >
            <span aria-hidden>{on ? "✓ " : "+ "}</span>
            {on ? `Following ${f.label}` : `Follow ${f.label}`}
          </button>
        );
      })}
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-white/5 pt-4">
      <h3 className="mb-2 text-sm font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

function Panel({ s }: { s: HubSituation }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">{s.blurb}</p>

      <Block title={`Recent changes naming ${s.changeLabels}`}>
        {s.changes.length > 0 ? (
          <ul className="space-y-3">
            {s.changes.map((c) => (
              <li key={c.id}>
                <div className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className={c.notInForce ? "font-semibold text-status-amber" : "text-slate-400"}>
                    {c.status}
                  </span>
                  <span className="text-slate-600" aria-hidden>·</span>
                  <span className="text-slate-500">{formatDate(c.publishedAt)}</span>
                </div>
                <Link href={c.href} className="mt-0.5 block text-sm font-medium leading-snug text-white hover:text-accent">
                  {c.title}
                </Link>
                <a
                  href={c.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block py-1 text-xs text-accent underline-offset-2 hover:underline"
                >
                  {c.sourceName} ↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            No recorded change names {s.changeLabels} among those affected. That is a statement about this
            archive, not evidence that nothing changed.
          </p>
        )}
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          Listed because the document names {s.changeLabels} among those it affects
          {s.changeTotal > s.changes.length ? ` (${s.changeTotal} in all)` : ""}. Whether a change applies to
          your case depends on its text and your circumstances.{" "}
          <Link href={s.archiveHref} className="link-accent">
            Every change that mentions {s.archiveLabel} →
          </Link>
        </p>
      </Block>

      {s.dates.length > 0 ? (
        <Block title="Deadlines and dates">
          <ul className="space-y-1.5">
            {s.dates.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <Link href={`/key-dates#${d.id}`} className="font-medium text-slate-200 hover:text-accent">
                  {d.title}
                </Link>
                <span className="text-xs text-slate-500">{d.when}</span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {s.points.length > 0 ? (
        <Block title="What the data shows">
          <ul className="space-y-2">
            {s.points.map((pt, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-300">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
                <span>
                  {pt.text} <ProvenanceTag provenance={pt.provenance} className="ml-0.5 align-middle" />
                </span>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Block title="Explained and related data">
        <div className="flex flex-wrap gap-2">
          {s.explainers.map((e) => (
            <Link
              key={e.slug}
              href={`/explained/${e.slug}`}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-accent/40 hover:text-white"
            >
              {e.title}
            </Link>
          ))}
          {s.dataLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-accent hover:border-accent/40"
            >
              {l.label} →
            </Link>
          ))}
        </div>
      </Block>

      <Block title="Follow for updates">
        <FollowChips follows={s.follows} />
        <p className="mt-2 text-xs text-slate-500">
          Saved in this browser. New matching changes appear on{" "}
          <Link href="/following" className="link-accent">
            Following
          </Link>
          .
        </p>
      </Block>

      <Block title="Services">
        <Link href={s.resource.href} className="text-sm font-medium text-accent hover:text-accent-soft">
          {s.resource.label}: official help and independent services →
        </Link>
        <p className="mt-1 text-xs text-slate-500">
          On the Resources page, each listing says whether it is official, independent or an affiliate.
        </p>
      </Block>
    </div>
  );
}

export function SituationHub({ situations }: { situations: HubSituation[] }) {
  const [active, setActive] = useState(situations[0]?.key);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s && situations.some((x) => x.key === s)) setActive(s as HubSituation["key"]);
  }, [situations]);

  function choose(key: HubSituation["key"]) {
    setActive(key);
    const url = new URL(window.location.href);
    url.searchParams.set("s", key);
    window.history.replaceState(null, "", url.toString());
  }

  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="text-lg font-bold text-white">Start from your situation</h2>
      <div role="tablist" aria-label="Choose a situation" className="-mx-1 mt-3 flex flex-wrap gap-2 px-1">
        {situations.map((s) => (
          <button
            key={s.key}
            id={`tab-${s.key}`}
            role="tab"
            type="button"
            aria-selected={s.key === active}
            aria-controls={`panel-${s.key}`}
            onClick={() => choose(s.key)}
            className={`min-h-[36px] rounded-full border px-3.5 text-sm font-medium transition-colors ${
              s.key === active
                ? "border-accent/60 bg-accent/15 text-white"
                : "border-white/10 text-slate-300 hover:border-accent/40 hover:text-white"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {situations.map((s) => (
        <div
          key={s.key}
          id={`panel-${s.key}`}
          role="tabpanel"
          aria-labelledby={`tab-${s.key}`}
          hidden={s.key !== active}
          className="mt-4"
        >
          <Panel s={s} />
        </div>
      ))}
      <p className="mt-5 border-t border-white/5 pt-3 text-[11px] leading-relaxed text-slate-500">
        Data and records, <strong className="text-slate-400">not legal advice</strong>. For your own case,
        consult a qualified professional.
      </p>
    </section>
  );
}
