// =============================================================================
// POST /api/pro/feedback: one optional answer from a signed-in subscriber
//
// Body: { source: "briefing" | "cancel", message: string }.
//
// Who may send: anyone holding a valid signed session, which proves they
// control the address in it. Not only active Pro: the cancel question is asked
// of people on their way out, and an expired subscriber who says why is worth
// hearing. Limits: a per-IP limit and a per-identity daily cap in the store.
//
// Where it goes: the subscriber's own record first (so nothing is lost if mail
// is down), then ONE fixed inbox (FEEDBACK_INBOX). The recipient is never read
// from the request. See src/lib/pro/feedback.ts.
// =============================================================================

import { billingStatus } from "@/lib/billing/config";
import { COOKIE_NAME, verify } from "@/lib/billing/entitlement";
import { clientIp, json, rateLimited, readCookie } from "@/lib/billing/http";
import { emailKey, resolveStore } from "@/lib/billing/store";
import { accessForKey } from "@/lib/billing/subscription";
import {
  DAILY_MAX,
  appendFeedback,
  buildFeedbackEmail,
  parseFeedbackInput,
  sendFeedbackEmail,
} from "@/lib/pro/feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PER_MINUTE = 5;

export async function POST(req: Request): Promise<Response> {
  if (rateLimited(clientIp(req), MAX_PER_MINUTE)) {
    return json({ error: "rate_limited", message: "Too many messages. Try again in a minute." }, 429);
  }

  const store = resolveStore();
  const secret = process.env.BILLING_SESSION_SECRET ?? "";
  if (!billingStatus().sessionsReady || !store || !secret) {
    return json({ error: "not_configured", message: "This is not available right now." }, 503);
  }

  const now = Math.floor(Date.now() / 1000);
  const entitlement = verify(readCookie(req, COOKIE_NAME), secret, now);
  if (!entitlement?.email) {
    return json({ error: "not_signed_in", message: "Sign in to send this." }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_body", message: "Expected a JSON object." }, 400);
  }
  const input = parseFeedbackInput(body);
  if (!input.ok) return json({ error: "invalid", message: input.message }, 400);

  const key = emailKey(entitlement.email, secret);
  if ((await store.incrementWindow(`feedback:day:${key}`, 86_400)) > DAILY_MAX) {
    return json({ error: "rate_limited", message: "Thanks, we have plenty from you today. Try again tomorrow." }, 429);
  }

  // Keep it first. If the mail fails, the answer is still on record.
  let kept = false;
  try {
    const raw = await store.getProDoc("feedback", key);
    await store.putProDoc("feedback", key, appendFeedback(raw, { at: now, source: input.source, message: input.message }));
    kept = true;
  } catch (err) {
    console.error(`[feedback] store failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const access = await accessForKey(store, key, now).catch(() => null);
  const record = access?.record;
  const standing = access?.pro
    ? `${record?.status === "trialing" ? "Pro trial" : "Pro"}${record?.cancelAtPeriodEnd ? ", cancelling" : ""}`
    : `not Pro (${access?.reason ?? "unknown"})`;

  const mail = buildFeedbackEmail({
    source: input.source,
    message: input.message,
    email: entitlement.email,
    standing,
    at: now,
    testMode: billingStatus().testMode,
  });
  const sent = await sendFeedbackEmail(mail);
  if (!sent.ok) console.error(`[feedback] send failed: ${sent.detail}`);

  if (!kept && !sent.ok) {
    return json({ error: "not_sent", message: "That did not go through. Please try again." }, 502);
  }
  return json({ received: true }, 200);
}
