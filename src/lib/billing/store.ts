// =============================================================================
// THE SUBSCRIBER STORE — the smallest durable thing that makes Pro honest
//
// WHY THIS EXISTS
// ---------------
// The first cut carried entitlement in a signed cookie alone. That is fine
// scaffolding and wrong as a product: a subscriber who clears cookies or opens
// a laptop instead of a phone has paid for something they cannot reach, and a
// watchlist that lives in localStorage is lost with the browser. A paid
// subscription needs a durable home for four things and only four:
//
//   1. Who is a subscriber (email -> Stripe customer, plan, period end).
//   2. Their watchlist.
//   3. Short-lived sign-in tokens.
//   4. What we have already alerted them about, so we do not repeat.
//
// WHAT THIS DELIBERATELY IS NOT
// -----------------------------
// It is not an ORM, a migration system or an auth stack. There are no
// relations, no joins and no schema to migrate: four key shapes, get and set.
// Introducing Postgres, Prisma and a session table for that would be the
// largest architectural change in the project's history, in service of data
// that fits in a few kilobytes per person.
//
// (The README still documents a Postgres/Prisma setup. It does not exist —
// there is no prisma directory, no driver in package.json and nothing reads
// DATABASE_URL. That documentation is a leftover from an abandoned design.)
//
// THE INTERFACE IS THE POINT
// --------------------------
// Everything above the interface is provider-agnostic. The shipped adapter
// speaks the Redis REST protocol over plain `fetch` — no dependency, no
// connection pool to exhaust from a serverless function — and is satisfied by
// Vercel KV (one click in the Storage tab, which injects exactly the two
// variables below) or by an Upstash account directly. If this ever outgrows a
// key-value store, one adapter is replaced and nothing else moves.
// =============================================================================

import { createHmac } from "node:crypto";

/** What we know about one subscriber. Stripe stays authoritative for billing. */
export interface SubscriberRecord {
  /** The billing email, lowercased. The identity for sign-in. */
  email: string;
  /** Stripe customer id, for the portal and for webhook correlation. */
  customerId: string;
  /** Mirrors the Stripe subscription status verbatim; we never invent one. */
  status: string;
  /** Unix seconds. Access is denied past this even if the status says otherwise. */
  currentPeriodEnd: number;
  /** Unix seconds, when this record was last written. */
  updatedAt: number;
  /**
   * The `created` timestamp of the most recent Stripe event applied to this
   * record. Unix seconds. Absent on records written before ordering was
   * enforced, which is treated as "older than anything".
   *
   * Stripe does not guarantee delivery order, and it retries. Without this, a
   * `customer.subscription.updated` carrying status active — redelivered or
   * merely late — lands after `customer.subscription.deleted` and silently
   * restores a cancelled subscriber's access.
   */
  lastEventAt?: number;
}

/** One person's watchlist. Entity ids only — the same strings /following uses. */
export interface WatchlistRecord {
  entityIds: string[];
  updatedAt: number;
}

export interface SubscriberStore {
  getSubscriber(emailKey: string): Promise<SubscriberRecord | null>;
  putSubscriber(emailKey: string, record: SubscriberRecord): Promise<void>;
  /** customerId -> emailKey, so a webhook carrying only a customer can find the person. */
  getEmailKeyForCustomer(customerId: string): Promise<string | null>;
  linkCustomer(customerId: string, emailKey: string): Promise<void>;

  getWatchlist(emailKey: string): Promise<WatchlistRecord | null>;
  putWatchlist(emailKey: string, record: WatchlistRecord): Promise<void>;

  /** Single-use sign-in token -> emailKey. Expires; consuming it deletes it. */
  putLoginToken(tokenHash: string, emailKey: string, ttlSeconds: number): Promise<void>;
  consumeLoginToken(tokenHash: string): Promise<string | null>;

  /**
   * Claim a Stripe checkout session, once.
   *
   * Returns true only for the caller that claimed it; every later call for the
   * same session returns false.
   *
   * WHY THIS EXISTS: /api/billing/activate is deliberately unauthenticated — the
   * person arriving back from Stripe has no cookie yet, and the session id is
   * the only thing they carry. But the route treated that id as a credential it
   * could honour any number of times, so one paid `cs_` id minted unlimited Pro
   * cookies in unlimited browsers. A checkout session is proof that ONE person
   * paid once; it has to be spendable once.
   */
  claimCheckoutSession(sessionId: string, ttlSeconds: number): Promise<boolean>;

  /** The last change id we alerted this person about, so we never repeat one. */
  getAlertCursor(emailKey: string): Promise<string | null>;
  putAlertCursor(emailKey: string, cursor: string): Promise<void>;

