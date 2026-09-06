// =============================================================================
// LIVE-MODE BILLING READINESS — one test per blocker, named after the harm
//
// A pre-live audit found nine blockers in the billing path. Every one of them
// was a way to take real money and then do the wrong thing with it: bill twice,
// deny a paying customer, hand one person another's account, or keep serving
// somebody whose money had already been returned.
//
// These tests exist so none of them can come back quietly. Each one describes
// the FAILURE it prevents, in money terms, because a test named after the
// implementation stops explaining itself the moment the implementation changes.
//
// The Redis client speaks a tiny command vocabulary over HTTP, so the store is
// exercised against an in-memory emulator of exactly those commands rather than
// mocked away — SET NX in particular, because the duplicate guards are only
// atomic if it is honoured.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { emailKey } from "@/lib/billing/store";
import { MAX_TTL_DAYS, sign, verify, type Entitlement } from "@/lib/billing/entitlement";
import { billingStatus, type BillingEnv } from "@/lib/billing/config";
import { HANDLED_EVENTS } from "@/lib/billing/stripe";

const WEBHOOK_SECRET = "whsec_placeholder_for_tests";
const SESSION_SECRET = "s".repeat(32);
const BUYER = "buyer@example.com";
const VICTIM = "victim@example.com";
const BUYER_KEY = emailKey(BUYER, SESSION_SECRET);
const VICTIM_KEY = emailKey(VICTIM, SESSION_SECRET);

const FULL_ENV: BillingEnv = {
  BILLING_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_PRO_MONTHLY: "price_monthly",
  STRIPE_PRICE_PRO_ANNUAL: "price_annual",
  BILLING_SESSION_SECRET: SESSION_SECRET,
  KV_REST_API_URL: "https://kv.example",
  KV_REST_API_TOKEN: "kv-token",
  RESEND_API_KEY: "re_placeholder",
};

// -----------------------------------------------------------------------------
// A Redis the tests can break on purpose.
// -----------------------------------------------------------------------------
function redisEmulator(opts: { failAfter?: number } = {}) {
  const data = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  let calls = 0;
  let failing = false;

  const impl = async (_url: string, init: { body: string }) => {
    calls += 1;
    if (failing || (opts.failAfter !== undefined && calls > opts.failAfter)) {
      // What a real Upstash blip looks like to the client: a non-2xx.
      return { ok: false, status: 500, json: async () => ({}), text: async () => "boom" };
    }
    const args = JSON.parse(init.body) as string[];
    const [cmd, key, ...rest] = args;
    let result: unknown = null;
    switch (cmd) {
      case "GET":
        result = data.get(key) ?? null;
        break;
      case "SET": {
        const nx = rest.includes("NX");
        if (nx && data.has(key)) result = null;
        else {
          data.set(key, rest[0]);
          result = "OK";
        }
        break;
      }
      case "GETDEL":
        result = data.get(key) ?? null;
        data.delete(key);
        break;
      case "SADD": {
        const s = sets.get(key) ?? new Set<string>();
        s.add(rest[0]);
        sets.set(key, s);
        result = 1;
        break;
      }
      case "SMEMBERS":
        result = [...(sets.get(key) ?? [])];
        break;
      default:
        result = null;
    }
    return { ok: true, json: async () => ({ result }) };
  };

  return { data, impl, break: () => { failing = true; }, heal: () => { failing = false; } };
}

function signedEvent(event: Record<string, unknown>) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${t}.${body}`).digest("hex");
  return new Request("https://immigrationclock.com/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${sig}` },
    body,
  });
}

function post(url: string, body: unknown, cookie?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

/** A signed entitlement cookie, as the magic-link flow would mint it. */
function identityCookie(email: string, plan: "free" | "pro", now: number, periodEnd?: number): string {
  const ent: Entitlement = {
    plan,
    email,
    customerId: plan === "pro" ? "cus_existing" : "",
    exp: periodEnd ?? now + MAX_TTL_DAYS * 86_400,
    ...(periodEnd ? { periodEnd } : {}),
  };
  return `ic_ent=${sign(ent, SESSION_SECRET, now)}`;
}

const NOW = () => Math.floor(Date.now() / 1000);

let emulator: ReturnType<typeof redisEmulator>;

beforeEach(() => {
  vi.resetModules();
  for (const [k, v] of Object.entries(FULL_ENV)) process.env[k] = v as string;
  emulator = redisEmulator();
  vi.spyOn(globalThis, "fetch").mockImplementation(emulator.impl as unknown as typeof fetch);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(FULL_ENV)) delete process.env[k];
});

