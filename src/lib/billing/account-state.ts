// =============================================================================
// WHAT AN ACCOUNT SAYS ABOUT ITSELF — one function, so two surfaces cannot
// disagree about whether somebody is a subscriber.
//
// THE PROBLEM THIS SOLVES IS NOT TECHNICAL. The identity system worked and was
// invisible: a person could verify an email, pay, and then find nothing in the
// interface that acknowledged either fact. The account page said
// "ImmigrationClock has no accounts for reading", which reads as "there are no
// accounts", and there was no sign-in, account or sign-out control anywhere in
// the navigation.
//
// So the states are named here, in the vocabulary a person would use, and every
// surface renders from the same answer:
//
//   anonymous   — no verified identity on this browser. Everything public still
//                 works; this is not a locked door.
//   free        — a verified identity with no live subscription.
//   pro         — paying, and renewing.
//   cancelling  — paying, but Stripe will not renew. Access runs to paidThrough.
//   expired     — was paying; the paid period has passed.
//   unconfirmed — signed in, but the subscriber store could not be read, so
//                 nothing authoritative can be said about the subscription.
//
// "cancelling" and "expired" exist because collapsing them into "free" is how a
// subscriber comes to believe a cancellation did not work, or that they were
// cut off early. Both produce support mail, and both are avoidable by saying
// the true thing.
//
// "unconfirmed" exists for the same reason and is the sharpest case of it. A
// store read that fails returns no record, which is INDISTINGUISHABLE from
// "verified but never subscribed" unless the caller says which happened — so a
// paying subscriber caught by one KV timeout was shown "Free account" and
// invited to upgrade to something they already own. An outage must degrade into
// "we could not check", never into a claim about somebody's money.
// =============================================================================

import { accessFor } from "./subscription";
import type { SubscriberRecord } from "./store";
import type { Entitlement } from "./entitlement";

export type AccountStatus =
  | "anonymous"
  | "free"
  | "pro"
  | "cancelling"
  | "expired"
  | "unconfirmed";

export interface AccountState {
  status: AccountStatus;
  /** The VERIFIED address. Empty only when anonymous. */
  email: string;
  /** True for pro and cancelling — i.e. Pro works right now. */
  isPro: boolean;
  /** Unix seconds. Present whenever a paid period is known. */
  paidThrough: number | null;
  /** True when Stripe will charge again on paidThrough. */
  renews: boolean;
  /** Whether this browser can reach a billing portal at all. */
  hasBilling: boolean;
  /** What the person answered about the newsletter, if they were ever asked. */
  newsletter: "subscribed" | "declined" | "never_asked";
  /**
   * Whether the authoritative record was actually read.
   *
   * False only for "unconfirmed". Every surface that would ask somebody to
   * spend money must check this first: offering "Upgrade to Pro" during a store
   * outage is how a subscriber is talked into buying what they already have.
   */
  confirmed: boolean;
}

export const ANONYMOUS_ACCOUNT: AccountState = {
  status: "anonymous",
  email: "",
  isPro: false,
  paidThrough: null,
  renews: false,
  hasBilling: false,
  newsletter: "never_asked",
  confirmed: true,
};

export interface AccountLookup {
  /**
   * True when the store answered — INCLUDING when it answered "no such record",
   * which is a real and common state. False only when the read failed or no
   * store is configured, which is not an answer about anybody.
   */
  storeRead?: boolean;
}

/**
 * Resolve what to show, from the signed claim and the authoritative record.
 *
 * The RECORD wins wherever both speak. The claim is a fast path that says who
 * this browser belongs to; the store is what Stripe actually wrote. A claim
 * with no record behind it is a verified identity that has never subscribed —
 * which is a real and common state, not an error.
 */
export function accountStateFor(
  entitlement: Entitlement | null,
  record: SubscriberRecord | null,
  nowSeconds: number,
  lookup: AccountLookup = {}
): AccountState {
  // A claim with no address identifies nobody, whatever else it carries.
  if (!entitlement?.email) return ANONYMOUS_ACCOUNT;

  const email = entitlement.email;
  const newsletter: AccountState["newsletter"] = record?.newsletterConsent
    ? record.newsletterConsent.granted
      ? "subscribed"
      : "declined"
    : "never_asked";

  // THE STORE DID NOT ANSWER. Not "there is no record" — no answer at all.
  //
  // The claim is the only thing left, and it is a fast path rather than an
  // authority: it was minted from the store at most MAX_TTL_DAYS ago, so it is
  // good enough to keep showing a subscriber their own subscription, and not
  // good enough to base a purchase on. So the plan is carried through and the
  // state is marked unconfirmed, which is what suppresses the upgrade offer.
  if (lookup.storeRead === false) {
    const claimedPro = entitlement.plan === "pro" && entitlement.exp > nowSeconds;
    return {
      status: "unconfirmed",
      email,
      isPro: claimedPro,
      paidThrough: entitlement.periodEnd ?? null,
      // Unknowable without the record, and "renews" is a promise about money.
      renews: false,
      hasBilling: Boolean(entitlement.customerId),
      newsletter,
      confirmed: false,
    };
  }

  if (!record) {
    return {
      status: "free",
      email,
      isPro: false,
      paidThrough: null,
      renews: false,
      hasBilling: false,
      newsletter,
      confirmed: true,
    };
  }

  const access = accessFor(record, nowSeconds);
  const paidThrough = record.currentPeriodEnd > 0 ? record.currentPeriodEnd : null;
  // Either source is enough, because the portal route resolves the customer
  // from the verified identity and falls back to the claim. Reading only the
  // record left a subscriber whose claim carried a customer with a button that
  // 401s — and reading only the claim hid billing from anyone whose record
  // gained a customer after their claim was minted.
  const hasBilling = Boolean(record.customerId || entitlement.customerId);

  if (access.pro) {
    // Cancelled but not yet ended. Saying "active" here is technically true and
    // reads as "your cancellation did not work".
    const cancelling = record.cancelAtPeriodEnd === true;
    return {
      status: cancelling ? "cancelling" : "pro",
      email,
      isPro: true,
      paidThrough,
      renews: !cancelling,
      hasBilling,
      newsletter,
      confirmed: true,
    };
  }

  // Not pro. A record that once had a paid period is EXPIRED rather than free —
  // the difference is what tells somebody whether they used to be a subscriber,
  // and whether "Manage billing" is worth offering them.
  const everPaid = paidThrough !== null;
  return {
    status: everPaid ? "expired" : "free",
    email,
    isPro: false,
    paidThrough,
    renews: false,
    hasBilling,
    newsletter,
    confirmed: true,
  };
}

/** A short, human label. Used in the account panel heading. */
export function accountStatusLabel(state: AccountState): string {
  switch (state.status) {
    case "pro":
      return "Pro — active";
    case "cancelling":
      return "Pro — cancels at period end";
    case "expired":
      return "Pro — expired";
    case "free":
      return "Free account";
    case "unconfirmed":
      // Never "Free": an outage must not be reported as a fact about a
      // subscription, in either direction.
      return state.isPro ? "Pro — could not be confirmed" : "Signed in";
    default:
      return "Not signed in";
  }
}
