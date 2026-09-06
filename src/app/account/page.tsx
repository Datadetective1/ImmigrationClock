// =============================================================================
// /account — the whole subscriber surface
//
// Deliberately small. It answers three questions and does nothing else: is
// there a subscription on this browser, when does it run to, and where do I
// cancel. Cancellation, cards, invoices and receipts are Stripe's Customer
// Portal — building any of that here would mean holding more personal data than
// this site has ever held.
//
// DYNAMIC, AND EXCLUDED FROM SEARCH. It reads a cookie, so it cannot be
// prerendered, and it is noindex because a page whose content depends on who is
// asking has nothing to offer an index. It is the only page on the site that is
// not static, apart from the API routes.
// =============================================================================

import Link from "next/link";
import { cookies } from "next/headers";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { AccountActivation } from "@/components/AccountActivation";
import { ManageBillingButton } from "@/components/ManageBillingButton";
import { SignInForm } from "@/components/SignInForm";
import { COOKIE_NAME, isActive, verify } from "@/lib/billing/entitlement";
import { billingStatus } from "@/lib/billing/config";
import { STATUS_LABEL, availableNow, capabilitiesAddedBy, notYetAvailable } from "@/lib/billing/plans";
import { storeConfigured } from "@/lib/billing/store";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Your subscription",
  description: "The state of your ImmigrationClock Pro subscription on this browser.",
  path: "/account",
  noindex: true,
});

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function AccountPage() {
  const status = billingStatus();
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  const now = Math.floor(Date.now() / 1000);
  const entitlement = verify(cookies().get(COOKIE_NAME)?.value, secret, now);
  const active = isActive(entitlement, now);

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Your subscription"
        description="ImmigrationClock has no accounts for reading. This page exists only to show the state of a Pro subscription and to open the billing page Stripe hosts."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/account", label: "Account" },
        ]}
      />

      <div className="container-page max-w-3xl space-y-6 py-10">
        <AccountActivation />

        {active && entitlement ? (
          <section className="panel panel-pad" aria-labelledby="sub-heading">
            <h2 id="sub-heading" className="section-title">
              Pro — active
            </h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-wide text-slate-500">Paid through</dt>
                {/* THE PAID PERIOD, NOT THE CLAIM'S EXPIRY. The signed cookie is
                    deliberately short-lived (MAX_TTL_DAYS), and rendering that
                    told someone who had just paid $190 for a year that their
                    access ran out in thirty days. `periodEnd` is Stripe's own
                    period end; `exp` is only how long this browser's claim
                    lasts before it is re-minted. */}
                <dd className="mt-0.5 text-sm font-semibold text-white">
                  {formatDate(entitlement.periodEnd ?? entitlement.exp)}
                </dd>
              </div>
              {entitlement.email ? (
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-slate-500">Billed to</dt>
                  <dd className="mt-0.5 truncate text-sm text-slate-200">{entitlement.email}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-5">
              <ManageBillingButton />
              <p className="mt-2 text-xs text-slate-500">
                Cancel, change your card or download invoices on Stripe&rsquo;s billing page. Cancelling
                keeps Pro until the date above and does not renew.
              </p>
            </div>

            <div className="mt-5 border-t border-white/5 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                What your subscription does today
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {availableNow("pro").map((c) => (
                  <li key={c.id} className="text-slate-300">
                    <span className="text-status-green" aria-hidden>
                      ✓
                    </span>{" "}
                    {c.label}
                  </li>
                ))}
                {notYetAvailable("pro").map((c) => (
                  <li key={c.id} className="text-slate-500">
                    <span aria-hidden>·</span> {c.label}{" "}
                    <span className="text-status-amber">({STATUS_LABEL[c.status].toLowerCase()})</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                You are not charged again for the ones still in build.
              </p>
            </div>
          </section>
        ) : (
          <section className="panel panel-pad" aria-labelledby="none-heading">
            <h2 id="none-heading" className="section-title">
              No subscription on this browser
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              The whole public platform works without one, and always will. Pro adds monitoring and
              bulk work on top of it.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              {capabilitiesAddedBy("pro").map((c) => (
                <li key={c.id}>
                  <span className="font-medium text-white">{c.label}</span>
                  <span className="block text-xs text-slate-400">{c.blurb}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/pricing"
              className="mt-5 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft"
            >
              See what Pro costs
            </Link>

            {storeConfigured() ? (
              <div className="mt-6 border-t border-white/5 pt-5">
                <h3 className="text-sm font-semibold text-white">Already subscribed?</h3>
                <p className="mt-1 text-sm text-slate-400">
                  If you subscribed on another device, or cleared this browser, get a sign-in link by
                  email.
                </p>
                <div className="mt-3">
                  <SignInForm />
                </div>
              </div>
            ) : null}
          </section>
        )}

        {!status.checkoutReady ? (
          <p className="text-xs text-slate-500">
            Billing is not switched on for this deployment yet, so nothing here can be purchased.
          </p>
        ) : status.testMode ? (
          <p className="text-xs text-status-amber">
            Stripe is in test mode on this deployment. No real card will be charged.
          </p>
        ) : null}
      </div>
    </div>
  );
}
