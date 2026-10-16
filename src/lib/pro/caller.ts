// =============================================================================
// WHO IS ASKING, AND MAY THEY USE BRIEFING?
//
// One gate for every Briefing route and the /briefing page, in the same order
// the watchlist route uses: flag, configuration, signed cookie, then the STORE
// decides whether the subscription is active. The cookie is a fast path, never
// the authority — a cancelled subscriber holding a valid cookie is refused.
// =============================================================================

import { billingStatus } from "@/lib/billing/config";
import { COOKIE_NAME, verify } from "@/lib/billing/entitlement";
import { clientIp, json, rateLimited, readCookie } from "@/lib/billing/http";
import { emailKey, resolveStore, type SubscriberStore } from "@/lib/billing/store";
import { accessForKey } from "@/lib/billing/subscription";
import { flagOn } from "@/lib/flags";

export type ProGate =
  | { ok: true; store: SubscriberStore; key: string; now: number; secret: string }
  | { ok: false; reason: "off" | "not_configured" | "not_signed_in" | "not_pro"; detail?: string };

export async function proGate(cookieValue: string | undefined): Promise<ProGate> {
  if (!flagOn("pro_briefing")) return { ok: false, reason: "off" };
  const store = resolveStore();
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  if (!billingStatus().sessionsReady || !store || !secret) return { ok: false, reason: "not_configured" };
  const now = Math.floor(Date.now() / 1000);
  const entitlement = verify(cookieValue, secret, now);
  if (!entitlement?.email) return { ok: false, reason: "not_signed_in" };
  const key = emailKey(entitlement.email, secret);
  const access = await accessForKey(store, key, now);
  if (!access.pro) return { ok: false, reason: "not_pro", detail: access.reason };
  return { ok: true, store, key, now, secret };
}

const RESPONSES: Record<Exclude<ProGate, { ok: true }>["reason"], [string, number, string]> = {
  // While the flag is off the routes do not exist, as far as anyone can tell.
  off: ["not_found", 404, "Not found."],
  not_configured: ["not_configured", 503, "Briefing is not configured."],
  not_signed_in: ["not_signed_in", 401, "Sign in to use Briefing."],
  not_pro: ["not_pro", 402, "Briefing needs an active Pro subscription."],
};

/** For route handlers: the gate plus a per-IP limit, as a Response on refusal. */
export async function proRoute(
  req: Request,
  perMinute = 30
): Promise<{ error: Response } | { error?: undefined; store: SubscriberStore; key: string; now: number; secret: string }> {
  if (!flagOn("pro_briefing")) return { error: json({ error: "not_found" }, 404) };
  if (rateLimited(clientIp(req), perMinute)) return { error: json({ error: "rate_limited", message: "Too many requests." }, 429) };
  const gate = await proGate(readCookie(req, COOKIE_NAME) ?? undefined);
  if (!gate.ok) {
    const [error, status, message] = RESPONSES[gate.reason];
    return { error: json({ error, message }, status) };
  }
  return gate;
}
