// =============================================================================
// WATCHLIST SYNC — the first sellable Pro capability
//
// Two things are being asserted here, and they pull in opposite directions.
//
//   THE FREE PRODUCT MUST NOT MOVE. Following works with no account, no
//   network and no subscription, exactly as it did. If any test in this file
//   could pass while the anonymous path broke, the file is not doing its job.
//
//   THE PAID PRODUCT MUST NOT LEAK. A watchlist on an immigration site can
//   imply a nationality and a status. One subscriber must never see or change
//   another's, and no amount of browser-side lying may produce Pro.
//
// The route is exercised against an in-memory emulator of the exact Redis
// commands the client issues, so the store is real rather than mocked away.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mergeWatchlists, readSyncState, writeSyncState, clearSyncState, SYNC_STATE_KEY } from "@/lib/billing/watchlist-sync";
import { sign, sessionHintCookie, COOKIE_NAME, type Entitlement } from "@/lib/billing/entitlement";
import { hasSessionHint } from "@/lib/billing/watchlist-client";
import { emailKey, KEYS } from "@/lib/billing/store";
import { MAX_FOLLOWS, sanitizeFollows } from "@/lib/follows";
import { CAPABILITY_SPECS, availableNow } from "@/lib/billing/plans";

const SESSION_SECRET = "s".repeat(32);
const NOW = Math.floor(Date.now() / 1000);

// -----------------------------------------------------------------------------
// THE MERGE — pure, and the reason first sign-in does not delete anybody's work
// -----------------------------------------------------------------------------

describe("first sign-in merges rather than replaces", () => {
  it("keeps follows the browser had and the account did not", () => {
    // The scenario from the brief: someone already follows these three, then
    // pays and signs in. All three must survive.
    const local = ["visa:h-1b", "country:mexico", "agency:uscis"];
    const merged = mergeWatchlists([], local);
    expect(merged.entityIds).toEqual(local);
    expect(merged.added).toEqual(local);
    expect(merged.changed).toBe(true);
  });

  it("keeps follows the account had and the browser did not", () => {
    const merged = mergeWatchlists(["country:india"], []);
    expect(merged.entityIds).toEqual(["country:india"]);
    expect(merged.added).toEqual([]);
    expect(merged.changed).toBe(false);
  });

  it("is a union, in a stable order, with the account's entries first", () => {
    const merged = mergeWatchlists(["country:india", "visa:h-1b"], ["visa:h-1b", "country:mexico"]);
    expect(merged.entityIds).toEqual(["country:india", "visa:h-1b", "country:mexico"]);
    // Deterministic: a retry writes exactly the same list.
    expect(mergeWatchlists(["country:india", "visa:h-1b"], ["visa:h-1b", "country:mexico"]).entityIds).toEqual(
      merged.entityIds
    );
  });

  it("does not duplicate a follow both sides already have", () => {
    const merged = mergeWatchlists(["visa:h-1b"], ["visa:h-1b", "visa:h-1b"]);
    expect(merged.entityIds).toEqual(["visa:h-1b"]);
    expect(merged.changed).toBe(false);
  });

  it("handles two empty lists without inventing anything", () => {
    const merged = mergeWatchlists([], []);
    expect(merged.entityIds).toEqual([]);
    expect(merged.changed).toBe(false);
  });

  it("drops legacy and invalid ids from BOTH sides", () => {
    // policy: and employer: were retired when the Monitor could not match them.
    // A server record written before that must not reintroduce them, or the
    // account resurrects the exact ids that broke the Monitor page.
    const merged = mergeWatchlists(
      ["policy:uscis-pm-volume-1-part-e", "country:india"],
      ["employer:amazon", "visa:h-1b", "", "not-an-id", "visa:h-1b"]
    );
    expect(merged.entityIds).toEqual(["country:india", "visa:h-1b"]);
    expect(merged.rejected).toContain("employer:amazon");
    expect(merged.rejected).toContain("not-an-id");
  });

  it("never exceeds the cap the browser itself enforces", () => {
    const many = Array.from({ length: MAX_FOLLOWS + 25 }, (_, i) => `country:c${i}`);
    const merged = mergeWatchlists([], many.map((id) => id));
    expect(merged.entityIds.length).toBeLessThanOrEqual(MAX_FOLLOWS);
  });

  it("survives junk types without throwing", () => {
    const merged = mergeWatchlists(
      [null, 42, { entityId: "visa:h-1b" }] as unknown[],
      [undefined, ["visa:h-1b"], "country:india"] as unknown[]
    );
    expect(merged.entityIds).toEqual(["country:india"]);
  });
});

