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
import { RecentChanges } from "@/components/RecentChanges";
import { EVENTS, EVENT_STORE_META, significantEvents, contributingAdapters } from "@/lib/event-store";
import { ReportError } from "@/components/ReportError";

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

  // The archive, surfaced. `significantEvents` already excludes routine
  // paperwork, so this is what actually CHANGED rather than what was merely
  // published.
  const recent = significantEvents(6);
  const contributing = contributingAdapters().length;
  const heroCoverage =
    `${EVENTS.length.toLocaleString()} government changes recorded from ${contributing} official sources` +
    `${EVENT_STORE_META.earliestEvent ? `, back to ${formatDate(EVENT_STORE_META.earliestEvent)}` : ""}. ` +
    "Every figure is labelled reported, projected, or estimated, and this is not a real-time feed.";
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
            {/* The headline says what the product DOES. "The Immigration Clock"
                is the name, not an explanation — a first-time visitor met with
                a brand word, a hedged paragraph and an H-1B origin map could not
                tell what this site was for. The name still leads the wordmark in
                the navbar; the homepage has one job, which is to be understood. */}
            <h1 className="text-balance text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
              Track every U.S. immigration change,{" "}
              <span className="bg-gradient-to-r from-accent via-accent-soft to-status-red bg-clip-text text-transparent">
                back to the official source
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-slate-300 sm:text-lg">
              Rules, executive actions, agency guidance and court decisions — each one linked to the
              government document it came from, with what that document says about who is affected.
              Plus the public data on enforcement, visas, and the immigrant workforce.
            </p>

            {/* The four things a reader can actually do, in the order the three
                audiences ask for them: what happened, does it affect me, keep me
                posted, and tell me by email. */}
            <div className="mx-auto mt-7 flex max-w-2xl flex-wrap items-center justify-center gap-2.5">
              <Link
                href="/what-changed"
                className="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft"
              >
                See what changed
              </Link>
              <Link
                href="/for-you"
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-accent/50 hover:bg-accent/10"
              >
                Find changes affecting me
              </Link>
              <Link
                href="/what-changed#follow"
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-accent/50 hover:bg-accent/10"
              >
                Follow a country or visa
              </Link>
              <Link
                href="/pulse#subscribe"
                className="rounded-lg border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-accent/50 hover:bg-accent/10"
              >
                Get the weekly email
              </Link>
            </div>

            <div className="mx-auto mt-7 max-w-xl">
              <SearchBar />
            </div>

            {/* Freshness and coverage in ONE line rather than a paragraph of
                caveats. The full disclaimer still lives on /data and /methodology
                — a hero is the wrong place to spend a reader's attention on it,
                and burying the offer under hedging was costing more trust than
                it bought. */}
            <p className="mx-auto mt-5 max-w-2xl text-xs leading-relaxed text-slate-500">
              {heroCoverage}{" "}
              <Link href="/methodology" className="link-accent">
                How we source and label every figure →
              </Link>
            </p>
          </div>
        </div>
      </section>

      <div className="container-page space-y-12 py-10">
        {/* WHAT CHANGED leads the page. It used to be absent from the homepage
            entirely while the origin map opened it — a showpiece ahead of the
            product. An attorney checking for current policy movement, and an
            immigrant asking whether something affects them, are both served by
            this block and neither was served by the map. */}
        <RecentChanges
          events={recent}
          heading="What changed recently"
          intro="The most significant changes we have recorded, newest first. Routine paperwork notices are kept out of this list and remain searchable in the full archive."
          linkLabel={`See all ${EVENTS.length.toLocaleString()} recorded changes`}
        />

        {/* Origin map — a showpiece, now placed after the product's actual answer. */}
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

        <ReportError />

        <PulseSignup />
      </div>
    </div>
  );
}
