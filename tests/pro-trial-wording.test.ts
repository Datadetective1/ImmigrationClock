// =============================================================================
// A FREE TRIAL IS NOT A PAYMENT
//
// The /trial offer creates a subscription that Stripe calls "trialing" and has
// charged nothing. The welcome email told those subscribers their subscription
// was "active", that Stripe had "sent the payment receipt", and that Pro was
// "paid through" the trial's last day; the account page said "Renews on". Both
// read like a charge had happened. These tests pin the trial wording, and that
// a paying subscriber still gets the receipt-style email.
// Found in a live end-to-end Pro test on Nov 8, 2026.
// =============================================================================

import { describe, it, expect } from "vitest";
import { buildProWelcomeEmail } from "@/lib/billing/welcome-email";
import { trialFactsOf } from "@/lib/billing/onboarding";
import { accountStateFor, accountStatusLabel } from "@/lib/billing/account-state";
import { decodeEntities, richText } from "@/domains/graph/text";
import type { SubscriberRecord } from "@/lib/billing/store";
import type { Entitlement } from "@/lib/billing/entitlement";

const END = Date.UTC(2026, 11, 8) / 1000; // Dec 8, 2026
const base = {
  email: "reader@example.com",
  interval: "month" as const,
  amountMinor: 1900,
  currency: "usd",
  periodEnd: END,
  origin: "https://immigrationclock.com",
  testMode: false,
};

describe("Pro welcome email during a free trial", () => {
  const mail = buildProWelcomeEmail({ ...base, trialEnd: END });

  it("says the trial started and nothing was charged", () => {
    expect(mail.subject).toBe("Your ImmigrationClock Pro free trial has started");
    expect(mail.text).toContain("Nothing was charged today.");
    expect(mail.text).toContain("Free trial ends:   December 8, 2026");
    expect(mail.text).toContain("After the trial:   $19.00 per month");
    expect(mail.text).toContain("Cancel before December 8, 2026 and you will not be charged.");
    expect(mail.html).toContain("Your free trial has started");
  });

  it("never reads like a payment confirmation", () => {
    for (const body of [mail.text, mail.html]) {
      expect(body).not.toMatch(/payment receipt/i);
      expect(body).not.toMatch(/paid through/i);
      expect(body).not.toMatch(/subscription is active/i);
    }
  });

  it("leaves the price out when a discount applies after the trial", () => {
    const discounted = buildProWelcomeEmail({ ...base, trialEnd: END, discounted: true });
    expect(discounted.text).not.toContain("$19.00");
    expect(discounted.html).not.toContain("$19.00");
  });

  it("keeps the receipt-style email for a paid start", () => {
    const paid = buildProWelcomeEmail({ ...base, trialEnd: null });
    expect(paid.subject).toBe("Welcome to ImmigrationClock Pro");
    expect(paid.text).toContain("Paid through:  December 8, 2026");
  });
});

describe("reading trial facts from the Stripe subscription", () => {
  it("finds a trial only when Stripe says trialing", () => {
    expect(trialFactsOf({ status: "trialing", trial_end: END })).toEqual({ trialEnd: END, discounted: false });
    expect(trialFactsOf({ status: "active", trial_end: END }).trialEnd).toBeNull();
  });

  it("notices a discount in either Stripe shape", () => {
    expect(trialFactsOf({ status: "trialing", trial_end: END, discount: { id: "di_1" } }).discounted).toBe(true);
    expect(trialFactsOf({ status: "trialing", trial_end: END, discounts: ["di_1"] }).discounted).toBe(true);
  });
});

describe("account page during a free trial", () => {
  const now = Math.floor(Date.now() / 1000);
  const claim: Entitlement = { plan: "pro", email: "reader@example.com", customerId: "cus_1", exp: now + 86_400 };
  const rec = (status: string): SubscriberRecord => ({
    email: "reader@example.com",
    customerId: "cus_1",
    status,
    currentPeriodEnd: now + 30 * 86_400,
    updatedAt: now,
  });

  it("labels a trial as a trial", () => {
    const state = accountStateFor(claim, rec("trialing"), now);
    expect(state.trial).toBe(true);
    expect(accountStatusLabel(state)).toBe("Pro: free trial");
  });

  it("keeps the paid label for an active subscription", () => {
    const state = accountStateFor(claim, rec("active"), now);
    expect(state.trial).toBe(false);
    expect(accountStatusLabel(state)).toBe("Pro: active");
  });
});

describe("double-encoded non-breaking spaces", () => {
  it("decodes &amp;nbsp; to a space instead of leaving &nbsp; on the page", () => {
    expect(decodeEntities("Services&amp;nbsp;(USCIS)")).toBe("Services (USCIS)");
    expect(richText("opening an&amp;nbsp;asylum office")).toBe("opening an asylum office");
  });

  it("still keeps an author's escaped markup as text", () => {
    expect(decodeEntities("&amp;lt;p&amp;gt;")).toBe("&lt;p&gt;");
  });
});
