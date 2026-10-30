// =============================================================================
// AFTER "EMAIL ME A LINK", ONE CLEAR STATE, AND A STRIPE REFUSAL WE CAN READ
//
// A buyer on a phone saw "Check your inbox" and "Too many attempts" at once,
// with the email box still live, and took it for a broken checkout. After a
// send there is now one message naming the address, and a single resend that
// waits out the minute. Separately, a live checkout that Stripe refused showed
// only "HTTP 400"; the response now carries Stripe's code and parameter.
// =============================================================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { StripeClient, StripeError } from "@/lib/billing/stripe";

const read = (rel: string) => readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");

describe("the sent state", () => {
  const source = read("src/components/UpgradeButton.tsx");
  const start = source.indexOf('state === "sent" ? (');
  const sent = source.slice(start, source.indexOf("<>", start));

  it("names the address and says to open the link on this device", () => {
    expect(sent).toContain("We emailed a link to");
    expect(sent).toContain("{email}");
    expect(sent).toContain("Open it on this device");
  });

  it("shows no email form, only a resend that waits out the minute", () => {
    expect(sent).not.toContain("<form");
    expect(sent).toContain("Send it again");
    expect(sent).toMatch(/disabled=\{resendBusy \|\| now < resendAt\}/);
  });

  it("treats a rate-limited resend as still sent, never as an error beside it", () => {
    expect(source).toMatch(/res\.ok \|\| \(resending && res\.status === 429\)/);
  });
});

describe("a Stripe refusal", () => {
  it("keeps Stripe's code and parameter, not just the status", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({ error: { message: "No such coupon: 'x'", code: "resource_missing", param: "discounts[0][coupon]" } }),
        { status: 400 }
      )) as unknown as typeof fetch;
    const client = new StripeClient({ secretKey: "sk_test_x", fetchImpl });
    const err = await client
      .createCheckoutSession({ priceId: "price_x", successUrl: "https://a/s", cancelUrl: "https://a/c", couponId: "x" })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StripeError);
    expect((err as StripeError).status).toBe(400);
    expect((err as StripeError).code).toBe("resource_missing");
    expect((err as StripeError).param).toBe("discounts[0][coupon]");
  });

  it("returns that code and parameter from the checkout route", () => {
    const route = read("src/app/api/billing/checkout/route.ts");
    expect(route).toContain("stripe = err instanceof StripeError ? { code: err.code, param: err.param }");
    expect(route).toContain("Nothing was charged");
  });
});
