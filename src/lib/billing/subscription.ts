// =============================================================================
// THE SUBSCRIPTION, RESOLVED — one place that answers "may this person use Pro?"
//
// Two sources, and their order matters:
//
//   STRIPE is authoritative for billing. It decides whether money is being
//   paid, and the webhook is how that decision reaches us.
//
//   THE STORE is authoritative for access. It holds what the webhook last
//   said, so a request can be answered without a Stripe round trip on every
//   page view — and, more importantly, so a cancellation takes effect at the
//   next request rather than whenever a cookie happens to lapse.
//
// The cookie is neither. It is a fast path: a signed claim that says "the
// store said yes recently". Anything that grants real capability re-reads the
// store; the cookie alone is only good for showing the right UI.
//
// That ordering is what fixes the flaw in the first design. A subscriber who
// clears cookies signs in again by email and the store still knows them; a
// subscriber who cancels stops being able to use Pro the moment the webhook
// writes it, not up to thirty days later.
// =============================================================================

import { grantsAccess } from "./stripe";
import type { SubscriberRecord, SubscriberStore } from "./store";

export interface Access {
  /** May this person use Pro right now? */
  pro: boolean;
  /** Why, in a form a log or an account page can state without inventing anything. */
  reason: string;
  record: SubscriberRecord | null;
}

export const NO_ACCESS: Access = { pro: false, reason: "no subscription record", record: null };

/**
 * Does this record grant Pro at this instant?
 *
 * Two independent conditions, both required:
 *   • Stripe's own status is one that means "paying" (active or trialing).
 *   • The period we were paid for has not ended.
 *
 * The second is not redundant. If a webhook is missed — a deploy at the wrong
 * moment, an endpoint disabled, Stripe retrying into a 500 — the status can
 * sit at "active" forever. The period end is a dead man's switch: access stops
 * on its own unless something renews it.
 */
export function accessFor(record: SubscriberRecord | null, nowSeconds: number): Access {
  if (!record) return NO_ACCESS;
  if (!grantsAccess(record.status)) {
    return { pro: false, reason: `subscription is ${record.status}`, record };
  }
  if (record.currentPeriodEnd <= nowSeconds) {
    return { pro: false, reason: "the paid period has ended", record };
  }
  return { pro: true, reason: `active until ${new Date(record.currentPeriodEnd * 1000).toISOString()}`, record };
}

/** Read a person's access from the store. The one call every gate makes. */
export async function accessForKey(
  store: SubscriberStore,
  key: string,
  nowSeconds: number
): Promise<Access> {
  return accessFor(await store.getSubscriber(key), nowSeconds);
}

/**
 * Write what Stripe just told us.
 *
 * Merges rather than replaces: a `customer.subscription.updated` event carries
 * the subscription but not the billing email, and losing the email would make
 * the person unreachable by sign-in link and by alert. The email only ever
 * arrives from checkout, so an update must keep the one already stored.
 */
export function mergeSubscriber(
  existing: SubscriberRecord | null,
  incoming: Partial<SubscriberRecord>,
  nowSeconds: number
): SubscriberRecord {
  return {
    email: incoming.email || existing?.email || "",
    customerId: incoming.customerId || existing?.customerId || "",
    status: incoming.status || existing?.status || "incomplete",
    currentPeriodEnd: incoming.currentPeriodEnd ?? existing?.currentPeriodEnd ?? 0,
    updatedAt: nowSeconds,
    lastSubscriptionEventAt: incoming.lastSubscriptionEventAt ?? existing?.lastSubscriptionEventAt,
  };
}

/**
 * Should a SUBSCRIPTION event be applied to the record we already hold?
 *
 * Checkout sessions are deliberately not ordered against this watermark. They
 * are a separate object stream whose events carry a LATER timestamp than the
 * subscription they create, so sharing one watermark dropped the only event
 * carrying current_period_end and denied a customer who had just paid.
 *
 * STRIPE DOES NOT GUARANTEE ORDER, AND IT RETRIES. The failure this prevents is
 * specific and expensive: `customer.subscription.deleted` arrives and access
 * ends, then a `customer.subscription.updated` carrying status active — a
 * redelivery, or simply the earlier event losing the race — lands afterwards
 * and restores the cancelled subscriber. Nothing in the merge compared the two,
 * because the merge had no notion of when either event happened.
 *
 * The comparison is on Stripe's own `created` timestamp, not on our clock, so a
 * slow delivery is still applied in the order Stripe generated it.
 *
 * An event with the SAME timestamp is applied. Stripe emits several events for
 * one state change within the same second, and refusing equal timestamps would
 * drop the one that matters. Equal-timestamp events describe the same state, so
 * applying them is idempotent in effect.
 */
export function shouldApplySubscriptionEvent(
  existing: SubscriberRecord | null,
  eventCreatedAt: number | undefined
): boolean {
  if (!existing) return true;
  // A record written before ordering existed has no stamp. Treat it as older
  // than anything, so the first stamped event wins and the record heals.
  if (existing.lastSubscriptionEventAt === undefined) return true;
  if (eventCreatedAt === undefined) return true;
  return eventCreatedAt >= existing.lastSubscriptionEventAt;
}
