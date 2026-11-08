// =============================================================================
// A SIGN-IN CODE BESIDE THE LINK, AND A WAY BACK TO WHERE YOU WERE
//
// The link signs in whichever device opens it. The code from the same email,
// typed on the page that asked, signs in that page. These tests hold the code
// to what makes six digits safe: bound to one address, one use shared with the
// link, the link's lifetime, and five tries per inbox counted in the store.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetRateLimiter } from "@/lib/billing/http";


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

async function verify(payload: Record<string, unknown>, ip = "192.0.2.1") {
  const { POST } = await import("@/app/api/billing/signin/verify/route");
  const res = await POST(
    new Request("https://immigrationclock.com/api/billing/signin/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(payload),
    })
  );
  return { status: res.status, body: (await res.json()) as { plan?: string; error?: string; message?: string }, res };
}

const codeIn = (text: string) => /code on the sign-in page: (\d{6})/.exec(text)![1];
const tokenIn = (text: string) => decodeURIComponent(/signin=([^\s"&<]+)/.exec(text)![1]);

describe("a sign-in code beside the link", () => {
  it("emails a 6-digit code with the link, and puts it in the subject", async () => {
    const r = await requestLink("reader@example.com");
    expect(r.body.message).toMatch(/6-digit code/);
    expect(sent).toHaveLength(1);
    const mail = sent[0] as unknown as { subject: string; text: string; html: string };
    const code = codeIn(mail.text);
    expect(mail.subject).toContain(code);
    expect(mail.html).toContain(code);
    expect(mail.text).toContain("account?signin=");
  });

  it("signs in with the address and the code, on the device that typed it", async () => {
    await requestLink("Reader@Example.com");
    const code = codeIn(sent[0].text);
    const r = await verify({ email: "reader@example.com", code: `${code.slice(0, 3)} ${code.slice(3)}` });
    expect(r.status).toBe(200);
    expect(r.body.plan).toBe("free");
    expect(r.res.headers.get("set-cookie")).toBeTruthy();
  });

  it("works once, and spends the link from the same email", async () => {
    await requestLink("reader@example.com");
    const code = codeIn(sent[0].text);
    const token = tokenIn(sent[0].text);
    expect((await verify({ email: "reader@example.com", code })).status).toBe(200);
    expect((await verify({ email: "reader@example.com", code })).body.error).toBe("bad_code");
    expect((await verify({ token })).body.error).toBe("link_expired");
  });

  it("is spent when the link is used first", async () => {
    await requestLink("reader@example.com");
    const code = codeIn(sent[0].text);
    expect((await verify({ token: tokenIn(sent[0].text) })).status).toBe(200);
    expect((await verify({ email: "reader@example.com", code })).body.error).toBe("bad_code");
  });

  it("is useless with another address", async () => {
    await requestLink("reader@example.com");
    const code = codeIn(sent[0].text);
    expect((await verify({ email: "someone@example.com", code })).body.error).toBe("bad_code");
    expect((await verify({ email: "reader@example.com", code })).status).toBe(200);
  });

  it("expires with the link", async () => {
    await requestLink("reader@example.com");
    const code = codeIn(sent[0].text);
    advance(15 * 60 + 1);
    expect((await verify({ email: "reader@example.com", code })).body.error).toBe("bad_code");
  });

  it("allows five tries per inbox, then refuses even the right code", async () => {
    await requestLink("reader@example.com");
    const code = codeIn(sent[0].text);
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i += 1) {
      expect((await verify({ email: "reader@example.com", code: wrong }, `203.0.113.${i}`)).status).toBe(400);
    }
    const blocked = await verify({ email: "Reader+x@example.com", code }, "203.0.113.99");
    expect(blocked.status).toBe(429);
    // The link in the same email still works.
    expect((await verify({ token: tokenIn(sent[0].text) })).status).toBe(200);
  });

  it("checks no code when the store cannot count", async () => {
    await requestLink("reader@example.com");
    const code = codeIn(sent[0].text);
    kv.fail();
    expect((await verify({ email: "reader@example.com", code })).status).toBe(429);
  });

  it("rejects a malformed code without touching the store", async () => {
    expect((await verify({ email: "reader@example.com", code: "12345" })).body.error).toBe("bad_code");
    expect((await verify({ email: "nope", code: "123456" })).body.error).toBe("bad_code");
  });

  it("sends no code with a Subscribe detour, and keeps that wording", async () => {
    const r = await requestLink("buyer@example.com", { resume: "monthly" });
    expect(r.body.message).not.toMatch(/code/);
    expect(sent[0].text).not.toMatch(/code on the sign-in page/);
  });

  it("keeps no address or code in a store key", async () => {
    await requestLink("private.person@example.com");
    const code = codeIn(sent[0].text);
    await verify({ email: "private.person@example.com", code: code === "000000" ? "111111" : "000000" });
    const keys = [...kv.data.keys()].join("\n");
    expect(keys).not.toMatch(/person|@/i);
    expect(keys).not.toContain(code);
  });
});

describe("back to the page you came from", () => {
  it("carries a safe page on the emailed link", async () => {
    await requestLink("reader@example.com", { next: "/briefing" });
    expect(sent[0].text).toContain("&next=%2Fbriefing");
  });

  it("drops anything that is not a plain same-site page", async () => {
    for (const bad of ["//evil.example", "https://evil.example", "/\\evil.example", "/account", "/api/x", "/a?b=c", "briefing"]) {
      sent = [];
      advance(61);
      await requestLink(`r${bad.length}${Math.random().toString(36).slice(2, 6)}@example.com`, { next: bad });
      expect(sent[0].text).not.toContain("next=");
    }
  });
});
