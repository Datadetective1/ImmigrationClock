// =============================================================================
// /api/admin/health — operational health, for operators and monitoring only
//
// Replaces the public /api/health.json and the readiness flags the webhook GET
// used to expose. An admin session or MONITOR_TOKEN (src/lib/admin.ts); a 404
// for everyone else. Readers keep a plain "updated" date on the pages they use.
// =============================================================================

import { adminRoute } from "@/lib/admin";
import { billingStatus } from "@/lib/billing/config";
import { json } from "@/lib/billing/http";
import pipelineHealth from "@/lib/generated/pipeline-health.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const refused = adminRoute(req);
  if (refused) return refused;
  const billing = billingStatus();
  return json(
    {
      pipeline: pipelineHealth,
      billing: { checkoutReady: billing.checkoutReady, webhookReady: billing.webhookReady, testMode: billing.testMode },
    },
    200,
    { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }
  );
}
