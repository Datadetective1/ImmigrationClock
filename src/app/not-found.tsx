import Link from "next/link";
import { SearchBar } from "@/components/SearchBar";

/** Where most readers were heading. A wrong address should still lead somewhere. */
const POPULAR = [
  { href: "/what-changed", label: "What changed", desc: "Every recorded rule and policy change" },
  { href: "/key-dates", label: "Key dates", desc: "Deadlines and windows, counted down" },
  { href: "/for-you", label: "For you", desc: "Start from your situation" },
  { href: "/h1b/top-sponsors", label: "Top H-1B sponsors", desc: "Employers, approvals and wages" },
  { href: "/resources", label: "Resources", desc: "Legal help, documents and services" },
  { href: "/following", label: "Follow a topic", desc: "Free, no account needed" },
];

export default function NotFound() {
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <div className="font-mono text-6xl font-bold text-white">404</div>
      <h1 className="mt-3 text-2xl font-bold text-white">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">
        That page doesn&rsquo;t exist, or it has moved. Search for an employer, state, country, visa type or
        job title, or pick a place to start.
      </p>
      <div className="mt-6 w-full max-w-md">
        <SearchBar />
      </div>
      <nav aria-label="Popular pages" className="mt-8 w-full max-w-2xl">
        <ul className="grid gap-2 text-left sm:grid-cols-2">
          {POPULAR.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                className="block rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 transition-colors hover:border-accent/30 hover:bg-white/[0.04]"
              >
                <span className="block text-sm font-semibold text-white">{p.label}</span>
                <span className="block text-xs text-slate-400">{p.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Link href="/" className="mt-6 text-sm font-semibold text-accent hover:text-accent-soft">
        ← Back to the home page
      </Link>
    </div>
  );
}
