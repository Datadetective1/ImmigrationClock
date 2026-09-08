import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { ContactLink } from "@/components/ContactLink";
import { SITE } from "@/lib/site";
import Link from "next/link";

export const metadata = buildMetadata({
  title: "Terms of Use",
  description:
    "The terms governing use of ImmigrationClock, including Pro subscription billing, automatic renewal, cancellation and refunds.",
  path: "/terms",
});

const UPDATED = "September 7, 2026";

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

        {/* =====================================================================
            SUBSCRIPTION AND BILLING

            This page carried NO billing language at all while the site was
            selling a subscription — grep it for "refund", "cancel", "renew" or
            "charge" and every one returned nothing. That is the document a
            merchant relies on when a cardholder disputes a recurring charge,
            and it was silent on the charge existing.

            EVERY CLAIM BELOW WAS VERIFIED AGAINST THE RUNNING SYSTEM, not
            written from intention:

              • the prices match src/lib/billing/plans.ts and the Stripe Price
                objects those env vars point at;
              • "excludes tax" is what a real test-mode invoice did — $19.00
                plus $1.69 New York sales tax, charged as $20.69, tax-exclusive
                with liability on Stripe;
              • "Stripe is the merchant of record" is Managed Payments, which
                is enabled on this account and visible on every subscription
                object as managed_payments.enabled;
              • "cancellation takes effect at the end of the period" matches
                the billing portal configuration, whose subscription_cancel
                mode is "at_period_end";
              • "access continues until then" and "ends when the period ends"
                are what accessFor() actually does, exercised end to end;
              • the failed-payment sentence describes the invoice.payment_failed
                handler, which marks the record past_due WITHOUT shortening the
                paid period.

            NOT LEGAL ADVICE, and it has not been reviewed by a lawyer. It is
            accurate plain English describing what the system does, which is
            strictly better than the silence it replaces. Consumer-subscription
            rules are jurisdiction-specific — US state auto-renewal laws, the
            FTC negative-option rule, UK/EU cancellation rights — and a lawyer
            should check this before the product is scaled or marketed abroad.
            See docs/proposed-billing-terms.md for the open questions.
            ===================================================================== */}
        <section className="space-y-3">
          <h2>Pro subscriptions &amp; billing</h2>
          <p>
            Everything on the public site is free and stays free. {SITE.name} Pro is an optional paid
            subscription; you never need one to read the site, use the API, or receive the newsletter.
          </p>
          <p>
            <strong>Price.</strong> Pro is $19 per month or $190 per year. Prices are in US dollars and
            <strong> exclude sales tax or VAT</strong>, which Stripe calculates from your billing address
            and shows you on the payment page before you pay. The total you are charged may therefore be
            more than the price shown on our pricing page.
          </p>
          <p>
            <strong>Who charges you.</strong> Payment is processed by Stripe, which acts as merchant of
            record for these subscriptions. {SITE.name} never receives or stores your card details.
          </p>
          <p>
            <strong>Automatic renewal.</strong> Pro renews automatically — monthly plans every month,
            annual plans every twelve months — at the same price, until you cancel. Your card is charged
            at the start of each new period. Your current period end is shown on your{" "}
            <Link href="/account">account page</Link> at all times.
          </p>
          <p>
            <strong>Cancelling.</strong> You can cancel at any time from your{" "}
            <Link href="/account">account page</Link>, which opens Stripe&rsquo;s billing portal. You do
            not need to contact us or give a reason. Cancellation takes effect at the end of the period
            you have already paid for: <strong>you keep Pro until that date</strong> and are not charged
            again afterwards.
          </p>
          <p>
            <strong>Refunds.</strong> Because you can cancel at any time and keep access through the
            period you have paid for, we do not routinely refund part-used periods. Where the law that
            applies to you requires a refund, that law takes precedence over this paragraph. If you were
            charged in error, contact <ContactLink /> and we will put it right.
          </p>
          <p>
            <strong>If a payment fails.</strong> Stripe will retry your card. Your access continues
            through the period you have already paid for; if the payment is not recovered by the time
            that period ends, Pro access ends and the account returns to the free tier. Nothing you have
            saved is deleted.
          </p>
          <p>
            <strong>When access ends.</strong> Losing Pro stops paid features — currently syncing your
            follows across devices — and nothing else. Your account, your email address and the follows
            saved in your browser are unaffected, and you can subscribe again at any time.
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
