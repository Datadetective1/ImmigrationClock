// =============================================================================
// PRO ONBOARDING — the welcome email, and consent to be marketed to
//
// Two side effects fire after Stripe confirms a subscription, and they have
// opposite failure modes. The welcome email must arrive EXACTLY ONCE, under a
// retry regime that deliberately redelivers. The newsletter enrolment must
// happen ONLY on explicit consent, and must never reverse somebody's earlier
// decision to leave.
//
// Both are tested against an in-memory Resend that records every request, so
// the assertions are about what would actually be sent over the wire rather
// than about which function was called.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import { emailKey } from "@/lib/billing/store";
import { buildProWelcomeEmail } from "@/lib/billing/welcome-email";
import { enrollProSubscriber } from "@/lib/billing/newsletter-enrollment";
import { priceFactsOf } from "@/lib/billing/onboarding";
import { CONSENT_TEXT } from "@/lib/billing/consent";

const WEBHOOK_SECRET = "whsec_placeholder_for_tests";
const SESSION_SECRET = "s".repeat(32);
const BUYER = "buyer@example.com";
const VICTIM = "victim@example.com";
const BUYER_KEY = emailKey(BUYER, SESSION_SECRET);
const SEGMENT = "seg_en_test";

const ENV: Record<string, string> = {
  BILLING_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_PRO_MONTHLY: "price_monthly",
  STRIPE_PRICE_PRO_ANNUAL: "price_annual",
  BILLING_SESSION_SECRET: SESSION_SECRET,
  KV_REST_API_URL: "https://kv.example",
  KV_REST_API_TOKEN: "kv-token",
  RESEND_API_KEY: "re_placeholder",
  RESEND_API_BASE: "https://resend.example",
  RESEND_SEGMENT_EN: SEGMENT,
  NEXT_PUBLIC_SITE_URL: "https://immigrationclock.com",
};

interface SentEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

/** Redis + Resend in one fake, so a test can break either half. */
function world(opts: {
  contact?: { unsubscribed?: boolean; properties?: Record<string, unknown> } | null;
  emailFails?: boolean;
  segmentFails?: boolean;
} = {}) {
  const data = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const emails: SentEmail[] = [];
  const segmentJoins: string[] = [];
  const contactsCreated: string[] = [];
  let contact: { unsubscribed?: boolean; properties?: Record<string, unknown> } | null =
    opts.contact ?? null;

  const impl = async (url: string, init: { body?: string; method?: string } = {}) => {
    const u = String(url);
    const method = init.method ?? "POST";

    // ---- Resend ----------------------------------------------------------
    if (u.startsWith("https://resend.example")) {
      const path = u.slice("https://resend.example".length);

      if (path === "/emails") {
        if (opts.emailFails) return { ok: false, status: 500, text: async () => "boom" };
        emails.push(JSON.parse(init.body ?? "{}") as SentEmail);
        return { ok: true, status: 200, json: async () => ({ id: "email_1" }), text: async () => "" };
      }
      if (method === "GET" && /^\/contacts\/[^/]+$/.test(path)) {
        if (!contact) return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
        return { ok: true, status: 200, json: async () => contact, text: async () => "" };
      }
      if (method === "POST" && path === "/contacts") {
        contactsCreated.push(JSON.parse(init.body ?? "{}").email);
        contact = { unsubscribed: false };
        return { ok: true, status: 200, json: async () => ({ id: "c1" }), text: async () => "" };
      }
      if (method === "POST" && /\/segments\//.test(path)) {
        if (opts.segmentFails) return { ok: false, status: 500, text: async () => "nope" };
        segmentJoins.push(path);
        return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
      }
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    }

    // ---- Redis -----------------------------------------------------------
    const args = JSON.parse(init.body ?? "[]") as string[];
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
    return { ok: true, status: 200, json: async () => ({ result }), text: async () => "" };
  };

  return { data, impl, emails, segmentJoins, contactsCreated, get contact() { return contact; } };
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

const NOW = () => Math.floor(Date.now() / 1000);

let w: ReturnType<typeof world>;

function boot(opts: Parameters<typeof world>[0] = {}) {
  w = world(opts);
  vi.spyOn(globalThis, "fetch").mockImplementation(w.impl as unknown as typeof fetch);
  return w;
}

/** A subscriber record as the checkout route writes it, consent included. */
function seed(over: Record<string, unknown> = {}) {
  w.data.set(
    `sub:${BUYER_KEY}`,
    JSON.stringify({
      email: BUYER,
      customerId: "cus_1",
      status: "incomplete",
      currentPeriodEnd: 0,
      updatedAt: 1,
      ...over,
    })
  );
  w.data.set("cust:cus_1", BUYER_KEY);
}

function subscriptionEvent(opts: { interval: "month" | "year"; created?: number; id?: string; amount?: number }) {
  const now = NOW();
  return {
    id: `evt_${opts.interval}`,
    created: opts.created ?? now,
    type: "customer.subscription.created",
    data: {
      object: {
        id: opts.id ?? "sub_1",
        customer: "cus_1",
        status: "active",
        items: {
          data: [
            {
              current_period_end: now + (opts.interval === "year" ? 365 : 30) * 86_400,
              price: {
                unit_amount: opts.amount ?? (opts.interval === "year" ? 19000 : 1900),
                currency: "usd",
                recurring: { interval: opts.interval },
              },
            },
          ],
        },
      },
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(ENV)) delete process.env[k];
});

// =============================================================================
// 1 + 2 — ONE EMAIL PER SUBSCRIPTION, EITHER INTERVAL
// =============================================================================
describe("a successful subscription sends exactly one welcome email", () => {
  it("monthly", async () => {
    boot();
    seed({ newsletterConsent: { granted: false, at: NOW(), source: "checkout", version: "v1" } });
    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(subscriptionEvent({ interval: "month" })));

    expect(w.emails.length).toBe(1);
    expect(w.emails[0].to).toEqual([BUYER]);
    expect(w.emails[0].subject).toContain("Pro");
    expect(w.emails[0].text).toContain("billed monthly");
    expect(w.emails[0].text).toContain("$19.00");
  });

  it("annual, with the year's amount and cadence", async () => {
    boot();
    seed({ newsletterConsent: { granted: false, at: NOW(), source: "checkout", version: "v1" } });
    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(subscriptionEvent({ interval: "year" })));

    expect(w.emails.length).toBe(1);
    expect(w.emails[0].text).toContain("billed yearly");
    expect(w.emails[0].text).toContain("$190.00");
  });
});