  /** Every subscriber key, for the alert job. Small by construction. */
  listSubscriberKeys(): Promise<string[]>;
}

// -----------------------------------------------------------------------------
// KEYS
// -----------------------------------------------------------------------------

/**
 * An email becomes an opaque key before it is ever used as one.
 *
 * Two reasons, and the second is the one that matters. First, an email is not a
 * safe key shape — case, plus-addressing and dots vary. Second, and this is an
 * immigration site: a key listing is the easiest thing to leak from any store,
 * and a list of plaintext addresses of people who follow immigration policy is
 * exactly the kind of list that should not exist. The record still holds the
 * address, because alerts have to be sent somewhere; the KEY does not.
 *
 * Keyed HMAC rather than a bare hash, so a dumped key set cannot be attacked
 * with a dictionary of common addresses without also holding the secret.
 */
export function emailKey(email: string, secret: string): string {
  const normalized = email.trim().toLowerCase();
  return createHmac("sha256", secret).update(normalized).digest("base64url").slice(0, 32);
}

/** A sign-in token is stored only as a hash: a store dump must not be a set of live links. */
export function tokenHash(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("base64url");
}

export const KEYS = {
  subscriber: (k: string) => `sub:${k}`,
  watchlist: (k: string) => `watch:${k}`,
  customer: (id: string) => `cust:${id}`,
  login: (h: string) => `login:${h}`,
  cursor: (k: string) => `cursor:${k}`,
  /** A spent checkout session, so it cannot be replayed into a second cookie. */
  checkout: (id: string) => `cs:${id}`,
  /** The index of subscriber keys, so the alert job can iterate without SCAN. */
  index: "subs:index",
} as const;

// -----------------------------------------------------------------------------
// IN-MEMORY — for tests, and for a local run with no store configured
// -----------------------------------------------------------------------------

export class MemoryStore implements SubscriberStore {
  private readonly data = new Map<string, { value: string; expiresAt: number | null }>();

  private read(key: string): string | null {
    const hit = this.data.get(key);
    if (!hit) return null;
    if (hit.expiresAt !== null && hit.expiresAt <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return hit.value;
  }

  private write(key: string, value: string, ttlSeconds?: number): void {
    this.data.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }

  async getSubscriber(k: string): Promise<SubscriberRecord | null> {
    const raw = this.read(KEYS.subscriber(k));
    return raw ? (JSON.parse(raw) as SubscriberRecord) : null;
  }
  async putSubscriber(k: string, record: SubscriberRecord): Promise<void> {
    this.write(KEYS.subscriber(k), JSON.stringify(record));
    const index = new Set(JSON.parse(this.read(KEYS.index) ?? "[]") as string[]);
    index.add(k);
    this.write(KEYS.index, JSON.stringify([...index]));
  }
  async getEmailKeyForCustomer(customerId: string): Promise<string | null> {
    return this.read(KEYS.customer(customerId));
  }
  async linkCustomer(customerId: string, k: string): Promise<void> {
    this.write(KEYS.customer(customerId), k);
  }
  async getWatchlist(k: string): Promise<WatchlistRecord | null> {
    const raw = this.read(KEYS.watchlist(k));
    return raw ? (JSON.parse(raw) as WatchlistRecord) : null;
  }
  async putWatchlist(k: string, record: WatchlistRecord): Promise<void> {
    this.write(KEYS.watchlist(k), JSON.stringify(record));
  }
  async putLoginToken(hash: string, k: string, ttlSeconds: number): Promise<void> {
    this.write(KEYS.login(hash), k, ttlSeconds);
  }
  async consumeLoginToken(hash: string): Promise<string | null> {
    const value = this.read(KEYS.login(hash));
    this.data.delete(KEYS.login(hash));
    return value;
  }
  async claimCheckoutSession(sessionId: string, ttlSeconds: number): Promise<boolean> {
    if (this.read(KEYS.checkout(sessionId)) !== null) return false;
    this.write(KEYS.checkout(sessionId), "1", ttlSeconds);
    return true;
  }
  async getAlertCursor(k: string): Promise<string | null> {
    return this.read(KEYS.cursor(k));
  }
  async putAlertCursor(k: string, cursor: string): Promise<void> {
    this.write(KEYS.cursor(k), cursor);
  }
  async listSubscriberKeys(): Promise<string[]> {
    return JSON.parse(this.read(KEYS.index) ?? "[]") as string[];
  }

  /** Test helper: everything, so an assertion can look at raw state. */
  dump(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key] of this.data) {
      const value = this.read(key);
      if (value !== null) out[key] = value;
    }
    return out;
  }
}

