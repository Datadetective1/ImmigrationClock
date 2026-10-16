// =============================================================================
// /api/billing/alerts/run — the daily watchlist alert job (Vercel cron)
//
// Vercel calls this on the schedule in vercel.json and sends
// `Authorization: Bearer $CRON_SECRET`. Without CRON_SECRET configured the
// route refuses everything, so nobody can trigger mail by finding the URL.
//
// SENDING IS A SEPARATE, EXPLICIT SWITCH. ALERTS_SEND must be exactly "true"
// for email to leave; otherwise the run is a dry run that reports counts. That
// lets the job run in production, against real subscribers, before anyone has
// approved real alert email.
// =============================================================================

import { billingOrigin, billingStatus } from "@/lib/billing/config";
import { cronAuthorized, resendSender, runAlerts } from "@/lib/billing/alert-run";
import { json } from "@/lib/billing/http";
import { resolveStore } from "@/lib/billing/store";
import { EVENT_INDEX } from "@/lib/event-index";
import { flagOn } from "@/lib/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  // Not configured and wrong credentials are different answers, so an operator
  // (and the commercial smoke check) can tell "the job is switched off" from
  // "the job is on and refused a caller". Neither names a variable.
  if (!(process.env.CRON_SECRET ?? "").trim()) {
    return json({ error: "not_configured", message: "The alert job is not configured." }, 503);
  }
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  const status = billingStatus();
  const store = resolveStore();
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  if (!store || !status.sessionsReady || !secret) {
    return json({ error: "not_configured", message: "Billing store or session secret is not configured." }, 503);
  }

  const send = (process.env.ALERTS_SEND ?? "").trim() === "true";
  const report = await runAlerts({
    store,
    nowSeconds: Math.floor(Date.now() / 1000),
    // Change alerts only. Employers are not followable (src/lib/follows.ts),
    // so a watchlist can never match the WARN or H-1B feeds; loading those
    // multi-megabyte files into this function would buy nothing.
    data: { events: EVENT_INDEX, warnEmployers: [], h1bEmployers: [], fiscalYear: "" },
    secret,
    origin: billingOrigin(),
    testMode: status.testMode,
    supportEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined,
    send,
    briefing: flagOn("pro_briefing"),
    sender: send ? resendSender(process.env as Record<string, string | undefined>) : undefined,
  });
  console.log(`[alerts] run · ${JSON.stringify(report)}`);
  return json({ ok: true, report }, 200);
}
