// =============================================================================
// /trial: 30 days of ImmigrationClock Pro, free, for anyone trying it
//
// The trial length comes from the "free-trial" offer in
// src/lib/billing/offers.ts, so the words and the charge cannot drift apart.
// No coupon: after the trial the ordinary price applies. One trial per
// account; the checkout route refuses it to a returning subscriber.
// =============================================================================

import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { NewsletterOptInGroup, UpgradeButton } from "@/components/UpgradeButton";
import { PurchasePanel } from "@/components/PurchasePanel";
import { PLAN_BY_ID, availableNow } from "@/lib/billing/plans";
import { offerById, offerIsOpen } from "@/lib/billing/offers";
import { billingStatus } from "@/lib/billing/config";

const offer = offerById("free-trial");
const pro = PLAN_BY_ID.get("pro")!;

export const metadata = buildMetadata({
  title: `Try ImmigrationClock Pro free for ${offer.trialDays} days`,
  description: `${offer.trialDays} days of ImmigrationClock Pro at no cost: daily alerts on what you follow, your Briefing and effective dates for your calendar. Cancel before the trial ends and pay nothing.`,
  path: offer.path,
});

const STEPS: [string, string, string][] = [
  ["1", "Pick a plan", "Enter your email. The link we send opens checkout."],
  ["2", "Add a card", "Nothing is charged today."],
  ["3", "Use Pro now", `Cancel from your account within ${offer.trialDays} days and pay nothing.`],
];

export default function TrialPage() {
  const features = availableNow("pro");
  const builtReady = billingStatus().checkoutReady && offerIsOpen(offer);

  return (
    <div>
      <PageHeader
        eyebrow="ImmigrationClock Pro"
        title={`Try Pro free for ${offer.trialDays} days`}
        description={`Alerts on the rules you follow, with the official source and effective date. Then $${pro.monthlyUsd} a month or $${pro.annualUsd} a year, only if you keep it.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/pricing", label: "Pricing" },
        ]}
      />

      <div className="container-page max-w-3xl space-y-8 py-10">
        <section id="join" className="panel panel-pad" aria-labelledby="start-trial">
          <h2 id="start-trial" className="text-lg font-bold text-white">
            Start your free month
          </h2>
          <ol className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            {STEPS.map(([n, title, text]) => (
              <li key={n} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <span className="font-mono text-xs font-bold text-sky-300">{n}</span>
                <p className="mt-1 font-semibold text-white">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{text}</p>
              </li>
            ))}
          </ol>

          <PurchasePanel
            offer={offer.id}
            initialReady={builtReady}
            initialTestMode={billingStatus().testMode}
            forSale={
              <>
                <NewsletterOptInGroup>
                  <UpgradeButton
                    interval="monthly"
                    placement="trial_page"
                    offer={offer.id}
                    label={`Start free, then $${pro.monthlyUsd} a month`}
                  />
                  <UpgradeButton
                    interval="annual"
                    placement="trial_page"
                    offer={offer.id}
                    label={`Start free, then $${pro.annualUsd} a year`}
                    className="[&>button]:bg-transparent [&>button]:text-slate-200 [&>button]:ring-1 [&>button]:ring-white/15 [&>button]:hover:bg-white/5"
                  />
                </NewsletterOptInGroup>
                <p className="text-center text-[11px] leading-relaxed text-slate-500">
                  Secure checkout by Stripe. One free trial per account. After the trial it renews
                  automatically until you cancel, any time from your account. Any sales tax is shown
                  before you confirm.{" "}
                  <Link href="/terms" className="link-accent">
                    Billing terms
                  </Link>
                </p>
              </>
            }
            notForSale={
              <div className="mt-6 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-center">
                <p className="text-sm font-semibold text-slate-200">The free trial is not open yet</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Please check back soon. The free site works in the meantime, with no account.
                </p>
              </div>
            }
          />
        </section>

        <section className="panel panel-pad" aria-labelledby="what-you-get">
          <h2 id="what-you-get" className="text-lg font-bold text-white">
            What Pro adds
          </h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {features.map((f) => (
              <li key={f.id} className="font-medium text-white">
                {f.label}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">
            Everything on the free site stays free. The{" "}
            <Link href="/pricing" className="link-accent">
              pricing page
            </Link>{" "}
            describes each one.
          </p>
        </section>
      </div>
    </div>
  );
}
