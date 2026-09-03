// =============================================================================
// BILLING — the parts that must be right before anyone is charged
//
// Three things are worth testing here and the rest is presentation:
//
//   1. THE FREE/PAID BOUNDARY. The founder directive says revenue is earned by
//      adding value, not by restricting public information. That is a claim a
//      test can enforce: every capability the site has today must still be
//      free, and every paid capability must be one the site does not have.
//
//   2. THE WEBHOOK SIGNATURE. The webhook is a public URL that grants access.
//      Its signature check is the only thing between a real Stripe event and a
//      forged one, so it is tested against forgery, replay, tampering and
//      malformed headers — not only the happy path.
//
//   3. THE ENTITLEMENT CLAIM. There is no database, so a signed cookie is the
//      subscription. It must be unforgeable, expire, and fail closed on every
//      kind of damage.
//
// Nothing here talks to Stripe, and no Stripe identifier appears anywhere in
// this repository.
// =============================================================================

import { describe, it, expect, vi } from "vitest";
import {
  CAPABILITY_SPECS,
  PLANS,
  PLAN_BY_ID,
  annualSavingUsd,
  capabilitiesAddedBy,
  capabilitiesFor,
  isInterval,
  isPlanId,
} from "@/lib/billing/plans";
import {
  billingEnabled,
  billingOrigin,
  billingStatus,
  isTestKey,
  priceIdFor,
  purchasableIntervals,
  type BillingEnv,
} from "@/lib/billing/config";
import {
  ANONYMOUS,
  COOKIE_NAME,
  MAX_TTL_DAYS,
  can,
  clearedCookie,
  cookieFor,
  isActive,
  sign,
  verify,
  type Entitlement,
} from "@/lib/billing/entitlement";
import {
  StripeClient,
  StripeError,
  encodeForm,
  grantsAccess,
  isHandledEvent,
  parseSignatureHeader,
  verifyWebhookSignature,
} from "@/lib/billing/stripe";
import { createHmac } from "node:crypto";

// -----------------------------------------------------------------------------
// 1. THE PROMISE: NOTHING FREE BECOMES PAID
// -----------------------------------------------------------------------------

