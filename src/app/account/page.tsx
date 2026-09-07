// =============================================================================
// /account — the account surface, and the only place identity is managed
//
// WHAT THIS PAGE USED TO SAY, AND WHY IT WAS WRONG
// ------------------------------------------------
// "ImmigrationClock has no accounts for reading. This page exists only to show
// the state of a Pro subscription." Both sentences were true and the paragraph
// was misleading: read quickly, it says there are no accounts. Combined with a
// header that offered no sign-in, no account and no sign-out, a person who had
// verified an email and paid could reasonably conclude the site had lost them.
//
// The distinction the copy now draws is the real one: READING NEEDS NO ACCOUNT,
// and an account exists for the things that follow a person rather than a
// browser — Pro, follows across devices, the newsletter, and billing.
//
// IT READS THE STORE, NOT ONLY THE COOKIE. The signed claim says who this
// browser belongs to; the subscriber record is what Stripe actually wrote, and
// it is the only place that knows whether a subscription renews or ends, and
// what the person answered about the newsletter.
//
// DYNAMIC, AND EXCLUDED FROM SEARCH. It reads a cookie, so it cannot be
// prerendered, and it is noindex because a page whose content depends on who is
// asking has nothing to offer an index.
// =============================================================================

import Link from "next/link";
import { cookies } from "next/headers";
import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { AccountActivation } from "@/components/AccountActivation";
import { ManageBillingButton } from "@/components/ManageBillingButton";
import { SignInForm } from "@/components/SignInForm";
import { SignOutButton } from "@/components/SignOutButton";
import { COOKIE_NAME, verify } from "@/lib/billing/entitlement";
import { billingStatus } from "@/lib/billing/config";
import { availableNow, capabilitiesAddedBy, roadmap } from "@/lib/billing/plans";
import { emailKey, resolveStore, storeConfigured, type SubscriberRecord } from "@/lib/billing/store";
import { ANONYMOUS_ACCOUNT, accountStateFor, accountStatusLabel } from "@/lib/billing/account-state";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Your account",
  description: "Your ImmigrationClock account: sign in, subscription, syncing, newsletter and billing.",
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-200">{children}</dd>
    </div>
  );
}

