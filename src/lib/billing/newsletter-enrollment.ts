// =============================================================================
// NEWSLETTER ENROLLMENT FOR A PRO SUBSCRIBER — consented, idempotent, reversible
//
// A paid subscription and a marketing list are different relationships, and the
// only thing that may join them is an explicit act by the person. So this runs
// on ONE condition — a stored consent record against the VERIFIED identity —
// and it is written so that every way it can fail leaves the subscription
// untouched.
//
// THE ONE RULE THAT IS NOT NEGOTIABLE
// -----------------------------------
// A contact who previously UNSUBSCRIBED is never flipped back by this code.
//
// `POST /contacts` with `unsubscribed: false` is an upsert: for an address that
// opted out, it silently re-subscribes them. That is what /api/subscribe does
// today, and it is defensible there because the visitor is standing in front of
// a form whose entire purpose is the newsletter. Here the person is buying a
// subscription and ticking a secondary box, which is much weaker evidence that
// they meant to reverse an earlier opt-out — and re-subscribing somebody who
// deliberately left is the kind of mistake that ends in a spam complaint
// against a domain this project needs for transactional mail.
//
// So the contact is READ first, and an existing opt-out is reported for an
// operator rather than overridden. The consent is still recorded on our side,
// so the evidence exists if it is ever reconciled deliberately.
//
// WHY IT NEVER THROWS
// -------------------
// Enrollment happens after money has moved. Nothing here may fail a webhook,
// revoke access, or make Stripe retry: an entitlement that depends on a
// marketing API being up is an entitlement that disappears when Resend has a
// bad afternoon. Every path returns an outcome; the caller logs it.
// =============================================================================

import {
  LANGUAGE_PROPERTY,
  parseLocale,
  planSegments,
  segmentEnvVar,
  segmentIdFor,
} from "@/lib/newsletter/subscriber-language";
import type { Locale } from "@/lib/newsletter/types";

/**
 * English, and deliberately not negotiated.
 *
 * The Pro purchase flow is English-only — /pricing, the checkout copy and this
 * email are all English — so filing the subscriber anywhere else would record a
 * preference they never expressed. A subscriber who wants another language can
 * say so on the newsletter form, which asks; this one does not, so it must not
 * guess. The segment resolves through the existing chain:
 * RESEND_SEGMENT_EN -> RESEND_AUDIENCE_EN -> RESEND_NEWSLETTER_SEGMENT_ID.
 */
export const PRO_NEWSLETTER_LOCALE: Locale = "en";

export type EnrollmentOutcome =
  /** Consent recorded, contact present in the segment. */
  | "enrolled"
  /** Already a member and already subscribed. Nothing to do. */
  | "already_enrolled"
  /** They previously opted out. Untouched, deliberately. */
  | "previously_unsubscribed"
  /** No consent was given. Nothing was sent to Resend at all. */
  | "no_consent"
  /** Resend is not configured, or no segment exists for this locale. */
  | "not_configured"
  /** Something failed upstream. Logged for retry; access is unaffected. */
  | "failed";

export interface EnrollmentResult {
  outcome: EnrollmentOutcome;
  /** Operator-facing detail. Never contains a key or a full address. */
  detail: string;
}

export interface EnrollmentInput {
  /** The VERIFIED identity address. Never a buyer-typed Stripe email. */
  email: string;
  consented: boolean;
  apiKey?: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
  env?: Record<string, string | undefined>;
}

const TIMEOUT_MS = 8_000;

