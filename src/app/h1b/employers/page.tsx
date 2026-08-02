import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { Stat, StatRow } from "@/components/Stat";
import { MethodologyNote } from "@/components/MethodologyNote";
import { EmployerDirectory } from "@/components/EmployerDirectory";
import { DataStatus } from "@/components/DataStatus";
import { EMPLOYERS_META } from "@/lib/employers";
import { formatNumber } from "@/lib/format";

export const metadata = buildMetadata({
  title: "H-1B Employer Directory — Search Every Sponsor",
  description: `Search ${EMPLOYERS_META.count.toLocaleString()} U.S. H-1B sponsoring employers by name and see their reported USCIS approvals, denials, and approval rate for FY${EMPLOYERS_META.fiscalYear}.`,
  path: "/h1b/employers",
  keywords: ["H-1B employer search", "H-1B sponsors directory", "USCIS employer data hub", "H-1B approvals by employer"],
});

export default function EmployerDirectoryPage() {
  return (
    <div>
      <PageHeader
        eyebrow="H-1B employer directory"
        title="Look up any H-1B sponsor"
        description={`The reported USCIS H-1B record for ${EMPLOYERS_META.count.toLocaleString()} sponsoring employers — search by name to see approvals, denials, and approval rate. Real figures, not a sample.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/h1b/top-sponsors", label: "H-1B" },
          { href: "/h1b/employers", label: "Employer directory" },
        ]}
        share
      >
        <StatRow>
          <Stat label="Employers in directory" value={formatNumber(EMPLOYERS_META.count)} sub={`≥${EMPLOYERS_META.minApprovals} approvals`} />
          <Stat label="Data year" value={`FY${EMPLOYERS_META.fiscalYear}`} sub="Latest USCIS release" />
          <Stat label="Source" value="USCIS" sub="Employer Data Hub" />
          <Stat label="Label" value="Reported" sub="Official figures" />
        </StatRow>
      </PageHeader>

      <div className="container-page max-w-4xl space-y-8 py-10">
        <Suspense fallback={<p className="text-sm text-slate-400">Loading directory…</p>}>
          <EmployerDirectory />
        </Suspense>


        <DataStatus
          sourceKey="uscis_h1b"
          surface="employer-directory"
          provenance="reported"
          dataThrough={`FY${EMPLOYERS_META.fiscalYear}`}
          refreshedAt={EMPLOYERS_META.generatedAt.slice(0, 10)}
        />

        <MethodologyNote>
          Figures are USCIS H-1B Employer Data Hub counts of petition approvals and denials (initial plus
          continuing) for the latest available fiscal year, aggregated per employer across worksites. They
          are petition outcomes, not State Department visa issuances, and sponsorship volume does not by
          itself indicate displacement of U.S. workers.
        </MethodologyNote>
      </div>
    </div>
  );
}
