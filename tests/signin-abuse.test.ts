// =============================================================================
// SIGN-IN EMAIL ABUSE — a link per inbox, not per request
//
// From 2026-09-18 bots used /api/billing/signin to send bursts of three links,
// seconds apart, to addresses they chose (dotted-Gmail variants, an SMS
// gateway, strangers' work mail). One request sent one email; the per-IP limit
// of three a minute was the only brake. These tests hold the per-recipient
// limit to what it promises: shared, atomic, keyed on a hash of the inbox,
// fail-closed, and invisible in the response — while a real person can still
// sign in and ask again for a link that expired or never came.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetRateLimiter } from "@/lib/billing/http";
import { MemoryStore, signinLimitKey } from "@/lib/billing/store";

const SECRET = "s".repeat(32);
const ENV: Record<string, string> = {
  BILLING_SESSION_SECRET: SECRET,
  KV_REST_API_URL: "https://kv.example",
  KV_REST_API_TOKEN: "kv-token",
  RESEND_API_KEY: "re_placeholder",
};

/** Upstash over HTTP: the commands the sign-in path issues, with real TTLs. */
function upstash() {
  const data = new Map<string, { value: string; expiresAt: number | null }>();
  let down = false;
  const live = (k: string) => {
    const hit = data.get(k);
    if (hit && hit.expiresAt !== null && hit.expiresAt <= Date.now()) data.delete(k);
    return data.get(k) ?? null;
  };
  const handle = (args: (string | number)[]) => {
    const [cmd, ...rest] = args.map(String);
    switch (cmd) {
      case "GET":
        return live(rest[0])?.value ?? null;
      case "SET": {
        const ex = rest.indexOf("EX");
        data.set(rest[0], { value: rest[1], expiresAt: ex > 0 ? Date.now() + Number(rest[ex + 1]) * 1000 : null });
        return "OK";
      }
      case "GETDEL": {
        const v = live(rest[0])?.value ?? null;
        data.delete(rest[0]);
        return v;
      }
      case "EVAL": {
        // The window script: INCR, and EXPIRE on the first hit.
        expect(rest[0]).toContain("INCR");
        const key = rest[2];
        const cur = live(key);
        const n = (cur ? Number(cur.value) : 0) + 1;
        data.set(key, { value: String(n), expiresAt: cur ? cur.expiresAt : Date.now() + Number(rest[3]) * 1000 });
        return n;
      }
      default:
        return null;
    }
  };
  return { data, handle, fail: () => { down = true; }, isDown: () => down };
}

let kv: ReturnType<typeof upstash>;
let sent: { to: string[]; text: string }[];
let logs: string[];

beforeEach(() => {
  vi.resetModules();
  resetRateLimiter();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
  for (const [k, v] of Object.entries(ENV)) process.env[k] = v;
  kv = upstash();
  sent = [];
  logs = [];
  for (const m of ["log", "error", "warn"] as const) {
    vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
  }
  vi.spyOn(globalThis, "fetch").mockImplementation((async (url: string, init: { body: string }) => {
    if (String(url).startsWith("https://kv.example")) {
      // Yield first, so concurrent requests genuinely interleave between commands.
      await Promise.resolve();
      if (kv.isDown()) return { ok: false, status: 503, json: async () => ({}) };
      return { ok: true, json: async () => ({ result: kv.handle(JSON.parse(init.body)) }) };
    }
    sent.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ id: "email_1" }) };
  }) as unknown as typeof fetch);
});

