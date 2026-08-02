import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { ContactLink } from "@/components/ContactLink";
import { SITE } from "@/lib/site";
import Link from "next/link";

export const metadata = buildMetadata({
  title: "Terms of Use",
  description:
    "The terms governing use of ImmigrationClock — an informational public-data dashboard that does not provide legal, immigration, or financial advice.",
  path: "/terms",
});

const UPDATED = "June 13, 2026";

export default function TermsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Legal"
        title="Terms of Use"
        description={`Last updated ${UPDATED}.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/terms", label: "Terms" },
        ]}
      />

      <div className="container-page max-w-3xl space-y-8 py-10 text-sm leading-relaxed text-slate-300 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_a]:text-accent">
        <section className="space-y-3">
          <p>
            By using {SITE.name} ({SITE.url}) you agree to these terms. If you do not agree, please do not use
            the site.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Informational use only — not advice</h2>
          <p>
            {SITE.name} presents aggregated public datasets for informational and research purposes only. It
            does <strong>not</strong> provide legal, immigration, employment, tax, or financial advice, and is
            not a substitute for a qualified professional. Do not rely on it to make legal or financial
            decisions. See our{" "}
            <Link href="/methodology">methodology</Link> for how figures are defined.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Accuracy &amp; data</h2>
          <p>
            Figures come from third-party public sources and may lag official reporting, contain errors, or be
            revised. Some values are estimates clearly labelled as such. We provide the data &ldquo;as is&rdquo;
            without warranties of accuracy, completeness, or fitness for a particular purpose. Always verify a
            number against its linked official source before relying on it.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Acceptable use</h2>
          <p>
            You agree not to use the site to harass, target, or identify individuals; to misrepresent the data
            (for example, to assert that immigrants caused specific layoffs); or to scrape it in a way that
            burdens our infrastructure. The data must not be used to make unsupported or defamatory claims.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Intellectual property &amp; external links</h2>
          <p>
            Underlying government datasets are generally in the public domain; the site&rsquo;s design, code, and
            written analysis are ours. The site links to external sources we do not control and are not
            responsible for.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, {SITE.name} and its operators are not liable for any
            damages arising from use of, or reliance on, the site or its data.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Changes &amp; contact</h2>
          <p>
            We may update these terms; continued use after changes constitutes acceptance. Questions? Contact{" "}
            <ContactLink />.
          </p>
        </section>
      </div>
    </div>
  );
}