export default async function AccountPage() {
  const status = billingStatus();
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  const now = Math.floor(Date.now() / 1000);
  const entitlement = verify(cookies().get(COOKIE_NAME)?.value, secret, now);

  // The authoritative record, when there is a verified identity to look up.
  //
  // `storeRead` IS NOT THE SAME QUESTION AS `record !== null`. A read that
  // failed and a read that found nothing both produce null, and rendering them
  // the same way told a paying subscriber caught by one KV timeout that they
  // had a free account and should upgrade. The two are tracked separately and
  // the resolver is told which happened.
  let record: SubscriberRecord | null = null;
  let storeRead = true;
  if (entitlement?.email && secret) {
    const store = resolveStore();
    if (!store) {
      storeRead = false;
    } else {
      try {
        record = await store.getSubscriber(emailKey(entitlement.email, secret));
      } catch {
        // A store that cannot answer must not blank the page, and must not
        // answer for it either. The claim alone still names the person.
        record = null;
        storeRead = false;
      }
    }
  }

  const account = secret
    ? accountStateFor(entitlement, record, now, { storeRead })
    : ANONYMOUS_ACCOUNT;
  const signedIn = account.status !== "anonymous";

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title={signedIn ? "Your account" : "Sign in"}
        description="Reading ImmigrationClock never needs an account. An account is for Pro, keeping your follows across devices, the newsletter and billing."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/account", label: "Account" },
        ]}
      />

      <div className="container-page max-w-3xl space-y-6 py-10">
        <AccountActivation />

        {signedIn ? (
          <section className="panel panel-pad" aria-labelledby="account-heading">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="account-heading" className="section-title">
                {accountStatusLabel(account)}
              </h2>
              {account.isPro ? (
                <span className="rounded-full border border-status-green/30 bg-status-green/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-green">
                  Pro
                </span>
              ) : null}
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Row label="Signed in as">
                <span className="break-all">{account.email}</span>
              </Row>

              {account.paidThrough ? (
                <Row label={account.renews ? "Renews on" : account.isPro ? "Access runs to" : "Ended"}>
                  <span className="font-semibold text-white">{formatDate(account.paidThrough)}</span>
                </Row>
              ) : null}

              <Row label="Follows">
                {!account.confirmed ? (
                  <>
                    Could not be checked
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Your follows are safe either way — nothing is deleted by a failed check.
                    </span>
                  </>
                ) : account.isPro ? (
                  <>
                    <span className="text-status-green">Synced to your account</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      The same list on every device you sign in on.
                    </span>
                  </>
                ) : (
                  <>
                    Saved in this browser only
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Pro keeps the same list on every device.
                    </span>
                  </>
                )}
              </Row>

              {/* THREE ANSWERS, NOT TWO. Collapsing "declined" and "never
                  asked" into "Not subscribed" states something we do not know:
                  the consent record only covers the checkout checkbox, so
                  somebody who signed up through the newsletter form has no
                  entry here and would be told they are not subscribed when
                  they are. Saying "no preference recorded" is the true thing,
                  and it is also what keeps this page from being a place where
                  consent can silently change. */}
              <Row label="Newsletter">
                {account.newsletter === "subscribed" ? (
                  <>
                    <span className="text-status-green">Subscribed</span> to Immigration Pulse
                    <span className="mt-0.5 block text-xs text-slate-500">
                      You asked for it when you subscribed. Unsubscribe from any issue — the link is
                      in every email.
                    </span>
                  </>
                ) : account.newsletter === "declined" ? (
                  <>
                    Not subscribed
                    <span className="mt-0.5 block text-xs text-slate-500">
                      You declined at checkout. The weekly email is free, with or without Pro —{" "}
                      <Link href="/pulse" className="underline decoration-dotted hover:text-slate-300">
                        sign up any time
                      </Link>
                      .
                    </span>
                  </>
                ) : (
                  <>
                    No preference recorded here
                    <span className="mt-0.5 block text-xs text-slate-500">
                      If you signed up through the newsletter form, that subscription is managed from
                      the emails themselves, not from this page.{" "}
                      <Link href="/pulse" className="underline decoration-dotted hover:text-slate-300">
                        Immigration Pulse
                      </Link>{" "}
                      is free either way.
                    </span>
                  </>
                )}
              </Row>
            </dl>

            {!account.confirmed ? (
              <p className="mt-4 rounded-lg border border-status-amber/25 bg-status-amber/[0.06] px-3 py-2 text-xs leading-relaxed text-slate-300">
                We could not reach the subscription service just now, so this page is showing what
                your last confirmed sign-in said. Nothing has changed — reload in a moment. If you
                are a subscriber, your access and your synced follows are unaffected.
              </p>
            ) : null}

            {account.status === "cancelling" && account.paidThrough ? (
              <p className="mt-4 rounded-lg border border-status-amber/25 bg-status-amber/[0.06] px-3 py-2 text-xs leading-relaxed text-slate-300">
                Your subscription is cancelled and will not renew. Pro keeps working until{" "}
                {formatDate(account.paidThrough)}.
              </p>
            ) : null}

            {account.isPro ? (
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
                </ul>
                {roadmap().length > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Other capabilities are on the roadmap and are not part of Pro today.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-start gap-4 border-t border-white/5 pt-4">
              {account.hasBilling ? (
                <div>
                  <ManageBillingButton />
                  <p className="mt-2 text-xs text-slate-500">
                    Cancel, change your card or download invoices on Stripe&rsquo;s billing page.
                  </p>
                </div>
              ) : null}

              {/* `confirmed` GATES THIS, not just `isPro`. During a store
                  outage we cannot tell a subscriber from a free reader, and
                  the wrong guess here asks somebody to buy what they already
                  own. Checkout would refuse the duplicate with a 409, but the
                  offer should never be made in the first place. */}
              {!account.isPro && account.confirmed && status.checkoutReady ? (
                <div>
                  <Link
                    href="/pricing"
                    className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft"
                  >
                    Upgrade to Pro
                  </Link>
                  <p className="mt-2 text-xs text-slate-500">
                    {capabilitiesAddedBy("pro").length === 1
                      ? "Adds one capability to the free platform."
                      : "Adds to the free platform. It does not lock any of it."}
                  </p>
                </div>
              ) : null}
            </div>

            {/* WHAT ACTUALLY CROSSES DEVICES, SAID OUT LOUD.
                A sync feature that does not say what it covers is one people
                discover the edges of by losing something. Each line here is a
                statement about a specific store, and each is true of the code
                on the other side of it: the watchlist route reads and writes
                KV; follows for a non-Pro reader never leave localStorage; the
                consent record is written against the verified identity and the
                Resend contact is not readable from this page. */}
            <div className="mt-5 border-t border-white/5 pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                What follows you, and what stays on this device
              </h3>
              <dl className="mt-2 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-semibold text-slate-300">On your account</dt>
                  <dd className="mt-1 text-slate-500">
                    Your subscription and its dates, the Stripe customer behind it, your newsletter
                    answer{account.isPro ? ", and your follows" : ""}. These come back on any device
                    you sign in on.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-300">On this device only</dt>
                  <dd className="mt-1 text-slate-500">
                    {account.isPro
                      ? "Your cookie consent choice, and this browser's copy of your follows."
                      : "Your follows and your cookie consent choice. Clearing this browser clears them."}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="mt-5 border-t border-white/5 pt-4">
              <SignOutButton />
            </div>
          </section>
        ) : (
          <section className="panel panel-pad" aria-labelledby="signin-heading">
            <h2 id="signin-heading" className="section-title">
              Sign in with your email
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              No password. We email you a link that signs you in on this device. Use the same address
              every time and your Pro subscription, your follows and your settings follow you.
            </p>

            {storeConfigured() ? (
              <div className="mt-4">
                <SignInForm />
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Sign-in is not configured on this deployment yet.
              </p>
            )}

            <div className="mt-6 border-t border-white/5 pt-5">
              <h3 className="text-sm font-semibold text-white">You do not need an account to read</h3>
              <p className="mt-1 text-sm text-slate-400">
                Every recorded change, the employer directory, the layoff feed, the API and the weekly
                newsletter are open to everyone, signed in or not. Following things works here too — it
                is saved in this browser.
              </p>
              <p className="mt-2 text-sm text-slate-400">
                An account is for what should follow <em>you</em> rather than a browser: Pro, the same
                follows on every device, newsletter settings, and billing.
              </p>
              <Link
                href="/pricing"
                className="mt-4 inline-block rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-accent/40 hover:text-accent-soft"
              >
                See what Pro costs
              </Link>
            </div>
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
