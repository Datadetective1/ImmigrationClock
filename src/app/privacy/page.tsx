import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { ContactLink } from "@/components/ContactLink";
import { SITE } from "@/lib/site";

export const metadata = buildMetadata({
  title: "Privacy Policy",
  description:
    "How ImmigrationClock handles data, cookies, and advertising — including Google AdSense and third-party ad partners.",
  path: "/privacy",
});

const UPDATED = "June 13, 2026";

export default function PrivacyPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        description={`Last updated ${UPDATED}.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/privacy", label: "Privacy" },
        ]}
      />

      <div className="container-page max-w-3xl space-y-8 py-10 text-sm leading-relaxed text-slate-300 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-white [&_a]:text-accent">
        <section className="space-y-3">
          <p>
            {SITE.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates {SITE.url}. This policy explains what
            information we and our partners collect when you visit, and the choices you have. We aim to
            collect as little as possible: the site presents aggregated public data and does not require an
            account.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Information we collect</h2>
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              <strong>No accounts for reading.</strong> You never have to register to read anything
              here, and the search box runs in your browser and is not sent to us.
            </li>
            <li>
              <strong>Your email, only if you give it to us.</strong> If you subscribe to the
              newsletter we store your address with our email provider (Resend) so that we can send
              it to you. Nothing else about you is attached to it, and every issue carries an
              unsubscribe link.
            </li>
            <li>
              <strong>Payment details never reach us.</strong> If you subscribe to Pro, checkout and
              billing are handled entirely by Stripe, who collect your name, email and card in order
              to take the payment. We receive confirmation that a subscription is active, the billing
              email address, and a Stripe customer reference. We never see or store your card.
            </li>
            <li>
              <strong>Standard server/usage logs.</strong> Our hosting provider (Vercel) may record technical
              data such as IP address, browser type, and pages requested, for security and reliability.
            </li>
            <li>
              <strong>Cookies and similar technologies</strong> set by us and by third parties (see below).
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2>Advertising &amp; cookies</h2>
          <p>
            <strong>We do not display advertising.</strong> There is no advertising code on this site
            and no advertising network is loaded. If that ever changes, this section will say so
            before it happens rather than after.
          </p>
          <p>
            Some pages link to services a newcomer may need. Those links are labelled, marked{" "}
            <code>rel=&quot;sponsored&quot;</code>, and explained on our{" "}
            <a href="/disclosure">disclosure page</a>. They set no cookies here.
          </p>
          <p>
            The only measurement we run is Plausible, which is cookieless and records no personal
            data. If a Google Analytics id is ever configured for a deployment, it loads only after
            you accept the cookie banner.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Your choices &amp; rights</h2>
          <p>
            Depending on where you live (e.g. under GDPR or CCPA/CPRA), you may have rights to access,
            delete, or restrict the use of personal data. The only personal data we hold is a
            newsletter address, if you gave us one, and the billing email and customer reference for
            a subscription, if you have one. Unsubscribe from any issue to remove the first; cancel
            and ask us to delete to remove the second. We do not sell or share personal data for
            targeted advertising, and we have nothing to sell or share it with.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Children</h2>
          <p>This site is not directed to children under 13, and we do not knowingly collect their data.</p>
        </section>

        <section className="space-y-3">
          <h2>Changes &amp; contact</h2>
          <p>
            We may update this policy; material changes will be reflected by the &ldquo;last updated&rdquo;
            date above. Questions? Contact{" "}
            <ContactLink />.
          </p>
        </section>
      </div>
    </div>
  );
}