/** The record the checkout route writes before Stripe is ever called. */
function seed(key: string, email: string, over: Record<string, unknown> = {}) {
  emulator.data.set(
    `sub:${key}`,
    JSON.stringify({ email, customerId: "cus_1", status: "incomplete", currentPeriodEnd: 0, updatedAt: 1, ...over })
  );
  emulator.data.set("cust:cus_1", key);
}

// =============================================================================
// BLOCKER 1 — ACCOUNT TAKEOVER BY TYPING SOMEBODY ELSE'S ADDRESS
// =============================================================================
describe("blocker 1 · a paid checkout cannot seize another person's account", () => {
  it("keys the subscriber on OUR reference, never on the address typed at Stripe", async () => {
    // The attack: victim@ is a paying subscriber. An attacker who knows the
    // address pays $19 on their own card and types victim@ at Stripe Checkout.
    // The old webhook keyed on customer_details.email, so this rewrote the
    // victim's record — their customer id, their watchlist, their access.
    const now = NOW();
    seed(VICTIM_KEY, VICTIM, { status: "active", currentPeriodEnd: now + 30 * 86_400 });
    emulator.data.set("cust:cus_attacker", BUYER_KEY);
    emulator.data.set(
      `sub:${BUYER_KEY}`,
      JSON.stringify({ email: BUYER, customerId: "cus_attacker", status: "incomplete", currentPeriodEnd: 0, updatedAt: 1 })
    );

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(
      signedEvent({
        id: "evt_attack",
        created: now,
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_attack",
            customer: "cus_attacker",
            // OUR reference says who this really is.
            client_reference_id: BUYER_KEY,
            // The attacker typed the victim's address on Stripe's page.
            customer_details: { email: VICTIM },
          },
        },
      })
    );

    const victim = JSON.parse(emulator.data.get(`sub:${VICTIM_KEY}`)!);
    expect(victim.customerId, "the victim's customer id was overwritten").toBe("cus_1");
    expect(victim.email).toBe(VICTIM);

    const attacker = JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`)!);
    expect(attacker.email, "the attacker's record took the victim's address").toBe(BUYER);
  });

  it("ignores a client_reference_id that did not come from us", async () => {
    // A forged reference must not become a key into the store.
    const now = NOW();
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(
      signedEvent({
        id: "evt_forged",
        created: now,
        type: "checkout.session.completed",
        data: { object: { id: "cs_f", customer: "cus_unknown", client_reference_id: "../../etc/passwd" } },
      })
    );
    expect(res.status).toBe(200);
    expect([...emulator.data.keys()].some((k) => k.startsWith("sub:"))).toBe(false);
  });

  it("refuses to start a checkout for an unverified visitor", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/checkout", { interval: "monthly" }));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("identity_required");
  });
});

// =============================================================================
// BLOCKER 2 — TWO SUBSCRIPTIONS, BOTH BILLING
// =============================================================================
describe("blocker 2 · one identity, one customer, one subscription", () => {
  it("refuses a second checkout while one is live, and points at the portal", async () => {
    const now = NOW();
    seed(BUYER_KEY, BUYER, { status: "active", currentPeriodEnd: now + 300 * 86_400 });

    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      post(
        "https://immigrationclock.com/api/billing/checkout",
        { interval: "annual" },
        identityCookie(BUYER, "pro", now)
      )
    );

    expect(res.status, "a monthly subscriber could buy the annual plan too").toBe(409);
    const body = (await res.json()) as { error: string; manageUrl?: string };
    expect(body.error).toBe("already_subscribed");
    expect(body.manageUrl).toContain("/account");
  });

  it("reuses the canonical customer rather than minting a second one", async () => {
    const now = NOW();
    seed(BUYER_KEY, BUYER, { status: "canceled", currentPeriodEnd: now - 10 });
    emulator.data.set(`idcust:${BUYER_KEY}`, "cus_canonical");

    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string, init: { body: string }) => {
      const u = String(url);
      if (u.includes("api.stripe.com")) {
        calls.push(u + "|" + String(init?.body ?? ""));
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "cs_1", url: "https://stripe/x" }) };
      }
      return emulator.impl(u, init);
    }) as unknown as typeof fetch);

    const { POST } = await import("@/app/api/billing/checkout/route");
    const res = await POST(
      post("https://immigrationclock.com/api/billing/checkout", { interval: "monthly" }, identityCookie(BUYER, "free", now))
    );

    expect(res.status).toBe(200);
    expect(calls.some((c) => c.includes("/customers")), "a second Stripe customer was created").toBe(false);
    const session = calls.find((c) => c.includes("/checkout/sessions"))!;
    expect(session).toContain("customer=cus_canonical");
    expect(decodeURIComponent(session)).toContain(`client_reference_id=${BUYER_KEY}`);
  });

  it("survives two simultaneous first checkouts with one canonical customer", async () => {
    // SET NX decides; the loser adopts the winner rather than keeping its own.
    const { RedisStore } = await import("@/lib/billing/store");
    const store = new RedisStore({ url: "https://kv.example", token: "t", fetchImpl: emulator.impl as unknown as typeof fetch });
    const [a, b] = await Promise.all([
      store.putCustomerForIdentity(BUYER_KEY, "cus_A"),
      store.putCustomerForIdentity(BUYER_KEY, "cus_B"),
    ]);
    expect(a).toBe(b);
    expect(await store.getCustomerForIdentity(BUYER_KEY)).toBe(a);
  });
});

// =============================================================================
// BLOCKER 3 — A YEAR PAID FOR, THIRTY DAYS GRANTED
// =============================================================================
describe("blocker 3 · an annual subscription is not a thirty-day one", () => {
  it("carries the true paid-through date even though the claim is clamped", () => {
    const now = NOW();
    const oneYear = now + 365 * 86_400;
    const token = sign({ plan: "pro", email: BUYER, customerId: "cus_1", exp: oneYear, periodEnd: oneYear }, SESSION_SECRET, now);
    const back = verify(token, SESSION_SECRET, now)!;

    // The CLAIM is still short-lived: that is what limits a cancelled
    // subscription to thirty days of lingering access.
    expect(back.exp).toBeLessThanOrEqual(now + MAX_TTL_DAYS * 86_400);
    // But the PAID PERIOD is intact, and that is what the account page shows.
    // Rendering the clamp told a $190 buyer their year ended in a month.
    expect(back.periodEnd).toBe(oneYear);
  });

  it("re-mints the claim while the store still says the subscription is live", async () => {
    const now = NOW();
    const oneYear = now + 365 * 86_400;
    seed(BUYER_KEY, BUYER, { status: "active", currentPeriodEnd: oneYear });

    const { POST } = await import("@/app/api/billing/session/refresh/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/session/refresh", {
        method: "POST",
        headers: { cookie: identityCookie(BUYER, "pro", now) },
      })
    );

    expect(res.status, "an annual subscriber was signed out on day 31").toBe(200);
    expect(res.headers.get("Set-Cookie") ?? "").toContain("ic_ent=");
  });

  it("does NOT re-mint for a subscription that has ended, and clears the cookie", async () => {
    const now = NOW();
    seed(BUYER_KEY, BUYER, { status: "canceled", currentPeriodEnd: now - 1 });

    const { POST } = await import("@/app/api/billing/session/refresh/route");
    const res = await POST(
      new Request("https://immigrationclock.com/api/billing/session/refresh", {
        method: "POST",
        headers: { cookie: identityCookie(BUYER, "pro", now) },
      })
    );

    expect(res.status).toBe(402);
    expect(res.headers.get("Set-Cookie") ?? "").toMatch(/ic_ent=;|ic_ent=\s*;|Max-Age=0/);
  });
});

// =============================================================================
// BLOCKERS 4 & 5 — WEBHOOK ORDER, RETRIES AND LOST WRITES
// =============================================================================
describe("blockers 4 and 5 · every event converges, and none is lost silently", () => {
  it("applies a subscription event that arrives BEFORE its checkout event", async () => {
    // The customer index is written at checkout-CREATION time now, so the
    // earlier-arriving subscription event can already find the person. It used
    // to be dropped and answered 200, leaving a paying customer with nothing.
    const now = NOW();
    seed(BUYER_KEY, BUYER);
    const periodEnd = now + 30 * 86_400;

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(
      signedEvent({
        id: "evt_sub",
        created: now - 5,
        type: "customer.subscription.created",
        data: { object: { id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ current_period_end: periodEnd }] } } },
      })
    );

    const record = JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`)!);
    expect(record.currentPeriodEnd).toBe(periodEnd);
    const { accessFor } = await import("@/lib/billing/subscription");
    expect(accessFor(record, now).pro).toBe(true);
  });

  it("answers 500 — not 200 — when the store cannot record a cancellation", async () => {
    // THE LOST CANCELLATION. A 200 tells Stripe the event was handled and it
    // never redelivers, so one Redis blip left a cancelled subscriber with Pro
    // for the rest of a paid term — up to a year on annual.
    const now = NOW();
    seed(BUYER_KEY, BUYER, { status: "active", currentPeriodEnd: now + 300 * 86_400, lastSubscriptionEventAt: now - 100 });
    emulator.break();

    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(
      signedEvent({
        id: "evt_del",
        created: now,
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_1", customer: "cus_1", status: "canceled" } },
      })
    );

    expect(res.status, "a lost write was reported to Stripe as success").toBe(500);
  });

  it("is idempotent: the same event twice leaves the same state", async () => {
    const now = NOW();
    seed(BUYER_KEY, BUYER);
    const periodEnd = now + 30 * 86_400;
    const event = {
      id: "evt_dup",
      created: now,
      type: "customer.subscription.created",
      data: { object: { id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ current_period_end: periodEnd }] } } },
    };

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(event));
    const first = emulator.data.get(`sub:${BUYER_KEY}`)!;
    await POST(signedEvent(event));
    const second = JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`)!);

    expect(second.status).toBe(JSON.parse(first).status);
    expect(second.currentPeriodEnd).toBe(JSON.parse(first).currentPeriodEnd);
  });

  it("a replayed checkout event cannot resurrect a cancelled subscription", async () => {
    // The checkout branch used to write status "active" unconditionally, so
    // redelivering an old checkout event handed access back to someone who had
    // cancelled or whose card had failed.
    const now = NOW();
    seed(BUYER_KEY, BUYER, { status: "canceled", currentPeriodEnd: now - 1, lastSubscriptionEventAt: now });

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(
      signedEvent({
        id: "evt_replay",
        created: now - 500,
        type: "checkout.session.completed",
        data: { object: { id: "cs_old", customer: "cus_1", client_reference_id: BUYER_KEY } },
      })
    );

    const record = JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`)!);
    expect(record.status, "a cancelled subscriber was reactivated by a replay").toBe("canceled");
  });
});

