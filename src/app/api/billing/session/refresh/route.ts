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

/**
 * How long the readable hint lasts.
 *
 * Deliberately longer than the signed claim. The hint grants nothing — it says
 * only "somebody signed in on this browser" — and its job is to tell the
 * browser that recovery is worth offering. Expiring it with the claim meant the
 * moment a subscriber most needed the sign-in prompt was the moment it stopped
 * appearing.
 */
const HINT_EXP = (now: number) => now + 180 * 86_400;

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
    // A VERIFIED IDENTITY IS NOT A SUBSCRIPTION, AND MUST SURVIVE NOT BEING ONE.
    //
    // This cleared the cookie for anybody the store could not call Pro — which
    // includes every first-time buyer, because checkout seeds their record as
    // `incomplete` and the magic-link claim is `plan: "free"`. The sign-in link
    // lands on /account, /account calls this on load, and the identity was
    // destroyed seconds after being proved. Clicking Subscribe then answered
    // "confirm your email address" to somebody who just had.
    //
    // So: only a PAID claim can be revoked here. A free one is re-minted, which
    // is also what keeps the address available for the checkout that follows.
    if (current.plan !== "pro") {
      const identity: Entitlement = {
        plan: "free",
        email: current.email,
        customerId: current.customerId,
        exp: now + MAX_TTL_DAYS * 86_400,
      };
      const kept = sign(identity, secret, now);
      const keptExp = now + MAX_TTL_DAYS * 86_400;
      const ok = json({ plan: "free", verified: true, reason: access.reason }, 200);
      ok.headers.append("Set-Cookie", serializeCookie(cookieFor(kept, keptExp, now, secure)));
      ok.headers.append("Set-Cookie", serializeCookie(sessionHintCookie(HINT_EXP(now), now, secure)));
      return ok;
    }

    // A PAID claim against a record that no longer grants access: revoked,
    // lapsed, refunded or disputed. Clearing it is the fastest path from
    // "cancelled in Stripe" to "cannot use Pro in this browser".
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
  // THE HINT OUTLIVES THE CLAIM ON PURPOSE. Both used to expire together, so a
  // subscriber whose claim lapsed also lost the only signal telling the browser
  // that asking about a subscription was worth doing — and silently stopped
  // being offered the recovery they were entitled to.
  res.headers.append("Set-Cookie", serializeCookie(sessionHintCookie(HINT_EXP(now), now, secure)));
  return res;
}
