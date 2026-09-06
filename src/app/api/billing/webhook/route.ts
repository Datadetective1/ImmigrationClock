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
import { grantsAccess, isHandledEvent, periodEndOf, verifyWebhookSignature } from "@/lib/billing/stripe";
import { emailKey, resolveStore, type SubscriberStore } from "@/lib/billing/store";
import { mergeSubscriber, shouldApplySubscriptionEvent } from "@/lib/billing/subscription";
import { onboardingLogLine, runProOnboarding } from "@/lib/billing/onboarding";
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
      { error: "billing_not_configured", message: "This endpoint is not accepting deliveries." },
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
      // A TRANSIENT STORE FAILURE MUST MAKE STRIPE RETRY.
      //
      // This used to log and answer 200. Stripe treats 200 as success and never
      // redelivers, so one Redis blip during a `customer.subscription.deleted`
      // meant the cancellation was simply lost: the record kept status "active"
      // with its period end intact, and a cancelled subscriber kept Pro for the
      // rest of the term — up to a year on annual — with no later event to
      // correct it.
      //
      // 500 is the right answer to "I could not write this down". Stripe backs
      // off and retries for days, and every handler here is idempotent, so a
      // redelivery costs nothing. The old comment worried that retries would
      // get the endpoint disabled; losing a cancellation silently is worse, and
      // an endpoint failing every delivery is a thing an operator should see.
      console.error(`[billing] webhook store write failed: ${err instanceof Error ? err.message : String(err)}`);
      return json(
        { error: "store_unavailable", message: "Could not record this event. Please retry.", type },
        500
      );
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

  // ---------------------------------------------------------------------------
  // CHECKOUT COMPLETED
  // ---------------------------------------------------------------------------
  if (type === "checkout.session.completed") {
    // THE IDENTITY COMES FROM US, NOT FROM STRIPE.
    //
    // `client_reference_id` is the emailKey this deployment put on the session
    // when it created it, for an address it had already verified by magic link.
    // The previous version keyed on `customer_details.email` — a string the
    // buyer types on Stripe's page — so paying $19 while typing a subscriber's
    // address seized that subscriber's record, watchlist and access.
    //
    // Nothing in this branch reads an email any more. The address was written
    // at checkout-creation time and is merged forward untouched.
    const key = await resolveKey(store, object);
    if (!key) return false;

    const customer = typeof object.customer === "string" ? object.customer : "";
    if (customer) await store.linkCustomer(customer, key);
    const existing = await store.getSubscriber(key);

    // NO ORDERING GUARD HERE, deliberately. A checkout session and the
    // subscription it creates are separate object streams, and the subscription
    // carries the EARLIER timestamp. Ordering checkout against the subscription
    // watermark dropped the only event carrying current_period_end and left a
    // paying customer with no access.
    //
    // A REDELIVERY MUST NOT RESURRECT A DEAD SUBSCRIPTION. It used to write
    // status "active" unconditionally, so replaying an old checkout event over
    // a past_due or cancelled record restored access. Once the subscription
    // stream has said anything at all, that stream owns the status.
    const settled = Boolean(existing && existing.lastSubscriptionEventAt !== undefined);
    if (settled) return true;

    // A LAPSED SUBSCRIBER WHO COMES BACK MUST NOT INHERIT THEIR DEAD PERIOD.
    // mergeSubscriber falls back to the stored currentPeriodEnd when the
    // incoming event carries none, and a checkout session never carries one.
    const expired = (existing?.currentPeriodEnd ?? 0) <= now;
    await store.putSubscriber(
      key,
      mergeSubscriber(
        existing,
        {
          customerId: customer || existing?.customerId || "",
          status: "active",
          ...(expired ? { currentPeriodEnd: 0 } : {}),
        },
        now
      )
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // MONEY GOING BACK OUT — refunds and disputes end access NOW
  // ---------------------------------------------------------------------------
  if (type === "charge.refunded" || type === "charge.dispute.created" || type === "charge.dispute.closed") {
    const customer = typeof object.customer === "string" ? object.customer : "";
    if (!customer) return false;
    const key = await store.getEmailKeyForCustomer(customer);
    if (!key) return false;
    const existing = await store.getSubscriber(key);
    if (!existing) return false;

    // A PARTIAL REFUND IS NOT THE END OF THE RELATIONSHIP.
    //
    // Stripe emits `charge.refunded` for partial refunds too. Revoking on the
    // event alone meant a $5 goodwill refund against a $190 annual charge
    // ended eleven months of access on every device — while Stripe, which does
    // not cancel a subscription when you refund it, kept billing the card.
    if (type === "charge.refunded" && !isFullRefund(object)) {
      console.log(`[billing] partial refund · access unchanged · charge ${String(object.id ?? "unknown")}`);
      return true;
    }

    if (type === "charge.dispute.closed") {
      // Stripe reports the outcome in `status`. WE DO NOT AUTO-RESTORE: access
      // was revoked when the dispute opened, and a won dispute means the money
      // is ours, not that this person still wants the subscription. If the
      // subscription is genuinely still live, the subscription stream says so.
      const outcome = typeof object.status === "string" ? object.status : "unknown";
      console.log(`[billing] dispute closed · ${outcome} · no automatic restore`);
      return true;
    }

    // Refund or dispute opened: end access at once, and say why in the status
    // so the account page and the logs both name the real reason.
    //
    // `revokedAt` is what stops this becoming a state nobody can leave. The
    // first version refused every later subscription event outright, so a
    // customer who won a dispute — or who simply bought again — was billed by
    // Stripe forever and never regained access, with no path back in the
    // product at all. Money that arrives AFTER the revocation is new money.
    await store.putSubscriber(
      key,
      mergeSubscriber(
        existing,
        {
          status: type === "charge.refunded" ? "refunded" : "disputed",
          currentPeriodEnd: now,
          revokedAt: eventCreatedAt ?? now,
        },
        now
      )
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // A FAILED RENEWAL
  // ---------------------------------------------------------------------------
  if (type === "invoice.payment_failed") {
    const customer = typeof object.customer === "string" ? object.customer : "";
    if (!customer) return false;
    const key = await store.getEmailKeyForCustomer(customer);
    if (!key) return false;
    const existing = await store.getSubscriber(key);
    if (!existing) return false;

    // ORDERED LIKE EVERY OTHER SUBSCRIPTION FACT. Without this, a redelivered
    // or late `invoice.payment_failed` landed after the customer had already
    // fixed their card and flipped a recovered subscriber back to past_due —
    // and returning 500 on store failures, which is the right fix elsewhere in
    // this file, makes redelivery more likely rather than less.
    if (!shouldApplySubscriptionEvent(existing, eventCreatedAt)) return false;

    // Do NOT shorten the period: they have paid through it and Stripe is still
    // retrying the card. The status stops renewal being assumed, and
    // accessFor() ends access at the period end on its own if dunning fails.
    if (!grantsAccess(existing.status)) return true;
    await store.putSubscriber(
      key,
      mergeSubscriber(existing, { status: "past_due", lastSubscriptionEventAt: eventCreatedAt }, now)
    );
    return true;
  }

  // ---------------------------------------------------------------------------
  // A SUBSCRIPTION EVENT
  // ---------------------------------------------------------------------------
  const customer = typeof object.customer === "string" ? object.customer : "";
  if (!customer) return false;
  const key = await store.getEmailKeyForCustomer(customer);
  // The index is written at checkout-creation time now, so a miss here means a
  // customer this deployment never created. Acknowledge rather than retry.
  if (!key) return false;

  // A webhook payload's version comes from the endpoint's configuration in
  // Stripe, not from the header this deployment sends — so both the pre-Basil
  // and post-Basil shapes can arrive at a single running integration.
  const periodEnd = periodEndOf(object);
  const existing = await store.getSubscriber(key);

  // ORDER, NOT ARRIVAL. Without this a redelivered "updated · active" landing
  // after "deleted" restores a cancelled subscriber's access, silently and for
  // a full billing period.
  if (!shouldApplySubscriptionEvent(existing, eventCreatedAt)) return false;

  // A REFUND OR DISPUTE OUTRANKS THE SUBSCRIPTION STREAM — BUT ONLY BACKWARDS.
  //
  // Stripe keeps a refunded subscription "active" until someone cancels it, so
  // a routine `customer.subscription.updated` generated BEFORE the refund would
  // otherwise hand access back to a person whose money has been returned.
  //
  // Refusing everything forever was worse: a won dispute, a re-purchase or the
  // next renewal could never restore access, so the card kept being charged for
  // nothing. Events generated after the revocation are new information and are
  // applied normally.
  if (existing && (existing.status === "refunded" || existing.status === "disputed")) {
    // NEW MONEY IS A NEW SUBSCRIPTION, NOT A LATER TIMESTAMP.
    //
    // Time alone is the wrong test: Stripe leaves a refunded subscription
    // "active" and keeps emitting customer.subscription.updated for it, so any
    // rule of the form "events after the refund apply" hands access straight
    // back to the person whose money was returned, seconds later.
    //
    // A genuine re-purchase creates a DIFFERENT subscription object. That is
    // what may lift the revocation — and refusing everything forever was the
    // other failure, leaving a won dispute or a re-purchase billed and granted
    // nothing.
    const revokedSubscription = existing.subscriptionId ?? "";
    const incoming = typeof object.id === "string" ? object.id : "";
    // BOTH IDS MUST BE KNOWN. If the record does not say which subscription was
    // revoked, we cannot tell a re-purchase from the refunded subscription's
    // own chatter — and serving somebody whose money was returned is the worse
    // of the two mistakes, so silence means refuse.
    const isNewSubscription =
      Boolean(incoming) && Boolean(revokedSubscription) && incoming !== revokedSubscription;
    if (!isNewSubscription && type !== "customer.subscription.deleted") return false;
  }

  // ONE RECORD TRACKS ONE SUBSCRIPTION.
  //
  // A customer can hold more than one subscription object over time — a
  // re-purchase after cancelling, or a plan the operator created by hand. With
  // no subscription id on the record, the DELETION of a long-dead subscription
  // revoked whatever was current, because both events carry the same customer.
  //
  // A subscription that grants access adopts the record. An event about some
  // OTHER subscription may not end access that a different one is paying for.
  const incomingId = typeof object.id === "string" ? object.id : "";
  const trackedId = existing?.subscriptionId ?? "";
  const isTracked = !trackedId || !incomingId || trackedId === incomingId;
  if (!isTracked && !access) {
    console.log(
      `[billing] ignoring ${type} for ${incomingId} · record tracks ${trackedId} · access unchanged`
    );
    return false;
  }

  const written = mergeSubscriber(
    existing,
    {
      customerId: customer,
      status: access ? status ?? "active" : status ?? "canceled",
      // A deletion ends access now rather than at the period end it carries.
      currentPeriodEnd: type === "customer.subscription.deleted" ? now : periodEnd,
      lastSubscriptionEventAt: eventCreatedAt,
      // An active subscription becomes the one this record follows.
      ...(access && incomingId ? { subscriptionId: incomingId } : {}),
    },
    now
  );
  await store.putSubscriber(key, written);

  // ---------------------------------------------------------------------------
  // ONBOARDING — the welcome email, and a consented newsletter enrolment.
  //
  // AFTER the store write, and unable to affect it. This is the authoritative
  // moment: Stripe has stated, over a signed webhook, that the subscription is
  // live and paid through a date we have just recorded. The browser's return to
  // /account is not used for this, because it can be closed, replayed or never
  // happen at all.
  //
  // WRAPPED SO IT CANNOT REACH THE RESPONSE. A thrown error here would become a
  // 500, Stripe would retry, and the retry would re-run a write that has
  // already succeeded — turning "the email provider is down" into "the
  // subscription record is rewritten every few minutes". The send itself is
  // idempotent by SET NX claim, so a retry that does happen sends nothing
  // twice.
  // ---------------------------------------------------------------------------
  //
  // FIRST ACTIVATION OF A SUBSCRIPTION, not a particular event type.
  //
  // Gating on `customer.subscription.created` looked like the honest trigger
  // and was a trap: that single event is droppable. The ordering watermark
  // discards it whenever an `updated` overtakes it, and Checkout can create a
  // subscription `incomplete` so the `created` event carries a status that
  // grants nothing — in both cases the subscriber gets no welcome at all, and
  // no later event was allowed to make up for it.
  //
  // So any event that finds the subscription ACTIVE may trigger onboarding, and
  // the SET NX claim — keyed by identity AND subscription id — is what makes it
  // happen exactly once. A renewal of the same subscription finds the claim
  // taken; a genuinely new subscription has a new id and earns its own welcome.
  //
  // THE TRANSITION INTO ACTIVE, not the event type and not the claim alone.
  //
  // `wasAlreadyActive` is what distinguishes a first activation from a renewal.
  // Gating on the event type instead was wrong in the other direction: the
  // ordering watermark can drop `customer.subscription.created`, and Checkout
  // can emit it with an `incomplete` status, so a subscriber could be left with
  // no welcome at all. And the SET NX claim alone is not enough either — a
  // subscription that predates this feature holds no claim, so its next renewal
  // would greet a long-standing subscriber as new.
  const wasAlreadyActive = Boolean(existing && grantsAccess(existing.status));
  if (!wasAlreadyActive && access && written.email && written.currentPeriodEnd > now) {
    try {
      const report = await runProOnboarding({
        store,
        identityKey: key,
        record: written,
        subscription: object,
      });
      console.log(onboardingLogLine(written.email, report));
    } catch (err) {
      console.error(
        `[billing] onboarding failed after a successful subscription write: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  return true;
}

/**
 * Which identity does this checkout session belong to?
 *
 * `client_reference_id` first — it is ours, opaque, and was set on a session
 * this deployment created for an address it had already verified. The customer
 * index is the fallback, for a session created before this existed.
 *
 * An email is never consulted. That is the point.
 */
async function resolveKey(
  store: SubscriberStore,
  object: Record<string, unknown>
): Promise<string | null> {
  const ref = typeof object.client_reference_id === "string" ? object.client_reference_id.trim() : "";
  // emailKey() emits 32 base64url characters. Anything else did not come from
  // us, so it is not trusted as a key into the store.
  if (/^[A-Za-z0-9_-]{32}$/.test(ref)) return ref;

  const customer = typeof object.customer === "string" ? object.customer : "";
  if (!customer) return null;
  return store.getEmailKeyForCustomer(customer);
}

/** An operator's readiness check. Never reveals the secret or its length. */
export async function GET(): Promise<Response> {
  const status = billingStatus();
  return json({ webhookReady: status.webhookReady, testMode: status.testMode }, status.webhookReady ? 200 : 503);
}

/**
 * Was this charge refunded in full?
 *
 * Stripe emits `charge.refunded` for partial refunds as well as complete ones,
 * and a partial refund is a goodwill gesture rather than the end of the
 * relationship. `refunded` is Stripe's own boolean for "nothing is left on this
 * charge"; the amounts are the fallback when it is absent.
 *
 * The safe default when neither is readable is TRUE — revoking access after a
 * refund we cannot size is recoverable by the subscriber buying again, whereas
 * serving someone whose money we returned is not.
 */
function isFullRefund(object: Record<string, unknown>): boolean {
  if (typeof object.refunded === "boolean") return object.refunded;
  const amount = typeof object.amount === "number" ? object.amount : undefined;
  const refunded = typeof object.amount_refunded === "number" ? object.amount_refunded : undefined;
  if (amount === undefined || refunded === undefined) return true;
  return refunded >= amount;
}
