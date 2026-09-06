// =============================================================================
// scripts/verify-billing.ts — is billing correctly configured, in TEST mode?
//
//   npm run billing:verify
//
// WHAT IT IS FOR
// --------------
// The billing code is complete and heavily tested, but every test runs against
// a fake Stripe. The one thing tests cannot tell you is whether the values in
// YOUR environment are the right values: whether the secret key works, whether
// the two price ids exist, whether they cost what the pricing page says, and
// whether any of it is pointing at live mode by accident.
//
// This asks Stripe. It performs READ-ONLY calls — it retrieves the account and
// the two prices and nothing else. It creates nothing, charges nothing, and
// changes nothing.
//
// IT REFUSES TO RUN AGAINST A LIVE KEY. A verification script that quietly
// worked against production is a script that will eventually be run against
// production by someone who thought it was safe. Pass --allow-live if you have
// a specific reason, and read the code first.
//
// IT INVENTS NOTHING. Every line of output is either something Stripe returned
// or something the environment does not contain. A missing value is reported as
// missing; nothing is defaulted, guessed, or filled in.
// =============================================================================

import { billingStatus, isTestKey, priceIdFor, type BillingEnv } from "../src/lib/billing/config";
import { PLAN_BY_ID } from "../src/lib/billing/plans";
import { STRIPE_API_VERSION } from "../src/lib/billing/stripe";

const ALLOW_LIVE = process.argv.includes("--allow-live");
const env = process.env as BillingEnv;

const API = "https://api.stripe.com/v1";

interface Check {
  name: string;
  ok: boolean | null; // null = could not be checked
  detail: string;
}

const checks: Check[] = [];
const add = (name: string, ok: boolean | null, detail: string) => checks.push({ name, ok, detail });

async function stripeGet<T>(path: string, key: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    // The same pin the app uses. A verifier that asked Stripe under a
    // different API version could pass while production failed.
    headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_API_VERSION },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.replace(/\s+/g, " ").slice(0, 200);
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      /* keep the raw text */
    }
    throw new Error(`${res.status}: ${message}`);
  }
  return JSON.parse(text) as T;
}

interface StripePrice {
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  livemode: boolean;
  type: string;
  recurring?: { interval: string; interval_count: number } | null;
  product: string;
}

interface StripeAccount {
  id: string;
  business_profile?: { name?: string | null } | null;
  charges_enabled?: boolean;
}

