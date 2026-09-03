// =============================================================================
// THE X CREDENTIAL CHECK
//
// One property matters more than every other test in this file:
//
//     THIS CODE PATH CANNOT PUBLISH.
//
// It exists to be run against a live endpoint with real credentials before
// anything has ever been posted, which is exactly the moment when an accidental
// write would be worst. So the first test asserts the HTTP method, and the rest
// only then care about what the response means.
//
// The second property: verification signs with the SAME function the publisher
// signs with. If it signed differently, a passing check would prove nothing
// about whether a post would authenticate — which is the entire reason the check
// exists, given that this repository's OAuth 1.0a code has never run against X.
// =============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  XPublisher,
  verifyXCredentials,
  buildAuthorizationHeader,
  readXCredentials,
  type XCredentials,
} from "@/lib/social/platforms/x";

const CREDS: XCredentials = {
  apiKey: "ck",
  apiSecret: "SECRET_CS",
  accessToken: "at",
  accessTokenSecret: "SECRET_ATS",
};

/** Capture the request without letting it leave the process. */
function stubFetch(response: { ok?: boolean; status?: number; text?: string }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      text: async () => response.text ?? "",
    } as Response;
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verification cannot publish", () => {
  it("uses GET, never POST", async () => {
    const calls = stubFetch({ text: JSON.stringify({ data: { id: "1", username: "a", name: "b" } }) });
    await verifyXCredentials(CREDS);
    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe("GET");
  });

  it("sends no request body", async () => {
    const calls = stubFetch({ text: "{}" });
    await verifyXCredentials(CREDS);
    expect(calls[0].init.body).toBeUndefined();
  });

  it("calls the identity endpoint, not the tweets endpoint", async () => {
    const calls = stubFetch({ text: "{}" });
    await verifyXCredentials(CREDS);
    expect(calls[0].url).toBe("https://api.x.com/2/users/me");
    expect(calls[0].url).not.toContain("/tweets");
  });

  it("makes exactly one request", async () => {
    const calls = stubFetch({ text: "{}" });
    await verifyXCredentials(CREDS);
    expect(calls).toHaveLength(1);
  });
});

describe("verification exercises the publisher's own signing", () => {
  it("sends an OAuth 1.0a header built by buildAuthorizationHeader", async () => {
    const calls = stubFetch({ text: "{}" });
    await verifyXCredentials(CREDS);

    const header = (calls[0].init.headers as Record<string, string>).Authorization;
    expect(header.startsWith("OAuth ")).toBe(true);
    expect(header).toContain('oauth_signature_method="HMAC-SHA1"');
    expect(header).toContain('oauth_consumer_key="ck"');
    expect(header).toContain('oauth_token="at"');
    expect(header).toContain("oauth_signature=");
  });

  it("signs the GET with the same function, so a pass predicts a post would authenticate", async () => {
    const calls = stubFetch({ text: "{}" });
    await verifyXCredentials(CREDS);
    const header = (calls[0].init.headers as Record<string, string>).Authorization;

    // Re-derive with the publisher's signer, reusing the nonce and timestamp the
    // implementation chose. Identical output means one signer, not two.
    const nonce = /oauth_nonce="([^"]+)"/.exec(header)![1];
    const ts = /oauth_timestamp="([^"]+)"/.exec(header)![1];
    expect(header).toBe(
      buildAuthorizationHeader(CREDS, "GET", "https://api.x.com/2/users/me", nonce, ts)
    );
  });

  it("never puts a secret in the header", async () => {
    const calls = stubFetch({ text: "{}" });
    await verifyXCredentials(CREDS);
    const header = (calls[0].init.headers as Record<string, string>).Authorization;
    expect(header).not.toContain("SECRET_CS");
    expect(header).not.toContain("SECRET_ATS");
  });
});

describe("what the response means", () => {
  it("reports the authenticated account on success", async () => {
    stubFetch({
      text: JSON.stringify({ data: { id: "42", username: "immigrationclock", name: "ImmigrationClock" } }),
    });
    const result = await verifyXCredentials(CREDS);
    expect(result.ok).toBe(true);
    expect(result.handle).toBe("immigrationclock");
    expect(result.userId).toBe("42");
    expect(result.displayName).toBe("ImmigrationClock");
    expect(result.error).toBeNull();
  });

  it("succeeds without a handle rather than throwing on an unexpected body", async () => {
    stubFetch({ text: "not json" });
    const result = await verifyXCredentials(CREDS);
    expect(result.ok).toBe(true);
    expect(result.handle).toBeNull();
  });

  it("explains a 401 as a credential-or-signature problem, not a permission one", async () => {
    stubFetch({ ok: false, status: 401, text: '{"title":"Unauthorized"}' });
    const result = await verifyXCredentials(CREDS);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toMatch(/wrong, or the signature did not verify/);
  });

  it("surfaces any other status with X's own text", async () => {
    stubFetch({ ok: false, status: 429, text: '{"title":"Too Many Requests"}' });
    const result = await verifyXCredentials(CREDS);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(429);
    expect(result.error).toContain("429");
    expect(result.error).toContain("Too Many Requests");
  });

  it("never leaks a secret through an error path", async () => {
    stubFetch({ ok: false, status: 401, text: "SECRET_CS SECRET_ATS leaked upstream" });
    const result = await verifyXCredentials(CREDS);
    // X's body is echoed for diagnosis, but our own values are not added to it.
    expect(JSON.stringify({ ...result, error: "" })).not.toContain("SECRET_CS");
  });

  it("reports a network failure as a failure, not a pass", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND api.x.com");
      })
    );
    const result = await verifyXCredentials(CREDS);
    expect(result.ok).toBe(false);
    expect(result.status).toBeNull();
    expect(result.error).toMatch(/Could not reach X/);
  });
});