/** An address, reduced to something safe to log. */
export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export async function enrollProSubscriber(input: EnrollmentInput): Promise<EnrollmentResult> {
  // CONSENT IS THE GATE, AND IT IS CHECKED BEFORE ANYTHING ELSE. No request is
  // made for someone who did not ask; an unchecked box must not produce so much
  // as a lookup against a marketing provider.
  if (!input.consented) return { outcome: "no_consent", detail: "no consent recorded" };

  const env = input.env ?? (process.env as Record<string, string | undefined>);
  const key = input.apiKey ?? env.RESEND_API_KEY;
  if (!key) return { outcome: "not_configured", detail: "RESEND_API_KEY is not set" };

  const segmentId = segmentIdFor(PRO_NEWSLETTER_LOCALE, env);
  if (!segmentId) {
    return {
      outcome: "not_configured",
      detail: `no ${segmentEnvVar(PRO_NEWSLETTER_LOCALE)} configured — consent is stored, delivery is not possible yet`,
    };
  }

  const base = input.apiBase ?? env.RESEND_API_BASE ?? "https://api.resend.com";
  const doFetch = input.fetchImpl ?? fetch;
  const email = input.email.trim().toLowerCase();

  const call = async (path: string, method: "GET" | "POST" | "PATCH" | "DELETE", body?: unknown) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await doFetch(`${base}${path}`, {
        method,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    // ---- 1. WHO IS THIS ALREADY? ------------------------------------------
    // Read before write, so an existing opt-out is discovered rather than
    // overwritten. A 404 means they are new.
    let existing: { unsubscribed?: boolean; properties?: Record<string, unknown> } | null = null;
    const lookup = await call(`/contacts/${encodeURIComponent(email)}`, "GET");
    if (lookup.ok) {
      existing = (await lookup.json().catch(() => null)) as {
        unsubscribed?: boolean;
        properties?: Record<string, unknown>;
      } | null;
    } else if (lookup.status !== 404) {
      return { outcome: "failed", detail: `contact lookup returned ${lookup.status}` };
    }

    if (existing?.unsubscribed === true) {
      // THE LINE THIS CODE WILL NOT CROSS. Their consent is stored on our side;
      // reversing an explicit opt-out is an operator decision, not a side
      // effect of buying a subscription.
      return {
        outcome: "previously_unsubscribed",
        detail: `${redactEmail(email)} opted out previously — consent recorded, NOT re-subscribed`,
      };
    }

    // ---- 2. WHICH LANGUAGE IS THIS PERSON'S? ------------------------------
    //
    // A CONTACT WHO ALREADY CHOSE ONE KEEPS IT. The Pro flow is English-only, so
    // "en" is the right default for somebody we have never met — but forcing it
    // onto a subscriber who picked French on the newsletter form would file them
    // under a language they cannot read, on the strength of a checkbox that
    // never mentioned language at all.
    const chosen = parseLocale(existing?.properties?.[LANGUAGE_PROPERTY]);

    // AN EXISTING CONTACT WHOSE LANGUAGE WE CANNOT READ IS LEFT ALONE.
    //
    // Defaulting to English here would move a French or Spanish subscriber onto
    // the English segment because they ticked a box that never mentioned
    // language — and contact properties are not readable on every Resend plan,
    // so "cannot read" is a normal state, not an error. For somebody we have
    // never met, English is the honest default: the whole Pro flow is English.
    if (existing && !chosen) {
      return {
        outcome: "already_enrolled",
        detail: `${redactEmail(email)} already a contact with no readable language — left in place`,
      };
    }

    const locale = chosen ?? PRO_NEWSLETTER_LOCALE;

    // ---- 3. UPSERT THE CONTACT --------------------------------------------
    if (!existing) {
      let created = await call("/contacts", "POST", {
        email,
        unsubscribed: false,
        properties: { [LANGUAGE_PROPERTY]: locale },
      });

      // CONTACT PROPERTIES ARE NOT AVAILABLE ON EVERY RESEND PLAN, and
      // /api/subscribe already learned this the hard way. Losing the language
      // record is bad; losing a consented subscriber because of it is worse,
      // and segment membership — which is what actually delivers — does not
      // depend on the property.
      if (created.status === 400 || created.status === 422) {
        const detail = await created.clone().text().catch(() => "");
        if (/propert/i.test(detail) || /unknown|unrecognized|not allowed/i.test(detail)) {
          created = await call("/contacts", "POST", { email, unsubscribed: false });
        }
      }

      if (!created.ok) {
        const detail = await created.text().catch(() => "");
        const duplicate = created.status === 409 || /already|exists|duplicate/i.test(detail);
        if (!duplicate) {
          return { outcome: "failed", detail: `contact create returned ${created.status}` };
        }
      }
    }

    // ---- 4. SEGMENT MEMBERSHIP --------------------------------------------
    //
    // LEAVE THE OTHERS FIRST. Two memberships means two copies of the same
    // newsletter in two languages — the failure /api/subscribe's reconciliation
    // exists to prevent, and joining a segment without it would reintroduce
    // exactly that for anybody who had already chosen a language.
    const plan = planSegments(locale, env);

    // NEVER SUBSTITUTE ANOTHER LANGUAGE'S SEGMENT. subscriber-language.ts states
    // the rule and the reason: a French subscriber receiving English mail they
    // cannot read, from a list they cannot find themselves on, is worse than
    // not being delivered to at all. The consent is stored either way, so this
    // is a delivery gap that closes the day the segment is configured.
    if (!plan.join) {
      return {
        outcome: "not_configured",
        detail: `no ${segmentEnvVar(locale)} configured — consent stored, delivery not possible yet`,
      };
    }

    for (const other of plan.leave) {
      try {
        const left = await call(
          `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(other)}`,
          "DELETE"
        );
        // 404 is the normal case: they were never in it.
        if (!left.ok && left.status !== 404) {
          console.error(`[billing] could not leave segment ${other} (${left.status})`);
        }
      } catch {
        // Non-fatal: the join below is what matters.
      }
    }

    const join = plan.join;
    // Separate from creation on purpose, and idempotent: re-adding an existing
    // member is a no-op, and "already a member" is the end state we want.
    const joined = await call(
      `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(join)}`,
      "POST"
    );
    if (!joined.ok) {
      const detail = await joined.text().catch(() => "");
      if (joined.status === 409 || /already|exists|duplicate/i.test(detail)) {
        return { outcome: "already_enrolled", detail: "already in the segment" };
      }
      return { outcome: "failed", detail: `segment join returned ${joined.status}` };
    }

    return {
      outcome: existing ? "already_enrolled" : "enrolled",
      detail: existing
        ? `existing contact confirmed in the ${locale} segment`
        : `contact created and enrolled in ${locale}`,
    };
  } catch (err) {
    // Never rethrow: the subscription is already paid for and stored.
    return { outcome: "failed", detail: `enrollment error: ${(err as Error)?.message ?? "unknown"}` };
  }
}
