import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { EMPLOYERS_META } from "@/lib/employers";
import { WARN_COVERAGE_SENTENCE, WARN_SUMMARY } from "@/lib/warn-summary";

export const metadata = buildMetadata({
  title: "Methodology",
  description:
    "How ImmigrationClock defines and distinguishes immigration metrics: arrests vs removals vs detention, encounters vs deportations, LCA filings vs approvals, and why some counters are estimated.",
  path: "/methodology",
});

const DISTINCTIONS: { a: string; b: string; note: string }[] = [
  {
    a: "ICE arrests",
    b: "Deportations / removals",
    note: "An administrative arrest is the start of a process. Many arrests do not end in removal, and a person can be arrested in one year and removed in another. The two counts are not interchangeable.",
  },
  {
    a: "Deportations / removals",
    b: "Detention population",
    note: "Removals are a flow over a fiscal year. Detention population is a stock — the number of people held at a point in time (often reported as an average daily population). Adding them together is meaningless.",
  },
  {
    a: "CBP encounters",
    b: "Deportations",
    note: "An encounter is an event at or near the border (an apprehension or inadmissibility determination). One person can be encountered multiple times. Encounters are not removals and are not unique people.",
  },
  {
    a: "LCA filings",
    b: "H-1B approvals",
    note: "A Labor Condition Application is a prerequisite an employer files with the Department of Labor. It is not a visa, not a petition, and not an approval. Many LCAs are never used.",
  },
  {
    a: "USCIS approvals",
    b: "State Department visa issuances",
    note: "USCIS approves petitions inside the immigration system. The State Department issues visas at consulates abroad. A person can have an approved petition without a visa issuance in the same year, and vice versa.",
  },
  {
    a: "Layoff data (WARN)",
    b: "Replacement by foreign workers",
    note: "WARN notices record that layoffs happened. They contain no information about who, if anyone, was hired afterward. Layoff data does not prove replacement by H-1B or any other workers.",
  },
];

