// =============================================================================
// WHAT MUST BE TRUE THE MOMENT REAL CARDS ARE CHARGED
//
// Cutover is one coordinated environment change — the Stripe secret key, both
// Price ids and the webhook signing secret, swapped together. Everything that
// makes that safe is already covered somewhere in this suite; what is NOT
// covered is the COMPOSITION, and the composition is what fails at 2am.
//
// Three properties, each of which has a specific, expensive failure:
//
//   1. Every "this is only a test" reassurance disappears on its own. If one
//      is hardcoded, or gated on something other than the key, a live
//      deployment tells a paying customer their card will not be charged.
//      It has to be impossible to leave one switched on by accident.
//
//   2. No Stripe identifier is ever hardcoded in the repository. A price id
//      pasted into source is a price the environment cannot override — so a
//      live deployment would charge against a TEST price, or against last
//      quarter's price, with no way to tell from the environment.
//
//   3. checkoutReady stays all-or-nothing. A half-configured live deployment
//      is the one state that charges cards while recording nothing.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { billingStatus, isTestKey, type BillingEnv } from "@/lib/billing/config";

const src = (rel: string) => readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");

/**
 * The same file with comments removed.
 *
 * This codebase explains each defect in prose directly above the code that
 * fixes it, so a "this string must appear at most once" check counts the
 * explanation too — and fails the file for documenting itself.
 */
const codeOf = (rel: string) =>
  src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");

/** A fully configured deployment, parameterised by key so both modes are testable. */
const env = (key: string): BillingEnv => ({
  BILLING_ENABLED: "true",
  STRIPE_SECRET_KEY: key,
  STRIPE_WEBHOOK_SECRET: "whsec_x".padEnd(38, "y"),
  STRIPE_PRICE_PRO_MONTHLY: "price_monthly",
  STRIPE_PRICE_PRO_ANNUAL: "price_annual",
  BILLING_SESSION_SECRET: "s".repeat(32),
  KV_REST_API_URL: "https://kv.example",
  KV_REST_API_TOKEN: "tok",
  RESEND_API_KEY: "re_x",
});

describe("the test-mode reassurances vanish by themselves at cutover", () => {
  it("testMode follows the KEY, so nothing has to be remembered", () => {
    expect(billingStatus(env("sk_test_abc")).testMode).toBe(true);
    expect(billingStatus(env("sk_live_abc")).testMode).toBe(false);
    // Everything checkout needs is still satisfied in live mode — the only
    // thing that changed is whether we claim cards are safe.
    expect(billingStatus(env("sk_live_abc")).checkoutReady).toBe(true);
  });

  it("treats anything that is not explicitly a test key as LIVE", () => {
    // The only unsafe direction is telling somebody they are in test mode
    // while a real card is charged. A restricted key, a typo or an empty
    // value must all fail closed toward "this is real money".
    for (const k of ["sk_live_abc", "rk_live_abc", "sk_", "", undefined, "SK_TEST_ABC"]) {
      expect(isTestKey(k as string | undefined), String(k)).toBe(false);
    }
    expect(isTestKey("sk_test_abc")).toBe(true);
  });

  it("every test-mode banner in the product is gated on that one answer", () => {
    // Each of these renders a sentence promising no card is charged. If any of
    // them is ever shown unconditionally — or gated on a hand-set flag — a live
    // deployment lies to a paying customer at the moment they are deciding.
    const surfaces: [string, RegExp][] = [
      ["src/components/PurchasePanel.tsx", /\{testMode \?/],
      ["src/app/account/page.tsx", /status\.testMode \?/],
      ["src/lib/billing/welcome-email.ts", /input\.testMode/],
    ];
    for (const [file, gate] of surfaces) {
      const source = src(file);
      expect(source, `${file} lost its test-mode gate`).toMatch(gate);
      // And EVERY occurrence of the reassurance must sit inside that gate.
      //
      // A count rule is the wrong shape here: welcome-email.ts states it twice
      // and both are correct — once for the text part of the email and once for
      // the HTML part. What matters is that no occurrence is ungated, so this
      // requires a testMode reference within the few lines above each claim.
      const lines = codeOf(file).split("\n");
      lines.forEach((line, i) => {
        if (!/No real card (is|was) charged/.test(line)) return;
        const context = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
        expect(
          context,
          `${file}:${i + 1} promises no card is charged without a testMode gate above it`
        ).toMatch(/testMode/);
      });
    }
  });

  it("the account page's notice cannot outlive a live key", () => {
    // Belt and braces on the surface a subscriber sees most often.
    const page = src("src/app/account/page.tsx");
    expect(page).toMatch(/Stripe is in test mode on this deployment/);
    expect(page).toMatch(/status\.testMode/);
  });
});

describe("no Stripe identifier is ever hardcoded", () => {
  it("src/ contains no key, price id or signing secret", () => {
    // A price id in source is a price the environment cannot override, which
    // at cutover means charging against a TEST price from a LIVE deployment.
    // The one permitted occurrence is the `sk_test_` PREFIX that isTestKey
    // compares against, which is a discriminator rather than a credential.
    const files = [
      "src/lib/billing/config.ts",
      "src/lib/billing/stripe.ts",
      "src/lib/billing/plans.ts",
      "src/app/pricing/page.tsx",
      "src/app/api/billing/checkout/route.ts",
      "src/app/api/billing/webhook/route.ts",
      "src/app/api/billing/portal/route.ts",
      "src/app/api/billing/activate/route.ts",
    ];
    const forbidden = /sk_live_[A-Za-z0-9]|price_1[A-Za-z0-9]{10,}|whsec_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]/;
    for (const f of files) {
      expect(src(f), `${f} hardcodes a Stripe identifier`).not.toMatch(forbidden);
    }
  });

  it("prices are resolved from the environment, never from plans.ts", () => {
    // plans.ts carries DISPLAY amounts. The authoritative price is the Stripe
    // Price object named by the env var, and the two must not be conflated.
    const plans = src("src/lib/billing/plans.ts");
    expect(plans).toContain('priceEnv: { monthly: "STRIPE_PRICE_PRO_MONTHLY", annual: "STRIPE_PRICE_PRO_ANNUAL" }');
    expect(plans, "plans.ts invented a Stripe id").not.toMatch(/price_[A-Za-z0-9]{8,}/);
  });
});

describe("a half-configured live deployment cannot sell", () => {
  it("checkoutReady requires every variable, not most of them", () => {
    // The dangerous state is charging cards while the webhook cannot be
    // verified — money moves and nothing records it.
    const required: (keyof BillingEnv)[] = [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_PRO_ANNUAL",
      "BILLING_SESSION_SECRET",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
      "RESEND_API_KEY",
    ];
    for (const key of required) {
      const broken = { ...env("sk_live_abc"), [key]: "" };
      expect(billingStatus(broken).checkoutReady, `checkout stayed open without ${key}`).toBe(false);
      expect(billingStatus(broken).missing).toContain(key);
    }
  });

  it("the master switch alone can close everything", () => {
    const off = { ...env("sk_live_abc"), BILLING_ENABLED: "" };
    expect(billingStatus(off).checkoutReady).toBe(false);
    expect(billingStatus(off).webhookReady).toBe(false);
    // Only the exact string "true" counts — not "TRUE", not "1", not "yes".
    for (const v of ["TRUE", "1", "yes", "true "]) {
      expect(billingStatus({ ...env("sk_live_abc"), BILLING_ENABLED: v }).checkoutReady, v).toBe(
        v.trim() === "true"
      );
    }
  });
});
