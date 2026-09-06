// =============================================================================
// ENTITLEMENTS — who may use what, and how the server knows
//
// THE CONSTRAINT THAT SHAPES ALL OF THIS: THERE IS NO DATABASE.
//
// This repository has no database, no ORM and no auth provider, and the whole
// site is 3,856 prerendered pages plus one serverless function. Adding Postgres
// and a session table to sell a subscription would be the largest architectural
// change in the project's history, and it would be made before a single person
// has paid.
//
// So Stripe is the system of record, and the browser carries a SIGNED CLAIM
// rather than a session id pointing at a row we do not have:
//
//   1. Checkout is Stripe-hosted. Stripe collects the email and the card.
//   2. On return, the server asks Stripe about that checkout session and, only
//      if it is genuinely paid, mints a cookie: {plan, email, customerId, exp},
//      signed with BILLING_SESSION_SECRET.
//   3. Every gate verifies the signature and the expiry. No lookup, no round
//      trip, no shared state between serverless invocations.
//   4. The cookie is short-lived on purpose (see MAX_TTL_DAYS). A cancellation
//      takes effect when it lapses at the latest, and the webhook shortens that
//      by refusing to re-mint.
//
// WHAT THIS DELIBERATELY IS NOT: it is not a general auth system, there are no
// passwords, and the claim cannot be used to read anything about a person. It
// says "this browser may export CSVs", not "this is who you are".
//
// WHY HMAC RATHER THAN A JWT LIBRARY: the payload is four fields we control on
// both sides, the repository already hand-rolls HMAC signing for X's OAuth 1.0a
// (src/lib/social/platforms/x.ts) and verifies Stripe's own webhook scheme the
// same way, and a JWT dependency would add a parser for algorithms we never
// use — including "none", which is how JWT libraries get people breached.
// =============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";
import { CAPABILITY_BY_ID, isPlanId, type Capability, type PlanId } from "./plans";

/**
 * How long a minted claim is good for.
 *
 * Short enough that a cancelled subscription cannot keep working for long,
 * long enough that a paying reader is not asked to prove themselves weekly.
 * The claim is also capped by the subscription's own period end, so a monthly
 * subscriber's cookie never outlives the month they paid for.
 */
export const MAX_TTL_DAYS = 30;

export interface Entitlement {
  plan: PlanId;
  /** The billing email, so the account page can say whose subscription this is. */
  email: string;
  /** Stripe customer id, used only to open the customer portal. */
  customerId: string;
  /** Unix seconds. When this CLAIM lapses — at most MAX_TTL_DAYS away. */
  exp: number;
  /**
   * Unix seconds: when the PAID PERIOD ends, straight from Stripe. Unclamped.
   *
   * WHY THIS IS SEPARATE FROM `exp`. The claim is deliberately short-lived so a
   * cancellation cannot keep working for long, and `sign()` clamps `exp` to
   * MAX_TTL_DAYS to enforce that. The account page then rendered `exp` — so
   * somebody who had just paid $190 for a year was told their access ran out in
   * thirty days. The clamp is right; showing it to the customer was not.
   *
   * This field is for DISPLAY and for deciding whether to re-mint. It grants
   * nothing: every gate reads `exp`, and real capability re-reads the store.
   */
  periodEnd?: number;
}

/** The anonymous state: everything free, nothing more. */
export const ANONYMOUS: Entitlement = { plan: "free", email: "", customerId: "", exp: 0 };

/**
 * A VERIFIED IDENTITY that is not paying for anything.
 *
 * Someone who has proved control of an email address through the magic-link
 * flow but holds no subscription. It is `plan: "free"`, so it unlocks nothing
 * anywhere — `can()` and `isActive()` both treat it as anonymous — but it
 * carries the verified address, which is what checkout now requires before it
 * will create a Stripe customer or a session in that person's name.
 */
export function isVerifiedIdentity(entitlement: Entitlement | null, nowSeconds: number): boolean {
  return Boolean(entitlement && entitlement.email && entitlement.exp > nowSeconds);
}

/** May this entitlement use this capability? */
export function can(entitlement: Entitlement | null, capability: Capability): boolean {
  const spec = CAPABILITY_BY_ID.get(capability);
  if (!spec) return false;
  if (spec.plan === "free") return true;
  return (entitlement?.plan ?? "free") === spec.plan;
}