// =============================================================================
// 3 — STRIPE RETRIES ARE NORMAL, AND MUST NOT DOUBLE-SEND
// =============================================================================
describe("webhook retries", () => {
  it("send exactly one welcome email across repeated deliveries", async () => {
    boot();
    seed();
    const { POST } = await import("@/app/api/billing/webhook/route");
    const event = subscriptionEvent({ interval: "month" });

    await POST(signedEvent(event));
    await POST(signedEvent(event));
    await POST(signedEvent(event));

    expect(w.emails.length, "Stripe's retry produced a duplicate welcome email").toBe(1);
  });

  it("re-subscribing after cancelling earns a new welcome", async () => {
    // A new relationship, not a retry — and the only realistic way one person
    // reaches a second subscription, because checkout refuses to start one
    // while access is live.
    boot();
    seed();
    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(subscriptionEvent({ interval: "month", id: "sub_1" })));
    expect(w.emails.length).toBe(1);

    // They cancel. The record stops granting access.
    await POST(
      signedEvent({
        id: "evt_del",
        created: NOW() + 5,
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_1", customer: "cus_1", status: "canceled" } },
      })
    );

    // Months later they come back on a new subscription.
    await POST(signedEvent(subscriptionEvent({ interval: "month", id: "sub_2", created: NOW() + 10 })));
    expect(w.emails.length, "a returning subscriber was not welcomed back").toBe(2);
  });

  it("an already-active subscriber is never welcomed again", async () => {
    // The record predates this feature, or the claim is gone: the transition
    // into active is what matters, and there was none.
    boot();
    seed({ status: "active", currentPeriodEnd: NOW() + 20 * 86_400, lastSubscriptionEventAt: NOW() - 100 });
    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(subscriptionEvent({ interval: "month", id: "sub_1" })));

    expect(w.emails.length, "an existing subscriber was greeted as new").toBe(0);
  });
});

