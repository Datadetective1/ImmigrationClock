import { notFound } from "next/navigation";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { RelatedSponsors } from "@/components/RelatedSponsors";
import { Stat, StatRow } from "@/components/Stat";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ProvenanceTag } from "@/components/ProvenanceTag";
import { Faq, type FaqItem } from "@/components/Faq";
import { DataStatus } from "@/components/DataStatus";
import { EMPLOYERS, EMPLOYERS_META, AVG_APPROVAL_RATE, employerBySlug, displayEmployer, relatedSponsors } from "@/lib/employers";
import { warnForEmployer } from "@/lib/warn";
import { formatNumber, formatRate, formatDate } from "@/lib/format";

export function generateStaticParams() {
  return EMPLOYERS.map((e) => ({ slug: e.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const hit = employerBySlug(params.slug);
  if (!hit) return buildMetadata({ title: "Employer not found", description: "", path: `/employer/${params.slug}` });
  const name = displayEmployer(hit.employer.name);
  return buildMetadata({
    title: `${name} — H-1B Sponsor Record`,
    description: `${name}'s reported USCIS H-1B record: ${formatNumber(hit.employer.approvals)} approvals, ${formatNumber(
      hit.employer.denials
    )} denials (${formatRate(hit.employer.approvalRate)} approval rate) in FY${EMPLOYERS_META.fiscalYear}.`,
    path: `/employer/${hit.employer.slug}`,
    keywords: [`${name} H-1B`, `${name} visa sponsor`, "H-1B approvals", "USCIS employer data"],
  });
}

export default function EmployerPage({ params }: { params: { slug: string } }) {
  const hit = employerBySlug(params.slug);
  if (!hit) notFound();
  const { employer: e, rank } = hit;
  const name = displayEmployer(e.name);
  const fy = EMPLOYERS_META.fiscalYear;
  const share = EMPLOYERS_META.nationalApprovals ? (e.approvals / EMPLOYERS_META.nationalApprovals) * 100 : 0;
  const rateDelta = (e.approvalRate - AVG_APPROVAL_RATE) * 100;
  const rateWord = rateDelta > 0.5 ? "above" : rateDelta < -0.5 ? "below" : "in line with";

  // Does this same employer also appear in the real WARN layoff feed? If so we
  // surface it right here — the layoffs-next-to-sponsorship view no layoff-only
  // tracker can produce. Appearing in both does NOT imply one caused the other.
  const warn = warnForEmployer(e.name);

  // FAQ built from the real record — targets "does {company} sponsor H-1B?" and
  // emits FAQPage JSON-LD for rich results.
  const faqItems: FaqItem[] = [
    {
      q: `Does ${name} sponsor H-1B visas?`,
      a:
        e.approvals > 0
          ? `Yes. The USCIS H-1B Employer Data Hub shows ${name} had ${formatNumber(e.approvals)} approved H-1B petitions in FY${fy} (${formatNumber(e.denials)} denials, a ${formatRate(e.approvalRate)} approval rate), ranking #${formatNumber(rank)} of ${formatNumber(EMPLOYERS_META.totalEmployers)} sponsoring employers. Past sponsorship does not guarantee any individual petition will be approved.`
          : `Based on FY${fy} USCIS H-1B Employer Data Hub records, ${name} had no approved H-1B petitions (${formatNumber(e.denials)} denials). Employers can begin or resume sponsorship in any year.`,
    },
    {
      q: `How many H-1B approvals did ${name} have in FY${fy}?`,
      a: `${name} had ${formatNumber(e.approvals)} H-1B petition approvals and ${formatNumber(e.denials)} denials in FY${fy}, according to the USCIS H-1B Employer Data Hub. That is about ${share >= 0.1 ? share.toFixed(1) : share.toFixed(2)}% of all approvals in the data hub that year.`,
    },
    {
      q: `What is ${name}'s H-1B approval rate?`,
      a: `${formatRate(e.approvalRate)} in FY${fy} — ${rateWord} the ${formatRate(AVG_APPROVAL_RATE)} average across all sponsoring employers.`,
    },
  ];
  if (e.topState) {
    faqItems.push({
      q: `Where does ${name} sponsor the most H-1B workers?`,
      a: `Most of ${name}'s reported FY${fy} H-1B approvals were in ${e.topState}.`,
    });
  }
  if (warn) {
    faqItems.push({
      q: `Has ${name} filed WARN layoff notices?`,
      a: `Yes. State WARN portals show ${name} filed ${formatNumber(warn.summary.notices)} layoff notice${
        warn.summary.notices === 1 ? "" : "s"
      } covering ${formatNumber(warn.summary.employees)} employees (${warn.summary.states.join(", ")}). WARN notices report planned layoffs; they do not indicate whether or how those roles relate to H-1B sponsorship.`,
    });
  }

  return (
    <div>
      <PageHeader
        eyebrow={`H-1B sponsor record · FY${fy}`}
        title={name}
        description={`The reported USCIS H-1B Employer Data Hub record for ${name} — petition approvals, denials, and approval rate for FY${fy}.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/h1b/employers", label: "Employer directory" },
          { href: `/employer/${e.slug}`, label: name },
        ]}
        share
      >
        <StatRow>
          <Stat label="H-1B approvals" value={formatNumber(e.approvals)} sub={`FY${fy}`} />
          <Stat label="Denials" value={formatNumber(e.denials)} sub={`FY${fy}`} />
          <Stat label="Approval rate" value={formatRate(e.approvalRate)} sub={`Avg ${formatRate(AVG_APPROVAL_RATE)}`} />
          <Stat label="Rank" value={`#${formatNumber(rank)}`} sub={`of ${formatNumber(EMPLOYERS_META.totalEmployers)}`} />
        </StatRow>
      </PageHeader>

      <div className="container-page max-w-3xl space-y-6 py-10">
        <section className="panel panel-pad">
          <div className="mb-2 flex items-center gap-2">
            <span className="eyebrow text-accent">What the record shows</span>
            <ProvenanceTag provenance="reported" />
          </div>
          <ul className="space-y-2.5 text-sm leading-relaxed text-slate-300">
            <li className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
              <span>
                {name} had <strong className="text-white">{formatNumber(e.approvals)}</strong> H-1B petition
                approvals and <strong className="text-white">{formatNumber(e.denials)}</strong> denials in FY{fy},
                a <strong className="text-white">{formatRate(e.approvalRate)}</strong> approval rate.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
              <span>
                That ranks <strong className="text-white">#{formatNumber(rank)}</strong> of{" "}
                {formatNumber(EMPLOYERS_META.totalEmployers)} sponsoring employers, about{" "}
                <strong className="text-white">{share >= 0.1 ? share.toFixed(1) : share.toFixed(2)}%</strong> of all
                FY{fy} H-1B Employer Data Hub approvals.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" />
              <span>
                Its approval rate is <strong className="text-white">{rateWord}</strong> the{" "}
                {formatRate(AVG_APPROVAL_RATE)} average across all sponsors.
                {e.topState ? <> Most approvals were in <strong className="text-white">{e.topState}</strong>.</> : null}
              </span>
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/h1b/employers?q=${encodeURIComponent(e.name)}`}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:border-accent/40"
            >
              Compare in the directory →
            </Link>
            <a
              href={EMPLOYERS_META.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-accent/40 hover:text-accent-soft"
            >
              ◆ USCIS source
            </a>
          </div>
        </section>

        {warn ? (
          <section className="panel panel-pad">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="eyebrow text-status-red">Layoff notices · WARN</span>
                <ProvenanceTag provenance="reported" />
              </div>
              <Link href="/layoffs-vs-h1b" className="text-xs font-semibold text-accent hover:text-accent-soft">
                Layoffs vs H-1B →
              </Link>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-slate-300">
              {name} also appears in the state WARN layoff feed:{" "}
              <strong className="text-white">{formatNumber(warn.summary.employees)}</strong> employees across{" "}
              <strong className="text-white">{formatNumber(warn.summary.notices)}</strong> notice
              {warn.summary.notices === 1 ? "" : "s"} ({warn.summary.states.join(", ")}). This sits next to the H-1B
              record above — a comparison no layoff-only tracker can show.{" "}
              <span className="text-slate-400">Appearing in both does not imply one caused the other.</span>
            </p>
            <div className="overflow-x-auto scroll-thin rounded-xl border border-white/5">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.03] text-left text-xs uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2 font-medium">Notice date</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium text-right">Employees</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {warn.notices.slice(0, 8).map((n, i) => (
                    <tr key={`${n.noticeDate}-${i}`} className="border-b border-white/5 last:border-0">
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-300">
                        {n.noticeDate ? formatDate(n.noticeDate) : "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-400">{[n.city, n.state].filter(Boolean).join(", ")}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums text-status-red">
                        {n.employees > 0 ? formatNumber(n.employees) : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <a
                          href={n.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent-soft hover:underline"
                        >
                          {n.state} ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {warn.notices.length > 8 ? (
              <p className="mt-3 text-xs text-slate-500">
                Showing 8 of {formatNumber(warn.notices.length)} notices. See the{" "}
                <Link href="/layoffs" className="link-accent">
                  full live layoffs feed
                </Link>
                .
              </p>
            ) : null}
          </section>
        ) : null}

        {/* The way out. Every one of the 2,614 employer pages ended here
            with no route to another employer. */}
        <RelatedSponsors related={relatedSponsors(e.slug)} name={name} />

        <Faq items={faqItems} />


        <DataStatus
          sourceKey="uscis_h1b"
          surface="employer"
          provenance="reported"
          dataThrough={`FY${EMPLOYERS_META.fiscalYear}`}
          refreshedAt={EMPLOYERS_META.generatedAt.slice(0, 10)}
        />

        <MethodologyNote>
          Figures are USCIS H-1B Employer Data Hub counts of petition approvals and denials (initial plus
          continuing) for FY{fy}, aggregated across this employer&rsquo;s worksites. They are petition outcomes,
          not State Department visa issuances, and sponsorship volume does not by itself indicate displacement of
          U.S. workers. Data context, not legal advice.
        </MethodologyNote>
      </div>
    </div>
  );
}