describe("the free/paid boundary", () => {
  it("keeps every capability the site has today free", () => {
    // The rule, as a test: if the site does it today, it is free. A future
    // change that moves an existing capability behind Pro fails here, which is
    // the point — it should require deleting this test and explaining why.
    for (const c of CAPABILITY_SPECS) {
      if (c.existsToday) expect(c.plan, `${c.id} exists today and must stay free`).toBe("free");
    }
  });

  it("only sells capabilities the site does not have yet", () => {
    const paid = CAPABILITY_SPECS.filter((c) => c.plan !== "free");
    expect(paid.length).toBeGreaterThan(0);
    for (const c of paid) {
      expect(c.existsToday, `${c.id} is sold, so it must be new`).toBe(false);
    }
  });

  it("names the free platform's pillars explicitly", () => {
    // Named one by one rather than counted, so removing one is a failure and
    // not a silently smaller list.
    const free = new Set(capabilitiesFor("free").map((c) => c.id));
    for (const id of [
      "archive_read",
      "employer_directory",
      "public_api",
      "weekly_newsletter",
      "browser_follows",
      "page_csv",
    ] as const) {
      expect(free.has(id), id).toBe(true);
    }
  });

  it("gives Pro everything free plus its own", () => {
    const freeIds = capabilitiesFor("free").map((c) => c.id);
    const proIds = capabilitiesFor("pro").map((c) => c.id);
    for (const id of freeIds) expect(proIds).toContain(id);
    expect(capabilitiesAddedBy("pro").length).toBe(proIds.length - freeIds.length);
    expect(capabilitiesAddedBy("free")).toEqual([]);
  });

  it("prices the annual plan below twelve months, and says by how much", () => {
    const pro = PLAN_BY_ID.get("pro")!;
    expect(pro.monthlyUsd).toBeGreaterThan(0);
    expect(pro.annualUsd).toBeLessThan((pro.monthlyUsd ?? 0) * 12);
    expect(annualSavingUsd(pro)).toBe((pro.monthlyUsd ?? 0) * 12 - (pro.annualUsd ?? 0));
    expect(annualSavingUsd(PLAN_BY_ID.get("free")!)).toBeNull();
  });

  it("carries no Stripe identifier anywhere in the plan catalogue", () => {
    // Price ids are named by ENV VAR, never embedded. A literal price id in
    // source is both wrong per environment and a thing that gets copied.
    const serialised = JSON.stringify(PLANS);
    expect(serialised).not.toMatch(/price_[A-Za-z0-9]/);
    expect(serialised).not.toMatch(/prod_[A-Za-z0-9]/);
    expect(serialised).not.toMatch(/sk_(test|live)_/);
    expect(PLAN_BY_ID.get("pro")!.priceEnv).toEqual({
      monthly: "STRIPE_PRICE_PRO_MONTHLY",
      annual: "STRIPE_PRICE_PRO_ANNUAL",
    });
  });

  it("validates its own identifiers", () => {
    expect(isPlanId("pro")).toBe(true);
    expect(isPlanId("enterprise")).toBe(false);
    expect(isInterval("annual")).toBe(true);
    expect(isInterval("weekly")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// 2. CONFIGURATION: OFF UNTIL AN OWNER TURNS IT ON
// -----------------------------------------------------------------------------

const FULL_ENV: BillingEnv = {
  BILLING_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_example_not_a_real_key",
  STRIPE_WEBHOOK_SECRET: "whsec_example_not_a_real_secret",
  STRIPE_PRICE_PRO_MONTHLY: "price_monthly_placeholder",
  STRIPE_PRICE_PRO_ANNUAL: "price_annual_placeholder",
  BILLING_SESSION_SECRET: "a-long-random-value-for-tests-only",
};

describe("billing configuration", () => {
  it("is off when the master switch is not exactly \"true\"", () => {
    for (const value of [undefined, "", "false", "TRUE", "1", "yes"]) {
      const env = { ...FULL_ENV, BILLING_ENABLED: value };
      expect(billingEnabled(env), String(value)).toBe(false);
      expect(billingStatus(env).checkoutReady, String(value)).toBe(false);
      expect(billingStatus(env).disabledReason).toBeTruthy();
    }
    expect(billingEnabled(FULL_ENV)).toBe(true);
  });

  it("refuses checkout while any required secret is missing, and names it", () => {
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_PRO_ANNUAL",
      "BILLING_SESSION_SECRET",
    ] as const) {
      const env = { ...FULL_ENV, [key]: "" };
      const status = billingStatus(env);
      expect(status.checkoutReady, key).toBe(false);
      expect(status.missing, key).toContain(key);
    }
  });

  it("will not accept a webhook without its signing secret, even when checkout is ready", () => {
    // The dangerous half-configured state: people could be charged while the
    // confirmation could not be verified.
    const env = { ...FULL_ENV, STRIPE_WEBHOOK_SECRET: "" };
    expect(billingStatus(env).checkoutReady).toBe(true);
    expect(billingStatus(env).webhookReady).toBe(false);
    expect(billingStatus(env).missing).toContain("STRIPE_WEBHOOK_SECRET");
  });

  it("is fully ready only with the whole set", () => {
    const status = billingStatus(FULL_ENV);
    expect(status.checkoutReady).toBe(true);
    expect(status.webhookReady).toBe(true);
    expect(status.sessionsReady).toBe(true);
    expect(status.missing).toEqual([]);
    expect(status.disabledReason).toBeNull();
  });

  it("treats anything that is not a test key as live", () => {
    expect(isTestKey("sk_test_abc")).toBe(true);
    expect(isTestKey("sk_live_abc")).toBe(false);
    expect(isTestKey("rk_test_abc")).toBe(false);
    expect(isTestKey(undefined)).toBe(false);
  });

  it("reads price ids from the environment and reports which intervals are buyable", () => {
    expect(priceIdFor("monthly", FULL_ENV)).toBe("price_monthly_placeholder");
    expect(priceIdFor("annual", FULL_ENV)).toBe("price_annual_placeholder");
    expect(priceIdFor("annual", { ...FULL_ENV, STRIPE_PRICE_PRO_ANNUAL: "" })).toBeNull();
    expect(purchasableIntervals(FULL_ENV)).toEqual(["monthly", "annual"]);
    expect(purchasableIntervals({ ...FULL_ENV, STRIPE_PRICE_PRO_ANNUAL: "" })).toEqual(["monthly"]);
  });

  it("builds return URLs from the configured site, never from a request header", () => {
    expect(billingOrigin({ NEXT_PUBLIC_SITE_URL: "https://example.com/" })).toBe("https://example.com");
    expect(billingOrigin({})).toBe("https://immigrationclock.com");
  });
});

// -----------------------------------------------------------------------------
// 3. THE ENTITLEMENT CLAIM
// -----------------------------------------------------------------------------

const SECRET = "test-signing-secret-not-used-anywhere-real";
const NOW = 1_800_000_000;

function pro(over: Partial<Entitlement> = {}): Entitlement {
  return { plan: "pro", email: "someone@example.com", customerId: "cus_placeholder", exp: NOW + 3600, ...over };
}

describe("the entitlement claim", () => {
  it("round-trips a valid claim", () => {
    const token = sign(pro(), SECRET, NOW);
    const back = verify(token, SECRET, NOW);
    expect(back).toEqual(pro());
  });

  it("refuses a claim signed with another secret", () => {
    const token = sign(pro(), "some-other-secret", NOW);
    expect(verify(token, SECRET, NOW)).toBeNull();
  });

  it("refuses a tampered payload", () => {
    // The whole point: upgrading yourself by editing the cookie must fail.
    const token = sign({ ...pro(), plan: "free" }, SECRET, NOW);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "pro", e: "", c: "", x: NOW + 3600 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verify(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(verify(`${payload}.${signature}`, SECRET, NOW)?.plan).toBe("free");
  });

  it("refuses an expired claim", () => {
    const token = sign(pro({ exp: NOW + 10 }), SECRET, NOW);
    expect(verify(token, SECRET, NOW)).not.toBeNull();
    expect(verify(token, SECRET, NOW + 11)).toBeNull();
  });

  it("caps how long a claim can be minted for", () => {
    // Even handed a period end years away, the cookie cannot outlive the policy.
    const token = sign(pro({ exp: NOW + 10 * 365 * 86_400 }), SECRET, NOW);
    const back = verify(token, SECRET, NOW)!;
    expect(back.exp).toBe(NOW + MAX_TTL_DAYS * 86_400);
  });

  it("fails closed on damage rather than throwing", () => {
    for (const bad of ["", "not-a-token", "a.b", ".", "..", "x".repeat(500), `${"a".repeat(20)}.short`]) {
      expect(() => verify(bad, SECRET, NOW)).not.toThrow();
      expect(verify(bad, SECRET, NOW), bad.slice(0, 12)).toBeNull();
    }
    expect(verify(undefined, SECRET, NOW)).toBeNull();
    expect(verify(sign(pro(), SECRET, NOW), "", NOW)).toBeNull();
  });

  it("will not sign without a secret", () => {
    expect(() => sign(pro(), "", NOW)).toThrow(/BILLING_SESSION_SECRET/);
  });

  it("gates capabilities by plan, and never gates a free one", () => {
    expect(can(ANONYMOUS, "archive_read")).toBe(true);
    expect(can(null, "employer_directory")).toBe(true);
    expect(can(null, "public_api")).toBe(true);
    expect(can(null, "bulk_export")).toBe(false);
    expect(can(ANONYMOUS, "watchlist_alerts")).toBe(false);
    expect(can(pro(), "bulk_export")).toBe(true);
    expect(can(pro(), "archive_read")).toBe(true);
  });

  it("treats only an unexpired paid claim as active", () => {
    expect(isActive(pro(), NOW)).toBe(true);
    expect(isActive(pro({ exp: NOW - 1 }), NOW)).toBe(false);
    expect(isActive(ANONYMOUS, NOW)).toBe(false);
    expect(isActive(null, NOW)).toBe(false);
  });

  it("ships the cookie httpOnly, Lax and Secure", () => {
    // httpOnly: script must never read it. Lax, not Strict: the reader arrives
    // from checkout.stripe.com by top-level navigation and Strict would
    // withhold the cookie on exactly that request.
    const c = cookieFor("token", NOW + 3600, NOW);
    expect(c.name).toBe(COOKIE_NAME);
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe("lax");
    expect(c.secure).toBe(true);
    expect(c.maxAge).toBe(3600);
    expect(clearedCookie().maxAge).toBe(0);
    expect(clearedCookie().value).toBe("");
  });
});

// -----------------------------------------------------------------------------
// 4. THE WEBHOOK SIGNATURE — the security boundary
// -----------------------------------------------------------------------------

const WEBHOOK_SECRET = "whsec_test_secret_not_real";

function signedHeader(body: string, timestamp: number, secret = WEBHOOK_SECRET): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}

describe("the Stripe webhook signature", () => {
  const body = JSON.stringify({ id: "evt_x", type: "customer.subscription.updated" });

  it("accepts a correctly signed, fresh body", () => {
    const result = verifyWebhookSignature(body, signedHeader(body, NOW), WEBHOOK_SECRET, NOW);
    expect(result.ok).toBe(true);
  });

  it("rejects a forged signature", () => {
    const forged = `t=${NOW},v1=${"0".repeat(64)}`;
    expect(verifyWebhookSignature(body, forged, WEBHOOK_SECRET, NOW).ok).toBe(false);
  });

  it("rejects a body signed with a different secret", () => {
    const header = signedHeader(body, NOW, "whsec_someone_elses_secret");
    expect(verifyWebhookSignature(body, header, WEBHOOK_SECRET, NOW).ok).toBe(false);
  });

  it("rejects a tampered body whose signature was valid for the original", () => {
    const header = signedHeader(body, NOW);
    const tampered = body.replace("updated", "created");
    expect(verifyWebhookSignature(tampered, header, WEBHOOK_SECRET, NOW).ok).toBe(false);
  });

  it("rejects a replay outside the tolerance window", () => {
    // Without this a signature captured once is valid forever.
    const header = signedHeader(body, NOW);
    expect(verifyWebhookSignature(body, header, WEBHOOK_SECRET, NOW + 299).ok).toBe(true);
    const late = verifyWebhookSignature(body, header, WEBHOOK_SECRET, NOW + 301);
    expect(late.ok).toBe(false);
    expect(late.reason).toMatch(/tolerance/);
    // And a timestamp from the future is just as suspect.
    expect(verifyWebhookSignature(body, header, WEBHOOK_SECRET, NOW - 400).ok).toBe(false);
  });

  it("accepts any of several v1 signatures, as Stripe sends during rotation", () => {
    const good = createHmac("sha256", WEBHOOK_SECRET).update(`${NOW}.${body}`).digest("hex");
    const header = `t=${NOW},v1=${"f".repeat(64)},v1=${good}`;
    expect(verifyWebhookSignature(body, header, WEBHOOK_SECRET, NOW).ok).toBe(true);
  });

  it("rejects malformed, missing and empty headers without throwing", () => {
    for (const header of [null, "", "garbage", "t=,v1=", "v1=abc", `t=${NOW}`, "t=notanumber,v1=abc"]) {
      const result = verifyWebhookSignature(body, header, WEBHOOK_SECRET, NOW);
      expect(result.ok, String(header)).toBe(false);
      expect(result.reason).toBeTruthy();
    }
  });

  it("refuses everything when no signing secret is configured", () => {
    const result = verifyWebhookSignature(body, signedHeader(body, NOW), "", NOW);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/signing secret/);
  });

  it("parses the header into its parts", () => {
    expect(parseSignatureHeader(`t=${NOW},v1=abc,v1=def`)).toEqual({ timestamp: NOW, signatures: ["abc", "def"] });
    expect(parseSignatureHeader("nonsense")).toBeNull();
  });
});

describe("which events change access", () => {
  it("handles the four that matter and ignores the rest", () => {
    expect(isHandledEvent("checkout.session.completed")).toBe(true);
    expect(isHandledEvent("customer.subscription.deleted")).toBe(true);
    expect(isHandledEvent("invoice.paid")).toBe(false);
    expect(isHandledEvent("payment_intent.succeeded")).toBe(false);
  });

  it("grants access only for an active or trialing subscription", () => {
    expect(grantsAccess("active")).toBe(true);
    expect(grantsAccess("trialing")).toBe(true);
    for (const status of ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused", null]) {
      expect(grantsAccess(status), String(status)).toBe(false);
    }
  });
});

// -----------------------------------------------------------------------------
// 5. THE STRIPE CLIENT
// -----------------------------------------------------------------------------

describe("the Stripe client", () => {
  function client(impl: typeof fetch) {
    return new StripeClient({ secretKey: "sk_test_placeholder", fetchImpl: impl });
  }

  function ok(body: unknown): Response {
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  }

  it("form-encodes nested fields the way Stripe expects", () => {
    expect(encodeForm({ mode: "subscription", "line_items[0][price]": "price_x" })).toContain(
      "line_items%5B0%5D%5Bprice%5D=price_x"
    );
    expect(encodeForm({ a: { b: "c" } })).toBe("a%5Bb%5D=c");
    expect(encodeForm({ skip: undefined, keep: "yes" })).toBe("keep=yes");
  });

  it("creates a subscription checkout session with our return URLs", async () => {
    const fetchImpl = vi.fn(async () => ok({ id: "cs_x", url: "https://checkout.stripe.com/x" }));
    const session = await client(fetchImpl as unknown as typeof fetch).createCheckoutSession({
      priceId: "price_x",
      successUrl: "https://immigrationclock.com/account?session_id={CHECKOUT_SESSION_ID}",
      cancelUrl: "https://immigrationclock.com/pricing?checkout=cancelled",
    });

    expect(session.url).toBe("https://checkout.stripe.com/x");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_test_placeholder");
    expect(init.body).toContain("mode=subscription");
    expect(init.body).toContain("CHECKOUT_SESSION_ID");
    // Pinned so Stripe cannot change a field shape under a running deployment.
    expect((init.headers as Record<string, string>)["Stripe-Version"]).toBeTruthy();
  });

  it("surfaces Stripe's own message on an error, with the status, and never the key", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: "Invalid API Key provided: sk_test_***" } }),
    } as unknown as Response));

    await expect(client(fetchImpl as unknown as typeof fetch).getSubscription("sub_x")).rejects.toThrow(StripeError);
    try {
      await client(fetchImpl as unknown as typeof fetch).getSubscription("sub_x");
    } catch (err) {
      expect((err as StripeError).status).toBe(401);
      expect((err as Error).message).not.toContain("sk_test_placeholder");
    }
  });

  it("opens a portal session for one customer", async () => {
    const fetchImpl = vi.fn(async () => ok({ url: "https://billing.stripe.com/p/session/x" }));
    const result = await client(fetchImpl as unknown as typeof fetch).createPortalSession({
      customerId: "cus_x",
      returnUrl: "https://immigrationclock.com/account",
    });
    expect(result.url).toContain("billing.stripe.com");
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toContain("customer=cus_x");
  });
});
