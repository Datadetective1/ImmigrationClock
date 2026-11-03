// =============================================================================
// GET /api/forecast?section=&row=&country=&date= : when might my date be reached?
//
// Everyone gets the one-line answer in years. A Pro subscriber also gets the
// month range, the pace behind each end of it and the line's history, which
// is what /priority-date-forecast draws. Nothing is stored: the date is used
// for this one answer and never written down or logged.
// =============================================================================

import { COOKIE_NAME } from "@/lib/billing/entitlement";
import { clientIp, json, rateLimited, readCookie } from "@/lib/billing/http";
import { proGate } from "@/lib/pro/caller";
import { parseForecastQuery } from "@/lib/visa-bulletin/forecast-query";
import { forecast, teaser } from "@/lib/visa-bulletin/forecast";
import { historySeries } from "@/lib/visa-bulletin/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How much history the Pro chart shows. */
const CHART_MONTHS = 48;

export async function GET(req: Request): Promise<Response> {
  if (rateLimited(clientIp(req), 60)) return json({ error: "rate_limited", message: "Too many requests." }, 429);
  const q = parseForecastQuery(new URL(req.url).searchParams);
  if (!q.ok) return json({ error: "bad_query", message: "Pick a category, a country and a date." }, 400);

  const f = forecast(q.section, q.row, q.country, q.date);
  const body: Record<string, unknown> = { kind: f.kind, teaser: teaser(f) };

  // Only a signed-in reader can be Pro; nobody else pays for the store read.
  const cookie = readCookie(req, COOKIE_NAME) ?? undefined;
  if (cookie) {
    const gate = await proGate(cookie);
    if (gate.ok) {
      body.pro = true;
      body.detail = f;
      body.history = historySeries(q.section, q.row, q.country).slice(-CHART_MONTHS);
    }
  }
  return json(body, 200);
}
