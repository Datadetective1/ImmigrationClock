// =============================================================================
// BILLING CONFIGURATION — inert until an owner turns it on
//
// The pattern is the one the social publisher already uses (SOCIAL_POST_ENABLED
// in .github/workflows/social.yml): the whole subsystem ships switched off, and
// the switch is an environment variable in the deployment rather than a code
// change. Nothing here reads a value at module load, nothing throws at build,
// and every route asks `billingStatus()` before it does anything.
//
// WHY THAT MATTERS MORE THAN USUAL HERE
// -------------------------------------
// A billing route that half-works is worse than one that refuses. If
// STRIPE_SECRET_KEY is present but STRIPE_WEBHOOK_SECRET is missing, checkout
// would succeed and the webhook confirming it would be silently unverifiable —
// people would be charged and nothing would grant them access. So the status
// below is all-or-nothing per surface, and each surface names exactly what it
// still needs.
//
// SECRETS
// -------
// Every variable in this file is server-side. None carries the NEXT_PUBLIC_
// prefix and none may ever get one: a NEXT_PUBLIC_ variable is inlined into the
// browser bundle, so prefixing STRIPE_SECRET_KEY would publish it. The one
// public value is the pricing page's own copy, which lives in plans.ts.
//
// This file contains no Stripe identifiers. Price ids, product ids, the
// publishable key and the account are all created by the owner in the Stripe
// dashboard and supplied here by name only. See docs/monetization.md.
// =============================================================================

import { INTERVALS, PLAN_BY_ID, type Interval } from "./plans";

export interface BillingEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_PRICE_PRO_ANNUAL?: string;
  BILLING_SESSION_SECRET?: string;
  BILLING_ENABLED?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}

export interface BillingStatus {
  /** The master switch is on AND everything checkout needs is present. */
  checkoutReady: boolean;
  /** The webhook can verify a signature. */
  webhookReady: boolean;
  /** A session cookie can be signed and read back. */
  sessionsReady: boolean;
  /** True when the key is a test-mode key, so the UI can say so out loud. */
  testMode: boolean;
  /** What is still missing, in the order an operator should fix it. */
  missing: string[];
  /** Set when the master switch itself is off, whatever else is configured. */
  disabledReason: string | null;
}

/**
 * What a VISITOR is told when billing cannot serve them.
 *
 * One sentence, no configuration in it. `disabledReason` and `missing` name
 * environment variables and internal switches — "BILLING_ENABLED is not set to
 * \"true\"" was being rendered under the Subscribe button on /pricing, which
 * tells a customer nothing they can act on and tells everyone else how the
 * deployment is wired.
 *
 * The diagnostics are not lost, they are moved: routes log them server-side,
 * and `npm run billing:verify` reads billingStatus() directly rather than over
 * HTTP, so an operator still gets the precise list.
 */
export const BILLING_UNAVAILABLE_MESSAGE =
  "Subscriptions are not open yet. Nothing on the site is behind a paywall, and the weekly email stays free.";

/** The master switch, exactly like SOCIAL_POST_ENABLED: only "true" counts. */
export function billingEnabled(env: BillingEnv = process.env as BillingEnv): boolean {
  return (env.BILLING_ENABLED ?? "").trim() === "true";
}

/**
 * Is a Stripe key a test key?
 *
 * Stripe's live keys begin `sk_live_`; test keys begin `sk_test_`. Anything
 * else — a restricted key, a malformed value — is treated as live, because the
 * only unsafe direction is telling someone they are in test mode when a real
 * card would be charged.
 */
export function isTestKey(key: string | undefined): boolean {
  return (key ?? "").startsWith("sk_test_");
}

export function billingStatus(env: BillingEnv = process.env as BillingEnv): BillingStatus {
  const missing: string[] = [];
  const has = (name: keyof BillingEnv) => Boolean((env[name] ?? "").trim());

  if (!has("STRIPE_SECRET_KEY")) missing.push("STRIPE_SECRET_KEY");
  if (!has("STRIPE_PRICE_PRO_MONTHLY")) missing.push("STRIPE_PRICE_PRO_MONTHLY");
  if (!has("STRIPE_PRICE_PRO_ANNUAL")) missing.push("STRIPE_PRICE_PRO_ANNUAL");
  if (!has("BILLING_SESSION_SECRET")) missing.push("BILLING_SESSION_SECRET");
  if (!has("STRIPE_WEBHOOK_SECRET")) missing.push("STRIPE_WEBHOOK_SECRET");

  const enabled = billingEnabled(env);
  const sessionsReady = has("BILLING_SESSION_SECRET");

  return {
    checkoutReady:
      enabled &&
      has("STRIPE_SECRET_KEY") &&
      has("STRIPE_PRICE_PRO_MONTHLY") &&
      has("STRIPE_PRICE_PRO_ANNUAL") &&
      sessionsReady,
    webhookReady: enabled && has("STRIPE_SECRET_KEY") && has("STRIPE_WEBHOOK_SECRET"),
    sessionsReady,
    testMode: isTestKey(env.STRIPE_SECRET_KEY),
    missing,
    disabledReason: enabled
      ? null
      : 'BILLING_ENABLED is not set to "true", so every billing surface is switched off.',
  };
}

/** The Stripe Price id for one interval, or null when it is not configured. */
export function priceIdFor(
  interval: Interval,
  env: BillingEnv = process.env as BillingEnv
): string | null {
  const plan = PLAN_BY_ID.get("pro");
  if (!plan?.priceEnv) return null;
  const name = plan.priceEnv[interval] as keyof BillingEnv;
  const value = (env[name] ?? "").trim();
  return value || null;
}

/** Every interval that currently has a configured price. */
export function purchasableIntervals(env: BillingEnv = process.env as BillingEnv): Interval[] {
  return INTERVALS.filter((i) => priceIdFor(i, env) !== null);
}

/**
 * The absolute origin Stripe returns the reader to.
 *
 * Stripe requires absolute URLs for success_url and cancel_url, and a relative
 * one fails at the API rather than at the redirect — so this resolves the same
 * way SITE.url does and never guesses a host from a request header, which is
 * how an open redirect gets built by accident.
 */
export function billingOrigin(env: BillingEnv = process.env as BillingEnv): string {
  return (env.NEXT_PUBLIC_SITE_URL || "https://immigrationclock.com").replace(/\/$/, "");
}
