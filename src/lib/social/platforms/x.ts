// =============================================================================
// X PUBLISHER — OAuth 1.0a user context
//
// OAuth 1.0a rather than OAuth 2.0 for one reason that matters here: its user
// access tokens do not expire. An unattended publisher that needs a token
// refreshed on a schedule is not unattended, and X's OAuth 2.0 refresh flow
// would put this platform in the same position LinkedIn is already in.
//
// The signature is computed over the request's query parameters and the OAuth
// parameters only — NOT the JSON body. That is correct per RFC 5849 for a
// request whose body is not form-encoded, and getting it wrong produces a 401
// that looks exactly like a bad credential.
//
// NOTHING IN THIS FILE LOGS A SECRET. Errors carry status codes and X's own
// error text; the four credential values never appear in a thrown message, a
// console line, or the ledger.
// =============================================================================

import { createHmac, randomBytes } from "node:crypto";
import type { PublishResult, Publisher } from "./types";

const ENDPOINT = "https://api.x.com/2/tweets";

/**
 * Read-only identity endpoint, used to prove a credential works before anything
 * is published. GET only — this file's write path is `publish()` and nothing
 * else, so verification physically cannot post.
 */
const VERIFY_ENDPOINT = "https://api.x.com/2/users/me";

export interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/** RFC 3986. encodeURIComponent leaves !*'() alone and OAuth requires them encoded. */
export function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function signatureBaseString(
  method: string,
  url: string,
  params: Record<string, string>
): string {
  const normalized = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");
  return [method.toUpperCase(), percentEncode(url), percentEncode(normalized)].join("&");
}

export function buildAuthorizationHeader(
  creds: XCredentials,
  method: string,
  url: string,
  nonce: string,
  timestamp: string
): string {
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const base = signatureBaseString(method, url, oauth);
  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
  const signature = createHmac("sha1", signingKey).update(base).digest("base64");

  const header: Record<string, string> = { ...oauth, oauth_signature: signature };
  return `OAuth ${Object.keys(header)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(header[k])}"`)
    .join(", ")}`;
}

/** Loosely typed on purpose: this only ever needs a string map, and requiring
 *  the full ProcessEnv shape makes it awkward to call from a test. */
export function readXCredentials(
  env: Record<string, string | undefined> = process.env
): XCredentials | null {
  const apiKey = env.X_API_KEY;
  const apiSecret = env.X_API_SECRET;
  const accessToken = env.X_ACCESS_TOKEN;
  const accessTokenSecret = env.X_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) return null;
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

/** What a credential check learned. Never carries a credential value. */
export interface XVerification {
  ok: boolean;
  /** The authenticated account, so a human can confirm it is the right one. */
  handle: string | null;
  userId: string | null;
  displayName: string | null;
  status: number | null;
  error: string | null;
}

/**
 * Prove the credentials authenticate, WITHOUT publishing.
 *
 * Deliberately routed through the same `buildAuthorizationHeader()` the
 * publisher uses. That is the whole value of this check: a 200 here means the
 * four values are valid AND that this file's OAuth 1.0a signing — the part that
 * has never run against a live endpoint — produces a signature X accepts. A
 * hand-rolled curl would prove the credentials and prove nothing about the code.
 *
 * WHAT IT CANNOT TELL YOU: whether the token carries WRITE permission. X does
 * not expose the token's permission level on this endpoint, so a read-only
 * token passes here and fails at the first post with HTTP 403. That gap is
 * unavoidable without publishing, and it is called out where the result is
 * printed rather than left for someone to discover.
 */
export async function verifyXCredentials(creds: XCredentials): Promise<XVerification> {
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const authorization = buildAuthorizationHeader(creds, "GET", VERIFY_ENDPOINT, nonce, timestamp);

  let response: Response;
  try {
    response = await fetch(VERIFY_ENDPOINT, {
      method: "GET",
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    return {
      ok: false,
      handle: null,
      userId: null,
      displayName: null,
      status: null,
      error: `Could not reach X: ${(err as Error).message}`,
    };
  }

  const body = await response.text();

  if (!response.ok) {
    return {
      ok: false,
      handle: null,
      userId: null,
      displayName: null,
      status: response.status,
      error:
        response.status === 401
          ? `X rejected the credential (HTTP 401). One of the four values is wrong, or the signature did not verify: ${summarize(body)}`
          : `X returned HTTP ${response.status}: ${summarize(body)}`,
    };
  }

  let data: { id?: string; username?: string; name?: string } | undefined;
  try {
    data = (JSON.parse(body) as { data?: typeof data }).data;
  } catch {
    data = undefined;
  }

  return {
    ok: true,
    handle: data?.username ?? null,
    userId: data?.id ?? null,
    displayName: data?.name ?? null,
    status: response.status,
    error: null,
  };
}

export class XPublisher implements Publisher {
  readonly platform = "x" as const;

  constructor(private readonly creds: XCredentials) {}

  async publish(text: string): Promise<PublishResult> {
    const nonce = randomBytes(16).toString("hex");
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const authorization = buildAuthorizationHeader(this.creds, "POST", ENDPOINT, nonce, timestamp);

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(30_000),
    });

    const body = await response.text();

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        credentialProblem: true,
        code: "credential",
        error: `X rejected the credential (HTTP ${response.status}): ${summarize(body)}`,
        externalId: null,
        externalUrl: null,
      };
    }

    // THE BALANCE, NOT THE CREDENTIAL. X's API is pay-per-use and answers 402
    // "credits depleted" when the balance runs out — it did on 2026-08-10, and
    // the first design filed it under a generic publish failure. Named here so
    // the ledger, the preflight and the summary can say what actually happened
    // and what to do about it, because no code change fixes an empty balance.
    if (response.status === 402) {
      return {
        ok: false,
        credentialProblem: false,
        code: "credits",
        error: `X API credits depleted (HTTP 402). Top up the pay-per-use balance in the X developer portal; nothing publishes until then. ${summarize(body)}`,
        externalId: null,
        externalUrl: null,
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        credentialProblem: false,
        code: "rate_limit",
        error: `X rate limit reached (HTTP 429). The next window will try again. ${summarize(body)}`,
        externalId: null,
        externalUrl: null,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        credentialProblem: false,
        code: "other",
        error: `X returned HTTP ${response.status}: ${summarize(body)}`,
        externalId: null,
        externalUrl: null,
      };
    }

    let id: string | null = null;
    try {
      id = (JSON.parse(body) as { data?: { id?: string } }).data?.id ?? null;
    } catch {
      // A 2xx with an unparseable body means the post very likely landed. Report
      // success without an id rather than risk a retry that double-posts.
    }

    return {
      ok: true,
      credentialProblem: false,
      error: null,
      externalId: id,
      externalUrl: id ? `https://x.com/i/web/status/${id}` : null,
    };
  }
}

/** Trim an API error body for logs. Never contains our credentials. */
function summarize(body: string): string {
  return body.replace(/\s+/g, " ").slice(0, 300);
}