// =============================================================================
// BLOCKER 6 — MONEY BACK OUT
// =============================================================================
describe("blocker 6 · refunds and disputes end access", () => {
  it("revokes access the moment a charge is refunded", async () => {
    // Refunding in the Stripe dashboard does NOT cancel the subscription, so
    // without this the record kept status active with a future period end and
    // access continued for the rest of the term after the money was returned.
    const now = NOW();
    seed(BUYER_KEY, BUYER, { status: "active", currentPeriodEnd: now + 300 * 86_400 });

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(
      signedEvent({
        id: "evt_refund",
        created: now,
        type: "charge.refunded",
        data: { object: { id: "ch_1", customer: "cus_1" } },
      })
    );

    const record = JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`)!);
    const { accessFor } = await import("@/lib/billing/subscription");
    expect(record.status).toBe("refunded");
    expect(accessFor(record, now).pro, "a refunded customer kept Pro").toBe(false);
  });

  it("revokes access when a dispute opens, and does not restore it when it closes", async () => {
    const now = NOW();
    seed(BUYER_KEY, BUYER, { status: "active", currentPeriodEnd: now + 300 * 86_400 });
    const { POST } = await import("@/app/api/billing/webhook/route");

    await POST(
      signedEvent({ id: "e1", created: now, type: "charge.dispute.created", data: { object: { id: "dp_1", customer: "cus_1" } } })
    );
    expect(JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`)!).status).toBe("disputed");

    await POST(
      signedEvent({
        id: "e2",
        created: now + 1,
        type: "charge.dispute.closed",
        data: { object: { id: "dp_1", customer: "cus_1", status: "won" } },
      })
    );
    const after = JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`)!);
    const { accessFor } = await import("@/lib/billing/subscription");
    expect(accessFor(after, now).pro, "a won dispute silently restored access").toBe(false);
  });

  it("a routine subscription update cannot undo a refund", async () => {
    const now = NOW();
    seed(BUYER_KEY, BUYER, { status: "refunded", currentPeriodEnd: now, lastSubscriptionEventAt: now - 10 });

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(
      signedEvent({
        id: "evt_upd",
        created: now + 5,
        type: "customer.subscription.updated",
        data: { object: { id: "sub_1", customer: "cus_1", status: "active", items: { data: [{ current_period_end: now + 300 * 86_400 }] } } },
      })
    );

    const record = JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`)!);
    expect(record.status, "Stripe kept the refunded subscription active and it won").toBe("refunded");
  });

  it("records a failed renewal without shortening a period already paid for", async () => {
    const now = NOW();
    const paidThrough = now + 10 * 86_400;
    seed(BUYER_KEY, BUYER, { status: "active", currentPeriodEnd: paidThrough });

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(
      signedEvent({
        id: "evt_fail",
        created: now,
        type: "invoice.payment_failed",
        data: { object: { id: "in_1", customer: "cus_1" } },
      })
    );

    const record = JSON.parse(emulator.data.get(`sub:${BUYER_KEY}`)!);
    expect(record.status).toBe("past_due");
    expect(record.currentPeriodEnd, "a paid-for period was cut short by a failed RENEWAL").toBe(paidThrough);
  });

  it("handles every event the activation guide tells an operator to select", () => {
    for (const e of ["charge.refunded", "charge.dispute.created", "charge.dispute.closed", "invoice.payment_failed"]) {
      expect(HANDLED_EVENTS as readonly string[]).toContain(e);
    }
  });
});

