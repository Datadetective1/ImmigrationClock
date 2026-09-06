// =============================================================================
// WHAT HAPPENS ONCE, AFTER STRIPE SAYS THE SUBSCRIPTION IS REAL
//
// Two side effects: a welcome email, and — only with recorded consent — a
// newsletter enrolment. Both are triggered from the WEBHOOK, not from the
// browser's return to /account, because the browser can be closed, reloaded,
// replayed or lied to, and Stripe's signed event is the only statement about
// this subscription that is worth acting on.
//
// IDEMPOTENCE IS THE WHOLE PROBLEM
// --------------------------------
// Stripe retries on any non-2xx, and this deployment deliberately answers 500
// when the store write fails — so redelivery is a normal event, not an edge
// case. An email cannot be un-sent. So the send is gated on a durable
// SET NX claim keyed by identity AND subscription: the first delivery wins, and
// every retry, duplicate and reordered redelivery finds the claim taken.
//
// The claim is taken BEFORE the send. That direction is deliberate: claiming
// first risks losing an email if the process dies between claim and send, and
// sending first risks sending twice. One is a customer who did not get a nice
// email and still has everything they paid for; the other is a customer who
// thinks they were charged twice. The recoverable failure is the right one.
//
// NOTHING HERE MAY AFFECT THE SUBSCRIPTION
// ----------------------------------------
// Every path swallows its errors and returns a report. An entitlement that
// depends on an email provider is an entitlement that vanishes when that
// provider has a bad afternoon — and the money has already moved by this point.
// =============================================================================

import { billingOrigin, billingStatus } from "./config";
import { enrollProSubscriber, redactEmail, type EnrollmentOutcome } from "./newsletter-enrollment";
import { buildProWelcomeEmail } from "./welcome-email";
import type { SubscriberRecord, SubscriberStore } from "./store";

/**
 * How long a spent welcome claim is remembered.
 *
 * LONGER THAN ANY SUBSCRIPTION, not merely longer than a retry window. At 400
 * days the claim expired under a live subscription, so the next renewal found
 * no claim and greeted a two-year subscriber with "Welcome to Pro". It is one
 * small key per subscription; there is no reason to reclaim the space.
 */
const CLAIM_TTL_SECONDS = 10 * 365 * 86_400;

export interface OnboardingReport {
  welcome: "sent" | "already_sent" | "skipped" | "failed";
  newsletter: EnrollmentOutcome;
  detail: string;
}

