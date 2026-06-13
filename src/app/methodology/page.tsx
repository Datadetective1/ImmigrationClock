import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";

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
          <h2 className="section-title">Tracked subsets vs national totals</h2>
          <p className="text-sm leading-relaxed text-slate-300">
            Employer, state, and occupation views are built from a curated set of large, public H-1B
            sponsors. These are a meaningful sample, not the entire country. National counters (for
            example, total H-1B approvals or border encounters) are drawn from agency-wide totals and are
            labelled accordingly.
          </p>
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
