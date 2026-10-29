// =============================================================================
// /join/nip: the National Immigration Project member offer
//
// 90 days of Pro at no cost, then 30% off for as long as the subscription runs.
// The trial length and the coupon come from src/lib/billing/offers.ts; this
// page only states them, so the words and the charge cannot drift apart.
//
// Membership is not checked. The page says who the offer is for and is kept
// out of search results; the partner shares the link with its members.
//
// Kept out of the index and the sitemap: it is a page for one group, reached
// by a link they were sent, not something a search should surface.
// =============================================================================

import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { UpgradeButton } from "@/components/UpgradeButton";
import { PurchasePanel } from "@/components/PurchasePanel";
import { PLAN_BY_ID, availableNow } from "@/lib/billing/plans";
import { couponIdFor, discountedUsd, offerById } from "@/lib/billing/offers";
import { billingStatus } from "@/lib/billing/config";
import { SITE } from "@/lib/site";

const offer = offerById("nip-member");
const pro = PLAN_BY_ID.get("pro")!;

export const metadata = buildMetadata({
  title: `${offer.partnerName} members: ${offer.trialDays} days of Pro free`,
  description: `${offer.trialDays} days of ImmigrationClock Pro at no cost for ${offer.partnerName} members, then ${offer.percentOff}% off.`,
  path: offer.path,
  noindex: true,
});

function usd(amount: number): string {
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export default function NipOfferPage() {
  const monthly = discountedUsd(pro.monthlyUsd!, offer);
  const annual = discountedUsd(pro.annualUsd!, offer);
  const features = availableNow("pro");
  const builtReady = billingStatus().checkoutReady && couponIdFor(offer) !== null;

  return (
    <div>
      <PageHeader
        eyebrow={`For ${offer.partnerName} members`}
        title={`${offer.trialDays} days of ImmigrationClock Pro, free`}
        description={`After the trial, Pro is ${offer.percentOff}% off for as long as you keep it: ${usd(monthly)} a month or ${usd(annual)} a year, instead of ${usd(pro.monthlyUsd!)} or ${usd(pro.annualUsd!)}.`}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/pricing", label: "Pricing" },
        ]}
      />

      <div className="container-page max-w-3xl space-y-8 py-10">
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
            describes each one, and what is still being built.
          </p>
        </section>

        <section id="join" className="panel panel-pad" aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="text-lg font-bold text-white">
            How it works
          </h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-300">
            <li>Confirm your email. We send you a link that brings you back to this page.</li>
            <li>
              Choose monthly or yearly and add a card on Stripe&apos;s checkout page. Nothing is
              charged today.
            </li>
            <li>
              Pro starts right away. After {offer.trialDays} days, the discounted price begins.
              Cancel from your account page before then and you pay nothing.
            </li>
          </ol>

          <PurchasePanel
            offer={offer.id}
            initialReady={builtReady}
            initialTestMode={billingStatus().testMode}
            forSale={
              <>
                <UpgradeButton
                  interval="monthly"
                  placement="offer_nip"
                  offer={offer.id}
                  label={`Start free, then ${usd(monthly)} a month`}
                />
                <UpgradeButton
                  interval="annual"
                  placement="offer_nip"
                  offer={offer.id}
                  label={`Start free, then ${usd(annual)} a year`}
                  className="[&>button]:bg-transparent [&>button]:text-slate-200 [&>button]:ring-1 [&>button]:ring-white/15 [&>button]:hover:bg-white/5"
                />
                <p className="text-center text-[11px] text-slate-500">
                  Payment is handled by Stripe. {SITE.name} never sees your card. Prices are in US
                  dollars and exclude any sales tax, which Stripe shows you before you confirm.
                  After the trial the subscription renews until you cancel. Full{" "}
                  <Link href="/terms" className="link-accent">
                    billing terms
                  </Link>
                  .
                </p>
              </>
            }
            notForSale={
              <div className="mt-6 rounded-lg border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 text-center">
                <p className="text-sm font-semibold text-slate-200">This offer is not open yet</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  Please check back soon. The free site works in the meantime, with no account.
                </p>
              </div>
            }
          />

          <p className="mt-5 text-xs leading-relaxed text-slate-500">
            This offer is for members of the {offer.partnerName}. We don&apos;t check membership
            when you sign up, so please keep this link within the membership.
          </p>
        </section>
      </div>
    </div>
  );
}
