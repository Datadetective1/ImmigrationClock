import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { ResourceDirectory } from "@/components/ResourcePanel";
import { partnersByCategory } from "@/lib/partners";

export const metadata = buildMetadata({
  title: "Immigration Resources: Legal Help, Translations, Taxes & Credit",
  description:
    "Official help and independent services for immigration paperwork: finding a lawyer, certified translations, degree evaluation, nonresident taxes, credit and the citizenship test.",
  path: "/resources",
  keywords: [
    "immigration resources",
    "immigration lawyer help",
    "certified translation USCIS",
    "nonresident tax filing",
    "foreign degree evaluation",
    "citizenship test study",
  ],
});

export default function ResourcesPage() {
  // Grouped by need; within a need, free official help first, then catalog
  // order. Compensation never moves a listing up.
  const partners = partnersByCategory().flatMap((g) => [
    ...g.partners.filter((p) => p.kind === "official"),
    ...g.partners.filter((p) => p.kind !== "official"),
  ]);

  return (
    <div>
      <PageHeader
        compact
        title="Resources"
        description="Services and official help for immigration paperwork, legal questions, taxes and credit, each labelled with what it is to us."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/resources", label: "Resources" },
        ]}
        share
      />

      <div className="container-page max-w-5xl space-y-6 py-5">
        <ResourceDirectory partners={partners} />
        <p className="text-sm text-slate-400">
          Looking for the data on your situation instead?{" "}
          <Link href="/for-you" className="link-accent">
            See For You
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
