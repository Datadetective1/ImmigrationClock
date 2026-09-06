// =============================================================================
// POST /api/billing/checkout — start a Stripe Checkout Session
//
// The reader clicks "Subscribe", this creates a hosted Checkout Session and
// answers with its URL. The browser navigates there. No card, no email and no
// address ever touches this origin, which is what keeps PCI scope with Stripe
// and lets the site's CSP stay as strict as it is today.
//
// IT REFUSES RATHER THAN HALF-WORKING. Without BILLING_ENABLED="true" and every
// required secret, this answers 503 with the list of what is missing. A
// checkout that succeeded while the webhook could not verify its confirmation
// would charge people and grant nothing.
//
// NOTHING HERE CAN CHARGE A CARD BY ITSELF: creating a Checkout Session is an
// intent. The charge happens on Stripe's page, after a person enters a card and
// presses pay.
//
// -----------------------------------------------------------------------------
// THREE THINGS THIS ROUTE NOW DOES BEFORE IT TALKS TO STRIPE
// -----------------------------------------------------------------------------
//
//   1. IT REQUIRES A VERIFIED IDENTITY. Previously anyone could start a
//      checkout and type any address at Stripe, and the webhook keyed the
//      subscriber record on that typed address — so paying $19 with somebody
//      else's address took over their record, their watchlist and their access.
//      The address must now be one this site has already proved control of,
//      through the magic-link flow, before a session exists at all.
//
//   2. IT REFUSES A SECOND SUBSCRIPTION. A subscriber who came back and clicked
//      the annual button got a second Stripe customer and a second live
//      subscription, both billing the same card, with the portal able to reach
//      only the newer one. Someone who is already paying is sent to the portal.
//
//   3. IT REUSES ONE CANONICAL STRIPE CUSTOMER per identity, created here on
//      the first checkout and passed to Stripe on every one after. Writing the
//      customer -> identity index HERE, before the session exists, is also what
//      makes webhook ordering safe: whichever event arrives first can already
//      find the person.
// =============================================================================

import { BILLING_UNAVAILABLE_MESSAGE, billingOrigin, billingStatus, priceIdFor } from "@/lib/billing/config";
import { COOKIE_NAME, isVerifiedIdentity, verify } from "@/lib/billing/entitlement";
import { isInterval } from "@/lib/billing/plans";
import { StripeClient, StripeError } from "@/lib/billing/stripe";
import { emailKey, resolveStore } from "@/lib/billing/store";
import { accessForKey } from "@/lib/billing/subscription";
import { clientIp, json, rateLimited, readCookie } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Each attempt creates a Stripe object, so this is tighter than the signup route. */
const MAX_PER_MINUTE = 5;

