import Link from "next/link";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { SearchBar } from "@/components/SearchBar";
import { DashboardGrid } from "@/components/DashboardGrid";
import { HookSection } from "@/components/HookSection";
import { PersonaRelevance } from "@/components/PersonaRelevance";
import { KeyDates } from "@/components/KeyDates";
import { KEY_DATES } from "@/lib/key-dates";
import { MigrationMap } from "@/components/MigrationMap";
import { PulseSignup } from "@/components/PulseSignup";
import { buildMetrics, LAST_REFRESHED } from "@/lib/data";
import { personaSummaries } from "@/lib/relevance";
import { partnersForPersona, type PersonaKey, type ResolvedPartner } from "@/lib/partners";
import { formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: SITE.title,
  description: SITE.subtitle,
  path: "/",
});

// "Explore the data" — the homepage routes into the full sections instead of
// rendering every chart inline. Each destination is its own focused page.
const EXPLORE = [
  {
    href: "/enforcement",
    title: "Enforcement & Border",
    desc: "ICE arrests, removals, and detention, plus CBP border encounters.",
  },
  {
    href: "/work-visas",
    title: "Work & Visas",
    desc: "H-1B sponsors, salaries, F-1 students, and the immigrant workforce.",
  },
  {
    href: "/layoffs-vs-h1b",
    title: "Jobs & Wages",
    desc: "Layoffs and visa sponsorship shown side by side, with offered wages.",
  },
  {
    href: "/insights",
    title: "Insights",
    desc: "Plain-language takeaways drawn automatically from the data.",
  },
  {
    href: "/pulse",
    title: "Weekly Pulse",
    desc: "The biggest U.S. immigration changes, summarized every week.",
  },
  {
    href: "/resources",
    title: "Resources",
    desc: "Services newcomers use: legal help, taxes, money transfer, and more.",
  },
];

export default function HomePage() {
  const metrics = buildMetrics();
  const personas = personaSummaries();
  const resourcesByPersona = personas.reduce<Record<string, ResolvedPartner[]>>((acc, p) => {
    acc[p.key] = partnersForPersona(p.key as PersonaKey, 3);
    return acc;
  }, {});

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="container-page py-12 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <span className="pulse-live" />
              {SITE.tagline}
            </div>
            <h1 className="text-balance text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
              The Immigration{" "}
              <span className="bg-gradient-to-r from-accent via-accent-soft to-status-red bg-clip-text text-transparent">
                Clock
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-slate-300 sm:text-lg">
              {SITE.subtitle}
            </p>
            <div className="mx-auto mt-7 max-w-xl">
              <SearchBar />
            </div>
            <p className="mx-auto mt-4 max-w-2xl text-xs leading-relaxed text-slate-500">
              {SITE.heroDisclaimer}
            </p>
          </div>
        </div>
      </section>

      <div className="container-page space-y-12 py-10">
        {/* Origin map — the showpiece: first thing visitors see, routes into country pages */}
        <section>
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Origins · interactive</div>
              <h2 className="section-title">Where America&rsquo;s immigrants come from</h2>
            </div>
            <Link href="/migration-map" className="text-sm font-semibold text-accent hover:text-accent-soft">
              Open the full map →
            </Link>
          </div>
          <MigrationMap />
        </section>

        {/* Counter grid — the "Clock" identity */}
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Latest available · auto-refreshed</div>
              <h2 className="section-title">The latest available numbers</h2>
            </div>
            <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-400">
              Last refreshed {formatDate(LAST_REFRESHED)}
            </span>
          </div>
          <p className="mb-5 text-sm text-slate-400">
            Each counter shows its source&rsquo;s freshest reporting period, labelled reported, projected, or
            estimated. This is <strong className="text-slate-300">not a real-time feed</strong>.{" "}
            <Link href="/data" className="link-accent">How freshness works →</Link>
          </p>
          <DashboardGrid metrics={metrics} />
        </section>

        {/* What does this mean for you? — persona relevance + contextual resources */}
        <PersonaRelevance personas={personas} resourcesByPersona={resourcesByPersona} />

        {/* Key dates — the honest urgency layer, routing to tax/legal partners */}
        <KeyDates dates={KEY_DATES} placement="home" limit={4} />

        {/* Explore the data — route into the full sections instead of inlining them */}
        <section>
          <div className="mb-5">
            <div className="eyebrow mb-1">Explore</div>
            <h2 className="section-title">Go deeper into the data</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {EXPLORE.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group flex h-full flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-accent/40 hover:bg-accent/[0.04]"
              >
                <h3 className="text-base font-semibold text-white">{c.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-slate-400">{c.desc}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-accent transition-colors group-hover:text-accent-soft">
                  Open
                  <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Closing brand statement */}
        <HookSection title="Numbers People Argue About. Sources Everyone Can Check.">
          Immigration is one of America&rsquo;s most emotional debates. This site does not tell you what to
          think. It shows the public numbers behind enforcement, visas, jobs, wages, and workforce change
          &mdash; with a source and date on every figure.
        </HookSection>

        <PulseSignup />
      </div>
    </div>
  );
}
