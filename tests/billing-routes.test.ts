// =============================================================================
// THE BILLING ROUTES REFUSE BEFORE THEY DO ANYTHING
//
// Four public endpoints now exist that can create Stripe objects and grant
// access. The property that matters most about all four, on the day they ship,
// is that they do NOTHING: no environment is configured, so every one of them
// answers 503 and no request ever reaches Stripe.
//
// That is what makes this safe to merge before an owner has a Stripe account,
// and it is the first thing a regression would break — a route that read a key
// as "" and called the API anyway would fail somewhere much less obvious.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BILLING_UNAVAILABLE_MESSAGE } from "@/lib/billing/config";
import { resetRateLimiter, readCookie, serializeCookie } from "@/lib/billing/http";

const BILLING_VARS = [
  "BILLING_ENABLED",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PRO_MONTHLY",
  "STRIPE_PRICE_PRO_ANNUAL",
  "BILLING_SESSION_SECRET",
  // Readiness now requires a subscriber store and a way to send a sign-in
  // link. Without them the duplicate guard, the customer index and the only
  // recovery path a subscriber has all silently do nothing while cards are
  // charged normally, so they are part of "configured" rather than extras.
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "RESEND_API_KEY",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  resetRateLimiter();
  for (const key of BILLING_VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of BILLING_VARS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.restoreAllMocks();
});

function post(url: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("with nothing configured — the shipped state", () => {
  it("checkout refuses, names the switch, and calls no API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/checkout", { interval: "monthly" }));

    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("billing_not_configured");
    // THIS ASSERTION USED TO REQUIRE THE LEAK. It matched /BILLING_ENABLED/,
    // so the test enforced showing a visitor the literal string
    // 'BILLING_ENABLED is not set to "true", so every billing surface is
    // switched off.' under the Subscribe button. A customer can do nothing with
    // that, and everyone else learns how the deployment is wired.
    expect(body.message).toBe(BILLING_UNAVAILABLE_MESSAGE);
    expect(body.message).not.toMatch(/BILLING_ENABLED|STRIPE_|KV_REST|_SECRET|env\b/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("the webhook refuses rather than acknowledging deliveries it cannot verify", async () => {
    // 503 and not 200: an unconfigured endpoint that answered 200 would show
    // as a healthy endpoint in the Stripe dashboard while verifying nothing.
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/webhook", { type: "x" }));
    expect(res.status).toBe(503);
  });

  it("the portal refuses", async () => {
    const { POST } = await import("@/app/api/billing/portal/route");
    expect((await POST(post("https://immigrationclock.com/api/billing/portal"))).status).toBe(503);
  });

  it("activation refuses", async () => {
    const { POST } = await import("@/app/api/billing/activate/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/activate", { sessionId: "cs_test_x" }));
    expect(res.status).toBe(503);
  });

  it("the readiness probe answers ready-or-not without naming configuration", async () => {
    // It used to return `missing: ["STRIPE_SECRET_KEY", ...]` and
    // `disabledReason` from an UNAUTHENTICATED endpoint — variable names are
    // configuration, and this told anyone who asked how the deployment is set
    // up. An operator gets the precise list from `npm run billing:verify`,
    // which reads billingStatus() directly rather than over HTTP.
    const { GET } = await import("@/app/api/billing/checkout/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.checkoutReady).toBe(false);
    expect(body.missing).toBeUndefined();
    expect(body.disabledReason).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/sk_(test|live)_|STRIPE_|BILLING_ENABLED|KV_REST/);
  });
});

describe("no billing route leaks configuration to a caller", () => {
  // A sweep rather than four separate assertions, so a route added later is
  // covered the moment someone points this at it.
  const CONFIG = /BILLING_ENABLED|BILLING_SESSION_SECRET|STRIPE_[A-Z_]+|KV_REST_API|process\.env|sk_(test|live)_|whsec_/;

  it("keeps checkout, portal, activate and the webhook free of it", async () => {
    const routes: [string, () => Promise<Response>][] = [
      [
        "checkout",
        async () =>
          (await import("@/app/api/billing/checkout/route")).POST(
            post("https://immigrationclock.com/api/billing/checkout", { interval: "monthly" })
          ),
      ],
      [
        "portal",
        async () =>
          (await import("@/app/api/billing/portal/route")).POST(
            post("https://immigrationclock.com/api/billing/portal")
          ),
      ],
      [
        "activate",
        async () =>
          (await import("@/app/api/billing/activate/route")).POST(
            post("https://immigrationclock.com/api/billing/activate", { sessionId: "cs_test_x" })
          ),
      ],
      [
        "webhook",
        async () =>
          (await import("@/app/api/billing/webhook/route")).POST(
            post("https://immigrationclock.com/api/billing/webhook", { type: "x" })
          ),
      ],
    ];

    for (const [name, call] of routes) {
      const res = await call();
      const text = JSON.stringify(await res.json());
      expect(text, `${name} leaked configuration: ${text}`).not.toMatch(CONFIG);
    }
  });
});

