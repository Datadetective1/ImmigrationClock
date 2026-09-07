// =============================================================================
// POST /api/billing/portal — hand the subscriber to Stripe's Customer Portal
//
// Cancellations, card updates, invoices and receipts are Stripe's job. Building
// any of that here would mean holding more data, writing more forms and being
// the place a refund argument lands. The portal is one API call and it is the
// single best reason to prefer hosted Checkout in the first place.
//
// THE CUSTOMER IS RESOLVED FROM THE VERIFIED IDENTITY, NEVER FROM THE REQUEST.
// Reading a customer id from the body would let anyone open anyone's billing
// portal by guessing one — the classic insecure-direct-object hole.
//
// Two trusted sources, in this order:
//
//   1. The STORE, keyed on the verified address in the signed claim. This is
//      the fresher of the two, and it is why the account page can offer
//      "Manage billing" to somebody whose claim predates their first checkout.
//      Without it that button answered 401 for exactly the people who most
//      needed it — an expired subscriber wanting an invoice, or a buyer who
//      abandoned checkout and came back.
//   2. The CLAIM's own customer id, which this site minted itself. It is the
//      fallback for a store that cannot answer, so an outage does not also
//      take billing away.
//
// Both are ours. Neither is anything the caller said.
// =============================================================================

import { BILLING_UNAVAILABLE_MESSAGE, billingOrigin, billingStatus } from "@/lib/billing/config";
import { COOKIE_NAME, verify } from "@/lib/billing/entitlement";
import { StripeClient, StripeError } from "@/lib/billing/stripe";
import { emailKey, resolveStore } from "@/lib/billing/store";
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

  const secret = process.env.BILLING_SESSION_SECRET as string;
  const entitlement = verify(readCookie(req, COOKIE_NAME), secret, Math.floor(Date.now() / 1000));

  if (!entitlement?.email) {
    return json(
      { error: "not_signed_in", message: "Sign in to open your billing page." },
      401
    );
  }

  // The store first, because it is current. A failure here is not fatal: the
  // claim carries a customer this site minted, and refusing billing because KV
  // blinked would be the wrong way to fail.
  let customerId = "";
  const store = resolveStore();
  if (store) {
    try {
      const key = emailKey(entitlement.email, secret);
      customerId =
        (await store.getSubscriber(key))?.customerId ||
        (await store.getCustomerForIdentity(key)) ||
        "";
    } catch (err) {
      console.error(`[billing] portal identity lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (!customerId) customerId = entitlement.customerId;

  if (!customerId) {
    return json(
      { error: "not_a_subscriber", message: "There is no billing history on this account yet." },
      404
    );
  }

  const stripe = new StripeClient({ secretKey: process.env.STRIPE_SECRET_KEY as string });
  try {
    const session = await stripe.createPortalSession({
      customerId,
      returnUrl: `${billingOrigin()}/account`,
    });
    return json({ url: session.url }, 200);
  } catch (err) {
    const detail = err instanceof StripeError ? `HTTP ${err.status}` : "network error";
    console.error(`[billing] portal failed: ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "portal_failed", message: `Could not open the billing portal (${detail}).` }, 502);
  }
}
