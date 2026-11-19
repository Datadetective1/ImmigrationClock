// =============================================================================
// /visa-bulletin-alerts : the free alert, on its own page
//
// The place every alert email and the confirmation link point back to. After
// a confirmation the page opens with "You're confirmed" (?confirmed=1, no
// category or country in the address, so nothing about the reader reaches
// page analytics) and the Pro free trial.
// =============================================================================

import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { BulletinAlertSignup } from "@/components/BulletinAlertSignup";
import { ChromeExtensionPanel } from "@/components/AddToChromeButton";
import { Faq } from "@/components/Faq";
import { buildMetadata } from "@/lib/seo";
import { ogImagePath } from "@/lib/share";
import { offerById } from "@/lib/billing/offers";
import { ALERTS_PAGE_PATH } from "@/lib/bulletin-alerts/options";
import { VISA_BULLETIN_PATH, latestBulletin } from "@/lib/visa-bulletin";
import { WAIT_TIME_PATH } from "@/lib/visa-bulletin/wait-time";

const TRIAL_DAYS = offerById("free-trial").trialDays;
const latest = latestBulletin();

export const metadata = buildMetadata({
  title: "Free Visa Bulletin Email Alerts by Category and Country",
  description:
    "Get a free email when ImmigrationClock publishes each new Visa Bulletin month, with the final action date and date for filing for your category and country.",
  path: ALERTS_PAGE_PATH,
  image: ogImagePath("page", "visa-bulletin"),
  keywords: ["visa bulletin alerts", "visa bulletin email", "priority date alert", "EB-2 India visa bulletin alert"],
});

export default function AlertsPage({ searchParams }: { searchParams?: { confirmed?: string } }) {
  const confirmed = searchParams?.confirmed === "1";
  return (
    <div>
      <PageHeader
        compact
        eyebrow="Free alerts"
        title="Visa Bulletin email alerts"
        description="The two dates for your category and country, by email, each time we publish a new Visa Bulletin month."
        crumbs={[
          { href: "/", label: "Home" },
          { href: VISA_BULLETIN_PATH, label: "Visa Bulletin" },
          { href: ALERTS_PAGE_PATH, label: "Email alerts" },
        ]}
      />

      <div className="container-page max-w-3xl space-y-6 py-6 sm:py-8">
        {confirmed ? (
          <section role="status" className="panel panel-pad" data-testid="alert-confirmed">
            <p className="text-lg font-semibold text-white">You&apos;re confirmed.</p>
            <p className="mt-1 text-sm text-slate-300">
              We just emailed you the dates for your category and country in the {latest?.label ?? "latest"} bulletin.
              The next email comes when we publish the next month.
            </p>
            <p className="mt-3 text-sm text-slate-400">
              Want to know when your own priority date may be reached? Pro gives you a forecast by month for your date,
              alerts on a watchlist of policy changes, and your Briefing.
            </p>
            <Link
              href="/trial"
              className="mt-3 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-soft"
            >
              Try Pro free for {TRIAL_DAYS} days
            </Link>
          </section>
        ) : null}

        <BulletinAlertSignup
          placement="alerts-page"
          trialDays={TRIAL_DAYS}
          heading={confirmed ? "Sign up another address" : "Get the new dates by email"}
        />

        <section className="panel panel-pad text-sm text-slate-300">
          <h2 className="text-base font-bold text-white">What you get</h2>
          <ul className="mt-2 list-inside list-disc space-y-1.5">
            <li>One email when we publish each new Visa Bulletin month on ImmigrationClock.</li>
            <li>The final action date and the date for filing for your category and country, and how each moved since the month before.</li>
            <li>Links to the official State Department bulletin and to the full table here.</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            Every date is typed from the official bulletin and checked before it is published here, so an alert can
            arrive a little after the State Department releases a bulletin. See every category on the{" "}
            <Link href={WAIT_TIME_PATH} className="link-accent">
              green card wait times
            </Link>{" "}
            page.
          </p>
        </section>

        <ChromeExtensionPanel
          placement="alerts-page"
          what="Prefer your browser? The free extension shows your dates in one click, with an alert each time we add a new bulletin month."
        />

        <Faq
          items={[
            {
              q: "What do you store?",
              a: "Your email address, the category and country you picked, and when you agreed to the emails. Nothing else, and nothing at all until you click the confirmation link.",
            },
            {
              q: "How do I stop the emails?",
              a: "Every email has a one-click unsubscribe link. Using it deletes your address, category and country.",
            },
            {
              q: "Can I change my category or country?",
              a: "Sign up again with the same address and pick the new one. Your newest confirmed choice replaces the old one.",
            },
            {
              q: `What does Pro add?`,
              a: `A forecast by month for your own priority date, email alerts on a watchlist of policy changes, and your Briefing. Pro is free for the first ${TRIAL_DAYS} days.`,
            },
          ]}
        />
      </div>
    </div>
  );
}
