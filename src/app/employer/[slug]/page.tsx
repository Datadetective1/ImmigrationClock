import { notFound } from "next/navigation";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ProvenanceTag } from "@/components/ProvenanceTag";
import {
  EMPLOYERS,
  EMPLOYERS_META,
  AVG_APPROVAL_RATE,
  employerBySlug,
  displayEmployer,
} from "@/lib/employers";
import { formatNumber, formatRate } from "@/lib/format";

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