afterEach(() => {
  for (const k of Object.keys(ENV)) delete process.env[k];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

let ipSeq = 0;
async function requestLink(email: string, extra: Record<string, unknown> = {}, ip = `198.51.100.${++ipSeq % 250}`) {
  const { POST } = await import("@/app/api/billing/signin/route");
  const res = await POST(
    new Request("https://immigrationclock.com/api/billing/signin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email, ...extra }),
    })
  );
  return { status: res.status, body: (await res.json()) as { ok?: boolean; message?: string } };
}

const advance = (seconds: number) => vi.setSystemTime(Date.now() + seconds * 1000);

describe("sign-in links are limited per recipient", () => {
  it("sends one link for a three-request burst, and answers all three the same", async () => {
    const answers = [];
    for (let i = 0; i < 3; i += 1) {
      answers.push(await requestLink("victim@example.com"));
      advance(5);
    }
    expect(sent).toHaveLength(1);
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
    expect(answers[0]).toMatchObject({ status: 200, body: { ok: true } });
  });

  it("treats dotted, +tag and case variants of one Gmail inbox as one recipient", async () => {
    for (const v of ["jane.doe@gmail.com", "j.a.n.e.d.o.e@gmail.com", "JaneDoe+promo@googlemail.com"]) {
      await requestLink(v);
    }
    expect(sent).toHaveLength(1);
    expect(signinLimitKey("j.a.n.e+x@Gmail.com", SECRET)).toBe(signinLimitKey("jane@gmail.com", SECRET));
    expect(signinLimitKey("j.ane@example.com", SECRET)).not.toBe(signinLimitKey("jane@example.com", SECRET));
  });

  it("does not let concurrent requests slip past the cooldown", async () => {
    const answers = await Promise.all(Array.from({ length: 10 }, () => requestLink("victim@example.com")));
    expect(sent).toHaveLength(1);
    expect(answers.every((a) => a.status === 200 && a.body.ok)).toBe(true);
  });

  it("allows another link once the cooldown expires, up to a daily budget", async () => {
    for (let i = 0; i < 7; i += 1) {
      await requestLink("person@example.com");
      advance(61);
    }
    expect(sent).toHaveLength(5);
    advance(86_400);
    await requestLink("person@example.com");
    expect(sent).toHaveLength(6);
  });

  it("keeps the per-IP limit", async () => {
    const codes = [];
    for (let i = 0; i < 4; i += 1) codes.push((await requestLink(`p${i}@example.com`, {}, "203.0.113.9")).status);
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it("sends nothing when the store cannot count, and says so in the log", async () => {
    kv.fail();
    const res = await requestLink("person@example.com");
    expect(res).toMatchObject({ status: 200, body: { ok: true } });
    expect(sent).toHaveLength(0);
    expect(logs.join("\n")).toMatch(/limiter unavailable, link not sent/);
  });

  it("sends nothing when the hidden field is filled, with the same answer", async () => {
    const trapped = await requestLink("victim@example.com", { ic_hp: "https://spam.example" });
    expect(sent).toHaveLength(0);
    const real = await requestLink("victim@example.com", { ic_hp: "" });
    expect(sent).toHaveLength(1);
    expect(trapped).toEqual(real);
  });

  it("never puts a raw address in a store key or a log line", async () => {
    await requestLink("Private.Person+x@gmail.com");
    await requestLink("private.person@gmail.com");
    kv.fail();
    await requestLink("other.person@example.com");
    const keys = [...kv.data.keys()].join("\n");
    expect(keys).toMatch(/^signin:cd:/m);
    expect(keys).toMatch(/^signin:day:/m);
    for (const hay of [keys, logs.join("\n")]) {
      expect(hay).not.toMatch(/person|@/i);
    }
  });
});

describe("a real person can still sign in", () => {
  it("requests a link, opens it, and is signed in", async () => {
    await requestLink("reader@example.com");
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(["reader@example.com"]);
    const token = decodeURIComponent(/signin=([^\s"&<]+)/.exec(sent[0].text)![1]);

    const { POST } = await import("@/app/api/billing/signin/verify/route");
    const verify = () =>
      POST(
        new Request("https://immigrationclock.com/api/billing/signin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "192.0.2.1" },
          body: JSON.stringify({ token }),
        })
      );
    const res = await verify();
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("ic_ent=");
    expect((await verify()).status).toBe(400);
  });

  it("recovers from an expired link by asking again", async () => {
    await requestLink("reader@example.com");
    advance(16 * 60);
    await requestLink("reader@example.com");
    expect(sent).toHaveLength(2);
  });

  it("counts atomically in the in-memory store too", async () => {
    const store = new MemoryStore();
    const counts = await Promise.all(Array.from({ length: 4 }, () => store.incrementWindow("w", 60)));
    expect(counts.sort()).toEqual([1, 2, 3, 4]);
    advance(61);
    expect(await store.incrementWindow("w", 60)).toBe(1);
  });
});
