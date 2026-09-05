// =============================================================================
// POST /api/billing/webhook — Stripe tells us what happened
//
// THIS IS A PUBLIC URL THAT GRANTS ACCESS. Anyone on the internet can POST to
// it. The only thing separating a real Stripe event from a forged one is the
// signature, so the order of operations here is not negotiable:
//
//   1. Read the RAW body. Not req.json() — parsing and re-serialising changes
//      whitespace and key order, and the signature would never match again.
//   2. Verify the signature and the timestamp tolerance.
//   3. Only then look at what the event says.
//
// WHAT IT DOES
// ------------
// It writes the subscription to the subscriber store, and that write is what
// makes a paid subscription honest:
//
//   • ACCESS SURVIVES THE BROWSER. The store, not a cookie, is what a sign-in
//     link and every Pro gate read. Clearing cookies costs a subscriber one
//     email, not their subscription.
//   • A CANCELLATION TAKES EFFECT AT ONCE. `customer.subscription.deleted`
//     writes the cancelled status here, and the next request that checks the
//     store is refused — rather than access lingering until a cookie lapses.
//   • It is the audit trail: type, event id, object id and status. Never an
//     email, never a card.
//
// If no store is configured the endpoint still verifies and acknowledges, and
// says so in the log. Losing the write is bad; making Stripe retry a delivery
// it cannot ever complete is worse.
//
// ALWAYS 200 FOR AN EVENT WE SIMPLY DO NOT HANDLE. Stripe sends dozens of event
// types; 400ing on the ones we ignore would teach it to retry them forever.
// =============================================================================

import { billingStatus } from "@/lib/billing/config";
import { grantsAccess, isHandledEvent, verifyWebhookSignature } from "@/lib/billing/stripe";
import { emailKey, resolveStore, type SubscriberStore } from "@/lib/billing/store";
import { mergeSubscriber, shouldApplySubscriptionEvent } from "@/lib/billing/subscription";
import { json } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StripeEvent {
  /**
   * Stripe's own creation timestamp, unix seconds. The ordering key: delivery
   * order is not guaranteed, so this is the only reliable way to tell a late
   * event from a new one.
   */
  created?: number;
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}

