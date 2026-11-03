// =============================================================================
// /api/pro/cases : a Pro subscriber's tracked USCIS cases
//
// GET     the cases and their last known status
// POST    { receipt, consent: true }  looks the case up with USCIS once, then
//         tracks it. Refused without consent, refused for anything that is
//         not a receipt number, and refused when USCIS has no such case.
// DELETE  { receipt } stops tracking one case; { all: true } deletes them all.
//
// While case alerts are switched off (flag or credentials missing) GET answers
// with enabled: false and POST is refused, so nothing is stored that the job
// would never check.
// =============================================================================

import { json } from "@/lib/billing/http";
import { proRoute } from "@/lib/pro/caller";
import { caseAlertsReady } from "@/lib/cases/config";
import { normalizeReceipt } from "@/lib/cases/receipt";
import { MAX_CASES, addCase, parseCases, removeCase, serializeCases } from "@/lib/cases/tracked";
import { fetchCaseStatus } from "@/lib/cases/uscis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const caller = await proRoute(req, 60);
  if (caller.error) return caller.error;
  const cases = parseCases(await caller.store.getProDoc("cases", caller.key), caller.secret);
  return json({ enabled: caseAlertsReady(), max: MAX_CASES, cases }, 200);
}

export async function POST(req: Request): Promise<Response> {
  const caller = await proRoute(req, 10);
  if (caller.error) return caller.error;
  if (!caseAlertsReady()) {
    return json({ error: "not_enabled", message: "Case alerts are not switched on yet." }, 503);
  }
  let body: { receipt?: unknown; consent?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "bad_body", message: "Expected { receipt, consent }." }, 400);
  }
  const receipt = normalizeReceipt(body.receipt);
  if (!receipt) {
    return json({ error: "bad_receipt", message: "A receipt number is 3 letters and 10 digits, like EAC2190012345." }, 400);
  }
  if (body.consent !== true) {
    return json({ error: "no_consent", message: "Confirm the case is yours, or that you have the case owner's permission." }, 400);
  }

  const current = parseCases(await caller.store.getProDoc("cases", caller.key), caller.secret);
  if (current.some((c) => c.receipt === receipt)) return json({ error: "exists", message: "You already track this case." }, 409);
  if (current.length >= MAX_CASES) {
    return json({ error: "full", message: `You can track up to ${MAX_CASES} cases. Remove one to add another.` }, 409);
  }

  const looked = await fetchCaseStatus(receipt);
  if (!looked.ok) {
    const status = looked.kind === "not_found" ? 404 : looked.kind === "rejected" ? 400 : 502;
    return json({ error: looked.kind, message: looked.message }, status);
  }
  const { cases, result } = addCase(current, {
    receipt,
    formType: looked.status.formType,
    status: looked.status.status,
    addedAt: caller.now,
    consentAt: caller.now,
    lastCheckedAt: caller.now,
    lastChangedAt: null,
  });
  if (result !== "added") return json({ error: result, message: "Could not add that case." }, 409);
  await caller.store.putProDoc("cases", caller.key, serializeCases(cases, caller.secret));
  return json({ added: true, case: cases[0], description: looked.status.description }, 200);
}

export async function DELETE(req: Request): Promise<Response> {
  const caller = await proRoute(req, 30);
  if (caller.error) return caller.error;
  let body: { receipt?: unknown; all?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: "bad_body", message: "Expected { receipt } or { all: true }." }, 400);
  }
  if (body.all === true) {
    await caller.store.deleteProDoc("cases", caller.key);
    return json({ deleted: "all" }, 200);
  }
  const receipt = normalizeReceipt(body.receipt);
  if (!receipt) return json({ error: "bad_receipt", message: "Expected a receipt number." }, 400);
  const current = parseCases(await caller.store.getProDoc("cases", caller.key), caller.secret);
  const next = removeCase(current, receipt);
  if (next.length === 0) await caller.store.deleteProDoc("cases", caller.key);
  else await caller.store.putProDoc("cases", caller.key, serializeCases(next, caller.secret));
  return json({ deleted: receipt, count: next.length }, 200);
}