// -----------------------------------------------------------------------------
// REDIS OVER HTTP — the shipped adapter
// -----------------------------------------------------------------------------

export interface RedisStoreOptions {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * The Redis REST protocol, which Vercel KV and Upstash both speak.
 *
 * HTTP rather than a socket, which is the whole reason it suits this project:
 * a serverless function that opens a TCP connection per invocation exhausts a
 * connection limit long before it exhausts anything else, and every workaround
 * for that is a dependency. Here a command is one POST with a JSON array body.
 */
export class RedisStore implements SubscriberStore {
  private readonly url: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: RedisStoreOptions) {
    this.url = opts.url.replace(/\/$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
  }

  private async command<T>(args: (string | number)[]): Promise<T> {
    const res = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      // Never echo the body: it can contain the value that was being written.
      throw new Error(`Subscriber store returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as { result?: T; error?: string };
    if (body.error) throw new Error(`Subscriber store error: ${body.error.slice(0, 120)}`);
    return body.result as T;
  }

  private async get(key: string): Promise<string | null> {
    return (await this.command<string | null>(["GET", key])) ?? null;
  }

  private async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    await this.command(ttlSeconds ? ["SET", key, value, "EX", ttlSeconds] : ["SET", key, value]);
  }

  async getSubscriber(k: string): Promise<SubscriberRecord | null> {
    const raw = await this.get(KEYS.subscriber(k));
    return raw ? (JSON.parse(raw) as SubscriberRecord) : null;
  }
  async putSubscriber(k: string, record: SubscriberRecord): Promise<void> {
    await this.set(KEYS.subscriber(k), JSON.stringify(record));
    await this.command(["SADD", KEYS.index, k]);
  }
  async getEmailKeyForCustomer(customerId: string): Promise<string | null> {
    return this.get(KEYS.customer(customerId));
  }
  async linkCustomer(customerId: string, k: string): Promise<void> {
    await this.set(KEYS.customer(customerId), k);
  }
  async getWatchlist(k: string): Promise<WatchlistRecord | null> {
    const raw = await this.get(KEYS.watchlist(k));
    return raw ? (JSON.parse(raw) as WatchlistRecord) : null;
  }
  async putWatchlist(k: string, record: WatchlistRecord): Promise<void> {
    await this.set(KEYS.watchlist(k), JSON.stringify(record));
  }
  async putLoginToken(hash: string, k: string, ttlSeconds: number): Promise<void> {
    await this.set(KEYS.login(hash), k, ttlSeconds);
  }
  async consumeLoginToken(hash: string): Promise<string | null> {
    // GETDEL: read and delete atomically, so a link cannot be used twice even
    // if it is opened twice at once (a mail client prefetching, say).
    return (await this.command<string | null>(["GETDEL", KEYS.login(hash)])) ?? null;
  }
  async claimCheckoutSession(sessionId: string, ttlSeconds: number): Promise<boolean> {
    // SET ... NX: sets only if absent, and reports which call won. Atomic, so
    // two tabs opening the success URL at the same instant cannot both claim it.
    const res = await this.command<string | null>([
      "SET",
      KEYS.checkout(sessionId),
      "1",
      "NX",
      "EX",
      ttlSeconds,
    ]);
    return res !== null;
  }
  async getAlertCursor(k: string): Promise<string | null> {
    return this.get(KEYS.cursor(k));
  }
  async putAlertCursor(k: string, cursor: string): Promise<void> {
    await this.set(KEYS.cursor(k), cursor);
  }
  async listSubscriberKeys(): Promise<string[]> {
    return (await this.command<string[]>(["SMEMBERS", KEYS.index])) ?? [];
  }
}

// -----------------------------------------------------------------------------
// RESOLUTION
// -----------------------------------------------------------------------------

export interface StoreEnv {
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
}

/**
 * The configured store, or null.
 *
 * Null is a first-class answer, not a failure: with no store configured the
 * billing routes refuse rather than pretending, exactly as they do for a
 * missing Stripe key. The variable names are the ones Vercel KV injects
 * automatically, so provisioning it in the Vercel dashboard configures this
 * with no further action.
 */
export function resolveStore(env: StoreEnv = process.env as StoreEnv): SubscriberStore | null {
  const url = (env.KV_REST_API_URL ?? "").trim();
  const token = (env.KV_REST_API_TOKEN ?? "").trim();
  if (!url || !token) return null;
  return new RedisStore({ url, token });
}

export function storeConfigured(env: StoreEnv = process.env as StoreEnv): boolean {
  return Boolean((env.KV_REST_API_URL ?? "").trim() && (env.KV_REST_API_TOKEN ?? "").trim());
}