// =============================================================================
// 4 + 5 — CONSENT DECIDES, AND NOTHING ELSE DOES
// =============================================================================
describe("newsletter consent", () => {
  it("checked · the contact is created and joined to the English segment", async () => {
    boot();
    seed({ newsletterConsent: { granted: true, at: NOW(), source: "checkout", version: "v1" } });
    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(subscriptionEvent({ interval: "month" })));

    expect(w.contactsCreated).toEqual([BUYER]);
    expect(w.segmentJoins.length).toBe(1);
    expect(w.segmentJoins[0]).toContain(SEGMENT);
  });

  it("unchecked · NOTHING is sent to the marketing side at all", async () => {
    boot();
    seed({ newsletterConsent: { granted: false, at: NOW(), source: "checkout", version: "v1" } });
    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(subscriptionEvent({ interval: "month" })));

    expect(w.contactsCreated, "an unchecked box produced a marketing contact").toEqual([]);
    expect(w.segmentJoins).toEqual([]);
    // The transactional email still goes: it confirms a purchase they made.
    expect(w.emails.length).toBe(1);
  });

  it("absent consent is treated as no consent, never as yes", async () => {
    boot();
    seed(); // no newsletterConsent at all
    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(subscriptionEvent({ interval: "month" })));
    expect(w.contactsCreated).toEqual([]);
    expect(w.segmentJoins).toEqual([]);
  });
});

// =============================================================================
// 6 + 7 — EXISTING CONTACTS
// =============================================================================
describe("a contact that already exists", () => {
  it("stays subscribed, and is not duplicated", async () => {
    boot({ contact: { unsubscribed: false } });
    const res = await enrollProSubscriber({ email: BUYER, consented: true, env: ENV, fetchImpl: w.impl as unknown as typeof fetch });

    expect(res.outcome).toBe("already_enrolled");
    expect(w.contactsCreated, "an existing contact was created again").toEqual([]);
  });

  it("is NOT silently re-subscribed after an explicit opt-out", async () => {
    // The line this code will not cross. POST /contacts with unsubscribed:false
    // is an upsert that would flip them back, and a purchase-page checkbox is
    // weak evidence that somebody meant to reverse a deliberate opt-out.
    boot({ contact: { unsubscribed: true } });
    const res = await enrollProSubscriber({ email: BUYER, consented: true, env: ENV, fetchImpl: w.impl as unknown as typeof fetch });

    expect(res.outcome).toBe("previously_unsubscribed");
    expect(w.contactsCreated).toEqual([]);
    expect(w.segmentJoins, "an unsubscribed contact was re-enrolled").toEqual([]);
    // The reason is logged without the full address.
    expect(res.detail).not.toContain(BUYER);
  });
});

// =============================================================================
// 8 + 9 — FAILURE MUST NOT REACH THE SUBSCRIPTION
// =============================================================================
describe("failures stay in their lane", () => {
  it("a newsletter failure leaves Pro entitlement intact", async () => {
    boot({ segmentFails: true });
    seed({ newsletterConsent: { granted: true, at: NOW(), source: "checkout", version: "v1" } });
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(signedEvent(subscriptionEvent({ interval: "month" })));

    expect(res.status, "a marketing failure made Stripe retry a successful write").toBe(200);
    const record = JSON.parse(w.data.get(`sub:${BUYER_KEY}`)!);
    const { accessFor } = await import("@/lib/billing/subscription");
    expect(accessFor(record, NOW()).pro).toBe(true);
  });

  it("a welcome-email failure leaves the subscription record correct", async () => {
    boot({ emailFails: true });
    seed();
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(signedEvent(subscriptionEvent({ interval: "month" })));

    expect(res.status).toBe(200);
    const record = JSON.parse(w.data.get(`sub:${BUYER_KEY}`)!);
    expect(record.status).toBe("active");
    const { accessFor } = await import("@/lib/billing/subscription");
    expect(accessFor(record, NOW()).pro).toBe(true);
  });
});

// =============================================================================
// 10 — IDENTITY BINDING
// =============================================================================
describe("identity binding", () => {
  it("a buyer-supplied Stripe email cannot become the welcome recipient", async () => {
    boot();
    seed(); // the verified record says BUYER
    const event = subscriptionEvent({ interval: "month" }) as Record<string, unknown>;
    // Stripe carries an address the buyer typed. It must be ignored entirely.
    (event.data as { object: Record<string, unknown> }).object.customer_email = VICTIM;
    (event.data as { object: Record<string, unknown> }).object.customer_details = { email: VICTIM };

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(event));

    expect(w.emails.length).toBe(1);
    expect(w.emails[0].to, "the welcome email went to a buyer-typed address").toEqual([BUYER]);
    expect(w.emails[0].text).not.toContain(VICTIM);
  });
});

