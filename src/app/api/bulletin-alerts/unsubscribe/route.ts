// =============================================================================
// /api/bulletin-alerts/unsubscribe — the link at the foot of every alert
//
// GET shows one button and changes nothing (mail scanners open every link).
// POST deletes the subscriber: the address, category, country and consent are
// removed from the store, not just paused. It answers the button with a page
// and RFC 8058 one-click unsubscribe (body `List-Unsubscribe=One-Click`, sent
// by the mail client's own button) with JSON. The token is an HMAC of the key.
// =============================================================================

import { ALERTS_PAGE_PATH, alertsOrigin, verifyUnsubscribe } from "@/lib/bulletin-alerts";
import { BUTTON_STYLE, escapeAttr, simplePage } from "@/lib/bulletin-alerts/page";
import { resolveAlertStore } from "@/lib/bulletin-alerts/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function params(req: Request) {
  const url = new URL(req.url);
  return { url, key: url.searchParams.get("k") ?? "", token: url.searchParams.get("t") ?? "" };
}

function invalidPage(): Response {
  return simplePage(
    "This link is not valid",
    `<h1 style="font-size:19px;margin:0 0 8px">This link is not valid</h1><p style="font-size:15px;line-height:1.5;color:#334155;margin:0">Use the unsubscribe link in the most recent alert email, or reply to that email and we will remove you.</p>`,
    400
  );
}

export async function GET(req: Request): Promise<Response> {
  const { url, key, token } = params(req);
  if (!verifyUnsubscribe(key, token, process.env.BILLING_SESSION_SECRET ?? "")) return invalidPage();
  const action = `${url.pathname}?k=${encodeURIComponent(key)}&t=${encodeURIComponent(token)}`;
  return simplePage(
    "Stop Visa Bulletin alerts",
    `<h1 style="font-size:19px;margin:0 0 8px">Stop free Visa Bulletin alerts?</h1><p style="font-size:15px;line-height:1.5;color:#334155;margin:0 0 16px">We will delete your address and your category and country, and send you nothing more.</p><form method="post" action="${escapeAttr(action)}"><button type="submit" style="${BUTTON_STYLE}" data-testid="unsubscribe-alert">Unsubscribe</button></form>`
  );
}

export async function POST(req: Request): Promise<Response> {
  const { key, token } = params(req);
  const body = await req.text().catch(() => "");
  const oneClick = body.includes("List-Unsubscribe=One-Click");
  const store = resolveAlertStore();
  const valid = verifyUnsubscribe(key, token, process.env.BILLING_SESSION_SECRET ?? "");

  let outcome: "ok" | "invalid" | "unavailable" = valid ? "ok" : "invalid";
  if (valid) {
    if (!store) outcome = "unavailable";
    else {
      try {
        await store.remove(key);
        console.log("[bulletin-alerts] unsubscribed");
      } catch (err) {
        console.error(`[bulletin-alerts] unsubscribe failed: ${(err as Error)?.message}`);
        outcome = "unavailable";
      }
    }
  }

  if (oneClick) {
    return new Response(JSON.stringify(outcome === "ok" ? { ok: true } : { error: outcome }), {
      status: outcome === "ok" ? 200 : outcome === "invalid" ? 400 : 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  if (outcome === "invalid") return invalidPage();
  if (outcome === "unavailable") {
    return simplePage("Try again shortly", `<p style="font-size:15px">We could not unsubscribe you just now. Please try the link again in a few minutes, or reply to the email.</p>`, 503);
  }
  return simplePage(
    "Unsubscribed",
    `<h1 style="font-size:19px;margin:0 0 8px">You are unsubscribed</h1><p style="font-size:15px;line-height:1.5;color:#334155;margin:0">Your address, category and country have been deleted. You can <a href="${escapeAttr(alertsOrigin() + ALERTS_PAGE_PATH)}" style="color:#0369a1">sign up again</a> any time.</p>`
  );
}
