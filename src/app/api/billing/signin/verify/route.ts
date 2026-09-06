// =============================================================================
// POST /api/billing/signin/verify — exchange a link for access
//
// The token is consumed ATOMICALLY (GETDEL) and is good exactly once, so a
// link that is opened twice — a mail client prefetching, a forwarded message —
// cannot be used twice.
//
// Consuming a token proves control of the address. It does not grant Pro:
// the subscription is re-read from the store, and if it is not live the person
// is told so rather than handed an entitlement.
// =============================================================================

import { billingStatus } from "@/lib/billing/config";
import { resolveStore, tokenHash } from "@/lib/billing/store";
import { accessForKey } from "@/lib/billing/subscription";
import { MAX_TTL_DAYS, cookieFor, sessionHintCookie, sign, type Entitlement } from "@/lib/billing/entitlement";
import { clientIp, json, rateLimited, serializeCookie } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_MINUTE = 10;

export async function POST(req: Request): Promise<Response> {
  const status = billingStatus();
  const store = resolveStore();

  if (!status.sessionsReady || !store) {
    return json({ error: "signin_not_configured", message: "Sign-in is not configured." }, 503);
  }

  if (rateLimited(clientIp(req), MAX_PER_MINUTE)) {
    return json({ error: "rate_limited", message: "Too many attempts. Try again in a minute." }, 429);
  }

  let token = "";
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body.token === "string") token = body.token.trim();
  } catch {
    // Falls through.
  }
  if (!token) return json({ error: "bad_token", message: "That sign-in link is not valid." }, 400);

  const secret = process.env.BILLING_SESSION_SECRET as string;
  const now = Math.floor(Date.now() / 1000);

  const consumed = await store.consumeLoginToken(tokenHash(token, secret));
  const { key, address } = parseLoginValue(consumed);
  if (!key) {
    // Expired, already used, or never real — all the same answer, because
    // distinguishing them tells an attacker which guesses were close.
    return json(
      { error: "link_expired", message: "That sign-in link has expired or was already used. Request a new one." },
      400
    );
  }

  const access = await accessForKey(store, key, now);

  // CONSUMING THE TOKEN PROVES CONTROL OF THE ADDRESS. That is worth a cookie
  // on its own, even with nothing to bill: checkout requires a verified
  // identity before it will create a Stripe customer, so a first-time buyer
  // arrives here with no subscription and must still leave with an identity.
  //
  // A verified-but-unpaid claim is `plan: "free"`. It unlocks nothing — can()
  // and isActive() treat it exactly as anonymous — and carries only the
  // address, which is the one thing checkout needs and must never be told by
  // the buyer.
  const record = access.record;
  const entitlement: Entitlement = access.pro && record
    ? {
        plan: "pro",
        email: record.email,
        customerId: record.customerId,
        // The claim is short-lived by policy; the PAID period is not, and the
        // account page shows this one. A $190 annual subscriber was being told
        // their year ended in thirty days because the two were one field.
        exp: record.currentPeriodEnd,
        periodEnd: record.currentPeriodEnd,
      }
    : {
        plan: "free",
        email: record?.email || address || "",
        customerId: record?.customerId || "",
        exp: now + MAX_TTL_DAYS * 86_400,
      };

  if (!entitlement.email) {
    // A token with no address and no record cannot identify anybody. Refuse
    // rather than mint an identity for the empty string.
    return json(
      { error: "link_expired", message: "That sign-in link has expired or was already used. Request a new one." },
      400
    );
  }
  const token2 = sign(entitlement, secret, now);
  const cookie = cookieFor(
    token2,
    Math.min(entitlement.exp, now + MAX_TTL_DAYS * 86_400),
    now,
    !(process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("http://")
  );

  console.log(
    `[billing] signed in · plan ${entitlement.plan} · customer ${entitlement.customerId || "none"}`
  );

  const secure = !(process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("http://");
  const res = json(
    {
      plan: entitlement.plan,
      verified: true,
      expiresAt: new Date((entitlement.periodEnd ?? entitlement.exp) * 1000).toISOString(),
    },
    200
  );
  res.headers.append("Set-Cookie", serializeCookie(cookie));
  // A readable "a session exists here", so the browser knows whether asking
  // about a subscription is worth a request. Carries no identity.
  res.headers.append("Set-Cookie", serializeCookie(sessionHintCookie(entitlement.exp, now, secure)));
  return res;
}

/**
 * A consumed login token's value, in either shape it can hold.
 *
 * New tokens store `{k, e}` — the identity key and the address it was sent to,
 * because a first-time verifier has no record to read the address from and
 * emailKey() cannot be reversed. Tokens issued before that change stored the
 * bare key, and must keep working until they expire fifteen minutes later.
 */
function parseLoginValue(raw: string | null): { key: string | null; address: string } {
  if (!raw) return { key: null, address: "" };
  if (!raw.startsWith("{")) return { key: raw, address: "" };
  try {
    const parsed = JSON.parse(raw) as { k?: unknown; e?: unknown };
    return {
      key: typeof parsed.k === "string" && parsed.k ? parsed.k : null,
      address: typeof parsed.e === "string" ? parsed.e : "",
    };
  } catch {
    return { key: null, address: "" };
  }
}
