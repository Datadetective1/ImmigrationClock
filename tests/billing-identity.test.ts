// =============================================================================
// PERSISTENT SUBSCRIBER IDENTITY
//
// The flaw this replaces: entitlement lived only in a cookie, so a subscriber
// who cleared it had paid for something they could not reach, and a cancelled
// subscriber kept access until the cookie lapsed. Both are fixed by making the
// STORE authoritative for access and the cookie a fast path.
//
// So the properties worth testing are the ones a paying customer would feel:
//
//   • Access survives losing the browser, and comes back with one email.
//   • A cancellation is effective at the next request, not in thirty days.
//   • A sign-in link works exactly once, expires, and grants nothing on its own.
//   • The store never holds an email address as a KEY, because a key listing is
//     the easiest thing to leak and this is an immigration site.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  KEYS,
  MemoryStore,
  RedisStore,
  emailKey,
  resolveStore,
  storeConfigured,
  tokenHash,
  type SubscriberRecord,
} from "@/lib/billing/store";
import {
  LOGIN_TTL_SECONDS,
  buildSignInEmail,
  isPlausibleEmail,
  loginUrl,
  newLoginToken,
} from "@/lib/billing/identity";
import { accessFor, accessForKey, mergeSubscriber, NO_ACCESS } from "@/lib/billing/subscription";

const SECRET = "test-only-secret-for-key-derivation";
const NOW = 1_800_000_000;

function record(over: Partial<SubscriberRecord> = {}): SubscriberRecord {
  return {
    email: "buyer@example.com",
    customerId: "cus_placeholder",
    status: "active",
    currentPeriodEnd: NOW + 30 * 86_400,
    updatedAt: NOW,
    ...over,
  };
}

// -----------------------------------------------------------------------------
// KEYS
// -----------------------------------------------------------------------------

describe("an email never becomes a key", () => {
  it("derives an opaque key that does not contain the address", () => {
    const key = emailKey("Buyer@Example.com", SECRET);
    expect(key).not.toContain("buyer");
    expect(key).not.toContain("@");
    expect(key).not.toContain("example");
    expect(key.length).toBe(32);
  });

  it("normalises case and surrounding space, so one person has one key", () => {
    expect(emailKey("  BUYER@example.com ", SECRET)).toBe(emailKey("buyer@example.com", SECRET));
  });

  it("is keyed, so a dumped key set cannot be dictionary-attacked without the secret", () => {
    expect(emailKey("buyer@example.com", SECRET)).not.toBe(emailKey("buyer@example.com", "another-secret"));
  });

  it("stores a sign-in token only as a hash", () => {
    const token = newLoginToken();
    const hash = tokenHash(token, SECRET);
    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token.slice(0, 12));
    expect(tokenHash(token, SECRET)).toBe(hash);
  });

  it("mints tokens that are unguessable and unique", () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newLoginToken()));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(t.length).toBeGreaterThanOrEqual(40);
  });
});

// -----------------------------------------------------------------------------
// ACCESS
// -----------------------------------------------------------------------------

describe("who may use Pro", () => {
  it("grants access to an active subscription inside its period", () => {
    const access = accessFor(record(), NOW);
    expect(access.pro).toBe(true);
    expect(access.reason).toMatch(/active until/);
  });

  it("grants access during a trial", () => {
    expect(accessFor(record({ status: "trialing" }), NOW).pro).toBe(true);
  });

  it("refuses every status Stripe uses for 'not paying'", () => {
    for (const status of ["past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"]) {
      const access = accessFor(record({ status }), NOW);
      expect(access.pro, status).toBe(false);
      expect(access.reason, status).toContain(status);
    }
  });

  it("refuses once the paid period has ended, even if the status still says active", () => {
    // The dead man's switch. If a webhook is ever missed — a deploy at the
    // wrong moment, a disabled endpoint — the status can sit at "active"
    // forever. The period end stops access on its own.
    const access = accessFor(record({ status: "active", currentPeriodEnd: NOW - 1 }), NOW);
    expect(access.pro).toBe(false);
    expect(access.reason).toMatch(/paid period has ended/);
  });

  it("refuses when there is no record at all", () => {
    expect(accessFor(null, NOW)).toEqual(NO_ACCESS);
    expect(NO_ACCESS.pro).toBe(false);
  });
});

