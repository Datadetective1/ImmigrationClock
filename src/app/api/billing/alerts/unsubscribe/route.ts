// =============================================================================
// /api/billing/alerts/unsubscribe — the link at the foot of every alert
//
// GET is the link a person clicks; POST is RFC 8058 one-click unsubscribe, the
// request a mail client sends from its own "Unsubscribe" button. Both turn
// alerts off for the subscriber named by the signed token. The token is an
// HMAC of the subscriber key, so a guessed key cannot unsubscribe anyone.
//
// It only turns alerts OFF. It never touches billing, the watchlist or the
// newsletter, and alerts can be turned back on from /account.
// =============================================================================

import { parseCursor, serializeCursor, withPaused } from "@/lib/billing/alerts";
import { verifyUnsubscribeToken } from "@/lib/billing/alert-run";
import { billingOrigin } from "@/lib/billing/config";
import { json } from "@/lib/billing/http";
import { resolveStore } from "@/lib/billing/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function pause(req: Request): Promise<"ok" | "invalid" | "unavailable"> {
  const url = new URL(req.url);
  const key = url.searchParams.get("k") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  const store = resolveStore();
  if (!store || !secret) return "unavailable";
  if (!verifyUnsubscribeToken(key, token, secret)) return "invalid";

  const current = parseCursor(await store.getAlertCursor(key));
  if (typeof current.pausedAt !== "number") {
    await store.putAlertCursor(key, serializeCursor(withPaused(current, Math.floor(Date.now() / 1000))));
  }
  console.log("[alerts] unsubscribed via link");
  return "ok";
}

export async function GET(req: Request): Promise<Response> {
  const outcome = await pause(req);
  const target = outcome === "ok" ? "off" : "error";
  return Response.redirect(`${billingOrigin()}/account?alerts=${target}`, 303);
}

export async function POST(req: Request): Promise<Response> {
  const outcome = await pause(req);
  if (outcome === "ok") return json({ ok: true }, 200);
  return json({ error: outcome }, outcome === "invalid" ? 400 : 503);
}
