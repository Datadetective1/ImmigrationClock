// =============================================================================
// /api/billing/alerts/unsubscribe — the link at the foot of every alert
//
// GET is the link a person clicks. It changes NOTHING: it shows one button.
// Mail security scanners (Outlook Safe Links, Mimecast and the like) fetch
// every link in an incoming message, and a GET that unsubscribed would turn
// alerts off for paying customers before they ever saw the email.
//
// POST does the work, from two callers: that button (a form post, answered
// with a redirect to /account), and RFC 8058 one-click unsubscribe, the
// request a mail client sends from its own "Unsubscribe" button with the body
// `List-Unsubscribe=One-Click` (answered with JSON). The token is an HMAC of
// the subscriber key, so a guessed key cannot unsubscribe anyone.
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

function page(body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Stop watchlist alerts</title></head><body style="margin:0;padding:40px 16px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a"><div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px">${body}</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  const key = url.searchParams.get("k") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!secret || !verifyUnsubscribeToken(key, token, secret)) {
    return page(
      `<h1 style="font-size:18px;margin:0 0 8px">This link is not valid</h1><p style="font-size:14px;color:#475569;margin:0">You can turn alerts off from <a href="${billingOrigin()}/account" style="color:#0f172a">your account</a>.</p>`,
      400
    );
  }
  const action = `${url.pathname}?k=${encodeURIComponent(key)}&t=${encodeURIComponent(token)}`;
  return page(
    `<h1 style="font-size:18px;margin:0 0 8px">Stop watchlist alerts?</h1><p style="font-size:14px;line-height:1.5;color:#475569;margin:0 0 16px">You will stop getting alert emails. Your subscription and your watchlist are not affected, and you can turn alerts back on from your account.</p><form method="post" action="${escapeAttr(action)}"><button type="submit" style="background:#0f172a;color:#fff;border:0;border-radius:8px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer">Stop alerts</button></form>`
  );
}

export async function POST(req: Request): Promise<Response> {
  const outcome = await pause(req);
  const body = await req.text().catch(() => "");
  const oneClick = body.includes("List-Unsubscribe=One-Click");
  if (!oneClick) {
    // The confirmation button: send the reader somewhere that shows the result.
    const target = outcome === "ok" ? "off" : "error";
    return Response.redirect(`${billingOrigin()}/account?alerts=${target}`, 303);
  }
  if (outcome === "ok") return json({ ok: true }, 200);
  return json({ error: outcome }, outcome === "invalid" ? 400 : 503);
}
