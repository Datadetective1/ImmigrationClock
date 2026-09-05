// =============================================================================
// POST /api/billing/portal — hand the subscriber to Stripe's Customer Portal
//
// Cancellations, card updates, invoices and receipts are Stripe's job. Building
// any of that here would mean holding more data, writing more forms and being
// the place a refund argument lands. The portal is one API call and it is the
// single best reason to prefer hosted Checkout in the first place.
//
// The customer id comes from the signed entitlement cookie and from nowhere
// else. Reading it from the request body would let anyone open anyone's billing
// portal by guessing a customer id — the classic insecure-direct-object hole.
// =============================================================================

import { BILLING_UNAVAILABLE_MESSAGE, billingOrigin, billingStatus } from "@/lib/billing/config";
import { COOKIE_NAME, verify } from "@/lib/billing/entitlement";
import { StripeClient, StripeError } from "@/lib/billing/stripe";
import { clientIp, json, rateLimited, readCookie } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_MINUTE = 10;

export async function POST(req: Request): Promise<Response> {
  const status = billingStatus();
  if (!status.checkoutReady) {
    return json(
      { error: "billing_not_configured", message: BILLING_UNAVAILABLE_MESSAGE },
      503
    );
  }

  if (rateLimited(clientIp(req), MAX_PER_MINUTE)) {
    return json({ error: "rate_limited", message: "Too many attempts. Try again in a minute." }, 429);
  }

  const entitlement = verify(
    readCookie(req, COOKIE_NAME),
    process.env.BILLING_SESSION_SECRET as string,
    Math.floor(Date.now() / 1000)
  );

  if (!entitlement?.customerId) {
    return json(
      { error: "not_a_subscriber", message: "No active subscription is associated with this browser." },
      401
    );
  }

  const stripe = new StripeClient({ secretKey: process.env.STRIPE_SECRET_KEY as string });
  try {
    const session = await stripe.createPortalSession({
      customerId: entitlement.customerId,
      returnUrl: `${billingOrigin()}/account`,
    });
    return json({ url: session.url }, 200);
  } catch (err) {
    const detail = err instanceof StripeError ? `HTTP ${err.status}` : "network error";
    console.error(`[billing] portal failed: ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "portal_failed", message: `Could not open the billing portal (${detail}).` }, 502);
  }
}
