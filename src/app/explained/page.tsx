import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ExplainList } from "@/components/ExplainList";
import { EXPLAINERS } from "@/lib/explainers";
import { EXPLAINERS as EDITORIAL_EXPLAINERS } from "@/lib/editorial/explainers";
import { explainerPath, ogImagePath } from "@/lib/share";
import { EXPLAINER_GROUP_LABEL } from "@/lib/stories";

export const metadata = buildMetadata({
  title: "Immigration Data, Explained — Simple, Technical, or Methodology",
  description:
    "Plain-language explanations of border encounters, ICE arrests vs removals vs detention, H-1B, visa issuance and WARN layoffs.",
  path: "/explained",
  image: ogImagePath("page", "explained"),
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

        {/* The editorial explainers: each one is a page of its own with a
            closed, source-backed fact set (src/lib/editorial/explainers.ts).
            Listed here so the hub is where a reader finds them, not only a
            social post. */}
        <section aria-labelledby="explainers-heading" className="space-y-4">
          <div>
            <h2 id="explainers-heading" className="section-title">
              Explainers
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Short, source-backed explanations of the distinctions immigration news gets wrong most
              often. Each one cites the government source it was written from and links the records
              it helps read.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {EDITORIAL_EXPLAINERS.map((e) => (
              <li key={e.slug}>
                <Link
                  href={explainerPath(e.slug)}
                  className="block h-full rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-accent/40"
                >
                  <span className="eyebrow mb-1 block text-slate-500">{EXPLAINER_GROUP_LABEL[e.group]}</span>
                  <span className="block text-base font-semibold text-white">{e.title}</span>
                  <span className="mt-1 block text-sm text-slate-400">{e.kicker}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>


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
