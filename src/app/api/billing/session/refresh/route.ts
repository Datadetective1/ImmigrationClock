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
// lapsed record fails accessFor(), and this answers 402 and DOWNGRADES the
// claim to a verified-but-unpaid identity rather than renewing it — so
// refreshing is also how a revoked subscription stops working on a browser that
// still holds a valid-looking claim.
//
// DOWNGRADE, NOT EJECTION. It used to clear the cookie outright, which ended
// the identity along with the subscription: a subscriber whose year ran out
// opened /account and found a sign-in form, with nothing saying what had
// happened and no route to their own invoices. A `plan: "free"` claim unlocks
// nothing anywhere, so Pro stops exactly as fast, and the person is still
// recognised.
//
// A caller with an expired cookie gets nothing: there is no identity left to
// re-read. That is what the sign-in link is for.
// =============================================================================

import { billingStatus } from "@/lib/billing/config";
import {
  COOKIE_NAME,
  MAX_TTL_DAYS,
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
  // One definition, used by every exit including the 401 below. A cookie
  // cleared with a different Secure flag than the one that set it is not
  // cleared at all in some browsers.
  const secure = !(process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("http://");

  if (!current?.email) {
    // THE HINT OUTLIVES THE CLAIM, BUT NOT FOREVER — AND THIS IS WHERE IT ENDS.
    //
    // `ic_session` is deliberately given 180 days below, so a subscriber whose
    // claim lapses is still offered recovery. But it is also what the header
    // reads to choose between "Sign in" and "Account", so a hint that outlives
    // every possible recovery leaves the navigation asserting an identity that
    // no longer exists.
    //
    // Reaching here means there is no claim left to renew: the only way back is
    // a new sign-in link, which the account page offers regardless of the hint.
    // Clearing it costs nothing and makes the header honest again on the next
    // navigation. It grants and revokes nothing — the hint has never been a
    // credential.
    const res = json({ error: "no_session", message: "No session on this browser." }, 401);
    res.headers.append("Set-Cookie", serializeCookie(clearedSessionHintCookie(secure)));
    return res;
  }

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
    // THE SAME MISTAKE WAS STILL BEING MADE ONE BRANCH DOWN, TO THE CUSTOMER
    // WHO HAD ACTUALLY PAID.
    //
    // A PAID claim whose record no longer grants access was cleared outright,
    // identity and all — so a subscriber whose year ran out, or who was
    // refunded, opened /account and was shown a sign-in form. Nothing told them
    // their subscription had ended, "Manage billing" was gone so they could not
    // reach their own invoices, and re-subscribing meant another email round
    // trip. The one moment the account page exists to explain was the one
    // moment it had nothing to say.
    //
    // WHAT ACTUALLY HAS TO HAPPEN IS THE DOWNGRADE, NOT THE EJECTION. Pro must
    // stop working immediately; the proof that this person controls this
    // address is unaffected by Stripe declining a card. So BOTH branches now
    // re-mint a `plan: "free"` claim, which unlocks nothing anywhere —
    // `isActive()` and `can()` treat it exactly as anonymous, and every gate
    // still re-reads the store — and the two differ only in what they REPORT.
    const identity: Entitlement = {
      plan: "free",
      email: current.email,
      customerId: current.customerId,
      exp: now + MAX_TTL_DAYS * 86_400,
    };
    const kept = sign(identity, secret, now);
    const keptExp = now + MAX_TTL_DAYS * 86_400;

    // THE STATUS CODE IS LOAD-BEARING AND KEEPS ITS OLD MEANING.
    //
    // 200 = "still a verified identity, nothing was revoked" — the first-time
    // buyer whose record is merely `incomplete`.
    // 402 = "a paid claim was just revoked" — which is what the watchlist
    // client reads to stop claiming sync, and what the account page reads to
    // re-render. Downgrading the cookie must not quietly turn that into a 200.
    const revoked = current.plan === "pro";
    const res = json(
      revoked
        ? { plan: "free", verified: true, revoked: true, reason: access.reason }
        : { plan: "free", verified: true, reason: access.reason },
      revoked ? 402 : 200
    );
    res.headers.append("Set-Cookie", serializeCookie(cookieFor(kept, keptExp, now, secure)));
    res.headers.append("Set-Cookie", serializeCookie(sessionHintCookie(HINT_EXP(now), now, secure)));
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