// =============================================================================
// 11 + 12 — WHAT THE EMAIL SAYS
// =============================================================================
describe("the welcome email's content", () => {
  const base = {
    email: BUYER,
    interval: "month" as const,
    amountMinor: 1900,
    currency: "usd",
    periodEnd: NOW() + 30 * 86_400,
    origin: "https://immigrationclock.com",
    supportEmail: "hello@immigrationclock.com",
  };

  it("says plainly when it is a sandbox subscription", () => {
    const mail = buildProWelcomeEmail({ ...base, testMode: true });
    expect(mail.subject).toContain("[TEST]");
    expect(mail.text).toMatch(/TEST MODE/);
    expect(mail.html).toMatch(/Test mode/i);
  });

  it("says nothing about test mode on a live deployment", () => {
    const mail = buildProWelcomeEmail({ ...base, testMode: false });
    expect(mail.subject).not.toContain("[TEST]");
    expect(mail.text).not.toMatch(/TEST MODE/);
  });

  it("advertises only capabilities that actually work", async () => {
    const { roadmap, availableNow } = await import("@/lib/billing/plans");
    const mail = buildProWelcomeEmail({ ...base, testMode: false });

    for (const c of roadmap()) {
      expect(mail.text.toLowerCase(), `the email sells ${c.id}, which does not exist`).not.toContain(
        c.label.toLowerCase()
      );
      expect(mail.html.toLowerCase()).not.toContain(c.label.toLowerCase());
    }
    for (const c of availableNow("pro")) {
      expect(mail.text).toContain(c.label);
    }
  });

  it("carries the account facts, and no secret", () => {
    const mail = buildProWelcomeEmail({ ...base, testMode: true });
    expect(mail.text).toContain(BUYER);
    expect(mail.text).toContain("$19.00");
    expect(mail.text).toContain("/account");
    expect(mail.text).toMatch(/Stripe/);

    for (const forbidden of ["sk_test", "sk_live", "whsec_", SESSION_SECRET, BUYER_KEY, "cus_"]) {
      expect(mail.text, `secret-ish value in the email: ${forbidden}`).not.toContain(forbidden);
      expect(mail.html).not.toContain(forbidden);
    }
  });

  it("omits the amount rather than inventing one", () => {
    const mail = buildProWelcomeEmail({ ...base, amountMinor: null, currency: null, testMode: false });
    expect(mail.text).not.toMatch(/Amount:/);
  });

  it("positions itself as account confirmation, not a payment receipt", () => {
    // Stripe issues the receipt. Two documents claiming to be the same receipt
    // is worse than one, and ours would be the copy more likely to be wrong.
    const mail = buildProWelcomeEmail({ ...base, testMode: false });
    expect(mail.text).toMatch(/receipt/i);
    expect(mail.text).toMatch(/Stripe has/);
    expect(mail.subject.toLowerCase()).not.toContain("receipt");
  });
});

// =============================================================================
// PRICE FACTS COME FROM STRIPE, NOT FROM OUR CATALOGUE
// =============================================================================
describe("priceFactsOf", () => {
  it("reads the interval and amount off the subscription item", () => {
    expect(
      priceFactsOf({ items: { data: [{ price: { unit_amount: 19000, currency: "usd", recurring: { interval: "year" } } }] } })
    ).toEqual({ interval: "year", amountMinor: 19000, currency: "usd" });
  });

  it("defaults to month and null rather than guessing a price", () => {
    expect(priceFactsOf({})).toEqual({ interval: "month", amountMinor: null, currency: null });
    expect(priceFactsOf({ items: { data: [{}] } })).toEqual({
      interval: "month",
      amountMinor: null,
      currency: null,
    });
  });
});

// =============================================================================
// THE CONSENT SENTENCE IS ONE STRING, IN ONE PLACE
// =============================================================================
describe("the consent copy", () => {
  it("is rendered from the shared constant, so the record and the UI cannot drift", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const source = readFileSync(
      fileURLToPath(new URL("../src/components/UpgradeButton.tsx", import.meta.url)),
      "utf8"
    );
    expect(source).toContain("CONSENT_TEXT");
    // Not hard-coded a second time.
    expect(source).not.toContain(CONSENT_TEXT);
    // And unchecked by default.
    expect(source).toMatch(/useState\(false\)/);
  });

  it("names the newsletter and says it is optional", () => {
    expect(CONSENT_TEXT).toMatch(/Immigration Pulse/);
  });
});

