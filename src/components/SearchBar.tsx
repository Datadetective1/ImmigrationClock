"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { search, type SearchResult } from "@/lib/data";
import { trackSearch } from "@/lib/analytics";
import { SITE } from "@/lib/site";

/** Wait for a pause in typing before recording a query. */
const TRACK_DELAY_MS = 800;

/**
 * What the search box can actually answer, shown as examples.
 *
 * The placeholder already lists the CATEGORIES ("employer, state, visa type,
 * job title, or country") but a category is an abstraction — "H-1B" and
 * "Amazon" are the things a reader recognises. Two of each kind, because the
 * point is to convey the RANGE in one glance rather than to be a menu.
 *
 * Clicking one types it. There is no new query path and no request: the same
 * client-side search() runs either way.
 */
const SEARCH_EXAMPLES = ["H-1B", "F-1", "India", "Canada", "Amazon", "Google", "California", "Texas"];

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  company: "Profile",
  employer: "Sponsor",
  state: "State",
  country: "Country",
  visa: "Visa",
  occupation: "Job title",
};

export function SearchBar({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => (q ? search(q) : []), [q]);

  // This box is the site's busiest search surface — it is on the homepage, the
  // 404 page and /work-visas — and it recorded nothing. Only /search and
  // /what-changed were instrumented, so the zero-result queries that tell us
  // what coverage is missing were being collected from everywhere except the
  // place most people type. Debounced, and deduped against the last recorded
  // query, so a settled question is logged once rather than once per keystroke.
  const tracked = useRef("");
  useEffect(() => {
    const term = q.trim();
    if (!term || term === tracked.current) return;
    const t = setTimeout(() => {
      tracked.current = term;
      trackSearch(term, results.length);
    }, TRACK_DELAY_MS);
    return () => clearTimeout(t);
  }, [q, results.length]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      router.push(results[active].href);
      setOpen(false);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-850/80 px-3 py-2.5 shadow-card focus-within:border-accent/50">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-500">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={SITE.searchPlaceholder}
          aria-label="Search"
          // 16px, not 14px: iOS Safari zooms the viewport on focus for any input
          // below 16px, which on the site-wide search box means the page jumps
          // and the reader has to pinch back out. text-base everywhere an input
          // takes typed text.
          className="w-full bg-transparent text-base text-white placeholder:text-slate-500 focus:outline-none"
        />
        {q ? (
          <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">
            ↵
          </kbd>
        ) : null}
      </div>

      {/* Examples appear only when the box is focused AND empty, so they never
          compete with real results. */}
      {open && !q ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-850 p-3 shadow-glow">
          <p className="px-1 text-xs text-slate-500">Try searching for</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SEARCH_EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                // onMouseDown, not onClick: the input's blur would close this
                // panel before a click ever landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  setQ(ex);
                  setActive(0);
                }}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent/50 hover:bg-accent/10 hover:text-white"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {open && q ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-glow">
          {results.length === 0 ? (
            // A dead end should still offer a way forward. The old copy repeated
            // the categories the reader had just failed to match; this says what
            // was searched, that the miss is about OUR data rather than their
            // spelling, and gives one working next step.
            <div className="px-4 py-3">
              <p className="text-sm text-slate-300">
                Nothing matches &ldquo;{q}&rdquo;.
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                This box searches employers, states, countries, visa types and job titles. Policy
                changes live in the archive.
              </p>
              <Link
                href={`/what-changed?q=${encodeURIComponent(q)}`}
                className="mt-2 inline-block py-1 text-xs font-semibold text-accent hover:underline"
                onClick={() => setOpen(false)}
              >
                Search the change archive for &ldquo;{q}&rdquo; →
              </Link>
            </div>
          ) : (
            <ul className="max-h-80 overflow-auto scroll-thin py-1">
              {results.map((r, i) => (
                <li key={`${r.type}-${r.href}`}>
                  <Link
                    href={r.href}
                    onClick={() => setOpen(false)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                      i === active ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-white">{r.label}</span>
                      <span className="block truncate text-xs text-slate-500">{r.sublabel}</span>
                    </span>
                    <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
                      {TYPE_LABEL[r.type]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/search?q=${encodeURIComponent(q)}`}
            onClick={() => setOpen(false)}
            className="block border-t border-white/10 px-4 py-2.5 text-xs font-semibold text-accent transition-colors hover:bg-white/5 hover:text-accent-soft"
          >
            See all results for &ldquo;{q}&rdquo; &rarr;
          </Link>
        </div>
      ) : null}
    </div>
  );
}
