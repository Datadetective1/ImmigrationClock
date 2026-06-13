"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_LINKS, SITE } from "@/lib/site";

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/80 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-status-red text-ink-950">
            <span className="absolute h-2 w-2 rounded-full bg-ink-950" />
            <span className="absolute h-3.5 w-[2px] -translate-y-1 rotate-45 bg-ink-950" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-mono text-sm font-bold tracking-tight text-white">
              Immigration<span className="text-accent">Clock</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Facts first
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <button
          type="button"
          className="rounded-lg border border-white/10 p-2 text-slate-300 lg:hidden"
          aria-label="Toggle navigation"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {open ? (
        <nav className="container-page grid gap-1 pb-4 lg:hidden">
          {NAV_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${
                pathname === l.href
                  ? "bg-white/10 text-white"
                  : "text-slate-300 hover:bg-white/5"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