// -----------------------------------------------------------------------------
// THE PUBLISHER NAMES THE FAILURE
//
// X's API is pay-per-use and answers HTTP 402 when the balance runs out — it
// did on 2026-08-10, and the first design filed it under a generic publish
// failure. The code on the result is what lets the ledger, the preflight and
// the summary say what actually happened and what to do about it, because no
// code change fixes an empty balance.
// -----------------------------------------------------------------------------

describe("the publisher names the balance and the rate limit, not just 'failed'", () => {
  it("posts to the tweets endpoint and reports the platform's own id", async () => {
    const calls = stubFetch({ status: 201, text: JSON.stringify({ data: { id: "1234567890" } }) });
    const r = await new XPublisher(CREDS).publish("hello");
    expect(calls[0].url).toBe("https://api.x.com/2/tweets");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ text: "hello" });
    expect(r.ok).toBe(true);
    expect(r.externalId).toBe("1234567890");
    expect(r.externalUrl).toBe("https://x.com/i/web/status/1234567890");
  });

  it("reports HTTP 402 as depleted credits — a human problem, never a retry", async () => {
    stubFetch({ ok: false, status: 402, text: '{"title":"CreditsDepleted"}' });
    const r = await new XPublisher(CREDS).publish("hello");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("credits");
    expect(r.credentialProblem).toBe(false);
    expect(r.error).toMatch(/credits depleted \(HTTP 402\)/i);
    expect(r.error).toMatch(/Top up/);
  });

  it("reports HTTP 429 as a rate limit — transient, the next window tries again", async () => {
    stubFetch({ ok: false, status: 429, text: '{"title":"Too Many Requests"}' });
    const r = await new XPublisher(CREDS).publish("hello");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("rate_limit");
    expect(r.credentialProblem).toBe(false);
    expect(r.error).toMatch(/rate limit reached \(HTTP 429\)/i);
  });

  it("reports 401 and 403 as a credential problem, which must not stop the other platform", async () => {
    for (const status of [401, 403]) {
      stubFetch({ ok: false, status, text: '{"title":"Unauthorized"}' });
      const r = await new XPublisher(CREDS).publish("hello");
      expect(r.ok, String(status)).toBe(false);
      expect(r.code, String(status)).toBe("credential");
      expect(r.credentialProblem, String(status)).toBe(true);
    }
  });

  it("reports anything else as other, with X's own text and never a secret", async () => {
    stubFetch({ ok: false, status: 500, text: "SECRET_CS upstream" });
    const r = await new XPublisher(CREDS).publish("hello");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("other");
    expect(r.error).toContain("HTTP 500");
    // X's body is echoed for diagnosis, but our own values are not added to it.
    expect(JSON.stringify({ ...r, error: "" })).not.toContain("SECRET_CS");
  });
});

describe("the four variable names the code reads", () => {
  it("are exactly the ones documented and configured", () => {
    const creds = readXCredentials({
      X_API_KEY: "a",
      X_API_SECRET: "b",
      X_ACCESS_TOKEN: "c",
      X_ACCESS_TOKEN_SECRET: "d",
    });
    expect(creds).toEqual({
      apiKey: "a",
      apiSecret: "b",
      accessToken: "c",
      accessTokenSecret: "d",
    });
  });

  it("fails closed when any single one is absent", () => {
    const full = {
      X_API_KEY: "a",
      X_API_SECRET: "b",
      X_ACCESS_TOKEN: "c",
      X_ACCESS_TOKEN_SECRET: "d",
    };
    for (const name of Object.keys(full)) {
      const partial = { ...full, [name]: undefined };
      expect(readXCredentials(partial), name).toBeNull();
    }
  });

  it("treats an empty string as absent, which is what an unset CI variable expands to", () => {
    expect(
      readXCredentials({
        X_API_KEY: "",
        X_API_SECRET: "b",
        X_ACCESS_TOKEN: "c",
        X_ACCESS_TOKEN_SECRET: "d",
      })
    ).toBeNull();
  });
});
