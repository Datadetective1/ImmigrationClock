// =============================================================================
// POST /api/bulletin-alerts/subscribe — step one of the free alert signup
//
// Stores NOTHING about the person. It emails a confirmation link that carries
// the signup, signed; only a click on that link stores the address (see
// ../confirm). So a typo, or an address entered by someone else, leaves no
// trace beyond one email the owner can ignore.
//
// Public and unauthenticated, so, like /api/subscribe:
//   • the answer is the same whether or not the address is already signed up;
//   • a honeypot field catches simple bots;
//   • requests are limited per IP, and confirmation emails per inbox, in the
//     store (best effort, and silent: a limited request still reads as sent).
// =============================================================================

import { isPlausibleEmail } from "@/lib/newsletter";
import {
  alertsOrigin,
  confirmToken,
  confirmUrl,
  isCountry,
  isRow,
} from "@/lib/bulletin-alerts";
import { confirmEmail } from "@/lib/bulletin-alerts/email";
import { sendAlertMail } from "@/lib/bulletin-alerts/resend";
import { ALERT_KEYS, alertKey, resolveAlertStore } from "@/lib/bulletin-alerts/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_IP_PER_HOUR = 10;
const PER_INBOX_PER_DAY = 3;

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  const store = resolveAlertStore();
  if (!apiKey || !secret || !store) {
    console.error("[bulletin-alerts] subscribe is not configured (Resend key, session secret or store missing)");
    return json({ ok: false, error: "Alerts are not available right now. Nothing was stored." }, 503);
  }

  let body: { email?: unknown; row?: unknown; country?: unknown; consent?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Malformed request." }, 400);
  }

  if (typeof body.website === "string" && body.website.trim() !== "") return json({ ok: true }, 200);

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isPlausibleEmail(email)) return json({ ok: false, error: "That does not look like an email address." }, 400);
  if (!isRow(body.row)) return json({ ok: false, error: "Choose your category." }, 400);
  if (!isCountry(body.country)) return json({ ok: false, error: "Choose your country of chargeability." }, 400);
  if (body.consent !== true) return json({ ok: false, error: "Please tick the box to confirm you want these emails." }, 400);

  try {
    const hour = new Date().toISOString().slice(0, 13);
    const day = hour.slice(0, 10);
    const ipCount = await store.increment(ALERT_KEYS.limit(hour, alertKey(`ip:${clientIp(req)}@ip`, secret)), 3600);
    if (ipCount > PER_IP_PER_HOUR) return json({ ok: false, error: "Too many attempts. Try again later." }, 429);
    const inboxCount = await store.increment(ALERT_KEYS.limit(day, alertKey(email, secret)), 86400);
    // Silent: saying "limited" would confirm someone is mailing this inbox.
    if (inboxCount > PER_INBOX_PER_DAY) return json({ ok: true }, 200);
  } catch (err) {
    console.error(`[bulletin-alerts] rate limit check failed: ${(err as Error)?.message}`);
    return json({ ok: false, error: "We could not complete the signup. Try again shortly." }, 502);
  }

  const origin = alertsOrigin();
  const token = confirmToken(
    { email, row: body.row, country: body.country, givenAt: Math.floor(Date.now() / 1000) },
    secret
  );
  const mail = confirmEmail({ pick: { row: body.row, country: body.country }, confirmUrl: confirmUrl(origin, token), origin });

  try {
    const result = await sendAlertMail({
      apiKey,
      to: email,
      mail,
      replyTo: process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined,
    });
    if (!result.ok) {
      console.error(`[bulletin-alerts] confirm email ${result.status}: ${result.detail}`);
      return json({ ok: false, error: "We could not send the confirmation email. Try again shortly." }, 502);
    }
  } catch (err) {
    console.error(`[bulletin-alerts] confirm email failed: ${(err as Error)?.message}`);
    return json({ ok: false, error: "We could not send the confirmation email. Try again shortly." }, 502);
  }

  return json({ ok: true }, 200);
}

export async function GET(): Promise<Response> {
  return json({ ok: false, error: "Use POST to sign up." }, 405);
}
