// =============================================================================
// /api/uscis/sandbox-check : daily USCIS sandbox traffic (Vercel cron)
//
// Same contract as the other crons: Bearer $CRON_SECRET or nothing. Runs only
// when the USCIS credentials point at the sandbox host. Touches no subscriber
// data and sends no email.
// =============================================================================

import { cronAuthorized } from "@/lib/billing/alert-run";
import { json } from "@/lib/billing/http";
import { resolveStore } from "@/lib/billing/store";
import { appendDay, consecutiveGoodDays, isSandbox, readLog, runSandboxProbes, writeLog } from "@/lib/cases/sandbox";
import { uscisConfigured, type UscisEnv } from "@/lib/cases/uscis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request): Promise<Response> {
  if (!(process.env.CRON_SECRET ?? "").trim()) {
    return json({ error: "not_configured", message: "The sandbox check is not configured." }, 503);
  }
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return json({ error: "unauthorized" }, 401);
  }
  const env = process.env as UscisEnv;
  if (!uscisConfigured(env)) return json({ error: "not_configured", message: "USCIS credentials are not set." }, 503);
  if (!isSandbox(env)) return json({ error: "not_sandbox", message: "USCIS_API_BASE is not the sandbox." }, 409);

  const day = await runSandboxProbes(env);
  let streak: number | null = null;
  const store = resolveStore();
  if (store) {
    const log = appendDay(await readLog(store), day);
    await writeLog(store, log);
    streak = consecutiveGoodDays(log);
  }
  console.log(`[uscis-sandbox] ${JSON.stringify({ ...day, streak })}`);
  return json({ ok: true, day, streak }, 200);
}
