// =============================================================================
// /api/uscis/sandbox-log : read-only view of the sandbox check log
//
// Holds dates, HTTP codes and response field names for USCIS's own fake
// staging cases. No secrets, no subscriber data, no values from responses.
// =============================================================================

import { json } from "@/lib/billing/http";
import { resolveStore } from "@/lib/billing/store";
import { consecutiveGoodDays, readLog } from "@/lib/cases/sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const store = resolveStore();
  if (!store) return json({ error: "not_configured" }, 503);
  const log = await readLog(store);
  return json({ consecutiveDays: consecutiveGoodDays(log), needed: 5, days: log }, 200, { "X-Robots-Tag": "noindex" });
}
