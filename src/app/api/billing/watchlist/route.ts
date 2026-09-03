// =============================================================================
// /api/billing/watchlist — the watchlist, kept where a browser cannot lose it
//
// GET  returns the stored list. PUT replaces it.
//
// FREE READERS ARE UNAFFECTED. Follows still live in localStorage and still
// work with no account, exactly as before; nothing was moved behind this route.
// What Pro adds is that the list survives a cleared browser and appears on a
// second device — and that an alert job has something to read.
//
// WHAT IS STORED, AND WHAT THAT MEANS
// -----------------------------------
// Entity ids and nothing else: "visa:h-1b", "country:india", "employer:acme".
// On an immigration site that list is sensitive — following a country can imply
// a nationality — so it is stored against an HMAC of the email rather than the
// address, it is never sent to analytics, and it is never included in a log
// line. The ids are validated against the site's own followable shapes, so this
// endpoint cannot be used as free storage for arbitrary strings.
// =============================================================================

import { billingStatus } from "@/lib/billing/config";
import { COOKIE_NAME, verify } from "@/lib/billing/entitlement";
import { emailKey, resolveStore, type SubscriberStore } from "@/lib/billing/store";
import { accessForKey } from "@/lib/billing/subscription";
import { MAX_FOLLOWS, isFollowableId } from "@/lib/follows";
import { clientIp, json, rateLimited, readCookie } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_MINUTE = 30;

type Caller = { error: Response } | { error?: undefined; store: SubscriberStore; key: string };

/** Who is asking, and may they use Pro? One place, both routes. */
async function resolveCaller(req: Request): Promise<Caller> {
  const status = billingStatus();
  const store = resolveStore();
  if (!status.sessionsReady || !store) {
    return { error: json({ error: "not_configured", message: "Watchlist sync is not configured." }, 503) };
  }

  const secret = process.env.BILLING_SESSION_SECRET as string;
  const now = Math.floor(Date.now() / 1000);
  const entitlement = verify(readCookie(req, COOKIE_NAME), secret, now);

  if (!entitlement?.email) {
    return { error: json({ error: "not_signed_in", message: "Sign in to sync your watchlist." }, 401) };
  }

  const key = emailKey(entitlement.email, secret);
  // The cookie is a fast path, never the authority: the store decides. A
  // cancelled subscriber holding a valid cookie stops syncing here.
  const access = await accessForKey(store, key, now);
  if (!access.pro) {
    return { error: json({ error: "not_pro", message: `Watchlist sync needs an active subscription (${access.reason}).` }, 402) };
  }

  return { store, key };
}

export async function GET(req: Request): Promise<Response> {
  if (rateLimited(clientIp(req), MAX_PER_MINUTE)) {
    return json({ error: "rate_limited", message: "Too many requests." }, 429);
  }
  const caller = await resolveCaller(req);
  if (caller.error) return caller.error;

  const record = await caller.store.getWatchlist(caller.key);
  return json({ entityIds: record?.entityIds ?? [], updatedAt: record?.updatedAt ?? null }, 200);
}

export async function PUT(req: Request): Promise<Response> {
  if (rateLimited(clientIp(req), MAX_PER_MINUTE)) {
    return json({ error: "rate_limited", message: "Too many requests." }, 429);
  }
  const caller = await resolveCaller(req);
  if (caller.error) return caller.error;

  let incoming: unknown = null;
  try {
    incoming = ((await req.json()) as { entityIds?: unknown }).entityIds;
  } catch {
    return json({ error: "bad_body", message: "Expected { entityIds: string[] }." }, 400);
  }
  if (!Array.isArray(incoming)) {
    return json({ error: "bad_body", message: "Expected { entityIds: string[] }." }, 400);
  }

  // Validated against the site's own rules, deduplicated and capped — the same
  // ceiling the browser applies, so syncing cannot exceed what following can.
  const entityIds = [...new Set(incoming.filter((v): v is string => typeof v === "string" && isFollowableId(v)))].slice(
    0,
    MAX_FOLLOWS
  );

  await caller.store.putWatchlist(caller.key, { entityIds, updatedAt: Math.floor(Date.now() / 1000) });
  // Count only. The ids themselves never reach a log.
  console.log(`[billing] watchlist saved · ${entityIds.length} entities`);
  return json({ entityIds, saved: true }, 200);
}
