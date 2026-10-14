// =============================================================================
// /api/billing/alerts/preferences — turn watchlist alerts on or off
//
// GET returns { enabled }. POST { enabled: boolean } sets it. Same gate as the
// watchlist route: a signed-in identity whose subscription the STORE says is
// active. Free readers cannot reach alerts at all.
// =============================================================================

import { initialCursor, parseCursor, serializeCursor, withPaused } from "@/lib/billing/alerts";
import { billingStatus } from "@/lib/billing/config";
import { COOKIE_NAME, verify } from "@/lib/billing/entitlement";
import { clientIp, json, rateLimited, readCookie } from "@/lib/billing/http";
import { emailKey, resolveStore, type SubscriberStore } from "@/lib/billing/store";
import { accessForKey } from "@/lib/billing/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Caller = { error: Response } | { error?: undefined; store: SubscriberStore; key: string; now: number };

async function resolveCaller(req: Request): Promise<Caller> {
  if (rateLimited(clientIp(req), 30)) return { error: json({ error: "rate_limited" }, 429) };
  const store = resolveStore();
  if (!billingStatus().sessionsReady || !store) {
    return { error: json({ error: "not_configured", message: "Alerts are not configured." }, 503) };
  }
  const secret = process.env.BILLING_SESSION_SECRET as string;
  const now = Math.floor(Date.now() / 1000);
  const entitlement = verify(readCookie(req, COOKIE_NAME), secret, now);
  if (!entitlement?.email) return { error: json({ error: "not_signed_in" }, 401) };
  const key = emailKey(entitlement.email, secret);
  const access = await accessForKey(store, key, now);
  if (!access.pro) return { error: json({ error: "not_pro", message: "Alerts need an active subscription." }, 402) };
  return { store, key, now };
}

export async function GET(req: Request): Promise<Response> {
  const caller = await resolveCaller(req);
  if (caller.error) return caller.error;
  const cursor = parseCursor(await caller.store.getAlertCursor(caller.key));
  return json({ enabled: typeof cursor.pausedAt !== "number" }, 200);
}

export async function POST(req: Request): Promise<Response> {
  const caller = await resolveCaller(req);
  if (caller.error) return caller.error;
  let enabled: unknown;
  try {
    enabled = ((await req.json()) as { enabled?: unknown }).enabled;
  } catch {
    enabled = undefined;
  }
  if (typeof enabled !== "boolean") return json({ error: "bad_body", message: "Expected { enabled: boolean }." }, 400);

  const raw = await caller.store.getAlertCursor(caller.key);
  // A subscriber with no cursor yet starts from today, so turning alerts on
  // never replays the archive.
  const base = raw === null ? initialCursor(new Date(caller.now * 1000).toISOString().slice(0, 10)) : parseCursor(raw);
  await caller.store.putAlertCursor(caller.key, serializeCursor(withPaused(base, enabled ? null : caller.now)));
  return json({ enabled }, 200);
}