/** True when the claim is a paid plan that has not lapsed. */
export function isActive(entitlement: Entitlement | null, nowSeconds: number): boolean {
  return Boolean(entitlement && entitlement.plan !== "free" && entitlement.exp > nowSeconds);
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signature(payload: string, secret: string): string {
  return base64url(createHmac("sha256", secret).update(payload).digest());
}

/**
 * Mint a signed claim.
 *
 * `exp` is clamped to MAX_TTL_DAYS so a caller cannot mint a claim that
 * outlives the policy by passing a distant period end from Stripe.
 */
export function sign(entitlement: Entitlement, secret: string, nowSeconds: number): string {
  if (!secret) throw new Error("BILLING_SESSION_SECRET is required to sign an entitlement");
  const exp = Math.min(entitlement.exp, nowSeconds + MAX_TTL_DAYS * 86_400);
  const payload = base64url(
    JSON.stringify({
      p: entitlement.plan,
      e: entitlement.email,
      c: entitlement.customerId,
      x: exp,
      // The true paid-through date rides along UNCLAMPED, for display only.
      ...(entitlement.periodEnd ? { v: entitlement.periodEnd } : {}),
    })
  );
  return `${payload}.${signature(payload, secret)}`;
}

/**
 * Read a claim back, or null.
 *
 * Null for every failure mode without distinguishing them to the caller: a
 * forged signature, a truncated cookie, an expired claim and a plan that no
 * longer exists all mean the same thing to a gate — this browser is anonymous.
 */
export function verify(token: string | undefined | null, secret: string, nowSeconds: number): Entitlement | null {
  if (!token || !secret) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = signature(payload, secret);

  // Constant-time, and length-guarded: timingSafeEqual throws on a length
  // mismatch, which would turn a malformed cookie into a 500.
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let parsed: { p?: unknown; e?: unknown; c?: unknown; x?: unknown; v?: unknown };
  try {
    parsed = JSON.parse(fromBase64url(payload).toString("utf8"));
  } catch {
    return null;
  }

  const plan = typeof parsed.p === "string" && isPlanId(parsed.p) ? parsed.p : null;
  const exp = typeof parsed.x === "number" ? parsed.x : 0;
  if (!plan || exp <= nowSeconds) return null;

  return {
    plan,
    email: typeof parsed.e === "string" ? parsed.e : "",
    customerId: typeof parsed.c === "string" ? parsed.c : "",
    exp,
    ...(typeof parsed.v === "number" && Number.isFinite(parsed.v) ? { periodEnd: parsed.v } : {}),
  };
}

/** The cookie this claim travels in. httpOnly: script must never read it. */
export const COOKIE_NAME = "ic_ent";

export interface CookieOptions {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export function cookieFor(token: string, exp: number, nowSeconds: number, secure = true): CookieOptions {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure,
    // Lax, not Strict: the reader arrives from checkout.stripe.com by
    // top-level navigation, and Strict would withhold the cookie on exactly
    // that first request.
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, exp - nowSeconds),
  };
}

/** The cookie that clears the claim. */
/**
 * A readable companion to the entitlement cookie: "a session exists here".
 *
 * WHY A SECOND COOKIE RATHER THAN READING THE FIRST. The entitlement cookie is
 * httpOnly and must stay that way — script must never be able to read a signed
 * claim. But that leaves the browser unable to tell whether asking the server
 * about a subscription is worth doing, so it asked on every page load, and an
 * anonymous reader got a 503 logged to their console for a feature they do not
 * have. Console noise on the free product to service a paid one is the wrong
 * way round.
 *
 * THIS COOKIE GRANTS NOTHING. It carries no identity, no plan and no
 * signature — one character, meaning "somebody signed in on this browser at
 * some point". Forging it buys a request that answers 401. Every gate still
 * reads the signed cookie and re-checks the store.
 */
export const SESSION_HINT_NAME = "ic_session";

/**
 * Same shape, but readable. A SEPARATE TYPE ON PURPOSE: CookieOptions pins
 * httpOnly to the literal `true` so the entitlement cookie cannot be made
 * script-readable by accident, and that guarantee is worth more than the
 * convenience of one shared interface.
 */
export interface ReadableCookieOptions extends Omit<CookieOptions, "httpOnly"> {
  httpOnly: false;
}

export function sessionHintCookie(exp: number, nowSeconds: number, secure = true): ReadableCookieOptions {
  return {
    name: SESSION_HINT_NAME,
    value: "1",
    // Deliberately readable: this is the one thing script is allowed to know.
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, exp - nowSeconds),
  };
}

export function clearedSessionHintCookie(secure = true): ReadableCookieOptions {
  return { name: SESSION_HINT_NAME, value: "", httpOnly: false, secure, sameSite: "lax", path: "/", maxAge: 0 };
}

export function clearedCookie(secure = true): CookieOptions {
  return { name: COOKIE_NAME, value: "", httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 };
}