// =============================================================================
// BLOCKER 7 — SELLING BEFORE IT IS SAFE TO SELL
// =============================================================================
describe("blocker 7 · readiness covers everything needed to take money safely", () => {
  it("refuses to sell without each required secret", () => {
    for (const name of [
      "STRIPE_SECRET_KEY",
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_PRO_ANNUAL",
      "BILLING_SESSION_SECRET",
      "STRIPE_WEBHOOK_SECRET",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
      "RESEND_API_KEY",
    ] as const) {
      const env = { ...FULL_ENV, [name]: "" };
      expect(billingStatus(env).checkoutReady, `${name} did not gate selling`).toBe(false);
      expect(billingStatus(env).missing, name).toContain(name);
    }
  });

  it("is ready with the whole set, and names nothing missing", () => {
    const status = billingStatus(FULL_ENV);
    expect(status.checkoutReady).toBe(true);
    expect(status.webhookReady).toBe(true);
    expect(status.storeReady).toBe(true);
    expect(status.missing).toEqual([]);
  });

  it("never leaks a variable name to an unauthenticated caller", async () => {
    const { GET } = await import("@/app/api/billing/checkout/route");
    const body = await (await GET()).json();
    expect(JSON.stringify(body)).not.toMatch(/STRIPE_|KV_REST|RESEND|BILLING_|sk_test|whsec/);
  });
});

