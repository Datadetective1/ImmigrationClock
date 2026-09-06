// =============================================================================
// POST /api/billing/activate — turn a paid checkout into an entitlement
//
// This is the only place a Pro claim is minted, and it mints one on exactly one
// condition: STRIPE says this checkout session is paid.
//
// The reader arrives at /account?session_id=cs_… after Stripe redirects them.
// That id is in the URL bar, so it is not a secret and it must not be treated
// as one — the route asks Stripe about it rather than believing it. A guessed
// or replayed id resolves to a session that is not paid, and gets nothing.
//
// What is minted: {plan, email, customerId, exp}, HMAC-signed, in an httpOnly
// cookie, expiring at the subscription's own period end and in no case more
// than MAX_TTL_DAYS away. See src/lib/billing/entitlement.ts for why a signed
// claim rather than a session row.
// =============================================================================

import { BILLING_UNAVAILABLE_MESSAGE, billingStatus } from "@/lib/billing/config";
import { MAX_TTL_DAYS, cookieFor, sessionHintCookie, sign, type Entitlement } from "@/lib/billing/entitlement";
import { StripeClient, StripeError, grantsAccess, periodEndOf } from "@/lib/billing/stripe";
import { emailKey, resolveStore } from "@/lib/billing/store";
import { mergeSubscriber } from "@/lib/billing/subscription";
import { clientIp, json, rateLimited, serializeCookie } from "@/lib/billing/http";

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

  let sessionId = "";
  try {
    const body = (await req.json()) as { sessionId?: unknown };
    if (typeof body.sessionId === "string") sessionId = body.sessionId.trim();
  } catch {
    // Fall through to the empty-id check.
  }
  // Stripe checkout session ids are `cs_` plus an opaque suffix. Checking the
  // shape here keeps obvious junk from becoming an API call.
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) {
    return json({ error: "bad_session_id", message: "That is not a checkout session id." }, 400);
  }

  const stripe = new StripeClient({ secretKey: process.env.STRIPE_SECRET_KEY as string });
  const now = Math.floor(Date.now() / 1000);

  try {
    const session = await stripe.getCheckoutSession(sessionId);

    // "paid" is the only answer that grants anything. An open session, an
    // expired one, or one whose payment failed all land here.
    if (session.payment_status !== "paid") {
      return json(
        { error: "not_paid", message: "That checkout has not been paid.", paymentStatus: session.payment_status },
        402
      );
    }

    const customerId = typeof session.customer === "string" ? session.customer : "";

    // THE IDENTITY IS OUR OWN REFERENCE, NOT THE ADDRESS TYPED AT STRIPE.
    //
    // This route used to key the store write on `customer_details.email`, so a
    // paid session carrying somebody else's address rewrote THEIR record. The
    // key now comes from `client_reference_id`, which this deployment set when
    // it created the session for an address it had already verified.
    //
    // A session without one predates this change or was not created by us;
    // the customer index is the only other trusted route to an identity.
    const store = resolveStore();
    const secret = process.env.BILLING_SESSION_SECRET as string;
    const ref = typeof session.client_reference_id === "string" ? session.client_reference_id.trim() : "";
    let key: string | null = /^[A-Za-z0-9_-]{32}$/.test(ref) ? ref : null;
    if (!key && store && customerId) key = await store.getEmailKeyForCustomer(customerId);
    if (!key) {
      console.error("[billing] activate: paid session with no resolvable identity");
      return json(
        {
          error: "identity_unknown",
          message: "We could not match that checkout to an account. Use the sign-in link on the account page.",
        },
        409
      );
    }

    // The claim expires with the subscription period when we can read one, so
    // a monthly subscriber's cookie never outlives the month they paid for.
    //
    // `periodFromStripe` stays undefined when the subscription could not be
    // read. That distinction matters: writing the 30-day FALLBACK into the
    // store as a period end would overwrite a correct annual period with one
    // month, and the store is what every gate reads — so a $190 subscriber
    // would be cut off on day 30 by the very lookup meant to protect them.
    let exp = now + MAX_TTL_DAYS * 86_400;
    let periodFromStripe: number | undefined;
    if (typeof session.subscription === "string" && session.subscription) {
      try {
        const subscription = await stripe.getSubscription(session.subscription);
        if (!grantsAccess(subscription.status)) {
          return json(
            { error: "subscription_inactive", message: `The subscription is ${subscription.status}.` },
            402
          );
        }
        // Read through periodEndOf: Basil moved this onto the subscription
        // items, and reading only the old place would silently fall back to
        // the default window for every subscriber.
        const periodEnd = periodEndOf(subscription);
        if (typeof periodEnd === "number" && periodEnd > now) {
          exp = periodEnd;
          periodFromStripe = periodEnd;
        }
      } catch (err) {
        // A readable paid session with an unreadable subscription still earns
        // the default window; the alternative is refusing someone who has paid.
        console.error(`[billing] subscription lookup failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // A CHECKOUT SESSION IS SPENDABLE ONCE.
    //
    // This route is unauthenticated on purpose: someone arriving back from
    // Stripe has no cookie yet, and the session id is the only thing they
    // carry. But it was honoured any number of times, so one paid `cs_` id
    // minted unlimited Pro cookies in unlimited browsers — a shoulder-surf, a
    // pasted success URL, a leaked referrer, a shared screenshot. The id proves
    // that ONE person paid once, and it now buys exactly one cookie.
    //
    // Claimed AFTER every check that can return a 4xx, so a session is never
    // burned by a failure the customer can fix, and BEFORE anything is written
    // or minted so nothing is issued twice. Placing it before the
    // subscription-status check spent the session on a 402 and locked the
    // customer out permanently. The claim outlives the longest cookie we grant.
    const claimStore = resolveStore();
    if (claimStore) {
      let claimed = false;
      try {
        claimed = await claimStore.claimCheckoutSession(sessionId, (MAX_TTL_DAYS + 1) * 86_400);
      } catch (err) {
        // A store that cannot answer must not lock a paying customer out. Log
        // it and allow the activation — the same call the subscription-lookup
        // failure below makes, for the same reason.
        console.error(
          `[billing] checkout claim failed, allowing activation: ${err instanceof Error ? err.message : String(err)}`
        );
        claimed = true;
      }
      if (!claimed) {
        return json(
          {
            error: "already_activated",
            message:
              "That checkout has already been used to sign in. Use the sign-in link on the account page to add another device.",
          },
          409
        );
      }
    }

    // Write it down before minting anything. The webhook usually gets here
    // first, but ordering between a redirect and a webhook delivery is not
    // guaranteed, and a subscriber whose only record was a cookie is exactly
    // the failure this store exists to remove.
    let email = "";
    if (store) {
      try {
        if (customerId) await store.linkCustomer(customerId, key);
        const existing = await store.getSubscriber(key);
        // The address is whatever the verified record already holds. It is
        // never taken from the session, and never overwritten from one.
        email = existing?.email ?? "";
        await store.putSubscriber(
          key,
          mergeSubscriber(
            existing,
            {
              customerId,
              status: "active",
              // Only a period Stripe actually stated. Omitting it lets
              // mergeSubscriber keep whatever the webhook already wrote, which
              // is the real period rather than our fallback.
              ...(periodFromStripe !== undefined ? { currentPeriodEnd: periodFromStripe } : {}),
            },
            now
          )
        );
      } catch (err) {
        // The person has paid; do not refuse them because a write failed. The
        // webhook will write the same record, and the cookie covers the gap.
        console.error(`[billing] activate store write failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // `periodEnd` is the TRUE Stripe period, unclamped, for display. `exp` is
    // clamped to MAX_TTL_DAYS by sign(). Showing the clamp told a $190 annual
    // buyer their year ended in thirty days.
    const entitlement: Entitlement = { plan: "pro", email, customerId, exp, periodEnd: exp };
    const token = sign(entitlement, secret, now);
    const cookie = cookieFor(token, Math.min(exp, now + MAX_TTL_DAYS * 86_400), now, billingOriginIsHttps());

    console.log(`[billing] activated · customer ${customerId || "unknown"} · expires ${new Date(exp * 1000).toISOString()}`);

    const res = json({ plan: "pro", expiresAt: new Date(exp * 1000).toISOString() }, 200);
    res.headers.append("Set-Cookie", serializeCookie(cookie));
    res.headers.append("Set-Cookie", serializeCookie(sessionHintCookie(exp, now, billingOriginIsHttps())));
    return res;
  } catch (err) {
    const detail = err instanceof StripeError ? `HTTP ${err.status}` : "network error";
    console.error(`[billing] activate failed: ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "activate_failed", message: `Could not confirm that checkout (${detail}).` }, 502);
  }
}

/** Secure cookies everywhere but a plain-http local run, where they would never be set. */
function billingOriginIsHttps(): boolean {
  return !(process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("http://");
}
