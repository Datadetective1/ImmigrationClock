// =============================================================================
// POST /api/billing/signin — "email me a sign-in link"
//
// This is what makes a paid subscription safe to sell: a subscriber who clears
// cookies, buys a new laptop or reads on a phone can get back in without asking
// a human. The first design could not do that, which is why it was scaffolding
// and not a product.
//
// IT ANSWERS THE SAME WAY TO EVERYONE. Whether or not the address belongs to a
// subscriber, the response is an identical 200 and an identical message. On an
// immigration site, an endpoint that distinguishes the two is a way to ask
// "does this person follow US immigration policy", and that is a question with
// consequences for the person being asked about.
//
// The link grants nothing by itself: opening it proves control of an address,
// and Pro still comes from a subscription record that Stripe wrote.
// =============================================================================

import { billingOrigin, billingStatus } from "@/lib/billing/config";
import { emailKey, resolveStore, tokenHash } from "@/lib/billing/store";
import {
  LOGIN_TTL_SECONDS,
  buildSignInEmail,
  isPlausibleEmail,
  loginUrl,
  newLoginToken,
} from "@/lib/billing/identity";
import { SITE } from "@/lib/site";
import { clientIp, json, rateLimited } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tight: each attempt can send an email to an address the sender chose. */
const MAX_PER_MINUTE = 3;

/** The same words on every path, so timing is the only thing left to differ. */
const ALWAYS = "Check your inbox — a sign-in link is on its way. It expires in 15 minutes.";

export async function POST(req: Request): Promise<Response> {
  const status = billingStatus();
  const store = resolveStore();

  if (!status.sessionsReady || !store) {
    return json(
      {
        error: "signin_not_configured",
        message: !store
          ? "No subscriber store is configured (KV_REST_API_URL and KV_REST_API_TOKEN)."
          : "BILLING_SESSION_SECRET is not configured.",
      },
      503
    );
  }

  if (rateLimited(clientIp(req), MAX_PER_MINUTE)) {
    return json({ error: "rate_limited", message: "Too many attempts. Try again in a minute." }, 429);
  }

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    if (typeof body.email === "string") email = body.email.trim();
  } catch {
    // Falls through to the shape check.
  }

  // A malformed address is the one case that can differ, because it reveals
  // nothing about anybody: it is a statement about the string, not the person.
  if (!isPlausibleEmail(email)) {
    return json({ error: "bad_email", message: "That does not look like an email address." }, 400);
  }

  const secret = process.env.BILLING_SESSION_SECRET as string;
  const key = emailKey(email, secret);

  try {
    // A LINK GOES TO ANY VALID ADDRESS, NOT ONLY TO EXISTING SUBSCRIBERS.
    //
    // Identity now comes BEFORE payment: checkout refuses to create a Stripe
    // customer or a session until this site has proved control of the address,
    // because the previous design took the buyer's word for it at Stripe and
    // that let $19 seize any subscriber's account. So someone who has never
    // paid must be able to verify themselves in order to become a customer.
    //
    // Opening the link still grants NOTHING but a verified identity: Pro comes
    // from a subscription record that Stripe wrote, checked separately.
    //
    // THE ADDRESS TRAVELS WITH THE TOKEN. emailKey() is a one-way HMAC, so a
    // first-time verifier's address cannot be recovered from the key, and
    // checkout needs it to create the Stripe customer. Storing it here keeps it
    // inside the token's own 15-minute TTL rather than writing a permanent row
    // for every address anyone types.
    const token = newLoginToken();
    await store.putLoginToken(
      tokenHash(token, secret),
      JSON.stringify({ k: key, e: email.trim().toLowerCase() }),
      LOGIN_TTL_SECONDS
    );
    await sendSignInEmail(email, loginUrl(billingOrigin(), token));
  } catch (err) {
    // Log for us, identical answer for them: an error here must not become a
    // side channel that says whether the address exists.
    console.error(`[billing] signin request failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return json({ ok: true, message: ALWAYS }, 200);
}

/**
 * Send through Resend, the provider the newsletter already uses.
 *
 * Throws on failure so the caller logs it. Never includes the address in the
 * thrown message.
 */
async function sendSignInEmail(to: string, link: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured; no sign-in link can be sent");

  const base = process.env.RESEND_API_BASE || "https://api.resend.com";
  const from = process.env.RESEND_FROM_EMAIL || "Immigration Clock <noreply@immigrationclock.com>";
  const mail = buildSignInEmail(link, SITE.name);

  const res = await fetch(`${base}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(process.env.NEXT_PUBLIC_CONTACT_EMAIL ? { reply_to: process.env.NEXT_PUBLIC_CONTACT_EMAIL } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`Resend returned HTTP ${res.status}`);
}
