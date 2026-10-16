// =============================================================================
// /api/pro/data — erase what Briefing keeps
//
// DELETE removes the subscriber's Briefing preferences, saved changes and
// alert history, and with the preferences the calendar link's version, so any
// copy of the old link stops working. The watchlist and the subscription are
// not touched: those have their own controls (/following and the billing
// portal), and erasing someone's subscription from a "clear my data" button
// would be a nasty surprise.
// =============================================================================

import { json } from "@/lib/billing/http";
import { PRO_DOC_KINDS } from "@/lib/billing/store";
import { proRoute } from "@/lib/pro/caller";
import { parsePrefs, serializePrefs, DEFAULT_PREFS } from "@/lib/pro/prefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: Request): Promise<Response> {
  const caller = await proRoute(req, 10);
  if (caller.error) return caller.error;
  const old = parsePrefs(await caller.store.getProDoc("prefs", caller.key));
  for (const kind of PRO_DOC_KINDS) await caller.store.deleteProDoc(kind, caller.key);
  // Keep only a bumped calendar version, so a leaked old link cannot come back
  // to life when the counter would otherwise restart at 1.
  await caller.store.putProDoc(
    "prefs",
    caller.key,
    serializePrefs({ ...DEFAULT_PREFS, calendarVersion: old.calendarVersion + 1 })
  );
  return json({ erased: true }, 200);
}
