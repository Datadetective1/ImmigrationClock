// =============================================================================
// THE STRIPE CLIENT — raw HTTP, on purpose, and the webhook verifier
//
// WHY NO SDK
// ----------
// The same reason the X publisher, the LinkedIn publisher and the OpenAI copy
// engine all speak HTTP directly (see the header of providers/openai.ts): this
// project's dependency list is eight packages, npm's optional-peer resolution
// has broken a CI install here before, and what we need from Stripe is three
// form-encoded POSTs and one GET. An SDK would add a dependency, a version to
// track and a bundle to ship, and would buy nothing.
//
// WHAT THIS FILE MAY NOT DO
// -------------------------
// It may not log a key, a card, an email or a request body. It may not throw a
// value that carries the secret. Errors carry the status and Stripe's own
// message, truncated, and nothing else.
//
// THE WEBHOOK SIGNATURE IS THE SECURITY BOUNDARY
// ----------------------------------------------
// A webhook endpoint is a public URL that grants access. Anyone can POST to it.
// The ONLY thing separating a real Stripe event from a forged one is the
// signature check in verifyWebhookSignature(), which is why it is implemented
// exactly to Stripe's published scheme and tested against forged, replayed,
// truncated and malformed headers rather than only the happy path.
// =============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.stripe.com/v1";

/**
 * The API version every Stripe request pins.
 *
 * WHY THIS EXACT VERSION. Managed Payments — which a Stripe account can become
 * eligible for without anything changing on our side — is rejected outright
 * below `2025-03-31.basil`:
 *
 *   Stripe returned HTTP 400: Managed Payments is not supported on API version
 *   2024-06-20. Update your API version, or set the API Version of this
 *   request to 2025-03-31.basil or greater.
 *
 * That took checkout down in production: the button reached Stripe, Stripe
 * refused, and the reader saw "Could not start checkout".
 *
 * It is the LOWEST version that satisfies that requirement, deliberately.
 * Every version beyond it adds more breaking changes to audit against this
 * integration for no gain here, and Basil already carries one that matters —
 * see `periodEndOf`.
 *
 * Pinning at all is what stops Stripe changing a field shape under a running
 * deployment. Raise it deliberately, with the changelog open, and check what
 * moved: https://docs.stripe.com/changelog
 */
export const STRIPE_API_VERSION = "2025-03-31.basil";

/** Stripe answered, and it was not a 2xx. Carries the status, never the key. */
export class StripeError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Stripe returned HTTP ${status}: ${message}`);
    this.name = "StripeError";
    this.status = status;
  }
}

export interface StripeClientOptions {
  secretKey: string;
  /** Overridable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request deadline. Checkout happens while a person waits on a click. */
  timeoutMs?: number;
}

/** Stripe takes form encoding, including for nested fields: a[b]=c. */
export function encodeForm(data: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      parts.push(encodeForm(value as Record<string, unknown>, name));
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          parts.push(encodeForm(item as Record<string, unknown>, `${name}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  /** Our verified-identity key, set when the session was created. */
  client_reference_id?: string | null;
  status: string | null;
  payment_status: string | null;
  customer: string | null;
  customer_email: string | null;
  customer_details?: { email?: string | null } | null;
  subscription: string | null;
}

export interface SubscriptionItem {
  id?: string;
  /** Where Basil and later keep the billing period. */
  current_period_end?: number;
}

export interface Subscription {
  id: string;
  status: string;
  customer: string;
  /** Present before 2025-03-31.basil, absent after it. Read with periodEndOf. */
  current_period_end?: number;
  items?: { data?: SubscriptionItem[] };
  cancel_at_period_end?: boolean;
}