describe("merging what Stripe tells us", () => {
  it("keeps the email a later event does not carry", () => {
    // customer.subscription.updated has no email. Overwriting would make the
    // subscriber unreachable by sign-in link and by alert — the exact way a
    // paying customer would silently lose access.
    const existing = record({ email: "buyer@example.com" });
    const merged = mergeSubscriber(existing, { status: "past_due", currentPeriodEnd: NOW + 100 }, NOW + 5);
    expect(merged.email).toBe("buyer@example.com");
    expect(merged.customerId).toBe("cus_placeholder");
    expect(merged.status).toBe("past_due");
    expect(merged.updatedAt).toBe(NOW + 5);
  });

  it("creates a usable record from nothing", () => {
    const merged = mergeSubscriber(null, { email: "new@example.com", customerId: "cus_new" }, NOW);
    expect(merged).toEqual({
      email: "new@example.com",
      customerId: "cus_new",
      status: "incomplete",
      currentPeriodEnd: 0,
      updatedAt: NOW,
    });
    expect(accessFor(merged, NOW).pro).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// THE STORE
// -----------------------------------------------------------------------------

describe("the subscriber store", () => {
  it("round-trips a subscriber and finds them again by customer id", async () => {
    const store = new MemoryStore();
    const key = emailKey("buyer@example.com", SECRET);

    await store.putSubscriber(key, record());
    await store.linkCustomer("cus_placeholder", key);

    expect(await store.getSubscriber(key)).toEqual(record());
    expect(await store.getEmailKeyForCustomer("cus_placeholder")).toBe(key);
    expect(await store.getEmailKeyForCustomer("cus_unknown")).toBeNull();
  });

  it("keeps an index the alert job can iterate", async () => {
    const store = new MemoryStore();
    await store.putSubscriber(emailKey("a@example.com", SECRET), record());
    await store.putSubscriber(emailKey("b@example.com", SECRET), record({ email: "b@example.com" }));
    await store.putSubscriber(emailKey("a@example.com", SECRET), record());

    const keys = await store.listSubscriberKeys();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
  });

  it("holds no email address in any key", async () => {
    const store = new MemoryStore();
    const key = emailKey("buyer@example.com", SECRET);
    await store.putSubscriber(key, record());
    await store.putWatchlist(key, { entityIds: ["visa:h-1b"], updatedAt: NOW });
    await store.linkCustomer("cus_placeholder", key);

    for (const k of Object.keys(store.dump())) {
      expect(k, k).not.toContain("buyer@example.com");
      expect(k, k).not.toContain("@");
    }
  });

  it("round-trips a watchlist", async () => {
    const store = new MemoryStore();
    const key = emailKey("buyer@example.com", SECRET);
    expect(await store.getWatchlist(key)).toBeNull();
    await store.putWatchlist(key, { entityIds: ["visa:h-1b", "employer:acme"], updatedAt: NOW });
    expect((await store.getWatchlist(key))?.entityIds).toEqual(["visa:h-1b", "employer:acme"]);
  });

  it("resolves access through the store", async () => {
    const store = new MemoryStore();
    const key = emailKey("buyer@example.com", SECRET);
    expect((await accessForKey(store, key, NOW)).pro).toBe(false);
    await store.putSubscriber(key, record());
    expect((await accessForKey(store, key, NOW)).pro).toBe(true);
    // A cancellation is effective at the next request, not in thirty days.
    await store.putSubscriber(key, record({ status: "canceled", currentPeriodEnd: NOW }));
    expect((await accessForKey(store, key, NOW)).pro).toBe(false);
  });

  it("gives a sign-in token exactly one use", async () => {
    const store = new MemoryStore();
    const key = emailKey("buyer@example.com", SECRET);
    const hash = tokenHash(newLoginToken(), SECRET);

    await store.putLoginToken(hash, key, LOGIN_TTL_SECONDS);
    expect(await store.consumeLoginToken(hash)).toBe(key);
    // A second open — a forwarded mail, a prefetching client — gets nothing.
    expect(await store.consumeLoginToken(hash)).toBeNull();
  });

  it("expires a sign-in token", async () => {
    const store = new MemoryStore();
    const hash = tokenHash("t", SECRET);
    await store.putLoginToken(hash, "key", -1);
    expect(await store.consumeLoginToken(hash)).toBeNull();
  });

  it("remembers what it already alerted about", async () => {
    const store = new MemoryStore();
    const key = emailKey("buyer@example.com", SECRET);
    expect(await store.getAlertCursor(key)).toBeNull();
    await store.putAlertCursor(key, '{"lastChangeDate":"2026-09-03"}');
    expect(await store.getAlertCursor(key)).toContain("2026-09-03");
  });
});

describe("the Redis adapter speaks the REST protocol", () => {
  function stub(results: unknown[]) {
    const calls: unknown[][] = [];
    let i = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(init.body as string) as unknown[]);
      const result = results[Math.min(i, results.length - 1)];
      i++;
      return { ok: true, status: 200, json: async () => ({ result }) } as unknown as Response;
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  it("writes with SET and adds to the index with SADD", async () => {
    const { fetchImpl, calls } = stub([null]);
    const store = new RedisStore({ url: "https://example.upstash.io/", token: "tok", fetchImpl });
    await store.putSubscriber("k1", record());

    expect(calls[0][0]).toBe("SET");
    expect(calls[0][1]).toBe(KEYS.subscriber("k1"));
    expect(calls[1]).toEqual(["SADD", KEYS.index, "k1"]);
  });

  it("consumes a login token atomically with GETDEL", async () => {
    // Not GET-then-DEL: two opens at once would both succeed.
    const { fetchImpl, calls } = stub(["k1"]);
    const store = new RedisStore({ url: "https://example.upstash.io", token: "tok", fetchImpl });
    expect(await store.consumeLoginToken("h1")).toBe("k1");
    expect(calls[0]).toEqual(["GETDEL", KEYS.login("h1")]);
  });

  it("sets a TTL on a login token", async () => {
    const { fetchImpl, calls } = stub([null]);
    const store = new RedisStore({ url: "https://example.upstash.io", token: "tok", fetchImpl });
    await store.putLoginToken("h1", "k1", 900);
    expect(calls[0]).toEqual(["SET", KEYS.login("h1"), "k1", "EX", 900]);
  });

  it("never puts the stored value into an error message", async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)) as unknown as typeof fetch;
    const store = new RedisStore({ url: "https://example.upstash.io", token: "tok", fetchImpl });
    await expect(store.putSubscriber("k1", record())).rejects.toThrow(/HTTP 500/);
    await expect(store.putSubscriber("k1", record())).rejects.not.toThrow(/buyer@example.com/);
  });
});

describe("store configuration", () => {
  it("is absent until both variables are set", () => {
    expect(storeConfigured({})).toBe(false);
    expect(storeConfigured({ KV_REST_API_URL: "https://x" })).toBe(false);
    expect(storeConfigured({ KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t" })).toBe(true);
    expect(resolveStore({})).toBeNull();
    expect(resolveStore({ KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t" })).toBeInstanceOf(RedisStore);
  });
});

// -----------------------------------------------------------------------------
// THE SIGN-IN EMAIL
// -----------------------------------------------------------------------------

describe("the sign-in link", () => {
  it("carries the token as a query parameter on the account page", () => {
    const url = loginUrl("https://immigrationclock.com/", "abc+def/ghi");
    expect(url.startsWith("https://immigrationclock.com/account?signin=")).toBe(true);
    expect(new URL(url).searchParams.get("signin")).toBe("abc+def/ghi");
  });

  it("says it expires and what to do if you did not ask", () => {
    const mail = buildSignInEmail("https://immigrationclock.com/account?signin=x", "ImmigrationClock");
    expect(mail.subject).toContain("ImmigrationClock");
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("15 minutes");
      expect(body).toMatch(/did not ask/i);
      expect(body).toContain("account?signin=x");
    }
    expect(LOGIN_TTL_SECONDS).toBe(900);
  });

  it("escapes what it puts in HTML", () => {
    const mail = buildSignInEmail("https://x/?a=1&b=2", '<script>alert("x")</script>');
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&amp;b=2");
  });

  it("accepts real addresses and rejects obvious junk", () => {
    for (const good of ["a@b.co", "first.last+tag@sub.example.com", "x_y@example.org"]) {
      expect(isPlausibleEmail(good), good).toBe(true);
    }
    for (const bad of ["", "nope", "a@b", "a b@example.com", "@example.com", "a@@b.com", `${"a".repeat(250)}@b.com`]) {
      expect(isPlausibleEmail(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});
