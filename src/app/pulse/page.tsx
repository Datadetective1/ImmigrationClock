import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ChangeFeed } from "@/components/ChangeFeed";
import { PulseSignup } from "@/components/PulseSignup";
import { LAST_REFRESHED, LIVE_BLS, CURRENT_FY } from "@/lib/data";
import { cbpRows, iceByFy } from "@/lib/dataset";
import { WARN_SUMMARY, WARN_COVERAGE_SENTENCE } from "@/lib/warn-summary";
import { formatNumber, formatCompact, formatDate, fiscalYearLabel } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Immigration Pulse — What Changed This Month",
  description:
    "How U.S. immigration data moved this month — border encounters, layoffs, enforcement pace and visa lag, on one page. Every figure sourced and labelled.",
  path: "/pulse",
  keywords: [
    "immigration pulse",
    "what changed immigration",
    "border encounters this month",
    "layoffs this month",
    "immigration data update",
  ],
});

export default function PulsePage() {
  const borderYtd = cbpRows.find((r) => r.fiscalYear === CURRENT_FY && r.border === "nationwide");
  const removalsYtd = iceByFy[CURRENT_FY]?.removals;
  const warnYtd = WARN_SUMMARY.byYear.find((y) => y.year === CURRENT_FY);

  return (
    <div>
      <PageHeader
        eyebrow="Immigration Pulse"
        title="What changed this month"
        description="A single, shareable read on how the immigration numbers moved — auto-generated from the latest available data, with a source and an integrity label on every line. We show movement, not opinion."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/pulse", label: "Pulse" },
        ]}
        share
      >
        <StatRow>
          <Stat
            label={`Border encounters · ${fiscalYearLabel(CURRENT_FY)} YTD`}
            value={borderYtd ? formatCompact(borderYtd.totalEncounters) : "—"}
            sub="Nationwide, reported"
          />
          <Stat
            label={`ICE removals · ${fiscalYearLabel(CURRENT_FY)} YTD`}
            value={removalsYtd ? formatCompact(removalsYtd) : "—"}
            sub="Year-to-date"
          />
          <Stat
            label={`WARN layoffs · ${CURRENT_FY} YTD`}
            value={warnYtd ? formatNumber(warnYtd.employees) : "—"}
            sub={`${WARN_SUMMARY.stateCount} states with open feeds`}
            tooltip={WARN_COVERAGE_SENTENCE}
          />
          <Stat
            label="U.S. unemployment"
            value={LIVE_BLS.value != null ? `${LIVE_BLS.value}%` : "—"}
            sub={LIVE_BLS.period ?? "BLS, live"}
          />
        </StatRow>
      </PageHeader>

      <div className="container-page max-w-4xl space-y-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <span>Auto-generated from the current data snapshot — newest movement first.</span>
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-slate-400">
            As of {formatDate(LAST_REFRESHED)}
          </span>
        </div>

        <ChangeFeed />

        <PulseSignup />

        <div className="panel panel-pad">
          <h2 className="text-sm font-semibold text-white">Share the Pulse</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
            Every line links to its primary source and is labelled reported, projected, or estimated.
            Useful for newsletters, threads, and forum discussions — share the page and let people check
            the numbers themselves.
          </p>
        </div>

        <MethodologyNote>
          The Pulse is computed automatically from the same public datasets shown across the site (CBP,
          ICE, USCIS, the State Department, BLS, and Texas WARN). Month-over-month and pace figures
          describe direction and magnitude only — they do not assert cause. Curated sources are labelled
          and may lag official reporting; see <span className="text-slate-300">/data</span> for the
          reporting-lag breakdown.
        </MethodologyNote>
      </div>
    </div>
  );
}
