import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ProvenanceTag } from "@/components/ProvenanceTag";
import { FreshnessBadge } from "@/components/FreshnessBadge";
import { LAST_REFRESHED, LIVE_BLS, REFRESH_MANIFEST } from "@/lib/data";
import { formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Data & Freshness",
  description:
    "How ImmigrationClock refreshes data and labels every figure reported, projected, or estimated — and why it is not a real-time feed.",
  path: "/data",
});

function dt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export default function DataPage() {
  return (
    <div>
      <PageHeader
        eyebrow="About the data"
        title="Data &amp; freshness"
        description="How this site stays current, and exactly what every label means. We never present a projection as an official figure, and we never call a delayed dataset 'live'."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/data", label: "Data & freshness" },
        ]}
      >
        <StatRow>
          <Stat label="Pipeline last ran" value={formatDate(LAST_REFRESHED)} sub="This build" tooltip="When the refresh pipeline last executed — not a claim the underlying data is real-time." />
          <Stat label="Near-live fetched" value={LIVE_BLS.value != null ? `${LIVE_BLS.value}%` : "—"} sub="BLS unemployment" tooltip="Genuinely fetched from the BLS API at build time." />
          <Stat label="Auto-fetched sources" value={String(REFRESH_MANIFEST.filter((m) => m.mode === "auto-fetch").length)} sub={`of ${REFRESH_MANIFEST.length}`} />
          <Stat label="Refresh cadence" value="Monthly" sub="Scheduled rebuild" />
        </StatRow>
      </PageHeader>

      <div className="container-page max-w-4xl space-y-8 py-10">
        <section className="space-y-3">
          <h2 className="section-title">Three labels on every number</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            The hardest problem with immigration data is that official figures lag — sometimes by months, sometimes
            by a year or more. Rather than guess and present it as fact, we label the <em>origin</em> of every value:
          </p>
          <div className="space-y-3">
            <div className="panel panel-pad">
              <ProvenanceTag provenance="reported" />
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                A real figure <strong className="text-white">published by the source agency</strong>. Example: USCIS
                FY2024 H-1B approvals (399,395), CBP FY2024 nationwide encounters, the BLS unemployment rate we fetch live.
              </p>
            </div>
            <div className="panel panel-pad">
              <ProvenanceTag provenance="projected" />
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                A <strong className="text-white">projection computed from reported data</strong> — e.g. a full-year pace
                scaled from the elapsed share of the current fiscal year. Clearly not an official total.
              </p>
            </div>
            <div className="panel panel-pad">
              <ProvenanceTag provenance="estimated" />
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                <strong className="text-white">Derived or apportioned</strong> from reported totals — e.g. a state or
                country share of a national figure, or a tracked-employer subset. An estimate, not an official figure.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="section-title">And a freshness label for the reporting period</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <FreshnessBadge completeness="complete" /> finished fiscal year &nbsp;·&nbsp;
            <FreshnessBadge completeness="ytd" /> fiscal-year-to-date &nbsp;·&nbsp;
            <FreshnessBadge completeness="preliminary" /> latest release, may revise &nbsp;·&nbsp;
            <FreshnessBadge completeness="point_in_time" /> a dated snapshot &nbsp;·&nbsp;
            <FreshnessBadge completeness="estimated" /> projected pace
          </div>
          <p className="text-sm leading-relaxed text-slate-300">
            So a card reading <em>&ldquo;Border encounters · FY2026 YTD&rdquo;</em> with a{" "}
            <ProvenanceTag provenance="projected" /> tag means: the year-to-date period, value projected from reported
            data — not an official YTD total. Toggle the dashboard to <em>Last complete FY</em> to see the most recent{" "}
            <ProvenanceTag provenance="reported" /> figure.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="section-title">How it refreshes (and why it is not &ldquo;live&rdquo;)</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            A scheduled job re-runs the data pipeline and rebuilds the site. Sources with a reliable machine-readable
            feed are fetched automatically at build time (with a real <code className="rounded bg-white/5 px-1 text-accent-soft">fetchedAt</code> stamp);
            the rest are maintained as the latest published values plus labelled projections until their feed is wired.
            <strong className="text-white"> &ldquo;Last refreshed&rdquo; is when our pipeline last ran — it is not a claim
            that the agencies publish in real time.</strong>
          </p>
          <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Feed</th>
                  <th className="px-4 py-3 font-medium">Mode</th>
                  <th className="px-4 py-3 font-medium">Last fetched</th>
                </tr>
              </thead>
              <tbody>
                {REFRESH_MANIFEST.map((m) => (
                  <tr key={m.key} className="border-b border-white/5 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-200">{m.key}</td>
                    <td className="px-4 py-3 text-slate-400">{m.feed}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${m.mode === "auto-fetch" ? "border-status-green/25 bg-status-green/10 text-status-green" : "border-white/10 bg-white/5 text-slate-400"}`}>
                        {m.mode}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{dt(m.lastFetchedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {LIVE_BLS.value != null ? (
            <p className="text-xs leading-relaxed text-slate-500">
              Live example: the U.S. unemployment rate ({LIVE_BLS.value}% for {LIVE_BLS.period}) was fetched from the{" "}
              <a href={LIVE_BLS.sourceUrl} target="_blank" rel="noopener noreferrer" className="link-accent">BLS Public Data API</a>{" "}
              at {dt(LIVE_BLS.fetchedAt)}.
            </p>
          ) : null}
        </section>

        <section className="space-y-2 text-sm leading-relaxed text-slate-300">
          <h2 className="section-title">More</h2>
          <p>
            See the <Link href="/methodology" className="link-accent">methodology</Link> for metric definitions, the{" "}
            <Link href="/sources" className="link-accent">sources</Link> page for every dataset, and the{" "}
            <Link href="/admin/refresh-status" className="link-accent">refresh status</Link> page for per-source
            ingestion health.
          </p>
        </section>
      </div>
    </div>
  );
}