export interface OnboardingInput {
  store: SubscriberStore;
  identityKey: string;
  record: SubscriberRecord;
  /** The raw Stripe subscription object from the event. */
  subscription: Record<string, unknown>;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

/**
 * The billing interval and amount, straight from the Stripe price on the
 * subscription item.
 *
 * Read from the EVENT rather than from our own plan catalogue: the catalogue
 * says what we advertise, and Stripe says what was actually set up. If they
 * ever disagree, the customer's bank statement will agree with Stripe.
 */
export function priceFactsOf(subscription: Record<string, unknown>): {
  interval: "month" | "year";
  amountMinor: number | null;
  currency: string | null;
} {
  const items = (subscription.items as { data?: unknown[] } | undefined)?.data ?? [];
  const first = (items[0] ?? {}) as { price?: Record<string, unknown> };
  const price = first.price ?? {};
  const recurring = price.recurring as { interval?: unknown } | undefined;
  const interval = recurring?.interval === "year" ? "year" : "month";
  const amountMinor = typeof price.unit_amount === "number" ? price.unit_amount : null;
  const currency = typeof price.currency === "string" ? price.currency : null;
  return { interval, amountMinor, currency };
}

export async function runProOnboarding(input: OnboardingInput): Promise<OnboardingReport> {
  const { store, identityKey, record, subscription } = input;
  const env = input.env ?? (process.env as Record<string, string | undefined>);

  if (!record.email) {
    return { welcome: "skipped", newsletter: "no_consent", detail: "no verified address on the record" };
  }


  const subscriptionId = typeof subscription.id === "string" ? subscription.id : "unknown";
  const token = `welcome:${identityKey}:${subscriptionId}`;
  // A SEPARATE CLAIM FOR THE NEWSLETTER, because the two have opposite failure
  // modes. An email cannot be un-sent, so its claim is taken BEFORE the attempt.
  // An enrolment that failed has not happened, so its claim is taken only AFTER
  // it succeeds — otherwise one Resend timeout silently discarded a consent
  // that could never be retried, since Stripe had already been told 200.
  const newsletterToken = `newsletter:${identityKey}:${subscriptionId}`;
  const consented = record.newsletterConsent?.granted === true;

  // ---- ONE PER IDENTITY PER SUBSCRIPTION ----------------------------------
  let claimed = false;
  try {
    claimed = await store.claimOnce(token, CLAIM_TTL_SECONDS);
  } catch (err) {
    // A store that cannot answer must not produce a second email. Refusing to
    // send is the safe direction: the subscription is unaffected either way.
    return {
      welcome: "skipped",
      // Do not claim this is "no consent" — the store simply could not answer.
      newsletter: consented ? "failed" : "no_consent",
      detail: `could not claim the welcome send: ${(err as Error)?.message ?? "unknown"}`,
    };
  }
  if (!claimed) {
    // The email is done. The ENROLMENT may not be — a previous run could have
    // sent the welcome and then failed against Resend — so this path still
    // tries, under its own claim.
    const retry = await enrollIfConsented();
    return {
      welcome: "already_sent",
      newsletter: retry.outcome,
      detail: `welcome already sent for this subscription · ${retry.detail}`,
    };
  }

  const facts = priceFactsOf(subscription);
  const status = billingStatus(env as never);

  // ---- THE WELCOME EMAIL --------------------------------------------------
  let welcome: OnboardingReport["welcome"] = "skipped";
  let detail = "";
  try {
    const email = buildProWelcomeEmail({
      email: record.email,
      interval: facts.interval,
      amountMinor: facts.amountMinor,
      currency: facts.currency,
      periodEnd: record.currentPeriodEnd,
      origin: billingOrigin(env as never),
      testMode: status.testMode,
      supportEmail: env.NEXT_PUBLIC_CONTACT_EMAIL || "",
    });
    const sent = await sendTransactional(record.email, email, env, input.fetchImpl);
    welcome = sent.ok ? "sent" : "failed";
    if (!sent.ok) detail = sent.detail;
  } catch (err) {
    welcome = "failed";
    detail = `welcome send threw: ${(err as Error)?.message ?? "unknown"}`;
  }

  // ---- THE NEWSLETTER, ONLY WITH CONSENT ----------------------------------
  // Runs even when the welcome email failed: they are separate promises to the
  // subscriber, and one provider hiccup must not silently drop a consented
  // enrolment as collateral.
  const enrollment = await enrollIfConsented();

  return {
    welcome,
    newsletter: enrollment.outcome,
    detail: [detail, enrollment.detail].filter(Boolean).join(" · "),
  };

  /**
   * Enrol, at most once, and only while the attempt has not already succeeded.
   *
   * The claim is taken AFTER success, so a failure leaves it available and the
   * next delivery of any activating event can try again. Reporting is honest:
   * an early return no longer says "no_consent" about somebody who consented.
   */
  async function enrollIfConsented(): Promise<{ outcome: EnrollmentOutcome; detail: string }> {
    if (!consented) return { outcome: "no_consent", detail: "no consent recorded" };

    // ALREADY DONE IS NOT WORTH REDOING. Without this every renewal re-ran the
    // whole Resend conversation for somebody long since enrolled — idempotent,
    // but pointless traffic against a marketing API on every billing cycle.
    try {
      if (await store.wasClaimed(newsletterToken)) {
        return { outcome: "already_enrolled", detail: "enrolled on an earlier event" };
      }
    } catch {
      // Cannot tell: fall through and let the idempotent enrolment decide.
    }

    const result = await enrollProSubscriber({
      email: record.email,
      consented: true,
      fetchImpl: input.fetchImpl,
      env,
    });

    if (result.outcome === "enrolled" || result.outcome === "already_enrolled") {
      try {
        await store.claimOnce(newsletterToken, CLAIM_TTL_SECONDS);
      } catch {
        // Losing the marker costs one idempotent re-enrolment, nothing more.
      }
    }
    return result;
  }
}

/**
 * Send one transactional message through Resend.
 *
 * TRANSACTIONAL, NOT MARKETING — and the difference is not cosmetic. This is
 * sent to every new subscriber regardless of newsletter consent, because it
 * confirms a transaction they initiated. It carries no unsubscribe link for the
 * same reason: there is nothing to unsubscribe from, and offering one would
 * suggest a person can opt out of being told about their own billing.
 *
 * The marketing list is a separate system with its own consent and its own
 * unsubscribe, in newsletter-enrollment.ts.
 */
async function sendTransactional(
  to: string,
  mail: { subject: string; text: string; html: string },
  env: Record<string, string | undefined>,
  fetchImpl?: typeof fetch
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const key = env.RESEND_API_KEY;
  if (!key) return { ok: false, detail: "RESEND_API_KEY is not set" };

  const base = env.RESEND_API_BASE || "https://api.resend.com";
  const from = env.RESEND_FROM_EMAIL || "Immigration Clock <noreply@immigrationclock.com>";
  const doFetch = fetchImpl ?? fetch;

  const res = await doFetch(`${base}/emails`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(env.NEXT_PUBLIC_CONTACT_EMAIL ? { reply_to: env.NEXT_PUBLIC_CONTACT_EMAIL } : {}),
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) return { ok: false, detail: `Resend returned ${res.status}` };
  return { ok: true };
}

/** A log line that names the outcome without naming the person. */
export function onboardingLogLine(email: string, report: OnboardingReport): string {
  return (
    `[billing] onboarding · ${redactEmail(email)} · welcome ${report.welcome} · ` +
    `newsletter ${report.newsletter}${report.detail ? ` · ${report.detail}` : ""}`
  );
}
