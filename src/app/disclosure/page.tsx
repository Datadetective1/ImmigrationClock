import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { ContactLink } from "@/components/ContactLink";
import { SITE } from "@/lib/site";

export const metadata = buildMetadata({
  title: "Advertising & Affiliate Disclosure",
  description:
    "How ImmigrationClock makes money: display advertising and affiliate partnerships. What that means for you, and the editorial line we hold so the data stays trustworthy.",
  path: "/disclosure",
});

const UPDATED = "June 18, 2026";

export default function DisclosurePage() {
  return (
    <div>
      <PageHeader
        eyebrow="Legal"
        title="Advertising & affiliate disclosure"
        description={`How we keep the data free — and the line we hold so it stays trustworthy. Last updated ${UPDATED}.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/disclosure", label: "Disclosure" },
        ]}
      />

      <div className="container-page max-w-3xl space-y-8 py-10 text-sm leading-relaxed text-slate-300 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_a]:text-accent">
        <section className="space-y-3">
          <p>
            {SITE.name} is free to read and does not require an account. To cover the cost of building and
            maintaining it, we earn money two ways, both disclosed here in plain language as the U.S. Federal
            Trade Commission (FTC) recommends.
          </p>
        </section>

        <section className="space-y-3">
          <h2>1. Display advertising</h2>
          <p>
            We may show ads through Google AdSense and similar networks. These are labelled
            &ldquo;Advertisement&rdquo; and are served by third parties — we don&rsquo;t hand-pick individual
            ads. How advertising cookies work and how to opt out is covered in our{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </section>

        <section className="space-y-3">
          <h2>2. Affiliate &amp; partner links</h2>
          <p>
            On our <Link href="/resources">Resources</Link> page and in the &ldquo;Helpful services&rdquo;
            modules beside our data, we link to independent third-party services — things like
            attorney-reviewed immigration applications, international money transfer, nonresident tax filing,
            newcomer banking, and student health insurance.
          </p>
          <p>
            Some of those are <strong>affiliate partnerships</strong>: if you click through and sign up or
            make a purchase, we may earn a commission or referral fee. <strong>It never costs you extra</strong>{" "}
            — the price is the same as going direct, and in some cases partners offer our readers a better deal.
          </p>
          <p>Partner placements are labelled <strong>&ldquo;Partner&rdquo;</strong> and open in a new tab.</p>
        </section>

        <section className="space-y-3">
          <h2>The editorial line we hold</h2>
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              <strong>Money never touches the data.</strong> No advertiser or partner can change, hide, or
              influence a single number, source, or chart on this site. The data is computed from public
              government datasets exactly as documented in our{" "}
              <Link href="/methodology">methodology</Link>.
            </li>
            <li>
              <strong>We only list services a newcomer would actually want.</strong> We don&rsquo;t fill the
              page with whoever pays the most; relevance comes first.
            </li>
            <li>
              <strong>Inclusion isn&rsquo;t endorsement.</strong> Listing a service is not a recommendation of
              any particular outcome, and nothing here is legal, immigration, tax, or financial advice. For
              your own case, consult a qualified professional.
            </li>
            <li>
              <strong>You&rsquo;re always free to go direct.</strong> Every partner can be reached without our
              link; using ours is simply how readers can support the project at no cost to themselves.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2>Questions</h2>
          <p>
            If anything here is unclear, or you believe a listing is inaccurate, contact{" "}
            <ContactLink /> and we&rsquo;ll review it.
          </p>
        </section>
      </div>
    </div>
  );
}
