import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { ResourcePanel } from "@/components/ResourcePanel";
import { MethodologyNote } from "@/components/MethodologyNote";
import { partnersByCategory, CATEGORY_META } from "@/lib/partners";

export const metadata = buildMetadata({
  title: "Resources for Immigrants — Legal Help, Money Transfer, Taxes & More",
  description:
    "A curated directory of services newcomers to the U.S. actually use: attorney-reviewed immigration applications, international money transfer, nonresident tax filing, newcomer banking, student health insurance, and eSIMs.",
  path: "/resources",
  keywords: [
    "immigration resources",
    "immigration lawyer help",
    "send money abroad",
    "nonresident tax filing",
    "international student insurance",
    "newcomer bank account",
  ],
});

const PERSONA_LINKS = [
  { href: "/for-you", label: "H-1B worker" },
  { href: "/for-you", label: "International student" },
  { href: "/for-you", label: "Green-card applicant" },
  { href: "/for-you", label: "Employer" },
];

export default function ResourcesPage() {
  const groups = partnersByCategory();

  return (
    <div>
      <PageHeader
        eyebrow="Resources"
        title="Services for your immigration journey"
        description="A curated directory of the services newcomers most often need — vetted, organized by what you're trying to do, and labelled honestly. Some are partnerships that help keep ImmigrationClock free."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/resources", label: "Resources" },
        ]}
        share
      />

      <div className="container-page max-w-5xl space-y-8 py-10">
        <section className="panel p-5 sm:p-6">
          <h2 className="text-base font-semibold text-white">Not sure where to start?</h2>
          <p className="mt-1 text-sm text-slate-400">
            See the data and the services tailored to your situation on the{" "}
            <Link href="/for-you" className="link-accent">
              For You
            </Link>{" "}
            page.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PERSONA_LINKS.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:border-accent/40 hover:text-accent-soft"
              >
                {l.label} →
              </Link>
            ))}
          </div>
        </section>

        {groups.map((group) => (
          <div key={group.category} className="space-y-3">
            <div>
              <h2 className="text-lg font-bold text-white">{CATEGORY_META[group.category].label}</h2>
              <p className="mt-0.5 text-sm text-slate-400">{CATEGORY_META[group.category].blurb}</p>
            </div>
            <ResourcePanel
              partners={group.partners}
              placement={`resources-${group.category}`}
              title={CATEGORY_META[group.category].label}
              subtitle={CATEGORY_META[group.category].blurb}
            />
          </div>
        ))}

        <MethodologyNote>
          ImmigrationClock is a data project, not a law firm or financial advisor. This directory points to
          independent third-party services; some links are partnerships that may earn us a commission at no
          extra cost to you. We list only services a newcomer would plausibly want, but inclusion is not an
          endorsement of any specific outcome. See our{" "}
          <Link href="/disclosure" className="link-accent">
            advertising &amp; affiliate disclosure
          </Link>
          .
        </MethodologyNote>
      </div>
    </div>
  );
}