// -----------------------------------------------------------------------------
// PER-DEVICE STATE — why the union runs once and not on every load
// -----------------------------------------------------------------------------

describe("the merge marker", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("is absent before the first merge and present after", () => {
    expect(readSyncState()).toBeNull();
    writeSyncState(NOW);
    expect(readSyncState()?.merged).toBe(true);
  });

  it("carries no account identity and no follow ids", () => {
    writeSyncState(NOW);
    const raw = store.get(SYNC_STATE_KEY) ?? "";
    expect(raw).not.toMatch(/@|country:|visa:|agency:|cus_/);
  });

  it("is cleared on sign-out, so the next sign-in merges again", () => {
    // A shared machine: the next person to sign in must not have this browser's
    // list silently adopted into their account without a union.
    writeSyncState(NOW);
    clearSyncState();
    expect(readSyncState()).toBeNull();
  });

  it("treats unreadable storage as not merged", () => {
    store.set(SYNC_STATE_KEY, "{not json");
    expect(readSyncState()).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// THE ROUTE — isolation, entitlement, and what a browser cannot talk its way into
// -----------------------------------------------------------------------------

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
        if (rest.includes("NX") && data.has(key)) result = null;
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
  return { data, impl };
}

/** A signed cookie for an address, exactly as the sign-in flow would mint it. */
function cookieFor(email: string): string {
  const ent: Entitlement = { plan: "pro", email, customerId: "cus_x", exp: NOW + 86_400 };
  return `${COOKIE_NAME}=${sign(ent, SESSION_SECRET, NOW)}`;
}

/** A live subscription for an address, as the webhook would have written it. */
function subscribe(emulator: ReturnType<typeof redisEmulator>, email: string) {
  const key = emailKey(email, SESSION_SECRET);
  emulator.data.set(
    KEYS.subscriber(key),
    JSON.stringify({
      email,
      customerId: "cus_x",
      status: "active",
      currentPeriodEnd: NOW + 30 * 86_400,
      updatedAt: NOW,
    })
  );
  return key;
}

describe("GET/PUT /api/billing/watchlist", () => {
  let emulator: ReturnType<typeof redisEmulator>;

  beforeEach(() => {
    vi.resetModules();
    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.BILLING_SESSION_SECRET = SESSION_SECRET;
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "token";
    emulator = redisEmulator();
    vi.spyOn(globalThis, "fetch").mockImplementation(emulator.impl as unknown as typeof fetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.BILLING_ENABLED;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  async function call(method: "GET" | "PUT", cookie?: string, body?: unknown) {
    const mod = await import("@/app/api/billing/watchlist/route");
    const req = new Request("https://immigrationclock.com/api/billing/watchlist", {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        "Content-Type": "application/json",
        // A distinct IP per call: the route rate-limits per address, and these
        // tests are about authorization, not throttling.
        "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200) + 1}`,
      },
      ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    });
    const res = method === "GET" ? await mod.GET(req) : await mod.PUT(req);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("refuses an anonymous caller", async () => {
    expect((await call("GET")).status).toBe(401);
    expect((await call("PUT", undefined, { entityIds: ["visa:h-1b"] })).status).toBe(401);
  });

  it("refuses a signed-in caller with no live subscription", async () => {
    // A valid, correctly-signed cookie and NO subscriber record. This is the
    // client-side-manipulation case: the browser holds a real cookie claiming
    // plan "pro" and still cannot sync, because the store is the authority.
    const res = await call("GET", cookieFor("lapsed@example.com"));
    expect(res.status).toBe(402);
    expect(res.body.error).toBe("not_pro");
  });

  it("refuses a forged cookie outright", async () => {
    const forged = `${COOKIE_NAME}=eyJwIjoicHJvIn0.deadbeef`;
    expect((await call("GET", forged)).status).toBe(401);
    expect((await call("PUT", forged, { entityIds: ["visa:h-1b"] })).status).toBe(401);
  });

  it("refuses a cookie signed with the wrong secret", async () => {
    const ent: Entitlement = { plan: "pro", email: "a@example.com", customerId: "c", exp: NOW + 86_400 };
    const wrong = `${COOKIE_NAME}=${sign(ent, "w".repeat(32), NOW)}`;
    subscribe(emulator, "a@example.com");
    expect((await call("GET", wrong)).status).toBe(401);
  });

  it("lets a subscriber read and write their own list", async () => {
    subscribe(emulator, "a@example.com");
    const cookie = cookieFor("a@example.com");

    expect((await call("GET", cookie)).body.entityIds).toEqual([]);

    const put = await call("PUT", cookie, { entityIds: ["visa:h-1b", "country:mexico"] });
    expect(put.status).toBe(200);
    expect(put.body.entityIds).toEqual(["visa:h-1b", "country:mexico"]);

    expect((await call("GET", cookie)).body.entityIds).toEqual(["visa:h-1b", "country:mexico"]);
  });

  it("keeps one subscriber's list invisible to another", async () => {
    // THE ISOLATION TEST. Two live subscribers, two cookies, one store.
    subscribe(emulator, "alice@example.com");
    subscribe(emulator, "bob@example.com");

    await call("PUT", cookieFor("alice@example.com"), { entityIds: ["country:venezuela"] });
    await call("PUT", cookieFor("bob@example.com"), { entityIds: ["visa:h-1b"] });

    expect((await call("GET", cookieFor("alice@example.com"))).body.entityIds).toEqual(["country:venezuela"]);
    expect((await call("GET", cookieFor("bob@example.com"))).body.entityIds).toEqual(["visa:h-1b"]);
  });

  it("gives a caller no way to address another account's list", async () => {
    // The key is derived server-side from the verified cookie. There is no
    // parameter, body field or header that names whose list to touch, so there
    // is nothing for a caller to tamper with.
    subscribe(emulator, "alice@example.com");
    subscribe(emulator, "bob@example.com");
    await call("PUT", cookieFor("alice@example.com"), { entityIds: ["country:venezuela"] });

    // Bob tries every shape that might be read as "act on Alice".
    for (const body of [
      { entityIds: ["visa:h-1b"], emailKey: emailKey("alice@example.com", SESSION_SECRET) },
      { entityIds: ["visa:h-1b"], email: "alice@example.com" },
      { entityIds: ["visa:h-1b"], key: emailKey("alice@example.com", SESSION_SECRET) },
    ]) {
      const res = await call("PUT", cookieFor("bob@example.com"), body);
      expect(res.status).toBe(200);
    }
    // Alice is untouched, and Bob only ever wrote his own.
    expect((await call("GET", cookieFor("alice@example.com"))).body.entityIds).toEqual(["country:venezuela"]);
    expect((await call("GET", cookieFor("bob@example.com"))).body.entityIds).toEqual(["visa:h-1b"]);
  });

  it("sanitizes what it stores, so the account cannot hold an unfollowable id", async () => {
    subscribe(emulator, "a@example.com");
    const cookie = cookieFor("a@example.com");
    const put = await call("PUT", cookie, {
      entityIds: ["visa:h-1b", "policy:uscis-pm-volume-1-part-e", "employer:amazon", "junk", "", "visa:h-1b"],
    });
    expect(put.body.entityIds).toEqual(["visa:h-1b"]);
  });

  it("accepts an empty list as a real answer", async () => {
    subscribe(emulator, "a@example.com");
    const cookie = cookieFor("a@example.com");
    await call("PUT", cookie, { entityIds: ["visa:h-1b"] });
    // Unfollowing the last thing must persist, not be read as "no change".
    const cleared = await call("PUT", cookie, { entityIds: [] });
    expect(cleared.body.entityIds).toEqual([]);
    expect((await call("GET", cookie)).body.entityIds).toEqual([]);
  });

  it("reflects an add and a remove", async () => {
    subscribe(emulator, "a@example.com");
    const cookie = cookieFor("a@example.com");
    await call("PUT", cookie, { entityIds: ["visa:h-1b", "country:mexico"] });
    await call("PUT", cookie, { entityIds: ["visa:h-1b", "country:mexico", "agency:uscis"] });
    expect((await call("GET", cookie)).body.entityIds).toEqual(["visa:h-1b", "country:mexico", "agency:uscis"]);
    await call("PUT", cookie, { entityIds: ["visa:h-1b", "agency:uscis"] });
    expect((await call("GET", cookie)).body.entityIds).toEqual(["visa:h-1b", "agency:uscis"]);
  });

  it("refuses a malformed body without disturbing what is stored", async () => {
    subscribe(emulator, "a@example.com");
    const cookie = cookieFor("a@example.com");
    await call("PUT", cookie, { entityIds: ["visa:h-1b"] });

    for (const bad of ["not json at all", { entityIds: "visa:h-1b" }, { entityIds: null }, {}]) {
      const res = await call("PUT", cookie, bad);
      expect(res.status).toBe(400);
    }
    expect((await call("GET", cookie)).body.entityIds).toEqual(["visa:h-1b"]);
  });

  it("survives sign-out and sign-in with the list intact", async () => {
    // Signing out clears a cookie. It does not touch the account, which is the
    // whole promise of "your watchlist, everywhere".
    subscribe(emulator, "a@example.com");
    await call("PUT", cookieFor("a@example.com"), { entityIds: ["country:india"] });

    const { POST } = await import("@/app/api/billing/signout/route");
    const res = await POST(new Request("https://immigrationclock.com/api/billing/signout", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/ic_ent=;|Max-Age=0/);

    // A fresh cookie for the same person finds the list where it was.
    expect((await call("GET", cookieFor("a@example.com"))).body.entityIds).toEqual(["country:india"]);
  });

  it("stores the list against an opaque key, never the address", async () => {
    subscribe(emulator, "alice@example.com");
    await call("PUT", cookieFor("alice@example.com"), { entityIds: ["country:venezuela"] });
    const keys = [...emulator.data.keys()].join(" ");
    expect(keys).not.toContain("alice@example.com");
    expect(keys).toContain(KEYS.watchlist(emailKey("alice@example.com", SESSION_SECRET)));
  });
});

// -----------------------------------------------------------------------------
// BILLING STAYS OFF UNTIL SOMEBODY TURNS IT ON
// -----------------------------------------------------------------------------

describe("sync is inert in the shipped configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.BILLING_ENABLED;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("answers 503 when billing is not enabled", async () => {
    const mod = await import("@/app/api/billing/watchlist/route");
    const res = await mod.GET(
      new Request("https://immigrationclock.com/api/billing/watchlist", {
        headers: { "x-forwarded-for": "10.1.2.3" },
      })
    );
    expect(res.status).toBe(503);
    const body = JSON.stringify(await res.json());
    expect(body).not.toMatch(/BILLING_ENABLED|STRIPE_|KV_REST|sk_(test|live)_/);
  });
});

// -----------------------------------------------------------------------------
// THE AVAILABILITY GATE
// -----------------------------------------------------------------------------

describe("watchlist sync is the first capability Pro can honestly sell", () => {
  it("is marked available, and it is the only one", () => {
    const now = availableNow("pro").map((c) => c.id);
    expect(now).toEqual(["watchlist_sync"]);
  });

  it("says it exists today, so the two fields agree", () => {
    const spec = CAPABILITY_SPECS.find((c) => c.id === "watchlist_sync")!;
    expect(spec.status).toBe("available");
    expect(spec.existsToday).toBe(true);
  });

  it("leaves every unfinished capability unfinished", () => {
    // The ones that must NOT be claimed: nothing here delivers an email, an
    // export, a search or employer monitoring.
    for (const id of ["watchlist_alerts", "bulk_export", "advanced_filters", "employer_monitoring"]) {
      const spec = CAPABILITY_SPECS.find((c) => c.id === id);
      if (!spec) continue;
      expect(spec.status, `${id} is claimed as available`).not.toBe("available");
      expect(spec.existsToday, `${id} claims to exist`).toBe(false);
    }
  });
});

// -----------------------------------------------------------------------------
// THE FREE PATH IS UNCHANGED
// -----------------------------------------------------------------------------

describe("anonymous following is untouched", () => {
  it("still sanitizes a local list with no account and no network", () => {
    expect(sanitizeFollows(["visa:h-1b", "policy:x", "country:mexico"])).toEqual([
      "visa:h-1b",
      "country:mexico",
    ]);
  });

  it("does not require a merge marker to work", () => {
    // Nothing in the free path reads sync state; a reader with no window at all
    // (server render) must not throw.
    delete (globalThis as { window?: unknown }).window;
    expect(readSyncState()).toBeNull();
    expect(() => writeSyncState(NOW)).not.toThrow();
    expect(() => clearSyncState()).not.toThrow();
  });
});

// -----------------------------------------------------------------------------
// THE SESSION HINT — why an anonymous reader makes no request at all
// -----------------------------------------------------------------------------

describe("the readable session hint", () => {
  afterEach(() => {
    delete (globalThis as { document?: unknown }).document;
  });

  function withCookie(cookie: string) {
    (globalThis as { document?: unknown }).document = { cookie };
  }

  it("is false with no cookies, so the free path issues no request", () => {
    withCookie("");
    expect(hasSessionHint()).toBe(false);
  });

  it("is false during server rendering", () => {
    delete (globalThis as { document?: unknown }).document;
    expect(hasSessionHint()).toBe(false);
  });

  it("is true once a session exists, among other cookies", () => {
    withCookie("theme=dark; ic_session=1; consent=all");
    expect(hasSessionHint()).toBe(true);
    withCookie("ic_session=1");
    expect(hasSessionHint()).toBe(true);
  });

  it("does not fire on a lookalike cookie name", () => {
    withCookie("not_ic_session=1; ic_session_other=1");
    expect(hasSessionHint()).toBe(false);
  });

  it("carries no identity — it is one character", () => {
    const c = sessionHintCookie(NOW + 86_400, NOW, true);
    expect(c.value).toBe("1");
    expect(c.httpOnly).toBe(false);
    expect(JSON.stringify(c)).not.toMatch(/@|cus_|pro|email/i);
  });

  it("grants nothing: the signed cookie is still what the route reads", async () => {
    // A browser that forges the hint gets a request that answers 401, not Pro.
    // Asserted against the real route rather than argued.
    vi.resetModules();
    process.env.BILLING_ENABLED = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    process.env.BILLING_SESSION_SECRET = SESSION_SECRET;
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "token";
    const emulator = redisEmulator();
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(emulator.impl as unknown as typeof fetch);

    const mod = await import("@/app/api/billing/watchlist/route");
    const res = await mod.GET(
      new Request("https://immigrationclock.com/api/billing/watchlist", {
        headers: { cookie: "ic_session=1", "x-forwarded-for": "10.9.9.9" },
      })
    );
    expect(res.status).toBe(401);

    spy.mockRestore();
    delete process.env.BILLING_ENABLED;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  });

  it("is cleared by sign-out alongside the signed cookie", async () => {
    const { POST } = await import("@/app/api/billing/signout/route");
    const res = await POST(new Request("https://immigrationclock.com/api/billing/signout", { method: "POST" }));
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""];
    const joined = cookies.join(" | ");
    expect(joined).toMatch(/ic_ent=/);
    expect(joined).toMatch(/ic_session=/);
    expect(joined.match(/Max-Age=0/g) ?? []).toHaveLength(2);
  });
});
