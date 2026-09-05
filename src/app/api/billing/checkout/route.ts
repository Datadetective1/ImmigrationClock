// =============================================================================
// POST /api/billing/checkout — start a Stripe Checkout Session
//
// The reader clicks "Upgrade", this creates a hosted Checkout Session and
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
// =============================================================================

import { BILLING_UNAVAILABLE_MESSAGE, billingOrigin, billingStatus, priceIdFor } from "@/lib/billing/config";
import { isInterval } from "@/lib/billing/plans";
import { StripeClient, StripeError } from "@/lib/billing/stripe";
import { clientIp, json, rateLimited } from "@/lib/billing/http";

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

  const priceId = priceIdFor(interval);
  if (!priceId) {
    return json({ error: "price_not_configured", message: `No Stripe price is configured for ${interval}.` }, 503);
  }

  const origin = billingOrigin();
  const stripe = new StripeClient({ secretKey: process.env.STRIPE_SECRET_KEY as string });

  try {
    const session = await stripe.createCheckoutSession({
      priceId,
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
