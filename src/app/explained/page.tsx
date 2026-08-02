import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ExplainList } from "@/components/ExplainList";
import { EXPLAINERS } from "@/lib/explainers";

export const metadata = buildMetadata({
  title: "Immigration Data, Explained — Simple, Technical, or Methodology",
  description:
    "Plain-language explanations of the core immigration concepts — border encounters, ICE arrests vs removals vs detention, H-1B, visa issuance, WARN layoffs, and our data labels — with a reading-level toggle.",
  path: "/explained",
  keywords: [
    "immigration explained",
    "what is a border encounter",
    "H-1B explained",
    "ICE removals vs arrests",
    "immigration data definitions",
  ],
});

export default function ExplainedPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Explained"
        title="The data, in plain English"
        description="Immigration data is full of terms that are easy to misread. Pick a reading level and get the same concept explained simply, technically, or by how we measure it — no jargon required."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/explained", label: "Explained" },
        ]}
        share
      />

      <div className="container-page max-w-4xl space-y-8 py-10">
        <ExplainList items={EXPLAINERS} />


        <MethodologyNote>
          These explanations are a starting point, not legal advice. For exact definitions, reporting
          periods, and source links, see the{" "}
          <Link href="/methodology" className="link-accent">methodology</Link> and{" "}
          <Link href="/sources" className="link-accent">sources</Link> pages, and{" "}
          <Link href="/data" className="link-accent">data &amp; freshness</Link> for how current each
          source is.
        </MethodologyNote>
      </div>
    </div>
  );
}
