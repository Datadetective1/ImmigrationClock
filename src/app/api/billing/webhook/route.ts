// =============================================================================
// POST /api/billing/webhook — Stripe tells us what happened
//
// THIS IS A PUBLIC URL THAT GRANTS ACCESS. Anyone on the internet can POST to
// it. The only thing separating a real Stripe event from a forged one is the
// signature, so the order of operations here is not negotiable:
//
//   1. Read the RAW body. Not req.json() — parsing and re-serialising changes
//      whitespace and key order, and the signature would never match again.
//   2. Verify the signature and the timestamp tolerance.
//   3. Only then look at what the event says.
//
// WHAT IT DOES, GIVEN THERE IS NO DATABASE
// ----------------------------------------
// It cannot write a subscription row, because there is no table. What it does
// is the part that still matters without one:
//
//   • It is the audit trail. Every handled event is logged with its type, its
//     id and the subscription status — never an email, never a card.
//   • It is the acknowledgement Stripe needs. An endpoint that errors makes
//     Stripe retry with backoff for days and eventually disable the endpoint.
//   • It is where a cancellation becomes visible to an operator today, and
//     where the revocation write will go on the day a store exists.
//
// Access itself is granted by /account exchanging a checkout session for a
// signed, short-lived claim (src/lib/billing/entitlement.ts), and lapses on its
// own. That is the honest architecture for a site with no database, and its
// limitation is written down in docs/monetization.md rather than hidden here.
//
// ALWAYS 200 FOR AN EVENT WE SIMPLY DO NOT HANDLE. Stripe sends dozens of event
// types; 400ing on the ones we ignore would teach it to retry them forever.
// =============================================================================

import { billingStatus } from "@/lib/billing/config";
import { grantsAccess, isHandledEvent, verifyWebhookSignature } from "@/lib/billing/stripe";
import { json } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StripeEvent {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}

export async function POST(req: Request): Promise<Response> {
  const status = billingStatus();
  if (!status.webhookReady) {
    // 503, not 200: an unconfigured endpoint must not look like a working one,
    // or Stripe will report deliveries as successful while nothing is verified.
    return json(
      { error: "billing_not_configured", message: status.disabledReason ?? "The webhook secret is not configured." },
      503
    );
  }

  const rawBody = await req.text();
  const check = verifyWebhookSignature(
    rawBody,
    req.headers.get("stripe-signature"),
    process.env.STRIPE_WEBHOOK_SECRET as string,
    Math.floor(Date.now() / 1000)
  );

  if (!check.ok) {
    console.error(`[billing] webhook signature rejected: ${check.reason}`);
    return json({ error: "invalid_signature", message: check.reason }, 400);
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return json({ error: "invalid_json", message: "The signed body was not JSON." }, 400);
  }

  const type = event.type ?? "";
  if (!isHandledEvent(type)) {
    return json({ received: true, handled: false, type }, 200);
  }

  const object = event.data?.object ?? {};
  const subscriptionStatus = typeof object.status === "string" ? object.status : null;
  const access = type === "customer.subscription.deleted" ? false : grantsAccess(subscriptionStatus ?? "active");

  // The audit line. Ids and statuses only — no email, no name, no card, no
  // address. These logs are readable by anyone with deployment access.
  console.log(
    `[billing] ${type} · event ${event.id ?? "unknown"} · object ${String(object.id ?? "unknown")} · ` +
      `status ${subscriptionStatus ?? "n/a"} · access ${access ? "granted" : "ended"}`
  );

  return json({ received: true, handled: true, type, access }, 200);
}

/** An operator's readiness check. Never reveals the secret or its length. */
export async function GET(): Promise<Response> {
  const status = billingStatus();
  return json({ webhookReady: status.webhookReady, testMode: status.testMode }, status.webhookReady ? 200 : 503);
}
