// =============================================================================
// PARTNER OFFERS: a trial and a coupon, and nothing else
//
// The National Immigration Project offer is 90 days of Pro at no cost, then
// 30% off. These tests pin the three places that could get it wrong:
//
//   1. the Checkout Session Stripe is asked for (trial, coupon, no promo box),
//   2. the checkout route, which refuses an unknown or unconfigured offer
//      rather than selling the full price on a page that promised a discount,
//   3. activation, which used to grant only "paid" sessions. A trial checkout
//      completes as "no_payment_required" and must still unlock Pro, but only
//      when Stripe confirms the subscription is trialing.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { emailKey } from "@/lib/billing/store";
import { MAX_TTL_DAYS, sign, type Entitlement } from "@/lib/billing/entitlement";
import { StripeClient } from "@/lib/billing/stripe";
import { loginUrl } from "@/lib/billing/identity";
import {
  OFFERS,
  couponIdFor,
  discountedUsd,
  offerById,
  offerFrom,
  offerResumePath,
  openOffers,
} from "@/lib/billing/offers";
import { PLAN_BY_ID } from "@/lib/billing/plans";

const SESSION_SECRET = "s".repeat(32);
const BUYER = "member@example.com";
const BUYER_KEY = emailKey(BUYER, SESSION_SECRET);
const COUPON = "coupon_nip_test";

const FULL_ENV: Record<string, string> = {
  BILLING_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder_for_tests",
  STRIPE_PRICE_PRO_MONTHLY: "price_monthly",
  STRIPE_PRICE_PRO_ANNUAL: "price_annual",
  BILLING_SESSION_SECRET: SESSION_SECRET,
  KV_REST_API_URL: "https://kv.example",
  KV_REST_API_TOKEN: "kv-token",
  RESEND_API_KEY: "re_placeholder",
  CRON_SECRET: "cron_placeholder",
  ALERTS_SEND: "true",
};

/** Just enough of Upstash's REST shape for checkout and activation. */
function redisEmulator() {
  const data = new Map<string, string>();
  const impl = async (_url: string, init: { body: string }) => {
    const [cmd, key, ...rest] = JSON.parse(init.body) as string[];
    let result: unknown = null;
    if (cmd === "GET") result = data.get(key) ?? null;
    else if (cmd === "SET") {
      if (rest.includes("NX") && data.has(key)) result = null;
      else {
        data.set(key, rest[0]);
        result = "OK";
      }
    } else if (cmd === "EVAL") {
      const casKey = String(rest[1]);
      if ((data.get(casKey) ?? "") === String(rest[2] ?? "")) {
        data.set(casKey, String(rest[3] ?? ""));
        result = 1;
      } else result = 0;
    } else if (cmd === "SADD") result = 1;
    else if (cmd === "SMEMBERS") result = [];
    return { ok: true, json: async () => ({ result }) };
  };
  return { data, impl };
}

function post(url: string, body: unknown, cookie?: string) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function identityCookie(email: string, now: number): string {
  const ent: Entitlement = { plan: "free", email, customerId: "", exp: now + MAX_TTL_DAYS * 86_400 };
  return `ic_ent=${sign(ent, SESSION_SECRET, now)}`;
}

const NOW = () => Math.floor(Date.now() / 1000);

let emulator: ReturnType<typeof redisEmulator>;
let stripeCalls: { url: string; body: string }[];
let stripeAnswer: (url: string) => unknown;

beforeEach(() => {
  vi.resetModules();
  for (const [k, v] of Object.entries(FULL_ENV)) process.env[k] = v;
  process.env.STRIPE_COUPON_NIP_MEMBER = COUPON;
  emulator = redisEmulator();
  stripeCalls = [];
  stripeAnswer = (url) =>
    url.includes("/customers") ? { id: "cus_member" } : { id: "cs_test_offer", url: "https://checkout.stripe.com/x" };
  vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string, init: { body?: string }) => {
    const u = String(url);
    if (u.includes("api.stripe.com")) {
      stripeCalls.push({ url: u, body: decodeURIComponent(String(init?.body ?? "")) });
      return { ok: true, status: 200, text: async () => JSON.stringify(stripeAnswer(u)) };
    }
    return emulator.impl(u, init as { body: string });
  }) as unknown as typeof fetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(FULL_ENV)) delete process.env[k];
  delete process.env.STRIPE_COUPON_NIP_MEMBER;
});

