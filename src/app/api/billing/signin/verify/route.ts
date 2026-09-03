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
import { MAX_TTL_DAYS, cookieFor, sign, type Entitlement } from "@/lib/billing/entitlement";
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

  const key = await store.consumeLoginToken(tokenHash(token, secret));
  if (!key) {
    // Expired, already used, or never real — all the same answer, because
    // distinguishing them tells an attacker which guesses were close.
    return json(
      { error: "link_expired", message: "That sign-in link has expired or was already used. Request a new one." },
      400
    );
  }

  const access = await accessForKey(store, key, now);
  if (!access.pro || !access.record) {
    return json(
      { error: "no_active_subscription", message: `No active subscription for that address (${access.reason}).` },
      402
    );
  }

  const entitlement: Entitlement = {
    plan: "pro",
    email: access.record.email,
    customerId: access.record.customerId,
    exp: access.record.currentPeriodEnd,
  };
  const token2 = sign(entitlement, secret, now);
  const cookie = cookieFor(
    token2,
    Math.min(entitlement.exp, now + MAX_TTL_DAYS * 86_400),
    now,
    !(process.env.NEXT_PUBLIC_SITE_URL ?? "").startsWith("http://")
  );

  console.log(`[billing] signed in · customer ${access.record.customerId || "unknown"}`);

  return json({ plan: "pro", expiresAt: new Date(entitlement.exp * 1000).toISOString() }, 200, {
    "Set-Cookie": serializeCookie(cookie),
  });
}