export default function MethodologyPage() {
  return (
    <div>
      <PageHeader
        eyebrow="About the data"
        title="Methodology"
        description="Immigration statistics are easy to misread because similar-sounding metrics measure very different things. Here is exactly what each number means — and what it does not."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/methodology", label: "Methodology" },
        ]}
      />

      <div className="container-page max-w-4xl space-y-8 py-10">
        <section className="space-y-4">
          <h2 className="section-title">Metrics that are not the same thing</h2>
          <div className="space-y-3">
            {DISTINCTIONS.map((d) => (
              <div key={`${d.a}-${d.b}`} className="panel panel-pad">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="rounded-md bg-accent/10 px-2 py-0.5 text-accent-soft">{d.a}</span>
                  <span className="text-slate-500">is not</span>
                  <span className="rounded-md bg-status-red/10 px-2 py-0.5 text-status-red">{d.b}</span>
                </div>
                <p className="text-sm leading-relaxed text-slate-300">{d.note}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="section-title">Reporting periods &amp; data freshness</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Sources update on different schedules, so each counter shows the <strong className="text-white">latest
            available reporting period</strong> for its dataset — not a single fixed year. We never present a
            stale figure as the headline when newer data exists, and every card is labelled so you know exactly
            what you are looking at:
          </p>
          <ul className="space-y-2 text-sm leading-relaxed text-slate-300">
            <li>
              <span className="chip">Complete</span> A finished fiscal year with final published totals
              (e.g. CBP encounters FY2025).
            </li>
            <li>
              <span className="chip">YTD</span> Fiscal-year-to-date — the current fiscal year is still in
              progress, so the total is partial (e.g. border encounters FY2026 YTD).
            </li>
            <li>
              <span className="chip">Preliminary</span> The agency&rsquo;s latest release that has not yet been
              finalized and may be revised (e.g. FY2025 H-1B petition totals).
            </li>
            <li>
              <span className="chip">Point-in-time</span> A snapshot on a specific date rather than a running
              total (e.g. the ICE detention population, which is a count on one day).
            </li>
            <li>
              <span className="chip">Est. pace</span> A projected full-year figure, scaling a year-to-date
              total by the share of the fiscal year elapsed. An estimate, not an official total.
            </li>
          </ul>
          <p className="text-sm leading-relaxed text-slate-300">
            Where a source lags — USCIS&rsquo;s employer-level H-1B Data Hub and DOL&rsquo;s wage disclosures
            run roughly a year behind — the latest available complete year (FY2024) is shown and labelled as
            such, rather than guessing at unpublished newer figures. Toggle the dashboard between{" "}
            <em>Latest available</em>, <em>Last complete fiscal year</em>, and <em>5-year trend</em> to compare.
            We use &ldquo;latest available&rdquo; and &ldquo;YTD,&rdquo; never &ldquo;real-time,&rdquo; because
            the underlying sources are not live feeds.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="section-title">Why some counters are estimated</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Different agencies publish on different calendars — some monthly, some quarterly, some only
            once a year. When a fiscal year is still in progress, we show the latest reported value and,
            where labelled <span className="chip">pace est.</span>, project a full-year figure by scaling
            the year-to-date total by the share of the fiscal year elapsed. Projections assume the current
            pace continues; they are estimates, not official totals, and will be revised as new data lands.
          </p>
          <p className="text-sm leading-relaxed text-slate-300">
            The U.S. federal fiscal year runs from October 1 to September 30. &ldquo;This fiscal year&rdquo;
            counters therefore accumulate from October, not January.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="section-title">The four integrity labels</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Every figure on this site carries one of four labels. They are not decoration — they describe
            exactly how much weight a number can bear.
          </p>
          <ul className="space-y-2.5 text-sm leading-relaxed text-slate-300">
            <li>
              <span className="font-semibold text-status-green">✓ Reported</span> — the agency published
              this exact number for this exact period. We only reformatted it.
            </li>
            <li>
              <span className="font-semibold text-status-amber">≈ Projected</span> — we extrapolated a
              reported partial period to a full one, by scaling the year-to-date total by the share of the
              fiscal year elapsed. It assumes the current pace continues.
            </li>
            <li>
              <span className="font-semibold text-slate-300">~ Estimated</span> — we apportioned a reported
              total using a share the agency itself published.
            </li>
            <li>
              <span className="font-semibold text-slate-300">◇ Modeled</span> — we apportioned a reported
              national total using <em>our own</em> assumed weights, which the agency has never published.
              This is the weakest claim we make. ICE arrests by state, removals by nationality, border
              encounters by citizenship, and the curated employer/wage views are all modeled. Read them as
              illustrative of relative scale, never as official counts.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="section-title">Tracked subsets vs national totals</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Employer, state, and occupation views are built from a curated set of large, public H-1B
            sponsors. These are a meaningful sample, not the entire country, and they are labelled{" "}
            <span className="chip">Modeled</span>. National counters (for example, total H-1B approvals or
            border encounters) are drawn from agency-wide totals and are labelled accordingly.
          </p>
          <p className="text-sm leading-relaxed text-slate-300">
            Two USCIS products can disagree on the latest year, and we do not hide that. Per-employer
            approvals come from the <strong className="text-slate-200">H-1B Employer Data Hub</strong>,
            whose most recent published export is FY{EMPLOYERS_META.fiscalYear}. National petition totals
            come from a separate USCIS release that runs a year ahead. Figures from the two will not add up
            to each other.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="section-title">Layoff (WARN) coverage</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            {WARN_COVERAGE_SENTENCE} Every notice we show is a real filing republished from a state
            agency&rsquo;s open-data portal, with a link back to that portal on each row. We do not
            estimate, model, or infer layoff notices — if a state has no machine-readable feed, we show
            nothing for it and say so.
          </p>
          <p className="text-sm leading-relaxed text-slate-300">
            {WARN_SUMMARY.yearBasisNote}
          </p>
          <p className="text-sm leading-relaxed text-slate-300">
            WARN notices report <em>planned</em> layoffs. They do not indicate whether or how the affected
            roles relate to visa sponsorship, and no dataset here identifies the immigration status of
            affected workers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="section-title">Corrections</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            When we get something wrong we say so, in public, with the date. Corrections are recorded in{" "}
            <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">docs/data-corrections.md</code> in
            the project repository.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              2026-08-01 — Synthetic layoff records removed
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Until this date, some state and employer pages displayed individual &ldquo;WARN
              notices&rdquo; that this site had generated rather than ingested: annual layoff totals
              reported in the press, split into invented notices with invented filing dates, and shown
              under a government source label. Those records have been deleted. Every layoff figure now
              comes from real notices filed with state agencies, each linking back to its own state
              portal. Some displayed totals changed as a result. Automated tests now block any
              reintroduction of generated records.
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="section-title">What this site will not do</h2>
          <ul className="list-inside list-disc space-y-1.5 text-sm leading-relaxed text-slate-300">
            <li>No individual immigrant profiles, tracking, or identifying personal data.</li>
            <li>No reporting of specific enforcement operations or locations of people.</li>
            <li>No claims that immigrants caused layoffs, or that sponsorship displaced specific workers.</li>
            <li>No dehumanizing language, slurs, or inflammatory framing.</li>
          </ul>
          <p className="text-sm leading-relaxed text-slate-300">
            Every figure links to its public source. See the{" "}
            <Link href="/sources" className="link-accent">
              sources page
            </Link>{" "}
            for the full list, and the{" "}
            <Link href="/admin/refresh-status" className="link-accent">
              refresh status page
            </Link>{" "}
            for when each dataset was last updated.
          </p>
        </section>
      </div>
    </div>
  );
}
