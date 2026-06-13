import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
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
              <strong>No accounts, no personal submissions.</strong> We do not ask you to register, and we do
              not collect names, emails, or payment details. The search box runs in your browser and is not
              sent to us.
            </li>
            <li>
              <strong>Standard server/usage logs.</strong> Our hosting provider (Netlify) may record technical
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
            We use <strong>Google AdSense</strong> to display ads. Third-party vendors, including Google, use
            cookies to serve ads based on your prior visits to this and other websites.
          </p>
          <ul className="list-inside list-disc space-y-1.5">
            <li>
              Google&rsquo;s use of advertising cookies enables it and its partners to serve ads to you based on
              your visits to this and/or other sites.
            </li>
            <li>
              You may opt out of personalized advertising by visiting{" "}
              <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer">
                Google Ads Settings
              </a>
              , or opt out of some third-party vendors&rsquo; use of cookies at{" "}
              <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">
                aboutads.info/choices
              </a>
              .
            </li>
            <li>
              For more on how Google uses data from sites that use its services, see{" "}
              <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
                Google&rsquo;s Partner Sites policy
              </a>
              .
            </li>
          </ul>
          <p>
            Visitors in the EEA, UK, and Switzerland are shown a consent choice before personalized ads load.
            You can change your choice at any time using the cookie controls on the site.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Your choices &amp; rights</h2>
          <p>
            Depending on where you live (e.g. under GDPR or CCPA/CPRA), you may have rights to access, delete,
            or restrict use of personal data, and to opt out of the &ldquo;sale&rdquo; or &ldquo;sharing&rdquo;
            of data for targeted advertising. Because we do not collect personal data directly, most requests
            concern the advertising cookies described above, which you control through the links provided and
            your browser settings.
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
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