/**
 * When the paid period ends — wherever this API version keeps it.
 *
 * Basil (2025-03-31) REMOVED `current_period_end` from the subscription and
 * moved it onto each subscription item, because items can now bill on
 * different cycles. Reading only the old location returns undefined against a
 * Basil payload, and undefined is how a paying customer gets stored with
 * `currentPeriodEnd: 0` and denied access until their first renewal. That
 * exact failure has already happened here once, from a different cause.
 *
 * BOTH SHAPES ARE READ ON PURPOSE, and this is not a workaround. The version
 * of a WEBHOOK payload is set by the endpoint's own configuration in Stripe,
 * not by the `Stripe-Version` header this client sends. So an account can
 * legitimately deliver pre-Basil events to a Basil-era integration, and a
 * reader that understood only one shape would be wrong half the time.
 *
 * The MAXIMUM across items is the paid-through date. Our plan has exactly one
 * item, so the choice is theoretical today — but where it ever mattered,
 * ending access early for someone who has paid is the worse mistake.
 *
 * `items` is a paginated sublist: Stripe returns the first 10 and sets
 * `has_more`. One item means one page, so this reads everything there is. A
 * plan that ever exceeds ten items would need to page before this stayed
 * true, and would understate the paid-through date until it did.
 */
export function periodEndOf(subscription: unknown): number | undefined {
  if (!subscription || typeof subscription !== "object") return undefined;
  const sub = subscription as Subscription;

  const ends = (sub.items?.data ?? [])
    .map((item) => item?.current_period_end)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (ends.length > 0) return Math.max(...ends);

  return typeof sub.current_period_end === "number" && Number.isFinite(sub.current_period_end)
    ? sub.current_period_end
    : undefined;
}

export class StripeClient {
  private readonly secretKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: StripeClientOptions) {
    this.secretKey = opts.secretKey;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": STRIPE_API_VERSION,
      },
      body: body ? encodeForm(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const text = await res.text();
    if (!res.ok) {
      let message = text.replace(/\s+/g, " ").slice(0, 200);
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string } };
        if (parsed.error?.message) message = parsed.error.message.slice(0, 200);
      } catch {
        // Keep the raw truncation.
      }
      throw new StripeError(res.status, message);
    }
    return JSON.parse(text) as T;
  }

  /**
   * A hosted Checkout Session.
   *
   * Hosted rather than embedded: the card never touches this origin, the CSP in
   * vercel.json needs no script-src for Stripe.js, and PCI scope stays with
   * Stripe. `client_reference_id` carries our own correlation id so a webhook
   * can be tied to the click that started it without a database.
   */
  async createCheckoutSession(input: {
    priceId: string;
    successUrl: string;
    cancelUrl: string;
    /**
     * The canonical Stripe customer for this verified identity.
     *
     * PASSING THIS IS WHAT STOPS ONE PERSON OWNING TWO CUSTOMERS. Without it,
     * Stripe mints a NEW Customer for every checkout, so a subscriber who
     * bought monthly and then clicked the annual button ended up with two
     * customers and two live subscriptions billing the same card — and the
     * portal, which takes its customer id from the entitlement, could only ever
     * reach the newer one.
     */
    customerId?: string;
    /**
     * Our own verified-identity key, echoed back on every event.
     *
     * THE WEBHOOK KEYS ON THIS, not on the email the buyer typed at Stripe.
     * Trusting that typed address let anyone who paid $19 seize the record,
     * watchlist and access of any subscriber whose address they knew.
     */
    clientReferenceId?: string;
    trialDays?: number;
  }): Promise<CheckoutSession> {
    return this.request<CheckoutSession>("POST", "/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": input.priceId,
      "line_items[0][quantity]": 1,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.clientReferenceId,
      customer: input.customerId,
      allow_promotion_codes: true,
      // Stripe collects and verifies the email; we never build an email form.
      billing_address_collection: "auto",
      ...(input.trialDays ? { "subscription_data[trial_period_days]": input.trialDays } : {}),
    });
  }

  /**
   * The one Stripe Customer that belongs to a verified identity.
   *
   * Created once, at the first checkout, and reused for every later one. The
   * email is the VERIFIED address from our own magic-link flow, never a string
   * a buyer typed into Stripe.
   */
  async createCustomer(input: { email: string; identityKey: string }): Promise<{ id: string }> {
    return this.request<{ id: string }>("POST", "/customers", {
      email: input.email,
      // Opaque, and deliberately not the address: it is the same HMAC key the
      // store uses, so a Stripe dashboard export is not a list of subscribers.
      "metadata[identity_key]": input.identityKey,
    });
  }

  /** Every subscription a customer has, so a duplicate can be detected. */
  async listSubscriptions(customerId: string): Promise<{ data: Subscription[] }> {
    return this.request<{ data: Subscription[] }>(
      "GET",
      `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=100`
    );
  }

  async getCheckoutSession(id: string): Promise<CheckoutSession> {
    return this.request<CheckoutSession>("GET", `/checkout/sessions/${encodeURIComponent(id)}`);
  }

  async getSubscription(id: string): Promise<Subscription> {
    return this.request<Subscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);
  }

  /** A Customer Portal session: cancellations, card updates, invoices — Stripe's UI, not ours. */
  async createPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }> {
    return this.request<{ url: string }>("POST", "/billing_portal/sessions", {
      customer: input.customerId,
      return_url: input.returnUrl,
    });
  }
}

