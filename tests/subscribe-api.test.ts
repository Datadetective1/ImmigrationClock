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

const VALID = { email: "reader@example.com", consent: true, language: "en" };

/** Mock Resend: records calls, returns whatever each call is scripted to. */
function mockResend(responses: { contact?: Response; email?: Response; segment?: Response } = {}) {
  const calls: { url: string; body: unknown; auth: string | null; method: string }[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push({
      url: u,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      auth: new Headers(init?.headers).get("Authorization"),
      // Language routing distinguishes joining a segment (POST) from leaving
      // one (DELETE), and a property update (PATCH) from a create (POST).
      method: (init?.method ?? "GET").toUpperCase(),
    });
    // Checked BEFORE /contacts: segment assignment is POSTed to
    // /contacts/<email>/segments/<id>, which also matches "/contacts".
    if (u.includes("/segments/")) {
      return responses.segment ?? new Response("", { status: 201 });
    }
    if (u.includes("/contacts")) {
      return responses.contact ?? new Response(JSON.stringify({ id: "c_1" }), { status: 201 });
    }
    return responses.email ?? new Response(JSON.stringify({ id: "e_1" }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

const SEGMENT = "84934be1-58ef-41f1-8680-3cd665df4d32";

type Call = { url: string; body: unknown; auth: string | null; method: string };
const segmentCalls = (calls: Call[]) => calls.filter((c) => c.url.includes("/segments/"));
/** Segment ids the contact was ADDED to, and ones it was REMOVED from. */
const joined = (calls: Call[]) =>
  calls.filter((c) => c.url.includes("/segments/") && c.method === "POST").map((c) => c.url.split("/segments/")[1]);
const left = (calls: Call[]) =>
  calls.filter((c) => c.url.includes("/segments/") && c.method === "DELETE").map((c) => c.url.split("/segments/")[1]);

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", KEY);
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
      const res = await POST(post({ email, consent: true, language: "en" }));
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
    await POST(post({ email: "  Reader@Example.COM  ", consent: true, language: "en" }));
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
  it("creates an account-level contact, authenticated", async () => {
    const calls = mockResend();
    const res = await POST(post(VALID));
    expect(res.status).toBe(200);

    const contact = calls.find((c) => c.url.includes("/contacts"))!;
    expect(contact.url).toBe("https://api.resend.com/contacts");
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
      contact: new Response("Invalid request; internal ref srv_secret_internal", { status: 422 }),
    });
    const res = await POST(post(VALID));
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain("srv_secret_internal");
    expect(text).not.toContain("Invalid request");
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

// =============================================================================
// SEGMENT MEMBERSHIP
//
// The contact is account-level; the segment is what the weekly broadcast
// targets. A subscriber stored outside it is stored and unreachable — the
// signup works, the dashboard fills up, and nobody ever receives an issue.
// =============================================================================// =============================================================================
// LANGUAGE PREFERENCE AND SEGMENT ROUTING
//
// The choice is stored as a contact property — the canonical record, written
// for every language. The segment is only WHERE that language is delivered, and
// segments are a billing-limited resource: three on the current plan, spent on
// EN, ES and FR.
//
// Keeping the two apart is what lets an Arabic subscriber be recorded
// truthfully today and delivered to the day a segment exists, with no
// migration and no code change.
// =============================================================================
describe("newsletter language", () => {
  const EN = "seg_en";
  const ES = "seg_es";
  const FR = "seg_fr";

  function threeSegments() {
    vi.stubEnv("RESEND_SEGMENT_EN", EN);
    vi.stubEnv("RESEND_SEGMENT_ES", ES);
    vi.stubEnv("RESEND_SEGMENT_FR", FR);
  }

  describe("required, and never inferred", () => {
    it("REJECTS a signup with no language", async () => {
      const calls = mockResend();
      const res = await POST(post({ email: "reader@example.com", consent: true }));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ ok: false });
      expect(calls, "an address was stored without a language").toHaveLength(0);
    });

    it("REJECTS an unsupported or malformed language", async () => {
      const calls = mockResend();
      for (const language of ["", "de", "en-US", "english", "zz", null, 1, true, ["en"]]) {
        const res = await POST(post({ email: "reader@example.com", consent: true, language }));
        expect(res.status, `accepted ${JSON.stringify(language)}`).toBe(400);
      }
      expect(calls).toHaveLength(0);
    });

    it("accepts each of the four supported languages", async () => {
      threeSegments();
      for (const language of ["en", "es", "fr", "ar"]) {
        const calls = mockResend();
        const res = await POST(post({ email: `r-${language}@example.com`, consent: true, language }));
        expect(res.status, language).toBe(200);
        const create = calls.find((c) => c.url === "https://api.resend.com/contacts")!;
        expect((create.body as { properties: Record<string, string> }).properties.language).toBe(language);
      }
    });
  });

  describe("the property is the canonical record", () => {
    it("stores the choice on the contact", async () => {
      threeSegments();
      const calls = mockResend();
      await POST(post({ ...VALID, language: "fr" }));
      const create = calls.find((c) => c.url === "https://api.resend.com/contacts")!;
      expect(create.body).toMatchObject({
        email: "reader@example.com",
        unsubscribed: false,
        properties: { language: "fr" },
      });
    });

    it("rewrites the property when an existing subscriber changes language", async () => {
      threeSegments();
      const calls = mockResend({
        contact: new Response(JSON.stringify({ message: "already exists" }), { status: 409 }),
      });
      await POST(post({ ...VALID, language: "es" }));
      const patch = calls.find((c) => c.method === "PATCH");
      expect(patch, "no property update on re-subscribe").toBeTruthy();
      expect(patch!.body).toMatchObject({ properties: { language: "es" } });
    });
  });

  describe("when the plan does not support contact properties", () => {
    it("still subscribes them, without the property, and says so loudly", async () => {
      // Losing the canonical record is bad; losing the subscriber is worse, and
      // delivery depends on segment membership rather than the property.
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      threeSegments();
      let seen = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL, init?: RequestInit) => {
          const u = String(url);
          if (u === "https://api.resend.com/contacts" && (init?.method ?? "GET").toUpperCase() === "POST") {
            seen++;
            if (seen === 1) return new Response(JSON.stringify({ message: "unknown field: properties" }), { status: 422 });
            return new Response(JSON.stringify({ id: "c_1" }), { status: 201 });
          }
          return new Response("", { status: 201 });
        })
      );

      const res = await POST(post({ ...VALID, language: "fr" }));
      expect(res.status, "a plan limitation cost us the subscriber").toBe(200);
      expect(seen, "no retry without the property").toBe(2);
      expect(err.mock.calls.flat().join(" ")).toMatch(/contact propert/i);
    });

    it("does not retry on an unrelated 422", async () => {
      threeSegments();
      const calls = mockResend({ contact: new Response("invalid email domain", { status: 422 }) });
      const res = await POST(post(VALID));
      expect(res.status).toBe(502);
      expect(calls.filter((c) => c.url === "https://api.resend.com/contacts")).toHaveLength(1);
    });
  });

  describe("routing", () => {
    it("EN routes to the English segment only", async () => {
      threeSegments();
      const calls = mockResend();
      await POST(post({ ...VALID, language: "en" }));
      expect(joined(calls)).toEqual([EN]);
      expect(left(calls).sort()).toEqual([ES, FR]);
    });

    it("ES routes to the Spanish segment only", async () => {
      threeSegments();
      const calls = mockResend();
      await POST(post({ ...VALID, language: "es" }));
      expect(joined(calls)).toEqual([ES]);
      expect(left(calls).sort()).toEqual([EN, FR]);
    });

    it("FR routes to the French segment only", async () => {
      threeSegments();
      const calls = mockResend();
      await POST(post({ ...VALID, language: "fr" }));
      expect(joined(calls)).toEqual([FR]);
      expect(left(calls).sort()).toEqual([EN, ES]);
    });

    it("AR stores the preference and joins NOTHING", async () => {
      // No Arabic segment on the current plan. The preference must survive
      // anyway, and must never fall back to English — a subscriber who chose
      // Arabic receiving English mail is worse than receiving none.
      threeSegments();
      const calls = mockResend();
      const res = await POST(post({ ...VALID, language: "ar" }));

      expect(res.status).toBe(200);
      const create = calls.find((c) => c.url === "https://api.resend.com/contacts")!;
      expect(create.body).toMatchObject({ properties: { language: "ar" } });
      expect(joined(calls), "an Arabic subscriber was placed in a segment").toEqual([]);
    });

    it("delivers Arabic the moment a segment is configured — no code change", async () => {
      threeSegments();
      vi.stubEnv("RESEND_SEGMENT_AR", "seg_ar");
      const calls = mockResend();
      await POST(post({ ...VALID, language: "ar" }));
      expect(joined(calls)).toEqual(["seg_ar"]);
    });

    it("NEVER puts one subscriber in two language segments", async () => {
      threeSegments();
      for (const language of ["en", "es", "fr"]) {
        const calls = mockResend();
        await POST(post({ ...VALID, language }));
        expect(joined(calls).length, `${language} joined more than one segment`).toBeLessThanOrEqual(1);
        expect(left(calls)).not.toContain(joined(calls)[0]);
      }
    });

    it("moves rather than accumulates when someone switches", async () => {
      threeSegments();
      const calls = mockResend({ contact: new Response("already exists", { status: 409 }) });
      await POST(post({ ...VALID, language: "fr" }));
      expect(joined(calls)).toEqual([FR]);
      expect(left(calls), "the old English membership was left in place").toContain(EN);
    });
  });

  describe("existing subscribers", () => {
    it("keeps the legacy single segment working for English", async () => {
      // The three existing subscribers live in RESEND_NEWSLETTER_SEGMENT_ID and
      // chose nothing. An English signup must still land exactly there, and
      // nothing must remove them from it.
      vi.stubEnv("RESEND_NEWSLETTER_SEGMENT_ID", "seg_legacy");
      const calls = mockResend();
      await POST(post({ ...VALID, language: "en" }));
      expect(joined(calls)).toEqual(["seg_legacy"]);
      expect(left(calls), "a legacy English subscriber would be removed from their own list").toEqual([]);
    });
  });

  describe("failure handling", () => {
    it("does not fail the signup when segment assignment fails", async () => {
      threeSegments();
      const calls = mockResend({ segment: new Response("no such segment", { status: 404 }) });
      const res = await POST(post(VALID));
      expect(res.status).toBe(200);
      expect(calls.some((c) => c.url.endsWith("/emails"))).toBe(true);
    });

    it("never leaks the key or a segment id to the client", async () => {
      threeSegments();
      mockResend({ segment: new Response(`bad ${EN} key ${KEY}`, { status: 403 }) });
      const res = await POST(post(VALID));
      const text = JSON.stringify(await res.json());
      expect(text).not.toContain(EN);
      expect(text).not.toContain(KEY);
    });

    it("stores the contact even when no segment exists at all, and says so", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const calls = mockResend();
      const res = await POST(post(VALID));
      expect(res.status).toBe(200);
      expect(joined(calls)).toEqual([]);
      expect(calls.some((c) => c.url === "https://api.resend.com/contacts")).toBe(true);
      expect(warn.mock.calls.flat().join(" ")).toMatch(/RESEND_SEGMENT_EN/);
    });
  });
});