export async function POST(req: Request): Promise<Response> {
  const status = billingStatus();
  if (!status.checkoutReady) {
    // THE DIAGNOSTIC GOES TO THE LOG, NOT TO THE CUSTOMER. This returned
    // `disabledReason` verbatim, so a visitor clicking Subscribe was shown
    // 'BILLING_ENABLED is not set to "true", so every billing surface is
    // switched off.' — nothing they can act on, and a description of how the
    // deployment is wired to everyone else.
    console.warn(
      `[billing] checkout unavailable: ${status.disabledReason ?? `missing ${status.missing.join(", ") || "nothing"}`}`
    );
    return json({ error: "billing_not_configured", message: BILLING_UNAVAILABLE_MESSAGE }, 503);
  }

  if (rateLimited(clientIp(req), MAX_PER_MINUTE)) {
    return json({ error: "rate_limited", message: "Too many attempts. Try again in a minute." }, 429);
  }

  let interval = "monthly";
  try {
    const body = (await req.json()) as { interval?: unknown };
    if (typeof body.interval === "string") interval = body.interval;
  } catch {
    // An empty or unparseable body means the default interval, not an error.
  }
  if (!isInterval(interval)) {
    return json({ error: "bad_interval", message: "interval must be \"monthly\" or \"annual\"." }, 400);
  }

  const secret = process.env.BILLING_SESSION_SECRET as string;
  const now = Math.floor(Date.now() / 1000);

  // ---- 1. WHO IS THIS? -----------------------------------------------------
  // A verified address, proved by our own magic link. Never a string typed at
  // Stripe: that is the difference between an account and an assertion.
  const identity = verify(readCookie(req, COOKIE_NAME), secret, now);
  if (!isVerifiedIdentity(identity, now)) {
    return json(
      {
        error: "identity_required",
        message: "Confirm your email address before subscribing. We will send you a link.",
      },
      401
    );
  }
  const email = identity!.email;
  const key = emailKey(email, secret);

  const store = resolveStore();
  if (!store) {
    // checkoutReady already requires the store, so this is unreachable in a
    // configured deployment. It is here because the alternative — proceeding
    // without one — is the state where duplicate protection silently does not
    // exist while cards are charged normally.
    console.error("[billing] checkout blocked: no subscriber store configured");
    return json({ error: "billing_not_configured", message: BILLING_UNAVAILABLE_MESSAGE }, 503);
  }

  const stripe = new StripeClient({ secretKey: process.env.STRIPE_SECRET_KEY as string });

  try {
    // ---- 2. ARE THEY ALREADY PAYING? ---------------------------------------
    const access = await accessForKey(store, key, now);
    if (access.pro) {
      return json(
        {
          error: "already_subscribed",
          message: "You already have an active subscription. Manage it from your account page.",
          manageUrl: `${billingOrigin()}/account`,
        },
        409
      );
    }

    // ---- 3. THE ONE CUSTOMER THIS IDENTITY OWNS ----------------------------
    let customerId = await store.getCustomerForIdentity(key);
    if (!customerId) {
      const created = await stripe.createCustomer({ email, identityKey: key });
      // NX: if two tabs raced, exactly one id becomes canonical and both use
      // it. The loser's customer is left unused rather than subscribed to.
      customerId = await store.putCustomerForIdentity(key, created.id);
    }

    // Index the customer BEFORE the session exists, so a subscription event
    // that overtakes checkout.session.completed can still find this person.
    // Without this the earlier event was dropped and answered 200, and a
    // paying customer was left with no record at all.
    await store.linkCustomer(customerId, key);

    // SEED THE RECORD WITH THE VERIFIED ADDRESS, HERE, WHERE IT IS KNOWN.
    //
    // The webhook must never learn an identity from Stripe — that is the whole
    // takeover defect. So the address is written now, from the cookie this
    // request already verified, and every later event merges status and period
    // onto it without ever touching `email`.
    //
    // A seeded record grants nothing: status "incomplete" and no period end
    // fail both halves of accessFor(). Someone who abandons checkout simply
    // leaves a row saying they once started one.
    const existing = await store.getSubscriber(key);
    if (!existing) {
      await store.putSubscriber(key, {
        email,
        customerId,
        status: "incomplete",
        currentPeriodEnd: 0,
        updatedAt: now,
      });
    } else if (existing.customerId !== customerId || existing.email !== email) {
      await store.putSubscriber(key, { ...existing, email, customerId, updatedAt: now });
    }

    const priceId = priceIdFor(interval);
    if (!priceId) {
      return json({ error: "price_not_configured", message: `No Stripe price is configured for ${interval}.` }, 503);
    }

    const origin = billingOrigin();
    const session = await stripe.createCheckoutSession({
      priceId,
      customerId,
      // Echoed back on the session event. THE WEBHOOK KEYS ON THIS.
      clientReferenceId: key,
      // {CHECKOUT_SESSION_ID} is substituted by Stripe on the redirect. The
      // account page exchanges it for an entitlement, having asked Stripe
      // whether it was genuinely paid — the id alone grants nothing.
      successUrl: `${origin}/account?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/pricing?checkout=cancelled`,
    });

    if (!session.url) {
      return json({ error: "no_checkout_url", message: "Stripe did not return a checkout URL." }, 502);
    }
    return json({ url: session.url, id: session.id, testMode: status.testMode }, 200);
  } catch (err) {
    // Never echo the Stripe error verbatim to the browser: it can name the
    // account and the key's mode. The server log carries the detail.
    const detail = err instanceof StripeError ? `HTTP ${err.status}` : "network error";
    console.error(`[billing] checkout failed: ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "checkout_failed", message: `Could not start checkout (${detail}).` }, 502);
  }
}

/** A GET is how an operator checks the wiring without creating anything. */
export async function GET(): Promise<Response> {
  const status = billingStatus();
  return json(
    {
      checkoutReady: status.checkoutReady,
      webhookReady: status.webhookReady,
      testMode: status.testMode,
      // `missing` and `disabledReason` are deliberately NOT returned here. This
      // endpoint is unauthenticated and both name environment variables. An
      // operator gets the precise list from `npm run billing:verify`, which
      // reads billingStatus() directly rather than over HTTP.
    },
    status.checkoutReady ? 200 : 503
  );
}
