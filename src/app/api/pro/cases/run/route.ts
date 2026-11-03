// =============================================================================
// /api/pro/cases/run : the daily case status check (Vercel cron)
//
// Same contract as /api/billing/alerts/run: Bearer $CRON_SECRET or nothing,
// and ALERTS_SEND must be exactly "true" for email to leave. Off (flag or
// USCIS credentials missing) it answers 503 and checks nothing.
// =============================================================================

import { billingOrigin, billingStatus } from "@/lib/billing/config";
import { cronAuthorized, resendSender } from "@/lib/billing/alert-run";
import { json } from "@/lib/billing/http";
import { resolveStore } from "@/lib/billing/store";
import { caseAlertsReady } from "@/lib/cases/config";
import { runCaseChecks } from "@/lib/cases/run";
import { fetchCaseStatus } from "@/lib/cases/uscis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  if (!(process.env.CRON_SECRET ?? "").trim()) {
    return json({ error: "not_configured", message: "The case check is not configured." }, 503);
  }
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!caseAlertsReady()) return json({ error: "not_enabled", message: "Case alerts are switched off." }, 503);
  const store = resolveStore();
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  if (!store || !billingStatus().sessionsReady || !secret) {
    return json({ error: "not_configured", message: "Billing store or session secret is not configured." }, 503);
  }
  const send = (process.env.ALERTS_SEND ?? "").trim() === "true";
  const report = await runCaseChecks({
    store,
    secret,
    nowSeconds: Math.floor(Date.now() / 1000),
    origin: billingOrigin(),
    send,
    sender: send ? resendSender(process.env as Record<string, string | undefined>) : undefined,
    lookup: (receipt) => fetchCaseStatus(receipt),
  });
  console.log(`[cases] run · ${JSON.stringify(report)}`);
  return json({ ok: true, report }, 200);
}
