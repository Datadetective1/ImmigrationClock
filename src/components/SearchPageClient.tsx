"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { search, searchTotals, type SearchResult } from "@/lib/data";
import { formatDate, formatNumber } from "@/lib/format";
import { trackSearch } from "@/lib/analytics";
import { searchGuides } from "@/lib/site-search";
import { EVENT_INDEX, filterEvents } from "@/lib/event-index";
import { CLASSIFICATION_LABEL } from "@/lib/event-labels";
import { changePath } from "@/lib/share";

type GroupType = SearchResult["type"] | "change" | "date" | "explainer";

const TYPE_LABEL: Record<GroupType, string> = {
  company: "Employer profiles",
  employer: "H-1B sponsors",
  state: "States",
  country: "Countries",
  visa: "Visa types",
  occupation: "Job titles",
  change: "Recorded changes",
  date: "Deadlines",
  explainer: "Explainers",
};
/** Places and visas, then what changed and when, then organisations. */
const TYPE_ORDER: GroupType[] = [
  "state",
  "country",
  "visa",
  "change",
  "date",
  "explainer",
  "company",
  "employer",
  "occupation",
];
/** Recorded changes listed here; the rest are one click away on /what-changed. */
const CHANGES_SHOWN = 6;

/** Per type, on the full results page. The dropdown shows far fewer. */
const PER_TYPE = 24;
/** Wait for a pause in typing before recording a query. */
const TRACK_DELAY_MS = 800;

/** Full "look anything up" results page — type, country, visa, employer, state. */
export function SearchPageClient() {
  const router = useRouter();
  const [q, setQ] = useState("");

  // Deep link: /search?q=amazon
  //
  // Read from location on mount rather than with useSearchParams, following
  // EventExplorer. useSearchParams forces a Suspense boundary around this whole
  // component, which meant the prerendered /search document contained no input
  // at all — just "Loading search…" until the JS arrived. The navbar's magnifier
  // is the only search affordance on most of the site, so that hydration wait
  // sat in front of every site-wide lookup. The box now ships in the HTML and
  // ?q= applies a moment later, which is the same moment it applied before.
  useEffect(() => {
    const term = new URLSearchParams(window.location.search).get("q");
    if (term) setQ(term.slice(0, 100));
  }, []);

  const trimmed = q.trim();
  const results = trimmed ? search(q, { perType: PER_TYPE, limit: 200 }) : [];
  const totals: Partial<Record<GroupType, number>> = trimmed ? { ...searchTotals(q) } : {};
  const changes = trimmed.length >= 2 ? filterEvents(EVENT_INDEX, { q: trimmed }) : [];
  totals.change = changes.length;
  const guides = trimmed ? searchGuides(trimmed, 20) : [];
  for (const g of guides) totals[g.type] = (totals[g.type] ?? 0) + 1;
  const rows: { type: GroupType; label: string; sublabel: string; href: string }[] = [
    ...results,
    ...guides,
    ...changes.slice(0, CHANGES_SHOWN).map((e) => ({
      type: "change" as const,
      label: e.title,
      sublabel: `${CLASSIFICATION_LABEL[e.classification]} · ${formatDate(e.publishedAt)}`,
      href: changePath(e),
    })),
  ];
  const grouped = TYPE_ORDER.map((type) => ({
    type,
    items: rows.filter((r) => r.type === type),
    total: totals[type] ?? 0,
  })).filter((g) => g.items.length > 0);

  // Record the query once typing settles. A search that returns nothing is the
  // most useful thing this page can report — it is a question the site could not
  // answer — and it was being dropped: trackSearch was imported here and never
  // called.
  const tracked = useRef("");
  useEffect(() => {
    if (!trimmed || trimmed === tracked.current) return;
    const t = setTimeout(() => {
      tracked.current = trimmed;
      trackSearch(trimmed, rows.length);
    }, TRACK_DELAY_MS);
    return () => clearTimeout(t);
  }, [trimmed, rows.length]);

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
          placeholder="Search a visa, country, employer, deadline or topic…"
          aria-label="Search"
          className="w-full bg-transparent text-base text-white placeholder:text-slate-500 focus:outline-none"
        />
      </div>

      {!trimmed ? (
        <p className="text-sm text-slate-400">
          Type to look up a visa, country, state, employer or job title, a deadline, an explainer, or the
          recorded changes that mention it. Every result links its source.
        </p>
      ) : grouped.length === 0 ? (
        // A dead end should still offer a way forward. This page used to end on
        // a repeat of the categories the reader had just failed to match; the
        // dropdown already got this right, and the archive genuinely answers the
        // policy words that land here ("tps", "parole", "public charge").
        <div>
          <p className="text-sm text-slate-300">Nothing matches &ldquo;{trimmed}&rdquo;.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            Nothing in the data pages, deadlines, explainers or the searchable window of the change archive
            matches. That is not evidence that nothing changed: try a shorter or different term.
          </p>
          <Link
            href={`/what-changed?q=${encodeURIComponent(trimmed)}`}
            className="mt-3 inline-block text-sm font-semibold text-accent hover:underline"
          >
            Search the change archive for &ldquo;{trimmed}&rdquo; &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map((g) => (
            <section key={g.type}>
              <h2 className="eyebrow mb-2 text-slate-500">
                {TYPE_LABEL[g.type]} ·{" "}
                {/* The count is the number of matches, not the number shown. It
                    used to print the truncated length, so 297 sponsors matching
                    "ca" was reported as 8. */}
                {g.total > g.items.length
                  ? `${formatNumber(g.items.length)} of ${formatNumber(g.total)}`
                  : formatNumber(g.total)}
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
              {g.type === "change" && g.total > g.items.length ? (
                <Link
                  href={`/what-changed?q=${encodeURIComponent(trimmed)}`}
                  className="mt-2 inline-block text-xs font-semibold text-accent hover:underline"
                >
                  All {formatNumber(g.total)} changes mentioning &ldquo;{trimmed}&rdquo; &rarr;
                </Link>
              ) : null}
              {g.type === "employer" && g.total > g.items.length ? (
                <Link
                  href={`/h1b/employers?q=${encodeURIComponent(trimmed)}`}
                  className="mt-2 inline-block text-xs font-semibold text-accent hover:underline"
                >
                  All {formatNumber(g.total)} sponsors matching &ldquo;{trimmed}&rdquo; &rarr;
                </Link>
              ) : null}
            </section>
          ))}
          <p className="border-t border-white/5 pt-4 text-xs text-slate-500">
            Looking for a rule, fee or deadline rather than an organisation?{" "}
            <Link href={`/what-changed?q=${encodeURIComponent(trimmed)}`} className="link-accent">
              Search the change archive
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
