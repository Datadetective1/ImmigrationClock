import Link from "next/link";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { SearchBar } from "@/components/SearchBar";
import { DashboardGrid } from "@/components/DashboardGrid";
import { PersonaRelevance } from "@/components/PersonaRelevance";
import { KeyDates } from "@/components/KeyDates";
import { KEY_DATES } from "@/lib/key-dates";
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
/**
 * Explore destinations. Was six description cards; now six links.
 *
 * The descriptions are not lost — each destination page carries its own
 * introduction, which is where a description belongs anyway.
 */
const EXPLORE = [
  { href: "/data", title: "Statistics" },
  { href: "/what-changed", title: "Latest changes" },
  { href: "/migration-map", title: "Countries" },
  { href: "/work-visas", title: "Visas" },
  { href: "/insights", title: "Insights" },
  { href: "/resources", title: "Resources" },
];

export default function HomePage() {
  const metrics = buildMetrics();
  const personas = personaSummaries();

  // The archive, surfaced. `significantEvents` already excludes routine
  // paperwork, so this is what actually CHANGED rather than what was merely
  // published.
  const recent = significantEvents(5);

  // The four headline numbers. Ordered deliberately rather than by whatever
  // buildMetrics() happens to return, so the row reads the same on every build.
  const FEATURED_KEYS = ["ice_arrests_fy", "removals_fy", "h1b_approvals_fy", "border_encounters_fy"];
  const featured = FEATURED_KEYS.map((k) => metrics.find((m) => m.key === k)).filter(
    (m): m is NonNullable<typeof m> => Boolean(m)
  );
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
        <div className="container-page py-10 sm:py-14">
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
              Rules, executive actions, agency guidance and court decisions — each linked to the
              government document it came from, and what that document says about who it affects.
            </p>

            {/* CTA HIERARCHY. Four buttons of equal weight is four buttons of
                no weight — the reader has to read all of them to choose. One
                primary action, three quieter alternates: same four
                destinations, but the eye now lands somewhere first.

                The primary is larger and carries the accent fill; the alternates
                drop to a lighter border and no fill, and sit on their own row so
                they read as "or" rather than as peers. */}
            <div className="mx-auto mt-8 flex max-w-2xl flex-col items-center gap-3">
              <Link
                href="/what-changed"
                className="rounded-lg bg-accent px-6 py-3 text-base font-semibold text-ink-950 shadow-card transition-colors hover:bg-accent-soft"
              >
                See what changed
              </Link>
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
                {[
                  { href: "/for-you", label: "Find changes affecting me" },
                  { href: "/following", label: "Follow a country or visa" },
                  { href: "/pulse#subscribe", label: "Get the weekly email" },
                ].map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    {c.label}
                  </Link>
                ))}
              </div>

              {/* THE PROFESSIONAL DOOR.
                  The three links above are written for someone navigating their
                  own immigration. A law firm's knowledge lead is a different
                  reader doing a different job, and until now the site gave them
                  no entry point at all — /monitor, /developers and /pricing
                  were reachable only by knowing they existed.
                  One quiet line rather than a second hero: this is a public
                  information site whose authority is the reason a professional
                  would trust it, and a sales banner would spend that. */}
              <p className="mt-4 text-sm text-slate-500">
                Following this professionally?{" "}
                <Link href="/monitor" className="link-accent font-medium">
                  Monitor what changed for your caseload
                </Link>{" "}
                — free, sourced, with the evidence attached.
              </p>
            </div>

            <div className="mx-auto mt-7 max-w-xl">
              <SearchBar />
            </div>

            {/* Freshness and coverage in ONE line rather than a paragraph of
                caveats. The full disclaimer still lives on /data and /methodology
                — a hero is the wrong place to spend a reader's attention on it,
                and burying the offer under hedging was costing more trust than
                it bought. */}
            {/* Freshness badge, kept from the statistics section header that this
                restructure removed. It belongs in the hero anyway: "when was this
                last updated" is a trust question, and trust questions are asked
                before a reader scrolls, not after. */}
            <div className="mt-6 flex justify-center">
              <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-slate-400">
                Last refreshed {formatDate(LAST_REFRESHED)}
              </span>
            </div>

            <p className="mx-auto mt-4 max-w-2xl text-xs leading-relaxed text-slate-500">
              {heroCoverage}{" "}
              <Link href="/methodology" className="link-accent">
                How we source and label every figure →
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* Vertical rhythm tightened from space-y-12/py-10 to space-y-8/py-8.
          The dashboard should read as a landing page, not a documentation
          portal — same components, same styling, less air between them. */}
      <div className="container-page space-y-7 py-8">
        {/* SECTION 2 — Latest changes. Leads the body: it is the product. */}
        <RecentChanges
          events={recent}
          heading="Latest immigration changes"
          intro="Newest first. Routine paperwork is left out here and stays searchable in the archive."
          linkLabel={`See all ${EVENTS.length.toLocaleString()} recorded changes`}
        />

        {/* SECTION 3 — Four headline numbers, not thirteen.
            The other nine are not deleted: /data now renders the complete grid
            with its view toggle. A visitor deciding whether to trust this site
            is served by four numbers they recognise; someone comparing fiscal
            years is served by the statistics page, one click away. */}
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="eyebrow mb-1">Latest available · auto-refreshed</div>
              <h2 className="section-title">Key immigration numbers</h2>
            </div>
            <Link href="/data" className="shrink-0 py-1.5 text-sm font-semibold text-accent hover:text-accent-soft">
              View all statistics →
            </Link>
          </div>
          <DashboardGrid metrics={featured} showModeToggle={false} />
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            Every number is labelled reported, projected, or estimated, and shows the latest period
            its source has published. This is{" "}
            <strong className="text-slate-400">not a real-time feed</strong>.{" "}
            <Link href="/data" className="link-accent">How freshness works →</Link>
          </p>
        </section>

        {/* SECTION 4 — Personal relevance, compressed to three bullets. */}
        <PersonaRelevance personas={personas} resourcesByPersona={resourcesByPersona} compact />

        {/* SECTION 5 — The next three deadlines only. */}
        {/* KeyDates renders its own "All dates →" link in the header, so the
            brief's "View all dates" requirement is already met without a second
            competing link below the list. */}
        <KeyDates dates={KEY_DATES} placement="home" limit={3} />

        {/* EXPLORE — was six large description cards taking most of a screen.
            Same six destinations, as a single wrapped row of links. Nothing is
            unreachable; it just no longer costs a screen to say so. */}
        <section>
          <h2 className="section-title mb-3">Explore</h2>
          <nav aria-label="Explore the site" className="flex flex-wrap gap-2">
            {EXPLORE.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-accent/40 hover:bg-accent/[0.06] hover:text-white"
              >
                {c.title}
              </Link>
            ))}
          </nav>
        </section>

        <ReportError />

        <PulseSignup placement="home" />
      </div>
    </div>
  );
}
