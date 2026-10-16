// =============================================================================
// /api/pro/calendar/<token> — the private calendar feed
//
// Fetched by calendar apps, with no cookie: the signed token is the
// credential (src/lib/pro/calendar.ts). Every fetch re-checks the flag, the
// token's version and the subscription, so a revoked link or a lapsed
// subscription stops working on the next refresh. Unknown, revoked and lapsed
// all answer the same 404, so the URL reveals nothing about an account.
// =============================================================================

import { billingOrigin, billingStatus } from "@/lib/billing/config";
import { clientIp, rateLimited } from "@/lib/billing/http";
import { resolveStore } from "@/lib/billing/store";
import { accessForKey } from "@/lib/billing/subscription";
import { flagOn } from "@/lib/flags";
import { buildCalendar, verifyCalendarToken } from "@/lib/pro/calendar";
import { buildBriefing } from "@/lib/pro/feed";
import { parsePrefs } from "@/lib/pro/prefs";
import { parseSaved } from "@/lib/pro/saved";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_FOUND = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request, { params }: { params: { token: string } }): Promise<Response> {
  if (!flagOn("pro_briefing")) return NOT_FOUND();
  if (rateLimited(clientIp(req), 30)) return new Response("Too many requests", { status: 429 });
  const store = resolveStore();
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  if (!store || !secret || !billingStatus().sessionsReady) return NOT_FOUND();

  const token = decodeURIComponent(params.token).replace(/\.ics$/, "");
  const key = await verifyCalendarToken(token, secret, async (k) =>
    parsePrefs(await store.getProDoc("prefs", k)).calendarVersion
  );
  if (!key) return NOT_FOUND();
  const now = Math.floor(Date.now() / 1000);
  if (!(await accessForKey(store, key, now)).pro) return NOT_FOUND();

  const today = new Date(now * 1000).toISOString().slice(0, 10);
  const follows = (await store.getWatchlist(key))?.entityIds ?? [];
  const savedIds = parseSaved(await store.getProDoc("saved", key)).map((s) => s.id);
  const { timeline } = buildBriefing({ follows, savedIds, today });

  return new Response(buildCalendar(timeline, { origin: billingOrigin(), now: new Date(now * 1000) }), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="immigrationclock.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
