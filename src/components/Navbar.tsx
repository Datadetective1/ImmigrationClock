"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV, SITE, type NavItem } from "@/lib/site";

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href && (pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href)))) return true;
  return Boolean(item.children?.some((c) => pathname === c.href || (c.href !== "/" && pathname.startsWith(c.href))));
}

/** Desktop dropdown for a nav group. Opens on hover or keyboard focus. */
function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = isActive(pathname, item);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href={item.href ?? "#"}
        aria-haspopup="menu"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
        }`}
      >
        {item.label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </Link>

      {open ? (
        <div role="menu" className="absolute left-0 top-full z-50 w-72 pt-2">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-850/95 p-1.5 shadow-glow backdrop-blur-md">
            {item.children!.map((c) => {
              const childActive = pathname === c.href;
              return (
                <Link
                  key={c.href}
                  href={c.href}
                  role="menuitem"
                  className={`block rounded-lg px-3 py-2 transition-colors ${
                    childActive ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <span className="block text-sm font-medium text-white">{c.label}</span>
                  {c.desc ? <span className="mt-0.5 block text-xs text-slate-400">{c.desc}</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
          {NAV.map((item) =>
            item.children ? (
              <NavGroup key={item.label} item={item} pathname={pathname} />
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === item.href
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link
            href="/search"
            aria-label="Search immigration data"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-white/10 p-2 text-slate-300 transition-colors hover:border-accent/40 hover:text-accent-soft"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </Link>

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
      </div>

      {open ? (
        <nav className="container-page max-h-[70vh] gap-1 overflow-y-auto pb-4 lg:hidden">
          {NAV.map((item) =>
            item.children ? (
              <div key={item.label} className="mt-2 first:mt-0">
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {item.label}
                </div>
                {item.children.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={() => setOpen(false)}
                    className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                      pathname === c.href ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                    }`}
                  >
                    {c.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                onClick={() => setOpen(false)}
                className={`mt-1 block rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname === item.href ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>
      ) : null}
    </header>
  );
}
