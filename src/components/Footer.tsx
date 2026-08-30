import Link from "next/link";
import { SITE, FOOTER_SECTIONS } from "@/lib/site";
import { CookieSettingsButton } from "./ConsentBanner";

const LEGAL_LINKS = [
  { href: "/about", label: "About" },
  { href: "/methodology", label: "Methodology" },
  { href: "/sources", label: "Sources" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/disclosure", label: "Disclosure" },
];

// Optional "tip jar" — set NEXT_PUBLIC_SUPPORT_URL to a Buy Me a Coffee, Ko-fi, or
// GitHub Sponsors link to show a support button. Hidden until configured.
const SUPPORT_URL = process.env.NEXT_PUBLIC_SUPPORT_URL;

export function Footer() {
  return (
    <footer className="mt-16 border-t border-white/5 bg-ink-950">
      <div className="container-page py-12">
        <div className="grid gap-10 md:grid-cols-4">
          <div>
            <div className="font-mono text-sm font-bold text-white">
              Immigration<span className="text-accent">Clock</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-400">{SITE.positioning}</p>
            <p className="mt-4 text-xs text-slate-500">{SITE.tagline}</p>
          </div>

          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              {/* h2, not h3: the footer sits on every page, and on pages whose body
                  has no h2 these group titles followed the h1 directly — a skipped
                  level for anyone navigating by heading. */}
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {section.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {section.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-slate-400 transition-colors hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <p className="text-xs leading-relaxed text-slate-500">{SITE.footerDisclaimer}</p>
        </div>

        <nav
          aria-label="Legal and policy"
          className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400"
        >
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="transition-colors hover:text-white">
              {l.label}
            </Link>
          ))}
          <CookieSettingsButton className="transition-colors hover:text-white" />
          {SUPPORT_URL ? (
            <a
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-accent transition-colors hover:text-accent-soft"
            >
              ♥ Support this project
            </a>
          ) : null}
        </nav>

        <div className="mt-6 flex flex-col items-start justify-between gap-2 text-xs text-slate-600 sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} {SITE.name}. Public data, presented neutrally.</p>
          <p>
            Built with public datasets ·{" "}
            <Link href="/sources" className="link-accent">
              View all sources
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
