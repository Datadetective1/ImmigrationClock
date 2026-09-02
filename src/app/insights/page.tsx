import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { MethodologyNote } from "@/components/MethodologyNote";
import { InsightCard } from "@/components/InsightCard";
import { PulseSignup } from "@/components/PulseSignup";
import { buildInsights } from "@/lib/insights";
import { buildSignals } from "@/lib/editorial/signals";
import { signalPath, ogImagePath } from "@/lib/share";
import { SIGNAL_GROUP_LABEL } from "@/lib/stories";
import { LAST_REFRESHED } from "@/lib/data";
import { formatDate } from "@/lib/format";

/** The build's date, fixed once, so the list agrees with the signal pages. */
const BUILD_DATE = new Date().toISOString().slice(0, 10);

export const metadata = buildMetadata({
  title: "Immigration Insights — What the Numbers Say",
  description:
    "Plain-language insights computed from official U.S. immigration data: H-1B concentration, border trends, detention, student visas and layoffs. Every claim sourced.",
  path: "/insights",
  image: ogImagePath("page", "insights"),
  keywords: [
    "immigration insights",
    "H-1B concentration",
    "border encounters trend",
    "ICE detention",
    "F-1 student visa trend",
    "layoffs vs H-1B",
  ],
});

export default function InsightsPage() {
  const insights = buildInsights();
  const signals = buildSignals(BUILD_DATE);

  return (
    <div>
      <PageHeader
        eyebrow="Insights"
        title="What the numbers say"
        description="Plain-language takeaways computed directly from the latest available data — each one sourced and labelled reported, projected, or estimated. We state direction and magnitude, never causation."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/insights", label: "Insights" },
        ]}
        share
      />

      <div className="container-page space-y-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>
            {insights.length} insights · generated from the current data snapshot.
          </span>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-400">
            Last refreshed {formatDate(LAST_REFRESHED)}
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {insights.map((insight) => (
            <InsightCard key={insight.key} insight={insight} />
          ))}
        </div>

        {/* Data signals: reported figures and exact archive counts only, each
            with its own page and card (src/lib/editorial/signals.ts). Kept
            apart from the insight cards above, which may be projected. */}
        {signals.length > 0 ? (
          <section aria-labelledby="signals-heading" className="space-y-4">
            <div>
              <h2 id="signals-heading" className="section-title">
                Data signals
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Observations computed from reported figures and exact counts of ImmigrationClock&rsquo;s
                own archive — nothing projected, estimated or modeled. Each has a page with the
                method, the source and the caveats.
              </p>
            </div>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {signals.map((s) => (
                <li key={s.slug}>
                  <Link
                    href={signalPath(s.slug)}
                    className="block h-full rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-accent/40"
                  >
                    <span className="eyebrow mb-1 block text-slate-500">{SIGNAL_GROUP_LABEL[s.group]}</span>
                    <span className="block font-mono text-3xl font-extrabold tabular-nums text-accent">{s.figure}</span>
                    <span className="mt-1 block text-sm text-slate-300">{s.figureLabel}</span>
                    <span className="mt-2 block text-sm font-semibold text-white">{s.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <PulseSignup placement="insights" />

        <MethodologyNote>
          Insights are derived automatically from the same public datasets shown across the site
          (USCIS, CBP, ICE, the State Department, and BLS). A figure marked <strong>Reported</strong>{" "}
          is published by the source agency; <strong>Projected</strong> extrapolates a full-year pace
          from year-to-date data; <strong>Estimated</strong> is apportioned from reported totals.
          Side-by-side comparisons (for example layoffs and H-1B sponsorship) do not assert that one
          caused the other.
        </MethodologyNote>
      </div>
    </div>
  );
}