// =============================================================================
// BLOCKER 9 — SELLING WHAT DOES NOT EXIST
// =============================================================================
describe("blocker 9 · Pro sells only what works", () => {
  it("offers nothing unfinished, and still shows the roadmap", async () => {
    const { availableNow, notYetAvailable, roadmap, capabilitiesFor } = await import("@/lib/billing/plans");
    expect(availableNow("pro").map((c) => c.id)).toEqual(["watchlist_sync"]);
    expect(notYetAvailable("pro"), "an unfinished capability is still being sold").toEqual([]);
    for (const c of capabilitiesFor("pro")) expect(c.existsToday).toBe(true);
    // Removing the promise must not become hiding the plan.
    expect(roadmap().length).toBeGreaterThan(0);
  });
});

// =============================================================================
// TEST / LIVE ISOLATION
// =============================================================================
describe("test and live modes stay apart", () => {
  it("treats anything that is not sk_test_ as live", async () => {
    const { isTestKey } = await import("@/lib/billing/config");
    expect(isTestKey("sk_test_abc")).toBe(true);
    for (const k of ["sk_live_abc", "rk_test_abc", "rk_live_abc", "", undefined]) {
      expect(isTestKey(k as string | undefined), String(k)).toBe(false);
    }
  });

  it("carries no Stripe identifier or secret anywhere in the billing source", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { join } = await import("node:path");
    const dir = fileURLToPath(new URL("../src/lib/billing", import.meta.url));
    for (const file of readdirSync(dir)) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text, file).not.toMatch(/sk_live_[A-Za-z0-9]{8}/);
      expect(text, file).not.toMatch(/whsec_[A-Za-z0-9]{8}/);
      expect(text, file).not.toMatch(/price_[A-Za-z0-9]{14}/);
    }
  });
});

