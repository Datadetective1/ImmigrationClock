// =============================================================================
// /api/pro/prefs — Briefing delivery preferences
//
// GET returns the preferences and the private calendar URL. POST takes any of
// { frequency, relevance, reminders } and merges them over what is stored;
// { resetCalendar: true } revokes the calendar link by bumping its version.
// =============================================================================

import { billingOrigin } from "@/lib/billing/config";
import { json } from "@/lib/billing/http";
import { proRoute } from "@/lib/pro/caller";
import { calendarUrl } from "@/lib/pro/calendar";
import { parsePrefs, sanitizePrefs, serializePrefs, type BriefingPrefs } from "@/lib/pro/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function body(prefs: BriefingPrefs, key: string, secret: string) {
  return {
    frequency: prefs.frequency,
    relevance: prefs.relevance,
    reminders: prefs.reminders,
    summary: prefs.summary,
    calendarUrl: calendarUrl(billingOrigin(), key, prefs.calendarVersion, secret),
  };
}

export async function GET(req: Request): Promise<Response> {
  const caller = await proRoute(req);
  if (caller.error) return caller.error;
  const prefs = parsePrefs(await caller.store.getProDoc("prefs", caller.key));
  return json(body(prefs, caller.key, caller.secret), 200);
}

export async function POST(req: Request): Promise<Response> {
  const caller = await proRoute(req);
  if (caller.error) return caller.error;
  let input: Record<string, unknown>;
  try {
    input = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "bad_body", message: "Expected a JSON object." }, 400);
  }
  if (!input || typeof input !== "object") return json({ error: "bad_body", message: "Expected a JSON object." }, 400);

  const current = parsePrefs(await caller.store.getProDoc("prefs", caller.key));
  // calendarVersion is never taken from the body: the only way to change it is
  // to revoke, which only ever moves it forward.
  const { calendarVersion: _ignored, ...rest } = input;
  void _ignored;
  const next = sanitizePrefs(rest, current);
  if (input.resetCalendar === true) next.calendarVersion = current.calendarVersion + 1;

  await caller.store.putProDoc("prefs", caller.key, serializePrefs(next));
  return json({ ...body(next, caller.key, caller.secret), saved: true }, 200);
}
