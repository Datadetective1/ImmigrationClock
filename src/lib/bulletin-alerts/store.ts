// =============================================================================
// WHERE FREE ALERT SUBSCRIBERS LIVE
//
// The same Redis REST store as Pro (Vercel KV: KV_REST_API_URL and
// KV_REST_API_TOKEN), under its own key prefix, so no new service is added and
// nothing here can touch a Pro record.
//
//   balert:<emailKey>            one subscriber, JSON (see AlertSubscriber)
//   balerts:index                the set of emailKeys, for the send job
//   balert:sent:<month>:<key>    "this month went to this person", so a re-run
//                                of the send job never mails anyone twice
//   balert:limit:<window>:<key>  confirmation emails sent to one inbox today
//
// The key is an HMAC of the address (emailKey from the Pro store), so a key
// listing is not a list of addresses.
// =============================================================================

import { emailKey } from "@/lib/billing/store";
import type { AlertSubscriber } from "./index";

export const ALERT_KEYS = {
  subscriber: (k: string) => `balert:${k}`,
  index: "balerts:index",
  sent: (month: string, k: string) => `balert:sent:${month}:${k}`,
  limit: (window: string, k: string) => `balert:limit:${window}:${k}`,
} as const;

export interface AlertStore {
  get(key: string): Promise<AlertSubscriber | null>;
  put(key: string, record: AlertSubscriber): Promise<void>;
  remove(key: string): Promise<boolean>;
  listKeys(): Promise<string[]>;
  /** SET NX: true only for the first caller. */
  claim(token: string, ttlSeconds: number): Promise<boolean>;
  /** Give a claim back, after a send that failed, so the next run retries it. */
  release(token: string): Promise<void>;
  /** Count one event in a fixed window, atomically. */
  increment(key: string, windowSeconds: number): Promise<number>;
}

export function alertKey(email: string, secret: string): string {
  return emailKey(email, `bulletin-alerts:${secret}`);
}

export class MemoryAlertStore implements AlertStore {
  readonly data = new Map<string, { value: string; expiresAt: number | null }>();
  readonly index = new Set<string>();

  private read(k: string): string | null {
    const hit = this.data.get(k);
    if (!hit) return null;
    if (hit.expiresAt !== null && hit.expiresAt <= Date.now()) {
      this.data.delete(k);
      return null;
    }
    return hit.value;
  }

  async get(key: string) {
    const raw = this.read(ALERT_KEYS.subscriber(key));
    return raw ? (JSON.parse(raw) as AlertSubscriber) : null;
  }
  async put(key: string, record: AlertSubscriber) {
    this.data.set(ALERT_KEYS.subscriber(key), { value: JSON.stringify(record), expiresAt: null });
    this.index.add(key);
  }
  async remove(key: string) {
    const had = this.data.delete(ALERT_KEYS.subscriber(key));
    this.index.delete(key);
    return had;
  }
  async listKeys() {
    return [...this.index];
  }
  async claim(token: string, ttlSeconds: number) {
    if (this.read(token) !== null) return false;
    this.data.set(token, { value: "1", expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }
  async release(token: string) {
    this.data.delete(token);
  }
  async increment(key: string, windowSeconds: number) {
    const n = Number(this.read(key) ?? "0") + 1;
    const existing = this.data.get(key);
    this.data.set(key, { value: String(n), expiresAt: existing?.expiresAt ?? Date.now() + windowSeconds * 1000 });
    return n;
  }
}

export class RedisAlertStore implements AlertStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async command<T>(args: (string | number)[]): Promise<T> {
    const res = await this.fetchImpl(this.url.replace(/\/$/, ""), {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5_000),
      // Never cached: see the note on RedisStore.command in ../billing/store.ts.
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Alert store returned HTTP ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: string };
    if (body.error) throw new Error(`Alert store error: ${body.error.slice(0, 120)}`);
    return body.result as T;
  }

  async get(key: string) {
    const raw = await this.command<string | null>(["GET", ALERT_KEYS.subscriber(key)]);
    return raw ? (JSON.parse(raw) as AlertSubscriber) : null;
  }
  async put(key: string, record: AlertSubscriber) {
    await this.command(["SET", ALERT_KEYS.subscriber(key), JSON.stringify(record)]);
    await this.command(["SADD", ALERT_KEYS.index, key]);
  }
  async remove(key: string) {
    const n = await this.command<number>(["DEL", ALERT_KEYS.subscriber(key)]);
    await this.command(["SREM", ALERT_KEYS.index, key]);
    return n > 0;
  }
  async listKeys() {
    return (await this.command<string[]>(["SMEMBERS", ALERT_KEYS.index])) ?? [];
  }
  async claim(token: string, ttlSeconds: number) {
    return (await this.command<string | null>(["SET", token, "1", "NX", "EX", ttlSeconds])) !== null;
  }
  async release(token: string) {
    await this.command(["DEL", token]);
  }
  private static readonly WINDOW_SCRIPT = [
    "local n = redis.call('INCR', KEYS[1])",
    "if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
    "return n",
  ].join("\n");
  async increment(key: string, windowSeconds: number) {
    return this.command<number>(["EVAL", RedisAlertStore.WINDOW_SCRIPT, 1, key, windowSeconds]);
  }
}

export function resolveAlertStore(env: Record<string, string | undefined> = process.env): AlertStore | null {
  const url = (env.KV_REST_API_URL ?? "").trim();
  const token = (env.KV_REST_API_TOKEN ?? "").trim();
  return url && token ? new RedisAlertStore(url, token) : null;
}
