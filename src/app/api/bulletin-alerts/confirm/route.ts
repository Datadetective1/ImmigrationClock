// =============================================================================
// /api/bulletin-alerts/confirm — step two: the link in the confirmation email
//
// GET changes nothing and shows one button. Mail security scanners open every
// link in a message; if opening the link confirmed, a scanner could sign up an
// address its owner never chose. POST, from that button, stores the four
// things (email, category, country, consent), sends the welcome email with the
// current dates, and lands on the alerts page.
// =============================================================================

import {
  ALERTS_PAGE_PATH,
  CONSENT_TEXT,
  CONSENT_VERSION,
  alertsOrigin,
  pickLabel,
  readConfirmToken,
  unsubscribeUrl,
  type AlertSubscriber,
} from "@/lib/bulletin-alerts";
import { listUnsubscribeHeaders, welcomeEmail } from "@/lib/bulletin-alerts/email";
import { BUTTON_STYLE, escapeAttr, simplePage } from "@/lib/bulletin-alerts/page";
import { sendAlertMail } from "@/lib/bulletin-alerts/resend";
import { alertKey, resolveAlertStore } from "@/lib/bulletin-alerts/store";
import { offerById } from "@/lib/billing/offers";
import { latestBulletin, previousBulletin } from "@/lib/visa-bulletin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invalid(origin: string): Response {
  return simplePage(
    "This link has expired",
    `<h1 style="font-size:19px;margin:0 0 8px">This link has expired or is not valid</h1><p style="font-size:15px;line-height:1.5;color:#334155;margin:0">Confirmation links work for 7 days. You can <a href="${escapeAttr(origin + ALERTS_PAGE_PATH)}" style="color:#0369a1">sign up again</a>; it takes a few seconds.</p>`,
    400
  );
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = alertsOrigin();
  const token = url.searchParams.get("t") ?? "";
  const pending = readConfirmToken(token, process.env.BILLING_SESSION_SECRET ?? "");
  if (!pending) return invalid(origin);
  const label = pickLabel(pending.row, pending.country);
  const action = `${url.pathname}?t=${encodeURIComponent(token)}`;
  return simplePage(
    "Confirm your Visa Bulletin alert",
    `<h1 style="font-size:19px;margin:0 0 8px">Confirm your free Visa Bulletin alert</h1><p style="font-size:15px;line-height:1.5;color:#334155;margin:0 0 16px">We will email <strong>${escapeAttr(pending.email)}</strong> when we publish each new Visa Bulletin month, with the dates for <strong>${escapeAttr(label)}</strong>. Every email has a one-click unsubscribe link.</p><form method="post" action="${escapeAttr(action)}"><button type="submit" style="${BUTTON_STYLE}" data-testid="confirm-alert">Confirm my alert</button></form>`
  );
}

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = alertsOrigin();
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  const store = resolveAlertStore();
  const pending = readConfirmToken(url.searchParams.get("t") ?? "", secret);
  if (!pending) return invalid(origin);
  if (!store) {
    console.error("[bulletin-alerts] confirm: store not configured");
    return simplePage("Try again shortly", `<p style="font-size:15px">We could not save your alert just now. Please use the link again in a few minutes.</p>`, 503);
  }

  const bulletin = latestBulletin();
  const key = alertKey(pending.email, secret);
  const existing = await store.get(key);
  const record: AlertSubscriber = {
    email: pending.email,
    row: pending.row,
    country: pending.country,
    consent: {
      text: CONSENT_TEXT,
      version: CONSENT_VERSION,
      givenAt: pending.givenAt,
      confirmedAt: Math.floor(Date.now() / 1000),
    },
    // A re-confirm keeps the month they started from, so changing category
    // never makes them miss or repeat a month.
    sinceMonth: existing?.sinceMonth ?? bulletin?.id ?? "0000-00",
  };
  try {
    await store.put(key, record);
  } catch (err) {
    console.error(`[bulletin-alerts] confirm: store write failed: ${(err as Error)?.message}`);
    return simplePage("Try again shortly", `<p style="font-size:15px">We could not save your alert just now. Please use the link again in a few minutes.</p>`, 503);
  }
  console.log("[bulletin-alerts] confirmed");

  // The welcome email: the dates they asked about, right now. A failure here
  // does not undo the signup; it is logged for an operator.
  const apiKey = process.env.RESEND_API_KEY ?? "";
  if (apiKey && bulletin) {
    const unsub = unsubscribeUrl(origin, key, secret);
    try {
      const result = await sendAlertMail({
        apiKey,
        to: pending.email,
        mail: welcomeEmail({
          pick: { row: pending.row, country: pending.country },
          bulletin,
          previous: previousBulletin(bulletin),
          origin,
          unsubscribeUrl: unsub,
          trialDays: offerById("free-trial").trialDays,
        }),
        replyTo: process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined,
        headers: listUnsubscribeHeaders(unsub),
        // Opening the link twice sends one welcome, not two.
        idempotencyKey: `balert-welcome-${key}-${pending.givenAt}`,
      });
      if (!result.ok) console.error(`[bulletin-alerts] welcome email ${result.status}: ${result.detail}`);
    } catch (err) {
      console.error(`[bulletin-alerts] welcome email failed: ${(err as Error)?.message}`);
    }
  }

  return Response.redirect(`${origin}${ALERTS_PAGE_PATH}?confirmed=1`, 303);
}