describe("with the switch on but a secret missing", () => {
  it("still refuses checkout, without naming the gap to the caller", async () => {
    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";
    process.env.RESEND_API_KEY = "re_test_placeholder";
    // Prices and the session secret are absent.
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/checkout", { interval: "monthly" }));
    expect(res.status).toBe(503);
    const { message } = (await res.json()) as { message: string };
    expect(message).toBe(BILLING_UNAVAILABLE_MESSAGE);
    expect(message).not.toMatch(/STRIPE_PRICE_PRO_MONTHLY|BILLING_SESSION_SECRET/);
  });

  it("rejects a bad interval before calling Stripe", async () => {
    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";
    process.env.RESEND_API_KEY = "re_test_placeholder";
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_m";
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_a";
    process.env.BILLING_SESSION_SECRET = "s".repeat(32);
    // Selling now requires being able to verify the confirmation, so this
    // fixture has to be complete for the route to get as far as the interval.
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_placeholder";

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/checkout", { interval: "hourly" }));

    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the webhook, once its secret exists", () => {
  beforeEach(() => {
    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";
    process.env.RESEND_API_KEY = "re_test_placeholder";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_placeholder_for_tests";
  });

  it("rejects an unsigned delivery", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/webhook", { type: "invoice.paid" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_signature");
  });

  it("rejects a delivery signed with the wrong secret", async () => {
    const { createHmac } = await import("node:crypto");
    const body = JSON.stringify({ id: "evt_x", type: "customer.subscription.deleted" });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", "whsec_not_the_configured_one").update(`${t}.${body}`).digest("hex");

    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/webhook", {
        method: "POST",
        headers: { "stripe-signature": `t=${t},v1=${sig}` },
        body,
      })
    );
    expect(res.status).toBe(400);
  });

  it("accepts a correctly signed event, and acknowledges one it does not handle", async () => {
    const { createHmac } = await import("node:crypto");
    const { POST } = await import("@/app/api/billing/webhook/route");

    async function deliver(payload: Record<string, unknown>) {
      const body = JSON.stringify(payload);
      const t = Math.floor(Date.now() / 1000);
      const sig = createHmac("sha256", "whsec_placeholder_for_tests").update(`${t}.${body}`).digest("hex");
      return POST(
        new Request("https://immigrationclock.com/api/billing/webhook", {
          method: "POST",
          headers: { "stripe-signature": `t=${t},v1=${sig}` },
          body,
        })
      );
    }

    const handled = await deliver({
      id: "evt_1",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", status: "active" } },
    });
    expect(handled.status).toBe(200);
    expect(await handled.json()).toMatchObject({ received: true, handled: true, access: true });

    const cancelled = await deliver({
      id: "evt_2",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", status: "canceled" } },
    });
    expect(await cancelled.json()).toMatchObject({ handled: true, access: false });

    // An event we do not handle is acknowledged, not rejected: a 400 would
    // make Stripe retry it for days and eventually disable the endpoint.
    const ignored = await deliver({ id: "evt_3", type: "invoice.paid", data: { object: {} } });
    expect(ignored.status).toBe(200);
    expect(await ignored.json()).toMatchObject({ received: true, handled: false });
  });
});

describe("activation refuses a session it has not verified", () => {
  beforeEach(() => {
    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";
    process.env.RESEND_API_KEY = "re_test_placeholder";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_placeholder_for_tests";
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_m";
    process.env.STRIPE_PRICE_PRO_ANNUAL = "price_a";
    process.env.BILLING_SESSION_SECRET = "s".repeat(32);
  });

  it("rejects anything that is not a checkout session id, without calling Stripe", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { POST } = await import("@/app/api/billing/activate/route");

    for (const sessionId of ["", "sub_123", "../../etc", "cs_", "<script>"]) {
      const res = await POST(post("https://immigrationclock.com/api/billing/activate", { sessionId }));
      expect(res.status, sessionId).toBe(400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("grants nothing when Stripe says the session was not paid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: "cs_x", payment_status: "unpaid", customer: "cus_x" }),
    } as unknown as Response);

    const { POST } = await import("@/app/api/billing/activate/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/activate", { sessionId: "cs_test_abc123" }));

    expect(res.status).toBe(402);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("mints an httpOnly claim when Stripe says the session was paid", async () => {
    const periodEnd = Math.floor(Date.now() / 1000) + 20 * 86_400;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/checkout/sessions")
        ? {
            id: "cs_x",
            payment_status: "paid",
            customer: "cus_x",
            subscription: "sub_x",
            // The identity this deployment stamped on the session. Activation
            // keys on this and never on the address below, which is exactly
            // what stops a paid session carrying somebody else's address from
            // rewriting their record.
            client_reference_id: "A".repeat(32),
            customer_details: { email: "buyer@example.com" },
          }
        : { id: "sub_x", status: "active", customer: "cus_x", current_period_end: periodEnd };
      return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
    });

    const { POST } = await import("@/app/api/billing/activate/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/activate", { sessionId: "cs_test_abc123" }));

    expect(res.status).toBe(200);
    const cookie = res.headers.get("Set-Cookie") ?? "";
    expect(cookie).toContain("ic_ent=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    // The claim is signed; the cookie must not carry the email in the clear.
    expect(cookie).not.toContain("buyer@example.com");
  });
});

describe("cookie plumbing", () => {
  it("serialises and reads back a cookie", () => {
    const header = serializeCookie({
      name: "ic_ent",
      value: "abc",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60,
    });
    expect(header).toBe("ic_ent=abc; Path=/; Max-Age=60; SameSite=Lax; HttpOnly; Secure");

    const req = new Request("https://immigrationclock.com/", { headers: { cookie: "other=1; ic_ent=abc; x=2" } });
    expect(readCookie(req, "ic_ent")).toBe("abc");
    expect(readCookie(req, "missing")).toBeNull();
    expect(readCookie(new Request("https://immigrationclock.com/"), "ic_ent")).toBeNull();
  });
});