describe("the offer table", () => {
  it("states the National Immigration Project terms the email promised", () => {
    const nip = offerById("nip-member");
    expect(nip.trialDays).toBe(90);
    expect(nip.percentOff).toBe(30);
    expect(nip.path).toBe("/join/nip");
    const pro = PLAN_BY_ID.get("pro")!;
    expect(discountedUsd(pro.monthlyUsd!, nip)).toBe(13.3);
    expect(discountedUsd(pro.annualUsd!, nip)).toBe(133);
  });

  it("only knows offers by their exact id, never by a path or a URL", () => {
    expect(offerFrom("nip-member")?.id).toBe("nip-member");
    for (const bad of ["/join/nip", "NIP-MEMBER", "https://evil.example", "", 1, null, undefined]) {
      expect(offerFrom(bad)).toBeNull();
    }
    expect(offerResumePath(offerById("nip-member"), "annual")).toBe("/join/nip?resume=annual#join");
  });

  it("is closed until its coupon is configured", () => {
    const nip = offerById("nip-member");
    expect(couponIdFor(nip, {})).toBeNull();
    expect(couponIdFor(nip, { STRIPE_COUPON_NIP_MEMBER: "  " })).toBeNull();
    expect(openOffers({})).toEqual([]);
    expect(openOffers({ STRIPE_COUPON_NIP_MEMBER: "c" })).toEqual(OFFERS.map((o) => o.id));
  });
});

describe("the Checkout Session Stripe is asked for", () => {
  function client() {
    return new StripeClient({ secretKey: "sk_test_placeholder" });
  }

  it("attaches the coupon, the trial and the offer tag, and drops the promotion code box", async () => {
    await client().createCheckoutSession({
      priceId: "price_monthly",
      successUrl: "https://immigrationclock.com/account",
      cancelUrl: "https://immigrationclock.com/join/nip",
      trialDays: 90,
      couponId: COUPON,
      offerId: "nip-member",
    });
    const body = stripeCalls[0].body;
    expect(body).toContain(`discounts[0][coupon]=${COUPON}`);
    expect(body).toContain("subscription_data[trial_period_days]=90");
    expect(body).toContain("subscription_data[metadata][offer]=nip-member");
    // Stripe rejects a session that sets both.
    expect(body).not.toContain("allow_promotion_codes");
  });

  it("leaves an ordinary checkout exactly as it was", async () => {
    await client().createCheckoutSession({
      priceId: "price_monthly",
      successUrl: "https://immigrationclock.com/account",
      cancelUrl: "https://immigrationclock.com/pricing",
    });
    const body = stripeCalls[0].body;
    expect(body).toContain("allow_promotion_codes=true");
    expect(body).not.toContain("discounts");
    expect(body).not.toContain("trial_period_days");
  });
});

describe("the checkout route with an offer", () => {
  it("starts a 90 day trial with the member coupon, returning to the offer page on cancel", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      post(
        "https://immigrationclock.com/api/billing/checkout",
        { interval: "annual", offer: "nip-member" },
        identityCookie(BUYER, NOW())
      )
    );
    expect(res.status).toBe(200);
    const session = stripeCalls.find((c) => c.url.includes("/checkout/sessions"))!;
    expect(session.body).toContain("line_items[0][price]=price_annual");
    expect(session.body).toContain(`discounts[0][coupon]=${COUPON}`);
    expect(session.body).toContain("subscription_data[trial_period_days]=90");
    expect(session.body).toContain("cancel_url=https://immigrationclock.com/join/nip?checkout=cancelled");
    expect(session.body).toContain(`client_reference_id=${BUYER_KEY}`);
  });

  it("refuses an offer it does not know, before calling Stripe", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      post(
        "https://immigrationclock.com/api/billing/checkout",
        { interval: "monthly", offer: "everyone-free" },
        identityCookie(BUYER, NOW())
      )
    );
    expect(res.status).toBe(400);
    expect(stripeCalls).toHaveLength(0);
  });

  it("refuses rather than charging full price when the coupon is not configured", async () => {
    delete process.env.STRIPE_COUPON_NIP_MEMBER;
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      post(
        "https://immigrationclock.com/api/billing/checkout",
        { interval: "monthly", offer: "nip-member" },
        identityCookie(BUYER, NOW())
      )
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("offer_not_open");
    expect(stripeCalls).toHaveLength(0);
  });

  it("tells a partner page whether its offer is open, without naming configuration", async () => {
    const { GET } = await import("@/app/api/billing/checkout/route");
    const open = (await (await GET()).json()) as { openOffers: string[] };
    expect(open.openOffers).toContain("nip-member");

    delete process.env.STRIPE_COUPON_NIP_MEMBER;
    const closedText = await (await GET()).text();
    expect(JSON.parse(closedText).openOffers).toEqual([]);
    expect(closedText).not.toContain("STRIPE_COUPON");
  });
});

