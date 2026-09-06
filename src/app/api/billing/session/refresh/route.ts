// =============================================================================
// POST /api/billing/session/refresh — keep a paying subscriber signed in
//
// WHY THIS EXISTS
// ---------------
// The entitlement claim is deliberately short-lived (MAX_TTL_DAYS = 30) so a
// cancellation cannot keep working for long. Nothing re-minted it, so the
// lifetime of the claim became the lifetime of the session: an annual
// subscriber who had paid $190 for twelve months was signed out on day 31,
// /following stopped syncing with no message, and the only way back was to
// request an email link — eleven more times over the year they had paid for.
//
// So the claim stays short AND is renewed while the STORE still says the
// subscription is live. That ordering is the whole design: the cookie is never
// trusted to extend itself, it is re-issued after the authoritative record has
// been read again.
//
// IT CANNOT EXTEND A DEAD SUBSCRIPTION. A cancelled, refunded, disputed or
// lapsed record fails accessFor(), and this answers 402 and CLEARS the cookie
// rather than renewing it — so refreshing is also how a revoked subscription
// stops working on a browser that still holds a valid-looking claim.
//
// A caller with an expired cookie gets nothing: there is no identity left to
// re-read. That is what the sign-in link is for.
// =============================================================================

import { billingStatus } from "@/lib/billing/config";
import {
  COOKIE_NAME,
  MAX_TTL_DAYS,
  clearedCookie,
  clearedSessionHintCookie,
  cookieFor,
  sessionHintCookie,
  sign,
  verify,
  type Entitlement,
} from "@/lib/billing/entitlement";
import { emailKey, resolveStore } from "@/lib/billing/store";
import { accessForKey } from "@/lib/billing/subscription";
import { clientIp, json, rateLimited, readCookie, serializeCookie } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_MINUTE = 20;

export async function POST(req: Request): Promise<Response> {
  const status = billingStatus();
  const store = resolveStore();
  if (!status.sessionsReady || !store) {
    return json({ error: "not_configured", message: "Sessions are not configured." }, 503);
  }

  if (rateLimited(clientIp(req), MAX_PER_MINUTE)) {
    return json({ error: "rate_limited", message: "Too many attempts. Try again in a minute." }, 429);
  }

  const secret = process.env.BILLING_SESSION_SECRET as string;
  const now = Math.floor(Date.now() / 1000);
  const current = verify(readCookie(req, COOKIE_NAME), secret, now);

  if (!current?.email) {
    return json({ error: "no_session", message: "No session on this browser." }, 401);
  }

  const secure = !(process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("http://");
  const key = emailKey(current.email, secret);

  let access;
  try {
    access = await accessForKey(store, key, now);
  } catch (err) {
    // A store that cannot answer must not sign a paying subscriber out. Leave
    // the existing claim alone and let them try again.
    console.error(`[billing] session refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    return json({ error: "store_unavailable", message: "Could not check the subscription." }, 503);
  }

  if (!access.pro || !access.record) {
    // Revoked, lapsed, refunded or disputed. Clear the claim rather than let it
    // run to its own expiry — this is the fastest path from "cancelled in
    // Stripe" to "cannot use Pro in this browser".
    const res = json({ plan: "free", reason: access.reason }, 402);
    res.headers.append("Set-Cookie", serializeCookie(clearedCookie(secure)));
    res.headers.append("Set-Cookie", serializeCookie(clearedSessionHintCookie(secure)));
    return res;
  }

  const entitlement: Entitlement = {
    plan: "pro",
    email: access.record.email,
    customerId: access.record.customerId,
    exp: access.record.currentPeriodEnd,
    periodEnd: access.record.currentPeriodEnd,
  };
  // sign() clamps exp to MAX_TTL_DAYS; periodEnd rides along unclamped.
  const token = sign(entitlement, secret, now);
  const cookieExp = Math.min(entitlement.exp, now + MAX_TTL_DAYS * 86_400);

  const res = json(
    { plan: "pro", paidThrough: new Date(entitlement.exp * 1000).toISOString() },
    200
  );
  res.headers.append("Set-Cookie", serializeCookie(cookieFor(token, cookieExp, now, secure)));
  res.headers.append("Set-Cookie", serializeCookie(sessionHintCookie(cookieExp, now, secure)));
  return res;
}
