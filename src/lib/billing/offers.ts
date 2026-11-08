// =============================================================================
// Partner offers: a free trial and a standing discount for one group's members
//
// An offer is a short, allow-listed id that rides on the checkout request and
// on the sign-in link. It changes two things about the Stripe Checkout Session
// and nothing else: how many trial days the subscription starts with, and which
// coupon is attached. It grants nothing on its own. Access still comes only
// from a Stripe subscription that is active or trialing.
//
// WHAT THIS DOES NOT DO: check membership. Anyone who reaches the offer page
// can take the offer. The page says who it is for, the link is shared by the
// partner, and the page is kept out of search results, but there is no member
// list behind it. If that ever matters, the place to add a check is the
// checkout route, before the session is created.
//
// The coupon id is configuration, not code, because test and live Stripe have
// separate coupons. Without it the offer is closed: checkout refuses rather
// than quietly selling the full price on a page that promises a discount.
//
// THE PUBLIC FREE TRIAL is an offer with no coupon: 30 days of Pro at no cost,
// then the ordinary price. It is open whenever checkout is open, and it is
// first-time only: checkout refuses it to anyone whose Stripe customer has ever
// had a subscription, so cancelling and starting again does not reset the clock.
// =============================================================================

import type { Interval } from "./plans";

export interface OfferSpec {
  /** Allow-listed id. Travels in request bodies and in the sign-in link. */
  id: string;
  /** Who the offer is for, as the page names them. Absent for the public trial. */
  partnerName?: string;
  /** The page that sells it. A fixed same-origin path, never read from a URL. */
  path: string;
  trialDays: number;
  /** The coupon's percent_off. Shown on the page; the coupon itself must match. 0 means no coupon. */
  percentOff: number;
  /** Environment variable holding the Stripe coupon id. Absent: the offer has no coupon. */
  couponEnv?: string;
  /** Refused to anyone whose Stripe customer has ever had a subscription. */
  firstTimeOnly?: boolean;
}

export const OFFERS: readonly OfferSpec[] = [
  {
    id: "nip-member",
    partnerName: "National Immigration Project",
    path: "/join/nip",
    trialDays: 90,
    percentOff: 30,
    couponEnv: "STRIPE_COUPON_NIP_MEMBER",
  },
  {
    id: "free-trial",
    path: "/trial",
    trialDays: 30,
    percentOff: 0,
    firstTimeOnly: true,
  },
] as const;

const OFFER_BY_ID = new Map(OFFERS.map((o) => [o.id, o] as const));

/** The offer named by a request body or query string, or null. Never a path. */
export function offerFrom(value: unknown): OfferSpec | null {
  return typeof value === "string" ? OFFER_BY_ID.get(value) ?? null : null;
}

export function offerById(id: string): OfferSpec {
  const offer = OFFER_BY_ID.get(id);
  if (!offer) throw new Error(`Unknown offer: ${id}`);
  return offer;
}

/** The Stripe coupon id for an offer, or null when it has none or it is not configured. */
export function couponIdFor(
  offer: OfferSpec,
  env: Record<string, string | undefined> = process.env
): string | null {
  if (!offer.couponEnv) return null;
  const value = (env[offer.couponEnv] ?? "").trim();
  return value || null;
}

/** An offer can sell when it needs no coupon, or its coupon is configured. */
export function offerIsOpen(offer: OfferSpec, env: Record<string, string | undefined> = process.env): boolean {
  return !offer.couponEnv || couponIdFor(offer, env) !== null;
}

/** Ids of offers that can sell now, so a page can say if it is open. */
export function openOffers(env: Record<string, string | undefined> = process.env): string[] {
  return OFFERS.filter((o) => offerIsOpen(o, env)).map((o) => o.id);
}

/** The discounted price, rounded to the cent, as the page states it. */
export function discountedUsd(fullUsd: number, offer: OfferSpec): number {
  return Math.round(fullUsd * (100 - offer.percentOff)) / 100;
}

/** Where a confirmed sign-in link returns someone who started on an offer page. */
export function offerResumePath(offer: OfferSpec, interval: Interval): string {
  return `${offer.path}?resume=${interval}#join`;
}