// -----------------------------------------------------------------------------
// WEBHOOK SIGNATURE
// -----------------------------------------------------------------------------

/**
 * Stripe's scheme, implemented exactly:
 *
 *   Stripe-Signature: t=1614556800,v1=<hex>,v1=<hex>
 *
 * The signed payload is `${t}.${rawBody}`, HMAC-SHA256 with the endpoint's
 * signing secret, hex encoded. Multiple v1 values appear while a secret is
 * being rotated, and ANY may match.
 *
 * The tolerance check is not decoration: without it a signature captured once
 * is valid forever, so an attacker who ever observes one body can replay it.
 *
 * The body MUST be the raw bytes as received. Parsing and re-serialising JSON
 * changes whitespace and key order and the signature will never match — which
 * is why the route reads `await request.text()` before anything else.
 */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

export interface SignatureCheck {
  ok: boolean;
  reason: string;
}

export function parseSignatureHeader(header: string | null): { timestamp: number; signatures: string[] } | null {
  if (!header) return null;
  let timestamp = NaN;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((s) => s?.trim() ?? "");
    if (key === "t") timestamp = Number(value);
    else if (key === "v1" && value) signatures.push(value);
  }
  if (!Number.isFinite(timestamp) || timestamp <= 0 || signatures.length === 0) return null;
  return { timestamp, signatures };
}

export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = WEBHOOK_TOLERANCE_SECONDS
): SignatureCheck {
  if (!secret) return { ok: false, reason: "no signing secret is configured" };

  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "the Stripe-Signature header is missing or malformed" };

  const age = Math.abs(nowSeconds - parsed.timestamp);
  if (age > toleranceSeconds) {
    return { ok: false, reason: `the signature is ${age}s old, outside the ${toleranceSeconds}s tolerance` };
  }

  const expected = createHmac("sha256", secret).update(`${parsed.timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const matched = parsed.signatures.some((candidate) => {
    const buf = Buffer.from(candidate);
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });

  return matched ? { ok: true, reason: "signature verified" } : { ok: false, reason: "no signature matched" };
}

// -----------------------------------------------------------------------------
// EVENTS WE ACT ON
// -----------------------------------------------------------------------------

/**
 * The four that change whether someone may use Pro. Every other Stripe event
 * is acknowledged with a 200 and ignored: a webhook that 400s on an event it
 * simply does not handle teaches Stripe to retry it forever.
 */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  // MONEY GOING BACK OUT. Without these four, refunding a subscriber in the
  // Stripe dashboard did not revoke anything: the stored record kept
  // status "active" with a future period end, and accessFor() kept saying yes
  // for the rest of the paid term — up to a year on annual, after the money
  // had been returned. A chargeback behaved the same way.
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  // A failed renewal. Stripe also moves the subscription to past_due, but that
  // event can be late or lost; this one names the failure directly.
  "invoice.payment_failed",
] as const;

/** Events that END access immediately rather than at the period end. */
export const REVOKING_EVENTS = ["charge.refunded", "charge.dispute.created"] as const;
export type HandledEvent = (typeof HANDLED_EVENTS)[number];

export function isHandledEvent(type: string): type is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

/** Stripe subscription statuses that mean "this person may use Pro right now". */
export const ACTIVE_STATUSES = ["active", "trialing"] as const;

export function grantsAccess(status: string | undefined | null): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status ?? "");
}
