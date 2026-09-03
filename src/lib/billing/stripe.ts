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
  status: string | null;
  payment_status: string | null;
  customer: string | null;
  customer_email: string | null;
  customer_details?: { email?: string | null } | null;
  subscription: string | null;
}

export interface Subscription {
  id: string;
  status: string;
  customer: string;
  current_period_end: number;
  cancel_at_period_end?: boolean;
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
        // Pinning the version means Stripe cannot change a field shape under a
        // running deployment. Update it deliberately, with the changelog open.
        "Stripe-Version": "2024-06-20",
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
      allow_promotion_codes: true,
      // Stripe collects and verifies the email; we never build an email form.
      billing_address_collection: "auto",
      ...(input.trialDays ? { "subscription_data[trial_period_days]": input.trialDays } : {}),
    });
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
] as const;
export type HandledEvent = (typeof HANDLED_EVENTS)[number];

export function isHandledEvent(type: string): type is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

/** Stripe subscription statuses that mean "this person may use Pro right now". */
export const ACTIVE_STATUSES = ["active", "trialing"] as const;

export function grantsAccess(status: string | undefined | null): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status ?? "");
}