// =============================================================================
// SESSION AND BROWSER RECOVERY
// =============================================================================
describe("a subscriber can get back in", () => {
  it("mints a verified identity for someone with no subscription yet", async () => {
    // Identity now precedes payment, so a first-time buyer must be able to
    // verify themselves before checkout will create a Stripe customer.
    const now = NOW();
    const { tokenHash } = await import("@/lib/billing/store");
    emulator.data.set(`login:${tokenHash("tok123", SESSION_SECRET)}`, JSON.stringify({ k: BUYER_KEY, e: BUYER }));

    const { POST } = await import("@/app/api/billing/signin/verify/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/signin/verify", { token: "tok123" }));

    expect(res.status).toBe(200);
    const body = (await res.json()) as { plan: string; verified: boolean };
    expect(body.plan).toBe("free");
    expect(body.verified).toBe(true);

    // The claim unlocks nothing: it only says who this is.
    const cookie = (res.headers.get("Set-Cookie") ?? "").match(/ic_ent=([^;]+)/)?.[1] ?? "";
    const ent = verify(decodeURIComponent(cookie), SESSION_SECRET, now)!;
    expect(ent.plan).toBe("free");
    expect(ent.email).toBe(BUYER);
    const { isActive } = await import("@/lib/billing/entitlement");
    expect(isActive(ent, now)).toBe(false);
  });

  it("a single-use link cannot be used twice", async () => {
    const { tokenHash } = await import("@/lib/billing/store");
    emulator.data.set(`login:${tokenHash("tok9", SESSION_SECRET)}`, JSON.stringify({ k: BUYER_KEY, e: BUYER }));

    const { POST } = await import("@/app/api/billing/signin/verify/route");
    expect((await POST(post("https://x/", { token: "tok9" }))).status).toBe(200);
    expect((await POST(post("https://x/", { token: "tok9" }))).status).toBe(400);
  });
});

// =============================================================================
// THE PORTAL
// =============================================================================
describe("the billing portal", () => {
  it("takes the customer id only from the signed cookie", async () => {
    // The classic insecure-direct-object hole: reading it from the body would
    // let anyone open anyone's billing portal by guessing a customer id.
    const source = (await import("node:fs")).readFileSync(
      (await import("node:url")).fileURLToPath(new URL("../src/app/api/billing/portal/route.ts", import.meta.url)),
      "utf8"
    );
    expect(source).toContain("entitlement.customerId");
    expect(source).not.toMatch(/body\.customerId|body\.customer\b/);
  });

  it("refuses a browser with no entitlement", async () => {
    const { POST } = await import("@/app/api/billing/portal/route");
    const res = await POST(post("https://immigrationclock.com/api/billing/portal", {}));
    expect(res.status).toBe(401);
  });
});