describe("activation of a trial checkout", () => {
  function session(over: Record<string, unknown> = {}) {
    return {
      id: "cs_test_trial",
      payment_status: "no_payment_required",
      customer: "cus_member",
      subscription: "sub_trial",
      client_reference_id: BUYER_KEY,
      ...over,
    };
  }

  it("grants Pro when Stripe says the subscription is trialing", async () => {
    const trialEnd = NOW() + 90 * 86_400;
    stripeAnswer = (url) =>
      url.includes("/checkout/sessions")
        ? session()
        : { id: "sub_trial", status: "trialing", customer: "cus_member", current_period_end: trialEnd };
    const { POST } = await import("@/app/api/billing/activate/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/activate", { sessionId: "cs_test_trial" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Set-Cookie") ?? "").toContain("ic_ent=");
    const stored = JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`) ?? "{}") as { status?: string };
    expect(stored.status).toBe("trialing");
  });

  it("grants nothing for an unpaid session whose subscription is not trialing", async () => {
    stripeAnswer = (url) =>
      url.includes("/checkout/sessions")
        ? session()
        : { id: "sub_trial", status: "active", customer: "cus_member", current_period_end: NOW() + 86_400 };
    const { POST } = await import("@/app/api/billing/activate/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/activate", { sessionId: "cs_test_trial" }));
    expect(res.status).toBe(402);
    expect(res.headers.get("Set-Cookie")).toBeNull();
  });

  it("grants nothing for an unpaid session with no subscription", async () => {
    stripeAnswer = () => session({ subscription: null });
    const { POST } = await import("@/app/api/billing/activate/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/activate", { sessionId: "cs_test_trial" }));
    expect(res.status).toBe(402);
  });

  it("does not give a trial the benefit of the doubt when the subscription cannot be read", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string, init: { body?: string }) => {
      const u = String(url);
      if (u.includes("/checkout/sessions")) {
        return { ok: true, status: 200, text: async () => JSON.stringify(session()) };
      }
      if (u.includes("api.stripe.com")) {
        return { ok: false, status: 500, text: async () => JSON.stringify({ error: { message: "down" } }) };
      }
      return emulator.impl(u, init as { body: string });
    }) as unknown as typeof fetch);
    const { POST } = await import("@/app/api/billing/activate/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/activate", { sessionId: "cs_test_trial" }));
    expect(res.status).toBe(502);
    expect(res.headers.get("Set-Cookie")).toBeNull();
    // The session was not spent, so a retry can still activate it.
    expect([...emulator.data.keys()].some((k) => k.includes("cs_test_trial"))).toBe(false);
  });
});

describe("the sign-in link remembers the offer page", () => {
  it("carries an allow-listed offer id alongside the plan", () => {
    const nip = offerById("nip-member");
    expect(loginUrl("https://immigrationclock.com", "tok", "monthly", nip)).toBe(
      "https://immigrationclock.com/account?signin=tok&resume=monthly&offer=nip-member"
    );
    expect(loginUrl("https://immigrationclock.com", "tok", "monthly")).toBe(
      "https://immigrationclock.com/account?signin=tok&resume=monthly"
    );
    // No plan, no detour: an offer alone does not change where a link lands.
    expect(loginUrl("https://immigrationclock.com", "tok", null, nip)).toBe(
      "https://immigrationclock.com/account?signin=tok"
    );
  });
});