async function main() {
  const rule = "─".repeat(78);
  console.log(rule);
  console.log("BILLING CONFIGURATION CHECK");
  console.log(rule);

  // ---- what the app itself thinks -----------------------------------------
  const status = billingStatus(env);
  console.log("\nWHAT THE APP SEES");
  console.log(`  checkout ready   ${status.checkoutReady}`);
  console.log(`  webhook ready    ${status.webhookReady}`);
  console.log(`  sessions ready   ${status.sessionsReady}`);
  console.log(`  test mode        ${status.testMode}`);
  if (status.disabledReason) console.log(`  disabled         ${status.disabledReason}`);
  if (status.missing.length) console.log(`  missing          ${status.missing.join(", ")}`);

  // ---- the environment, without printing any of it ------------------------
  const key = env.STRIPE_SECRET_KEY;
  add("STRIPE_SECRET_KEY present", Boolean(key), key ? `starts "${key.slice(0, 8)}…"` : "not set");
  add(
    "BILLING_SESSION_SECRET is long enough",
    env.BILLING_SESSION_SECRET ? env.BILLING_SESSION_SECRET.length >= 32 : null,
    env.BILLING_SESSION_SECRET
      ? `${env.BILLING_SESSION_SECRET.length} characters`
      : "not set — the entitlement cookie cannot be signed"
  );
  add(
    "STRIPE_WEBHOOK_SECRET looks like a signing secret",
    env.STRIPE_WEBHOOK_SECRET ? env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_") : null,
    env.STRIPE_WEBHOOK_SECRET
      ? `starts "${env.STRIPE_WEBHOOK_SECRET.slice(0, 6)}…"`
      : "not set — the webhook will reject every delivery"
  );
  add(
    "a subscriber store is configured",
    Boolean((env.KV_REST_API_URL ?? "").trim() && (env.KV_REST_API_TOKEN ?? "").trim()),
    (env.KV_REST_API_URL ?? "").trim() && (env.KV_REST_API_TOKEN ?? "").trim()
      ? "KV_REST_API_URL and KV_REST_API_TOKEN are set"
      : "not set — the duplicate guard, the customer index and every cancellation would silently do nothing"
  );
  add(
    "sign-in email can be sent",
    Boolean((env.RESEND_API_KEY ?? "").trim()),
    (env.RESEND_API_KEY ?? "").trim()
      ? "RESEND_API_KEY is set (verify the sending domain in Resend separately)"
      : "not set — a subscriber who clears cookies has no way back in, and the site would still say a link was sent"
  );
  add(
    "BILLING_ENABLED",
    (env.BILLING_ENABLED ?? "").trim() === "true",
    (env.BILLING_ENABLED ?? "").trim() === "true"
      ? "true — billing surfaces are live"
      : "not \"true\" — every billing surface is switched off, which is the shipped state"
  );

  if (!key) {
    report(checks);
    console.log("\nNothing further can be checked without STRIPE_SECRET_KEY.");
    console.log("See docs/stripe-activation.md for how to obtain one in TEST mode.");
    process.exitCode = 1;
    return;
  }

  if (!isTestKey(key) && !ALLOW_LIVE) {
    console.log("\n✗ REFUSING TO CONTINUE: this is not a test-mode key.");
    console.log("  STRIPE_SECRET_KEY does not start with sk_test_.");
    console.log("  Verify in test mode first. Pass --allow-live only deliberately.");
    process.exitCode = 1;
    return;
  }

  // ---- ask Stripe ----------------------------------------------------------
  console.log("\nASKING STRIPE (read-only)");
  try {
    const account = await stripeGet<StripeAccount>("/account", key);
    add(
      "the secret key works",
      true,
      `account ${account.id}${account.business_profile?.name ? ` (${account.business_profile.name})` : ""}`
    );
    // DECLARED AND NEVER READ until now. In live mode an account that has not
    // finished activation accepts no charges at all, and nothing here would
    // have said so before the first customer found out.
    add(
      "the account can accept charges",
      account.charges_enabled === undefined ? null : account.charges_enabled === true,
      account.charges_enabled === undefined
        ? "Stripe did not report charges_enabled"
        : account.charges_enabled
          ? "charges enabled"
          : "CHARGES DISABLED — finish account activation in the Stripe dashboard"
    );
  } catch (e) {
    add("the secret key works", false, (e as Error).message);
    report(checks);
    process.exitCode = 1;
    return;
  }

  const pro = PLAN_BY_ID.get("pro")!;
  for (const interval of ["monthly", "annual"] as const) {
    const priceId = priceIdFor(interval, env);
    if (!priceId) {
      add(`${interval} price id set`, null, `${pro.priceEnv?.[interval]} is not set`);
      continue;
    }
    try {
      const price = await stripeGet<StripePrice>(`/prices/${priceId}`, key);
      const expectedCents = (interval === "monthly" ? pro.monthlyUsd : pro.annualUsd)! * 100;
      const expectedInterval = interval === "monthly" ? "month" : "year";

      add(`${interval} price exists`, true, `${price.id}, product ${price.product}`);
      // THE KEY AND THE PRICE MUST AGREE, whichever mode that is.
      //
      // This used to assert `livemode === false` as the PASS condition, so a
      // correctly configured live account scored failures by design and there
      // was no green signal for live mode at all — only the test-mode one.
      // What actually matters is that the five values describe ONE account:
      // going live means re-entering all of them, and updating four is a
      // normal mistake that leaves checkout 502ing on the half that did not
      // change, with every readiness signal still green.
      const keyIsTest = isTestKey(key);
      add(
        `${interval} price mode matches the key`,
        price.livemode === !keyIsTest,
        price.livemode === !keyIsTest
          ? `both ${keyIsTest ? "test" : "LIVE"} mode`
          : `MISMATCH — the key is ${keyIsTest ? "test" : "live"} mode and this price is ${price.livemode ? "live" : "test"} mode`
      );
      add(`${interval} price is active`, price.active, price.active ? "active" : "archived in Stripe");
      add(
        `${interval} price is recurring ${expectedInterval}ly`,
        price.type === "recurring" && price.recurring?.interval === expectedInterval,
        `type ${price.type}, interval ${price.recurring?.interval ?? "none"}`
      );
      add(
        `${interval} price is $${(expectedCents / 100).toFixed(0)} USD`,
        price.unit_amount === expectedCents && price.currency === "usd",
        `${price.currency.toUpperCase()} ${((price.unit_amount ?? 0) / 100).toFixed(2)} — the pricing page says $${(expectedCents / 100).toFixed(0)}`
      );
    } catch (e) {
      add(`${interval} price exists`, false, (e as Error).message);
    }
  }

  report(checks);

  const failed = checks.filter((c) => c.ok === false);
  const unchecked = checks.filter((c) => c.ok === null);

  console.log("");
  if (failed.length > 0) {
    console.log(`${failed.length} check(s) failed. Fix those before testing a purchase.`);
    process.exitCode = 1;
  } else if (unchecked.length > 0) {
    console.log(`${unchecked.length} value(s) not set. See docs/stripe-activation.md.`);
    process.exitCode = 1;
  } else if (!status.checkoutReady) {
    console.log("Every value checks out individually, but billingStatus() still refuses to sell.");
    console.log(`  missing: ${status.missing.join(", ") || "nothing"}`);
    process.exitCode = 1;
  } else {
    console.log(`Everything checked out, in ${status.testMode ? "TEST" : "LIVE"} mode.`);
    console.log("Next: buy a subscription with card 4242 4242 4242 4242 and walk");
    console.log("the lifecycle in docs/stripe-activation.md.");
  }
}

function report(list: Check[]) {
  console.log("");
  for (const c of list) {
    const mark = c.ok === true ? "✓" : c.ok === false ? "✗" : "—";
    console.log(`  ${mark} ${c.name.padEnd(42)} ${c.detail}`);
  }
}

main();
