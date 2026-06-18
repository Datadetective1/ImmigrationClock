"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { search, type SearchResult } from "@/lib/data";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  company: "Employers",
  state: "States",
  country: "Countries",
  visa: "Visa types",
  occupation: "Job titles",
};
const TYPE_ORDER: SearchResult["type"][] = ["company", "state", "country", "visa", "occupation"];

/** Full "look anything up" results page — type, country, visa, employer, state. */
export function SearchPageClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  const results = q.trim() ? search(q) : [];
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: results.filter((r) => r.type === type),
  })).filter((g) => g.items.length > 0);

  function update(v: string) {
    setQ(v);
    const params = v.trim() ? `?q=${encodeURIComponent(v.trim())}` : "";
    router.replace(`/search${params}`, { scroll: false });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-850/80 px-3 py-3 shadow-card focus-within:border-accent/50">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => update(e.target.value)}
          placeholder="Search an employer, state, country, visa type, or job title…"
          aria-label="Search"
          className="w-full bg-transparent text-base text-white placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {!q.trim() ? (
        <p className="text-sm text-slate-400">
          Type to look up any tracked employer, state, country, visa type, or occupation — every result is a
          sourced, labelled data page.
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-slate-400">
          No matches for &ldquo;{q}&rdquo;. Try an employer (e.g. Amazon), a state (Texas), a country (India), a
          visa type (H-1B), or a job title.
        </p>
      ) : (
        <div className="space-y-7">
          {grouped.map((g) => (
            <section key={g.type}>
              <h2 className="eyebrow mb-2 text-slate-500">
                {TYPE_LABEL[g.type]} · {g.items.length}
              </h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {g.items.map((r) => (
                  <li key={r.href}>
                    <Link
                      href={r.href}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:border-accent/30 hover:bg-white/[0.04]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">{r.label}</span>
                        <span className="block truncate text-xs text-slate-500">{r.sublabel}</span>
                      </span>
                      <span aria-hidden className="shrink-0 text-accent">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
