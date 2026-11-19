// =============================================================================
// /api/bulletin-alerts/send — the daily free alert job (Vercel cron)
//
// Called once a day with `Authorization: Bearer $CRON_SECRET`. Most days it
// finds nobody due. On the first run after a new bulletin month is deployed,
// it emails each free subscriber their two dates (see lib/bulletin-alerts/run).
//
// SENDING IS ITS OWN SWITCH: BULLETIN_ALERTS_SEND must be exactly "true".
// Otherwise the run is a dry run that only counts. Separate from ALERTS_SEND
// (Pro) so the free list can be held back without touching Pro alerts.
// =============================================================================

import { alertsOrigin } from "@/lib/bulletin-alerts";
import { sendAlertMail } from "@/lib/bulletin-alerts/resend";
import { runBulletinAlerts } from "@/lib/bulletin-alerts/run";
import { resolveAlertStore } from "@/lib/bulletin-alerts/store";
import { cronAuthorized } from "@/lib/billing/alert-run";
import { offerById } from "@/lib/billing/offers";
import { latestBulletin, previousBulletin } from "@/lib/visa-bulletin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request): Promise<Response> {
  if (!(process.env.CRON_SECRET ?? "").trim()) return json({ error: "not_configured" }, 503);
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) return json({ error: "unauthorized" }, 401);

  const store = resolveAlertStore();
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  const apiKey = process.env.RESEND_API_KEY ?? "";
  const bulletin = latestBulletin();
  if (!store || !secret || !apiKey || !bulletin) return json({ error: "not_configured" }, 503);

  const send = (process.env.BULLETIN_ALERTS_SEND ?? "").trim() === "true";
  const replyTo = process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined;
  const report = await runBulletinAlerts({
    store,
    bulletin,
    previous: previousBulletin(bulletin),
    origin: alertsOrigin(),
    secret,
    trialDays: offerById("free-trial").trialDays,
    send,
    // About 2 sends a second leaves room inside the 60 second limit; anyone
    // left over is sent on the next run.
    limit: 90,
    deliver: async (to, mail, headers, idempotencyKey) => {
      const r = await sendAlertMail({ apiKey, to, mail, replyTo, headers, idempotencyKey });
      return r.ok ? { ok: true } : { ok: false, detail: `${r.status} ${r.detail}` };
    },
  });
  console.log(`[bulletin-alerts] run · ${JSON.stringify(report)}`);
  return json(report, 200);
}
