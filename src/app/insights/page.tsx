import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { MethodologyNote } from "@/components/MethodologyNote";
import { InsightCard } from "@/components/InsightCard";
import { PulseSignup } from "@/components/PulseSignup";
import { buildInsights } from "@/lib/insights";
import { LAST_REFRESHED } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Immigration Insights — What the Numbers Say",
  description:
    "Plain-language insights computed from official U.S. immigration data: H-1B concentration, border trends, detention, student visas and layoffs. Every claim sourced.",
  path: "/insights",
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

        <PulseSignup />

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
