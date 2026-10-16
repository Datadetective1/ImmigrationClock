// =============================================================================
// /api/pro/saved — saved changes
//
// GET returns the saved change ids, newest first. POST { id, saved } saves or
// unsaves one. Only ids of records that exist in the archive are accepted, so
// this cannot be used to store arbitrary text.
// =============================================================================

import { json } from "@/lib/billing/http";
import { proRoute } from "@/lib/pro/caller";
import { isKnownChange } from "@/lib/pro/feed";
import { MAX_SAVED, isChangeIdShape, parseSaved, serializeSaved, setSaved } from "@/lib/pro/saved";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const caller = await proRoute(req, 60);
  if (caller.error) return caller.error;
  const items = parseSaved(await caller.store.getProDoc("saved", caller.key));
  return json({ items, max: MAX_SAVED }, 200);
}

export async function POST(req: Request): Promise<Response> {
  const caller = await proRoute(req);
  if (caller.error) return caller.error;
  let id: unknown;
  let saved: unknown;
  try {
    ({ id, saved } = (await req.json()) as { id?: unknown; saved?: unknown });
  } catch {
    return json({ error: "bad_body", message: "Expected { id: string, saved: boolean }." }, 400);
  }
  if (!isChangeIdShape(id) || typeof saved !== "boolean") {
    return json({ error: "bad_body", message: "Expected { id: string, saved: boolean }." }, 400);
  }
  if (saved && !isKnownChange(id)) return json({ error: "unknown_change", message: "No recorded change has that id." }, 404);

  const current = parseSaved(await caller.store.getProDoc("saved", caller.key));
  const result = setSaved(current, id, saved, caller.now);
  if (result.full) {
    return json({ error: "full", message: `You can save up to ${MAX_SAVED} changes. Remove one to save another.` }, 409);
  }
  await caller.store.putProDoc("saved", caller.key, serializeSaved(result.items));
  return json({ id, saved, count: result.items.length }, 200);
}
