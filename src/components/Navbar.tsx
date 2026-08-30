"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { NAV, SITE, type NavItem } from "@/lib/site";

/**
 * Is `pathname` inside `base`? Boundary-aware, so /layoffs does not claim
 * /layoffs-vs-h1b by accident — a plain startsWith() would.
 */
function under(pathname: string, base: string): boolean {
  if (base === "/") return pathname === "/";
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Which nav item owns the current page.
 *
 * The old version tested `pathname.startsWith(item.href)` for the group hubs
 * only, which never once fired: no nav href is a prefix of any generated route,
 * so every employer, company, state, country and salary page — the large
 * majority of the site's URLs, and its main organic entry points — showed an
 * entirely unlit navbar. `item.match` (src/lib/site.ts) names each section's
 * real prefixes, and single links are now measured the same way as groups.
 */
export function isActive(pathname: string, item: NavItem): boolean {
  if (item.href && under(pathname, item.href)) return true;
  if (item.match?.some((m) => under(pathname, m))) return true;
  return Boolean(item.children?.some((c) => under(pathname, c.href)));
}

/** Desktop dropdown for a nav group. Opens on hover or keyboard focus. */
function NavGroup({ item, pathname }: { item: NavItem; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const active = isActive(pathname, item);

  // Set while Escape is handing focus back, so the trigger's own onFocus does
  // not immediately reopen the panel Escape just closed.
  const returningFocus = useRef(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const el = ref.current;
      setOpen(false);
      // Hand focus back to the control that opened the panel rather than
      // leaving it stranded in a menu that has just disappeared — but only when
      // focus was actually inside this group. Escape while merely hovering must
      // not yank focus out of whatever the reader was using.
      if (el && el.contains(document.activeElement)) {
        returningFocus.current = true;
        el.querySelector("a")?.focus();
        returningFocus.current = false;
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close on navigation. Nothing used to: the only paths to closed were
  // mouseleave and Escape, and clicking an item in the panel moves neither the
  // cursor nor the keyboard — so the 288px panel stayed open over the top-left
  // of the page it had just navigated to, exactly where the breadcrumb and h1
  // are. The App Router keeps the layout mounted across navigations, so this
  // state survives the route change unless it is reset.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      // Focusout bubbles, so this fires for the trigger and every link in the
      // panel; relatedTarget is where focus is going, and the containment check
      // keeps the panel open while tabbing through its own children. Without
      // it, onFocus opened each panel and nothing ever closed one, so tabbing
      // along the navbar stacked all three over the page.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Link
        href={item.href ?? "#"}
        // A disclosure, not a menu. role="menu"/"menuitem" took the link
        // semantics off these items — they vanished from screen-reader link
        // lists and were announced as menu items, promising arrow-key
        // navigation that no handler here implements.
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onFocus={() => {
          if (!returningFocus.current) setOpen(true);
        }}
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
        <div id={panelId} className="absolute left-0 top-full z-50 w-72 pt-2">
          <div className="overflow-hidden rounded-xl border border-white/10 bg-ink-850/95 p-1.5 shadow-glow backdrop-blur-md">
            {item.children!.map((c) => {
              const childActive = pathname === c.href;
              return (
                <Link
                  key={c.href}
                  href={c.href}
                  aria-current={childActive ? "page" : undefined}
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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mobileNavId = useId();

  // Every link in the mobile menu closes it on click, but the browser's back
  // and forward buttons do not — and the layout is not remounted between
  // routes, so the panel outlived the navigation it triggered.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // "/" and Cmd/Ctrl-K jump to search.
  //
  // This is a reference site: the common session is several lookups in a row
  // (compare two employers, check three states), and search was a mouse trip to
  // the magnifier from all but three routes. The conventional shortcuts cost
  // nothing and are what a reader who does this often will already try.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
      const cmdK = e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey);
      if (!slash && !cmdK) return;
      // Never steal a keystroke the reader is typing into something.
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      router.push("/search");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

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

        {/* Named landmarks: a page renders up to four <nav> elements (this one
            or the mobile menu, the breadcrumb, and the footer's legal row), and
            unnamed they all announce as plain "navigation". */}
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            if (item.children) return <NavGroup key={item.label} item={item} pathname={pathname} />;
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href!}
                aria-current={pathname === item.href ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link
            href="/search"
            aria-label="Search immigration data"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg border border-white/10 p-2 text-slate-300 transition-colors hover:border-accent/40 hover:text-accent-soft"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            {/* A shortcut nobody knows about is not a shortcut. Desktop only —
                it needs a physical key to be worth the space. */}
            <kbd
              aria-hidden
              className="hidden rounded border border-white/10 px-1.5 py-0.5 font-sans text-[10px] leading-none text-slate-500 lg:inline"
            >
              /
            </kbd>
          </Link>

          <button
            type="button"
            className="rounded-lg border border-white/10 p-2 text-slate-300 lg:hidden"
            aria-label="Toggle navigation"
            aria-expanded={open}
            aria-controls={mobileNavId}
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M6 18L18 6" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        // 22 rows of navigation do not fit on a phone, so this is always a
        // scroller. `overscroll-contain` stops a flick at either end from
        // chaining into the page behind it, and the tall bottom padding lets the
        // last items (Insights, Pulse) clear the fixed consent banner, which on
        // a first visit covers them. The 70vh cap has to stay: the panel is
        // inside the sticky header, and an uncapped one would make the header
        // taller than the viewport.
        <nav
          id={mobileNavId}
          aria-label="Main"
          className="container-page max-h-[70vh] overflow-y-auto overscroll-contain pb-28 lg:hidden"
        >
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