export async function POST(req: Request): Promise<Response> {
  const status = billingStatus();
  if (!status.webhookReady) {
    // 503, not 200: an unconfigured endpoint must not look like a working one,
    // or Stripe will report deliveries as successful while nothing is verified.
    return json(
      { error: "billing_not_configured", message: status.disabledReason ?? "The webhook secret is not configured." },
      503
    );
  }

  const rawBody = await req.text();
  const check = verifyWebhookSignature(
    rawBody,
    req.headers.get("stripe-signature"),
    process.env.STRIPE_WEBHOOK_SECRET as string,
    Math.floor(Date.now() / 1000)
  );

  if (!check.ok) {
    console.error(`[billing] webhook signature rejected: ${check.reason}`);
    return json({ error: "invalid_signature", message: check.reason }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return json({ error: "invalid_json", message: "The signed body was not JSON." }, 400);
  }

  const type = event.type ?? "";
  if (!isHandledEvent(type)) {
    return json({ received: true, handled: false, type }, 200);
  }

  const object = event.data?.object ?? {};
  // Stripe's own clock, not ours: a slow delivery must still be applied in the
  // order Stripe generated it. See shouldApplySubscriptionEvent().
  const eventCreatedAt = typeof event.created === "number" ? event.created : undefined;
  const subscriptionStatus = typeof object.status === "string" ? object.status : null;
  const access = type === "customer.subscription.deleted" ? false : grantsAccess(subscriptionStatus ?? "active");

  const store = resolveStore();
  let stored = false;
  if (store) {
    try {
      stored = await persist(store, type, object, subscriptionStatus, access, eventCreatedAt);
    } catch (err) {
      // Logged, not thrown: a 500 makes Stripe retry for days and then disable
      // the endpoint, which would lose every later event as well.
      console.error(`[billing] webhook store write failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // The audit line. Ids and statuses only — no email, no name, no card, no
  // address. These logs are readable by anyone with deployment access.
  console.log(
    `[billing] ${type} · event ${event.id ?? "unknown"} · object ${String(object.id ?? "unknown")} · ` +
      `status ${subscriptionStatus ?? "n/a"} · access ${access ? "granted" : "ended"} · ` +
      `${store ? (stored ? "stored" : "not stored") : "no store configured"}`
  );

  return json({ received: true, handled: true, type, access, stored }, 200);
}

/**
 * Write what this event says about a subscription.
 *
 * Two shapes arrive. A checkout session carries the billing EMAIL and the
 * customer; a subscription event carries the status and the period end but no
 * email. So the email is stored once, from checkout, and the customer id is
 * indexed to it — later events find the person through that index and merge
 * rather than overwrite, or the address would be lost on the first renewal and
 * the subscriber would be unreachable by sign-in link and by alert.
 */
async function persist(
  store: SubscriberStore,
  type: string,
  object: Record<string, unknown>,
  status: string | null,
  access: boolean,
  eventCreatedAt?: number
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const secret = process.env.BILLING_SESSION_SECRET;
  if (!secret) return false;

  const customerId =
    typeof object.customer === "string" ? object.customer : typeof object.id === "string" && type.startsWith("customer.subscription") ? "" : "";

  if (type === "checkout.session.completed") {
    const details = object.customer_details as { email?: string } | undefined;
    const email = (details?.email || (object.customer_email as string) || "").trim().toLowerCase();
    const customer = typeof object.customer === "string" ? object.customer : "";
    if (!email || !customer) return false;

    const key = emailKey(email, secret);
    await store.linkCustomer(customer, key);
    const existing = await store.getSubscriber(key);

    // NO ORDERING GUARD HERE, deliberately. A checkout session and the
    // subscription it creates are separate object streams, and the subscription
    // carries the EARLIER timestamp. Ordering checkout against the subscription
    // watermark dropped the only event carrying current_period_end and left a
    // paying customer with no access. A stale checkout redelivery is harmless on
    // its own: it writes no period end, and access is gated on the period.

    // A LAPSED SUBSCRIBER WHO COMES BACK MUST NOT INHERIT THEIR DEAD PERIOD.
    //
    // mergeSubscriber falls back to the stored currentPeriodEnd when the
    // incoming event carries none, and a checkout session never carries one.
    // For someone re-subscribing that fallback is their OLD, expired end, so
    // accessFor() denies a customer who has just paid — deterministically, on
    // every such checkout. Clearing it hands the decision to the subscription
    // event that follows, which does carry the real period.
    const expired = (existing?.currentPeriodEnd ?? 0) <= now;
    await store.putSubscriber(
      key,
      mergeSubscriber(
        existing,
        {
          email,
          customerId: customer,
          status: "active",
          ...(expired ? { currentPeriodEnd: 0 } : {}),
        },
        now
      )
    );
    return true;
  }

  // A subscription event: find the person by the customer index.
  const customer = customerId || (typeof object.customer === "string" ? object.customer : "");
  if (!customer) return false;
  const key = await store.getEmailKeyForCustomer(customer);
  if (!key) return false;

  const periodEnd = typeof object.current_period_end === "number" ? object.current_period_end : undefined;
  const existing = await store.getSubscriber(key);

  // ORDER, NOT ARRIVAL. Without this a redelivered "updated · active" landing
  // after "deleted" restores a cancelled subscriber's access, silently and for
  // a full billing period.
  if (!shouldApplySubscriptionEvent(existing, eventCreatedAt)) return false;

  await store.putSubscriber(
    key,
    mergeSubscriber(
      existing,
      {
        customerId: customer,
        status: access ? status ?? "active" : status ?? "canceled",
        // A deletion ends access now rather than at the period end it carries.
        currentPeriodEnd: type === "customer.subscription.deleted" ? now : periodEnd,
        lastSubscriptionEventAt: eventCreatedAt,
      },
      now
    )
  );
  return true;
}

/** An operator's readiness check. Never reveals the secret or its length. */
export async function GET(): Promise<Response> {
  const status = billingStatus();
  return json({ webhookReady: status.webhookReady, testMode: status.testMode }, status.webhookReady ? 200 : 503);
}
