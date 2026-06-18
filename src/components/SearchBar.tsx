"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { search, type SearchResult } from "@/lib/data";
import { SITE } from "@/lib/site";

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  company: "Employer",
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
          className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
        />
        {q ? (
          <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">
            ↵
          </kbd>
        ) : null}
      </div>

      {open && q ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/10 bg-ink-850 shadow-glow">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">
              No matches. Try an employer, state, country, visa type, or job title.
            </p>
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
