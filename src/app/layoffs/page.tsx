import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { ChartCard } from "@/components/ChartCard";
import { MethodologyNote } from "@/components/MethodologyNote";
import { DownloadCsvButton } from "@/components/DownloadCsvButton";
import { PulseSignup } from "@/components/PulseSignup";
import { DataStatus } from "@/components/DataStatus";
import {
  recentNotices,
  warnH1bCrossLink,
  WARN_META,
  WARN_STATES,
} from "@/lib/warn";
import { WARN_SUMMARY } from "@/lib/warn-summary";
import { formatNumber, formatDate } from "@/lib/format";

export const metadata = buildMetadata({
  title: "Live Layoffs — WARN Notices",
  description:
    "WARN Act layoff notices from state open-data portals: employer, location, employees affected and effective date, each linked to its source.",
  path: "/layoffs",
  image: ogImagePath("page", "layoffs"),
  keywords: ["WARN notices", "layoff tracker", "WARN Act layoffs", "layoffs by state", "mass layoff notices"],
});

const TABLE_LIMIT = 250;

export default function LayoffsPage() {
  const notices = recentNotices(TABLE_LIMIT);
  const crossLinked = warnH1bCrossLink();
  const rangeLabel =
    WARN_META.minNoticeDate && WARN_META.maxNoticeDate
      ? `${formatDate(WARN_META.minNoticeDate)} – ${formatDate(WARN_META.maxNoticeDate)}`
      : "—";

  const csvRows = notices.map((n) => ({
    employer: n.employer,
    state: n.state,
    city: n.city ?? "",
    employees_affected: n.employees,
    notice_date: n.noticeDate ?? "",
    effective_date: n.effectiveDate ?? "",
    type: n.layoffType ?? "",
    source: n.sourceUrl,
  }));

  return (
    <div>
      <PageHeader
        eyebrow="Jobs & Workforce"
        title="Live layoffs — WARN notices"
        description="Employer layoff and plant-closing notices, pulled directly from state open-data portals and refreshed each build. Every row links back to the government source it came from."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/layoffs", label: "Live layoffs" },
        ]}
        share
      >
        <StatRow>
          <Stat label="Employees noticed" value={formatNumber(WARN_META.employeesTotal)} sub="Across all tracked notices" />
          <Stat label="WARN notices" value={formatNumber(WARN_META.noticeCount)} sub={rangeLabel} />
          <Stat label="Employers" value={formatNumber(WARN_META.employerCount)} />
          <Stat
            label="Also H-1B sponsors"
            value={formatNumber(crossLinked.length)}
            tooltip="Employers here that also appear in the USCIS H-1B directory. Appearing in both does not imply one caused the other."
          />
        </StatRow>
      </PageHeader>

      <div className="container-page space-y-8 py-10">
        <DataStatus
          sourceKey="warn_layoffs"
          surface="layoffs"
          provenance="reported"
          dataThrough={WARN_SUMMARY.maxNoticeDate}
          refreshedAt={WARN_SUMMARY.generatedAt.slice(0, 10)}
        />

        <MethodologyNote>
          There is no national WARN feed. This tracks the states that publish a{" "}
          <span className="font-semibold text-white">structured, machine-readable</span> feed — a growing subset,
          not a national total. Not every state has a WARN act, and press-based trackers miss the small notices
          this captures. Coverage today: {WARN_META.stateCount} states.
        </MethodologyNote>

        {/* State coverage — each links to the government portal the data comes from. */}
        <ChartCard
          title="State coverage"
          subtitle="Machine-readable WARN feeds we ingest directly. More states are added as they publish open data."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {WARN_STATES.map((s) => (
              <a
                key={s.code}
                href={s.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 hover:bg-white/[0.04]"
              >
                <div>
                  <div className="font-mono text-sm font-semibold text-white">{s.code}</div>
                  <div className="text-xs text-slate-500">{s.agency}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums text-status-red">
                    {formatNumber(s.employeesTotal)}
                  </div>
                  <div className="text-xs text-slate-500">{formatNumber(s.noticeCount)} notices</div>
                </div>
              </a>
            ))}
          </div>
        </ChartCard>

        {crossLinked.length > 0 ? (
          <div className="panel panel-pad">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  {crossLinked.length} of these employers also sponsor H-1B workers
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  The join no single-source layoff tracker can do — layoff notices next to USCIS H-1B sponsorship
                  at the same company.
                </p>
              </div>
              <Link
                href="/layoffs-vs-h1b"
                className="rounded-lg bg-accent/10 px-4 py-2 text-sm font-medium text-accent-soft hover:bg-accent/20"
              >
                See layoffs vs H-1B →
              </Link>
            </div>
          </div>
        ) : null}

        <PulseSignup placement="layoffs" />

        <ChartCard
          title="Most recent notices"
          subtitle={`Latest ${Math.min(TABLE_LIMIT, notices.length)} of ${formatNumber(WARN_META.noticeCount)} tracked notices`}
          source={{
            sourceName: "State WARN open-data portals",
            sourceUrl: "https://www.dol.gov/agencies/eta/layoffs/warn",
            sourceUpdatedAt: WARN_META.maxNoticeDate ?? WARN_META.generatedAt.slice(0, 10),
          }}
          actions={<DownloadCsvButton rows={csvRows} filename="warn-layoffs-recent" />}
        >
          <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3 font-medium">Employer</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium text-right">Employees</th>
                  <th className="px-4 py-3 font-medium">Notice date</th>
                  <th className="px-4 py-3 font-medium">Effective</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                </tr>
              </thead>
              <tbody>
                {notices.map((n, i) => (
                  <tr key={`${n.normalized}-${i}`} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-4 py-3 font-medium text-white">{n.employer}</td>
                    <td className="px-4 py-3 text-slate-400">
                      {[n.city, n.state].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-status-red">
                      {n.employees > 0 ? formatNumber(n.employees) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-300">
                      {n.noticeDate ? formatDate(n.noticeDate) : "—"}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-500">
                      {n.effectiveDate ? formatDate(n.effectiveDate) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={n.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent-soft hover:underline"
                      >
                        {n.state} portal ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>

        <div className="panel panel-pad flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Use this data — free</h2>
            <p className="mt-1 text-sm text-slate-400">
              Every notice is available as JSON and CSV, no key required. WARN Tracker charges for this; we don&apos;t.
            </p>
          </div>
          <Link
            href="/developers"
            className="rounded-lg bg-accent/10 px-4 py-2 text-sm font-medium text-accent-soft hover:bg-accent/20"
          >
            Developer API &amp; downloads →
          </Link>
        </div>

        <div className="panel panel-pad text-sm leading-relaxed text-slate-300">
          <h2 className="mb-2 text-base font-semibold text-white">About this data</h2>
          <ul className="list-inside list-disc space-y-1.5 text-slate-300">
            <li>WARN (Worker Adjustment and Retraining Notification) requires 60 days&apos; notice of qualifying mass layoffs and plant closings.</li>
            <li>Notices are filed by employers with state workforce agencies — the &quot;notice date&quot; is when the state received it, not when jobs end.</li>
            <li>A filed notice can be revised or withdrawn; numbers reflect what was filed.</li>
            <li>WARN says nothing about who, if anyone, was hired afterward — it does not prove replacement.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