// =============================================================================
// A RENEWAL IS NOT A WELCOME
//
// customer.subscription.updated reaches the same branch as .created — every
// renewal, plan change and card update. The SET NX claim stops a duplicate
// inside its own lifetime, but a claim has to expire eventually, and a renewal
// landing after it did would greet a two-year subscriber with "Welcome to Pro".
// =============================================================================
describe("only the START of a subscription is welcomed", () => {
  function updatedEvent(created: number) {
    const now = NOW();
    return {
      id: "evt_renewal",
      created,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "active",
          items: {
            data: [
              {
                current_period_end: now + 60 * 86_400,
                price: { unit_amount: 1900, currency: "usd", recurring: { interval: "month" } },
              },
            ],
          },
        },
      },
    };
  }

  it("a renewal sends no welcome email, even with no claim held", async () => {
    boot();
    // An established subscriber: active, already past their first period, and
    // deliberately WITHOUT the once-claim, which is the state after it expires.
    seed({ status: "active", currentPeriodEnd: NOW() + 5 * 86_400, lastSubscriptionEventAt: NOW() - 86_400 });

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(updatedEvent(NOW())));

    expect(w.emails.length, "a renewal greeted an existing subscriber as new").toBe(0);
  });

  it("a renewal does not enrol them in the newsletter either", async () => {
    boot();
    seed({
      status: "active",
      currentPeriodEnd: NOW() + 5 * 86_400,
      lastSubscriptionEventAt: NOW() - 86_400,
      newsletterConsent: { granted: true, at: NOW(), source: "checkout", version: "v1" },
    });

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(updatedEvent(NOW())));

    // They were enrolled when they first subscribed; doing it again on every
    // renewal is pointless traffic against a marketing API.
    expect(w.contactsCreated).toEqual([]);
    expect(w.segmentJoins).toEqual([]);
  });

  it("but the subscription record is still updated by the renewal", async () => {
    boot();
    seed({ status: "active", currentPeriodEnd: NOW() + 5 * 86_400, lastSubscriptionEventAt: NOW() - 86_400 });

    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(updatedEvent(NOW())));

    const record = JSON.parse(w.data.get(`sub:${BUYER_KEY}`)!);
    expect(record.currentPeriodEnd).toBeGreaterThan(NOW() + 50 * 86_400);
  });
});

// =============================================================================
// SECOND ROUND — what the audit found in the first implementation
// =============================================================================
describe("second round · consent is the LATEST answer, not the best one", () => {
  const identity = async () => {
    const { sign } = await import("@/lib/billing/entitlement");
    const now = NOW();
    return `ic_ent=${sign(
      { plan: "free", email: BUYER, customerId: "", exp: now + 30 * 86_400 },
      SESSION_SECRET,
      now
    )}`;
  };

  async function checkout(optIn: boolean) {
    const { POST } = await import("@/app/api/billing/checkout/route");
    return POST(
      new Request("https://immigrationclock.com/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: await identity() },
        body: JSON.stringify({ interval: "monthly", newsletterOptIn: optIn }),
      })
    );
  }

  it("a later DECLINE overrides an earlier grant from an abandoned checkout", async () => {
    // The failure this replaces: someone ticked the box, walked away from
    // Stripe, came back, deliberately left it unchecked, paid — and was
    // enrolled anyway on the strength of the session they abandoned.
    boot();
    // Stripe calls succeed so checkout can complete.
    const inner = w.impl;
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string, init: never) => {
      if (String(url).includes("api.stripe.com")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "cs_1", url: "https://stripe/x" }) };
      }
      return inner(String(url), init);
    }) as unknown as typeof fetch);

    await checkout(true);
    expect(JSON.parse(w.data.get(`sub:${BUYER_KEY}`)!).newsletterConsent.granted).toBe(true);

    await checkout(false);
    const after = JSON.parse(w.data.get(`sub:${BUYER_KEY}`)!);
    expect(after.newsletterConsent.granted, "a decline was discarded in favour of a stale grant").toBe(false);
  });

  it("records a decline explicitly, so it is distinguishable from never asking", async () => {
    boot();
    const inner = w.impl;
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string, init: never) => {
      if (String(url).includes("api.stripe.com")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "cs_1", url: "https://stripe/x" }) };
      }
      return inner(String(url), init);
    }) as unknown as typeof fetch);

    await checkout(false);
    const rec = JSON.parse(w.data.get(`sub:${BUYER_KEY}`)!);
    expect(rec.newsletterConsent).toBeTruthy();
    expect(rec.newsletterConsent.granted).toBe(false);
    expect(rec.newsletterConsent.source).toBe("checkout");
    expect(typeof rec.newsletterConsent.version).toBe("string");
  });

  it("only an explicit boolean true is consent", async () => {
    boot();
    const inner = w.impl;
    vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string, init: never) => {
      if (String(url).includes("api.stripe.com")) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ id: "cs_1", url: "https://stripe/x" }) };
      }
      return inner(String(url), init);
    }) as unknown as typeof fetch);

    const { POST } = await import("@/app/api/billing/checkout/route");
    for (const value of ["true", 1, {}, [], "yes"]) {
      w.data.delete(`sub:${BUYER_KEY}`);
      await POST(
        new Request("https://immigrationclock.com/api/billing/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json", cookie: await identity() },
          body: JSON.stringify({ interval: "monthly", newsletterOptIn: value }),
        })
      );
      const rec = JSON.parse(w.data.get(`sub:${BUYER_KEY}`)!);
      expect(rec.newsletterConsent.granted, `${JSON.stringify(value)} was treated as consent`).toBe(false);
    }
  });
});

