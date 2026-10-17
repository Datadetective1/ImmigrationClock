import Link from "next/link";
import { SITE } from "@/lib/site";
import { buildMetadata } from "@/lib/seo";
import { SearchBar } from "@/components/SearchBar";
import { DashboardGrid } from "@/components/DashboardGrid";
import { KeyDates } from "@/components/KeyDates";
import { KEY_DATES } from "@/lib/key-dates";
import { PulseSignup } from "@/components/PulseSignup";
import { buildMetrics, LAST_REFRESHED } from "@/lib/data";
import { SITUATIONS } from "@/lib/situations";
import { formatDate } from "@/lib/format";
import pipelineHealth from "@/lib/generated/pipeline-health.json";
import { lastCheckedSentence } from "@/lib/pipeline-health";
import { RecentChanges } from "@/components/RecentChanges";
import { EVENTS, EVENT_STORE_META, significantEvents, contributingAdapters } from "@/lib/event-store";
import { ReportError } from "@/components/ReportError";

export const metadata = buildMetadata({
  title: SITE.title,
  description: SITE.subtitle,
  path: "/",
});

/**
 * The four jobs a visitor arrives with. The homepage is organised around these
 * rather than around the site's sections: someone asking "does this affect me?"
 * should not have to know that the answer lives under "For you".
 */
const TASKS = [
  {
    href: "/what-changed",
    title: "Understand a change",
    body: "What's new, what changed, and who it affects.",
    icon: "M4 6h16M4 12h10M4 18h7",
  },
  {
    href: "/key-dates",
    title: "Check deadlines",
    body: "Relevant dates, requirements, and next steps.",
    icon: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  },
  {
    href: "/following",
    title: "Track my situation",
    body: "Follow visas, countries, and topics; access personalized updates.",
    icon: "M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z",
  },
  {
    href: "/resources",
    title: "Find services",
    body: "Discover relevant immigration services and resources.",
    icon: "M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z",
  },
];

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

  // The archive, surfaced. `significantEvents` already excludes routine
  // paperwork, so this is what actually CHANGED rather than what was merely
  // published.
  const recent = significantEvents(4);

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

  return (
    <div>
      {/* Hero — task-first. The question a visitor arrives with, one search
          box that answers most of them, and the four jobs the site does. The
          product's promise (every change traced to its official source) stays
          directly under the question, so the page still says what it is. */}
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="container-page py-9 sm:py-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <span className="pulse-live" />
              {SITE.tagline}
            </div>
            <h1 className="text-balance text-3xl font-extrabold tracking-tight text-white sm:text-5xl">
              What do you need help with?
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-balance text-base text-slate-300 sm:text-lg">
              U.S. immigration rules, deadlines and data, each traced{" "}
              <span className="bg-gradient-to-r from-accent via-accent-soft to-status-red bg-clip-text font-semibold text-transparent">
                back to the official source
              </span>
              .
            </p>

            <div className="mx-auto mt-6 max-w-2xl text-left">
              <SearchBar size="hero" />
            </div>
          </div>

          <nav aria-label="What you can do here" className="mx-auto mt-6 grid max-w-5xl grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
            {TASKS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="group flex flex-col items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-left sm:flex-row sm:gap-3 sm:p-4 transition-colors hover:border-accent/40 hover:bg-accent/[0.05]"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={t.icon} />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-white group-hover:text-accent">{t.title}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-slate-400 sm:text-[13px]">{t.body}</span>
                </span>
              </Link>
            ))}
          </nav>

          {/* Situations as starting points, not boxes: each opens its view on
              /for-you, where any visa, country or topic can also be looked up. */}
          <div className="mx-auto mt-5 flex max-w-5xl flex-wrap items-center justify-center gap-2">
            <span className="text-sm text-slate-500">Start from a situation:</span>
            {SITUATIONS.map((s) => (
              <Link
                key={s.key}
                href={`/for-you?s=${s.key}`}
                className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-accent/40 hover:text-white"
              >
                {s.label}
              </Link>
            ))}
          </div>

          <div className="mx-auto mt-6 max-w-2xl text-center">
            <p className="text-xs leading-relaxed text-slate-500">
              <span className="font-mono text-slate-400">Last refreshed {formatDate(LAST_REFRESHED)}</span>
              {" · "}
              {heroCoverage}{" "}
              <Link href="/methodology" className="link-accent">
                How we source and label every figure →
              </Link>
            </p>
            {/* THE PROFESSIONAL DOOR. One quiet line: discoverable, not a sales banner. */}
            <p className="mt-3 text-sm text-slate-500">
              Following this professionally?{" "}
              <Link href="/monitor" className="link-accent font-medium">
                Monitor what changed for your caseload
              </Link>{" "}
              or see the{" "}
              <Link href="/briefing" className="link-accent font-medium">
                Pro Briefing
              </Link>
              .
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
          heading="Recent changes"
          intro={[
            "Newest first. Routine paperwork is left out here and stays searchable in the archive.",
            lastCheckedSentence(pipelineHealth, formatDate),
          ]
            .filter(Boolean)
            .join(" ")}
          linkLabel={`See all ${EVENTS.length.toLocaleString()} recorded changes`}
        />

        {/* SECTION 5 — The next three deadlines only. */}
        {/* KeyDates renders its own "All dates →" link in the header, so the
            brief's "View all dates" requirement is already met without a second
            competing link below the list. */}
        <KeyDates dates={KEY_DATES} placement="home" limit={3} />

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
