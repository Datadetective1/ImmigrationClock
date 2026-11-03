// =============================================================================
// THE OFFICIAL USCIS CASE STATUS API (developer.uscis.gov)
//
// The only source case alerts use. The public "Case Status Online" page is not
// read, scraped or automated: it sits behind a bot check, and USCIS publishes
// this API for exactly this purpose.
//
// ACCESS. An app registered on developer.uscis.gov gets OAuth client
// credentials for the sandbox. Production access is granted by USCIS after a
// demo with mock data, and the production base URL comes with that approval.
// Until all three values below are set the feature is off: every route answers
// "not switched on yet" and the daily check does nothing.
//
//   USCIS_API_BASE       e.g. https://api-int.uscis.gov (sandbox)
//   USCIS_CLIENT_ID      from the developer portal
//   USCIS_CLIENT_SECRET  from the developer portal, never NEXT_PUBLIC_
//
// TERMS. USCIS allows a receipt number only for a user of the app, with that
// person's consent. The add form asks the subscriber to confirm the case is
// theirs or that they have the case owner's permission, and records when.
//
// LIMITS. The sandbox allows 5 requests a second and 1,000 a day. The daily
// job spaces calls at 250 ms and stops at a per-run cap.
//
// ERRORS. USCIS returns RFC 9457 problem JSON; its `message` is passed back to
// the person, as USCIS asks.
// =============================================================================

export interface UscisEnv {
  USCIS_API_BASE?: string;
  USCIS_CLIENT_ID?: string;
  USCIS_CLIENT_SECRET?: string;
  USCIS_TOKEN_URL?: string;
}

export function uscisConfigured(env: UscisEnv = process.env as UscisEnv): boolean {
  return Boolean(env.USCIS_API_BASE?.trim() && env.USCIS_CLIENT_ID?.trim() && env.USCIS_CLIENT_SECRET?.trim());
}

/** What we keep from a status response. The long description is shown, never stored. */
export interface CaseStatus {
  receipt: string;
  formType: string | null;
  /** The status title, e.g. "Case Was Received". */
  status: string;
  /** The paragraph USCIS shows under the title. */
  description: string | null;
  /** USCIS's own "last modified", as they send it. */
  modified: string | null;
}

export type StatusResult =
  | { ok: true; status: CaseStatus }
  | { ok: false; kind: "not_configured" | "not_found" | "rejected" | "unavailable"; message: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Reads the documented response shape defensively; unknown shapes are "unavailable". */
export function parseStatusResponse(receipt: string, body: unknown): CaseStatus | null {
  const root = (body ?? {}) as Record<string, unknown>;
  const cs = (root.case_status ?? root.caseStatus ?? null) as Record<string, unknown> | null;
  if (!cs || typeof cs !== "object") return null;
  const status = str(cs.current_case_status_text_en) ?? str(cs.currentCaseStatusTextEn);
  if (!status) return null;
  return {
    receipt,
    formType: str(cs.formType) ?? str(cs.form_type),
    status,
    description: str(cs.current_case_status_desc_en) ?? str(cs.currentCaseStatusDescEn),
    modified: str(cs.modifiedDate) ?? str(cs.modified_date),
  };
}

function problemMessage(body: unknown, fallback: string): string {
  const b = (body ?? {}) as Record<string, unknown>;
  const errors = Array.isArray(b.errors) ? (b.errors[0] as Record<string, unknown>) : null;
  return str(b.message) ?? str(errors?.message) ?? str(b.detail) ?? fallback;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

/** Test seam. */
export function resetUscisToken(): void {
  tokenCache = null;
}

async function accessToken(env: UscisEnv, fetchImpl: typeof fetch, nowMs: number): Promise<string | null> {
  if (tokenCache && tokenCache.expiresAt > nowMs + 30_000) return tokenCache.value;
  const base = env.USCIS_API_BASE!.replace(/\/$/, "");
  const url = env.USCIS_TOKEN_URL?.trim() || `${base}/oauth/accesstoken`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.USCIS_CLIENT_ID!.trim(),
      client_secret: env.USCIS_CLIENT_SECRET!.trim(),
    }).toString(),
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number | string } | null;
  if (!body?.access_token) return null;
  const ttl = Number(body.expires_in ?? 1_200);
  tokenCache = { value: body.access_token, expiresAt: nowMs + (Number.isFinite(ttl) ? ttl : 1_200) * 1000 };
  return tokenCache.value;
}

export async function fetchCaseStatus(
  receipt: string,
  env: UscisEnv = process.env as UscisEnv,
  fetchImpl: typeof fetch = fetch,
  nowMs: number = Date.now()
): Promise<StatusResult> {
  if (!uscisConfigured(env)) {
    return { ok: false, kind: "not_configured", message: "Case alerts are not switched on yet." };
  }
  try {
    const token = await accessToken(env, fetchImpl, nowMs);
    if (!token) return { ok: false, kind: "unavailable", message: "USCIS did not accept our credentials. Try again later." };
    const base = env.USCIS_API_BASE!.replace(/\/$/, "");
    const res = await fetchImpl(`${base}/case-status/${encodeURIComponent(receipt)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const body = await res.json().catch(() => null);
    if (res.status === 401) resetUscisToken();
    if (res.status === 404) {
      return { ok: false, kind: "not_found", message: problemMessage(body, "USCIS has no case with that receipt number.") };
    }
    if (res.status >= 400 && res.status < 500) {
      return { ok: false, kind: "rejected", message: problemMessage(body, "USCIS could not look up that receipt number.") };
    }
    if (!res.ok) return { ok: false, kind: "unavailable", message: problemMessage(body, "USCIS is not answering right now.") };
    const status = parseStatusResponse(receipt, body);
    if (!status) return { ok: false, kind: "unavailable", message: "USCIS sent an answer we could not read." };
    return { ok: true, status };
  } catch {
    return { ok: false, kind: "unavailable", message: "USCIS is not answering right now." };
  }
}
