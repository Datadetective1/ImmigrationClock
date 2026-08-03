// =============================================================================
// POST /api/subscribe
//
// The only server-side surface on the site, and a public unauthenticated
// endpoint that writes to a mailing list. It is tested against a mocked Resend
// rather than the real one: these assertions must hold in CI, on a fork, and
// without anyone's API key.
//
// The tests below are weighted toward what goes WRONG. A signup box that works
// on the happy path and leaks on every other is the normal outcome, and the
// leaks here are specific: whether an address is already on an immigration
// site's mailing list is exactly the question this audience cannot afford to
// have answered by an HTTP status code.
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST, GET } from "@/app/api/subscribe/route";

const KEY = "re_test_key";
const AUDIENCE = "aud_123";

/** Each test gets its own IP so the module-level rate limiter cannot bleed. */
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter % 250}`;
}

function post(body: unknown, ip = nextIp()): Request {
  return new Request("https://immigrationclock.com/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID = { email: "reader@example.com", consent: true };

/** Mock Resend: records calls, returns whatever each call is scripted to. */
function mockResend(responses: { contact?: Response; email?: Response } = {}) {
  const calls: { url: string; body: unknown; auth: string | null }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      auth: new Headers(init?.headers).get("Authorization"),
    });
    if (u.includes("/contacts")) {
      return responses.contact ?? new Response(JSON.stringify({ id: "c_1" }), { status: 201 });
    }
    return responses.email ?? new Response(JSON.stringify({ id: "e_1" }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", KEY);
  vi.stubEnv("RESEND_AUDIENCE_ID", AUDIENCE);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("refuses rather than pretending when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const calls = mockResend();
    const res = await POST(post(VALID));
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
    // Crucially: it must not silently swallow the address and claim success.
    expect(calls).toHaveLength(0);
  });

  it("rejects anything but POST with a named error, not a 404", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });
});

describe("input validation", () => {
  it("rejects malformed JSON", async () => {
    mockResend();
    const res = await POST(post("{not json"));
    expect(res.status).toBe(400);
  });

  it("rejects an implausible address before calling the provider", async () => {
    const calls = mockResend();
    for (const email of ["", "nope", "a@b", "two words@example.com", "x@example..com"]) {
      const res = await POST(post({ email, consent: true }));
      expect(res.status, `accepted "${email}"`).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("requires consent as an explicit act, never inferred from submitting", async () => {
    const calls = mockResend();
    for (const consent of [undefined, false, "true", 1]) {
      const res = await POST(post({ email: "reader@example.com", consent }));
      expect(res.status, `accepted consent=${String(consent)}`).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });

  it("normalises the address before storing it", async () => {
    const calls = mockResend();
    await POST(post({ email: "  Reader@Example.COM  ", consent: true }));
    expect((calls[0].body as { email: string }).email).toBe("reader@example.com");
  });
});

describe("abuse resistance", () => {
  it("accepts the honeypot silently but stores nothing", async () => {
    const calls = mockResend();
    const res = await POST(post({ ...VALID, website: "http://spam.example" }));
    // A bot must learn nothing from the response.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
    expect(calls, "honeypot submission reached the provider").toHaveLength(0);
  });

  it("rate-limits repeated attempts from one address", async () => {
    mockResend();
    const ip = "198.51.100.7";
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await POST(post(VALID, ip))).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect(codes[0]).toBe(200);
  });
});

describe("storing the subscriber", () => {
  it("adds the contact to the configured audience, authenticated", async () => {
    const calls = mockResend();
    const res = await POST(post(VALID));
    expect(res.status).toBe(200);

    const contact = calls.find((c) => c.url.includes("/contacts"))!;
    expect(contact.url).toBe(`https://api.resend.com/audiences/${AUDIENCE}/contacts`);
    expect(contact.auth).toBe(`Bearer ${KEY}`);
    expect(contact.body).toMatchObject({ email: "reader@example.com", unsubscribed: false });
  });

  it("sends the welcome email from the no-reply sender", async () => {
    const calls = mockResend();
    await POST(post(VALID));

    const mail = calls.find((c) => c.url.endsWith("/emails"));
    expect(mail, "no welcome email was sent").toBeTruthy();
    const body = mail!.body as { from: string; to: string[]; subject: string; text: string };
    expect(body.from).toMatch(/noreply@immigrationclock\.com/);
    expect(body.to).toEqual(["reader@example.com"]);
    expect(body.subject).toBeTruthy();
    // The platform is not a law firm and the welcome email must not imply it is.
    expect(body.text).toMatch(/not a law firm/i);
  });

  it("still reports success when the welcome email fails", async () => {
    // The address is already stored at that point. Reporting failure would be a
    // lie that produces a duplicate signup attempt.
    mockResend({ email: new Response("smtp down", { status: 500 }) });
    const res = await POST(post(VALID));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ ok: true });
  });
});

describe("does not leak who is on the list", () => {
  it("reports a duplicate exactly like a new signup", async () => {
    const calls = mockResend({
      contact: new Response(JSON.stringify({ message: "Contact already exists" }), { status: 409 }),
    });
    const res = await POST(post(VALID));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    // And must not re-send a welcome to someone already subscribed.
    expect(calls.some((c) => c.url.endsWith("/emails"))).toBe(false);
  });

  it("never echoes the provider's response body to the client", async () => {
    mockResend({
      contact: new Response("Invalid audience id aud_secret_internal", { status: 422 }),
    });
    const res = await POST(post(VALID));
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("aud_secret_internal");
    expect(text).not.toContain("Invalid audience");
  });

  it("never returns the API key, whatever goes wrong", async () => {
    mockResend({ contact: new Response(`bad key ${KEY}`, { status: 401 }) });
    const res = await POST(post(VALID));
    expect(JSON.stringify(await res.json())).not.toContain(KEY);
  });

  it("survives the provider being unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }));
    const res = await POST(post(VALID));
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ ok: false });
  });
});

describe("response hygiene", () => {
  it("is never cached", async () => {
    mockResend();
    const res = await POST(post(VALID));
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
  });
});