describe("second round · a failed enrolment can still be retried", () => {
  it("does not consume the newsletter chance when Resend fails", async () => {
    boot({ segmentFails: true });
    seed({ newsletterConsent: { granted: true, at: NOW(), source: "checkout", version: "v1" } });
    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(subscriptionEvent({ interval: "month" })));

    // The welcome went; the enrolment did not.
    expect(w.emails.length).toBe(1);
    expect(w.segmentJoins).toEqual([]);
    // No newsletter claim was written, so a later attempt is still possible.
    const claims = [...w.data.keys()].filter((k) => k.startsWith("once:newsletter:"));
    expect(claims, "a failed enrolment burned its retry").toEqual([]);
  });

  it("writes the newsletter claim only after success", async () => {
    boot();
    seed({ newsletterConsent: { granted: true, at: NOW(), source: "checkout", version: "v1" } });
    const { POST } = await import("@/app/api/billing/webhook/route");
    await POST(signedEvent(subscriptionEvent({ interval: "month" })));

    const claims = [...w.data.keys()].filter((k) => k.startsWith("once:newsletter:"));
    expect(claims.length).toBe(1);
  });
});

describe("second round · language is respected, not overwritten", () => {
  it("keeps an existing contact in their own language segment", async () => {
    process.env.RESEND_SEGMENT_FR = "seg_fr_test";
    boot({ contact: { unsubscribed: false, properties: { language: "fr" } } });

    const res = await enrollProSubscriber({
      email: BUYER,
      consented: true,
      env: { ...ENV, RESEND_SEGMENT_FR: "seg_fr_test" },
      fetchImpl: w.impl as unknown as typeof fetch,
    });

    expect(res.outcome).toBe("already_enrolled");
    // Joined French, not English — the checkbox never mentioned language.
    expect(w.segmentJoins.some((p) => p.includes("seg_fr_test")), "a French subscriber was filed as English").toBe(true);
    delete process.env.RESEND_SEGMENT_FR;
  });

  it("falls back to a plain contact when Resend rejects properties", async () => {
    // Contact properties are not on every Resend plan. Losing the language
    // record is bad; losing a consented subscriber over it is worse.
    const rejecting = world();
    let firstCreate = true;
    const impl = async (url: string, init: { body?: string; method?: string } = {}) => {
      if (String(url) === "https://resend.example/contacts" && (init.method ?? "POST") === "POST") {
        const body = JSON.parse(init.body ?? "{}");
        if (firstCreate && body.properties) {
          firstCreate = false;
          return { ok: false, status: 422, clone: () => ({ text: async () => "unknown property language" }), text: async () => "unknown property language" };
        }
      }
      return rejecting.impl(String(url), init);
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(impl as unknown as typeof fetch);

    const res = await enrollProSubscriber({
      email: BUYER,
      consented: true,
      env: ENV,
      fetchImpl: impl as unknown as typeof fetch,
    });

    expect(res.outcome).toBe("enrolled");
    expect(rejecting.segmentJoins.length).toBe(1);
  });
});
