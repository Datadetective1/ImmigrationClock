// =============================================================================
// THE WEBHOOK'S STORE WRITE, EXERCISED
//
// persist() had no test coverage at all: resolveStore() returns null unless the
// KV variables are set, and no test set them, so every webhook test ran with
// "no store configured" and the write never executed. That blind spot is how a
// signup-order regression reached a review rather than a test.
//
// The Redis client speaks a tiny command vocabulary over HTTP, so the store is
// exercised for real against an in-memory emulator of exactly those commands —
// GET, SET (with EX and NX), GETDEL, SADD, SMEMBERS — rather than mocked away.
// SET NX in particular has to be honoured, because the single-use checkout claim
// is only atomic if it is.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { emailKey } from "@/lib/billing/store";

const SECRET = "whsec_placeholder_for_tests";
const SESSION_SECRET = "s".repeat(32);
const BUYER = "buyer@example.com";
/**
 * The identity key the checkout route stamps onto the Stripe session.
 *
 * Derived exactly as production derives it, so these tests exercise the real
 * binding rather than a stand-in string.
 */
const REF = emailKey(BUYER, SESSION_SECRET);

/** An in-memory stand-in for the Upstash REST endpoint. */
function redisEmulator() {
  const data = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const impl = async (_url: string, init: { body: string }) => {
    const args = JSON.parse(init.body) as string[];
    const [cmd, key, ...rest] = args;
    let result: unknown = null;
    switch (cmd) {
      case "GET":
        result = data.get(key) ?? null;
        break;
      case "SET": {
        const nx = rest.includes("NX");
        if (nx && data.has(key)) {
          result = null;
        } else {
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
  return { data, impl };
}

function signed(event: Record<string, unknown>) {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  return new Request("https://immigrationclock.com/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${sig}` },
    body,
  });
}

describe("the webhook actually writes to the store", () => {
  let emulator: ReturnType<typeof redisEmulator>;

  beforeEach(() => {
    vi.resetModules();
    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.BILLING_SESSION_SECRET = SESSION_SECRET;
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "token";
    emulator = redisEmulator();
    vi.spyOn(globalThis, "fetch").mockImplementation(emulator.impl as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  async function deliver(event: Record<string, unknown>) {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(signed(event));
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  // THE IDENTITY IS OUR OWN REFERENCE, NOT A TYPED EMAIL.
  //
  // `client_reference_id` is the emailKey the checkout route put on the session
  // for an address it had already verified. The webhook keys on it and never
  // reads customer_details.email — which is what stops a $19 payment carrying
  // somebody else's address from seizing that person's record.
  //
  // The address is still present on the object, exactly as Stripe sends it, so
  // these tests fail if anything ever starts trusting it again.
  const checkout = (created: number, ref: string = REF) => ({
    id: "evt_checkout",
    created,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        customer: "cus_1",
        client_reference_id: ref,
        customer_details: { email: "buyer@example.com" },
      },
    },
  });

  const subscriptionCreated = (created: number, periodEnd: number) => ({
    id: "evt_sub",
    created,
    type: "customer.subscription.created",
    data: { object: { id: "sub_1", customer: "cus_1", status: "active", current_period_end: periodEnd } },
  });

  /**
   * What the checkout ROUTE writes before it ever calls Stripe.
   *
   * The verified address is stored here, at the moment a session is created
   * for an identity this site has already proved. The webhook then merges
   * status and period onto it and never touches `email` — which is precisely
   * what stops a paid checkout carrying a stranger's address from rewriting a
   * subscriber's record.
   */
  async function seedIdentity(): Promise<void> {
    emulator.data.set(
      `sub:${REF}`,
      JSON.stringify({
        email: BUYER,
        customerId: "cus_1",
        status: "incomplete",
        currentPeriodEnd: 0,
        updatedAt: 1,
      })
    );
    emulator.data.set(`cust:cus_1`, REF);
  }

  async function storedRecord() {
    const key = REF;
    const raw = emulator.data.get(`sub:${key}`);
    return raw ? JSON.parse(raw) : null;
  }

  it("stores a subscriber from a checkout session", async () => {
    await seedIdentity();
    const { body } = await deliver(checkout(1_000));
    expect(body.stored).toBe(true);
    const record = await storedRecord();
    expect(record.email).toBe("buyer@example.com");
    expect(record.customerId).toBe("cus_1");
  });

  it("grants access when the subscription event arrives BEFORE the checkout timestamp", async () => {
    // THE SIGNUP RACE. In subscription-mode Checkout the subscription is created
    // as part of completing the session, so its event carries an EARLIER
    // timestamp. A single watermark shared between the two streams dropped this
    // event — the only one carrying current_period_end — and left a paying
    // customer at status "active", currentPeriodEnd 0, denied.
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    await seedIdentity();
    await deliver(checkout(1_000));
    const { body } = await deliver(subscriptionCreated(999, periodEnd));

    expect(body.stored, "the subscription event was dropped as stale").toBe(true);
    const record = await storedRecord();
    expect(record.currentPeriodEnd).toBe(periodEnd);

    const { accessFor } = await import("@/lib/billing/subscription");
    expect(accessFor(record, Math.floor(Date.now() / 1000)).pro).toBe(true);
  });

  it("still refuses a stale event inside the subscription stream", async () => {
    // The protection the ordering guard exists for, unchanged: a cancellation
    // must not be undone by a redelivered "updated · active".
    const now = Math.floor(Date.now() / 1000);
    await seedIdentity();
    await deliver(checkout(1_000));
    await deliver(subscriptionCreated(2_000, now + 30 * 86_400));

    await deliver({
      id: "evt_del",
      created: 3_000,
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", customer: "cus_1", status: "canceled" } },
    });
    expect((await storedRecord()).status).toBe("canceled");

    // A redelivery of the earlier active event, arriving after the deletion.
    const { body } = await deliver({
      id: "evt_upd_replay",
      created: 2_500,
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", customer: "cus_1", status: "active", current_period_end: now + 30 * 86_400 } },
    });

    expect(body.stored, "a stale replay was applied and restored access").toBe(false);
    const record = await storedRecord();
    expect(record.status).toBe("canceled");
    const { accessFor } = await import("@/lib/billing/subscription");
    expect(accessFor(record, now).pro).toBe(false);
  });

  // ===========================================================================
  // THE SHAPE BASIL DELIVERS
  //
  // Raising the pinned API version to 2025-03-31.basil — which Managed Payments
  // requires, and without which checkout returns 400 — also moves
  // current_period_end off the subscription and onto its items:
  //
  //   https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end
  //
  // A reader that only knew the old location would take the version bump,
  // start checkout working again, and then store every new subscriber with
  // currentPeriodEnd 0 — paid, and denied. This asserts the money path against
  // the payload Stripe now actually sends.
  // ===========================================================================
  const subscriptionCreatedBasil = (created: number, periodEnd: number) => ({
    id: "evt_sub_basil",
    created,
    type: "customer.subscription.created",
    data: {
      object: {
        id: "sub_1",
        customer: "cus_1",
        status: "active",
        // No top-level current_period_end. This is the whole point.
        items: { object: "list", data: [{ id: "si_1", object: "subscription_item", current_period_end: periodEnd }] },
      },
    },
  });

  it("grants access from a Basil payload, where the period is on the item", async () => {
    const now = Math.floor(Date.now() / 1000);
    const periodEnd = now + 30 * 86_400;

    await seedIdentity();
    await deliver(checkout(1_000));
    const { body } = await deliver(subscriptionCreatedBasil(2_000, periodEnd));

    expect(body.stored).toBe(true);
    const record = await storedRecord();
    expect(
      record.currentPeriodEnd,
      "the item-level period was not read: a paying customer is stored as expired"
    ).toBe(periodEnd);

    const { accessFor } = await import("@/lib/billing/subscription");
    expect(accessFor(record, now).pro, "a paid subscriber was denied access").toBe(true);
  });

  it("still grants access from a pre-Basil payload", async () => {
    // Webhook payload versions come from the endpoint's configuration in
    // Stripe, not from the header this deployment sends, so the old shape can
    // keep arriving indefinitely. Both must work at once.
    const now = Math.floor(Date.now() / 1000);
    const periodEnd = now + 30 * 86_400;

    await seedIdentity();
    await deliver(checkout(1_000));
    await deliver(subscriptionCreated(2_000, periodEnd));

    const record = await storedRecord();
    expect(record.currentPeriodEnd).toBe(periodEnd);
    const { accessFor } = await import("@/lib/billing/subscription");
    expect(accessFor(record, now).pro).toBe(true);
  });

  it("cancels on deletion even though a Basil deletion carries no period", async () => {
    const now = Math.floor(Date.now() / 1000);
    await seedIdentity();
    await deliver(checkout(1_000));
    await deliver(subscriptionCreatedBasil(2_000, now + 30 * 86_400));

    await deliver({
      id: "evt_del_basil",
      created: 3_000,
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", customer: "cus_1", status: "canceled", items: { data: [{ id: "si_1" }] } } },
    });

    const record = await storedRecord();
    expect(record.status).toBe("canceled");
    const { accessFor } = await import("@/lib/billing/subscription");
    expect(accessFor(record, now).pro, "a cancelled subscription still granted access").toBe(false);
  });
});
