// =============================================================================
// BUSINESS EMAIL — one human-written message, from hello@, to one person
//
// WHY THIS EXISTS
// ---------------
// hello@immigrationclock.com is a Cloudflare Email Routing address: mail sent
// TO it is forwarded to the owner's inbox, but nothing can send FROM it. The
// domain is already verified in Resend for the newsletter and sign-in links, so
// a reply to a business contact can go out through the same account at no
// extra cost, and the recipient's reply comes back through Cloudflare like any
// other message to hello@.
//
// WHY IT IS NOT REACHABLE FROM THE WEB
// ------------------------------------
// This site has no owner authentication. /admin/* pages are static and public,
// and a billing session proves only that someone controls SOME address. An
// endpoint that mails a caller-chosen recipient, behind either of those, is an
// open relay on a verified domain — the fastest way to lose the domain's
// sending reputation, and with it every sign-in link and newsletter.
//
// So this module is called only by scripts/send-business-email.ts, run by the
// owner on their own machine. The credential that authorizes a send is
// RESEND_API_KEY itself. tests/business-email.test.ts fails if anything under
// src/app or src/components imports it.
//
// WHAT THE CALLER CANNOT CHOOSE
// -----------------------------
// From and Reply-To are constants, not parameters. There is exactly one
// recipient. There is no cc, no bcc, and no arbitrary header: the only header
// a caller can influence is In-Reply-To, and only with a value that parses as
// a single Message-ID.
// =============================================================================

import { createHash } from "node:crypto";

export const BUSINESS_FROM = "Amary | ImmigrationClock <hello@immigrationclock.com>";
export const BUSINESS_REPLY_TO = "hello@immigrationclock.com";

export const LIMITS = {
  subject: 200,
  body: 20_000,
  messageId: 998,
} as const;

/** What a caller may supply. Anything else is refused, not ignored. */
const ALLOWED_FIELDS = new Set(["to", "subject", "text", "inReplyTo"]);

export interface BusinessEmail {
  to: string;
  subject: string;
  text: string;
  /** A Message-ID in angle brackets, when replying in an existing thread. */
  inReplyTo?: string;
}

export type Validation = { ok: true; email: BusinessEmail } | { ok: false; errors: string[] };

/**
 * One mailbox, no display name, no list.
 *
 * Stricter than the sign-in check on purpose: that one admits commas and angle
 * brackets because it only has to reject typos. Here the address becomes the
 * whole recipient list, so anything that could be read as two addresses, or as
 * a header, is refused.
 */
const ADDRESS =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** Single-line fields: no C0/C1 controls, DEL, or Unicode line/paragraph separators. */
// Built from code points: U+2028 and U+2029 typed literally into source end
// the line they sit on, and the escape form does not survive every editor.
const LINE_BREAKING = new RegExp(`[\\x00-\\x1f\\x7f-\\x9f${String.fromCharCode(0x2028, 0x2029)}]`);

const BOM = new RegExp(`^${String.fromCharCode(0xfeff)}`);

/** Body: the same, except tab and newline, which a letter legitimately has. */
const BODY_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

const MESSAGE_ID = /^<[^<>\s@]+@[^<>\s@]+>$/;

export function isSingleAddress(value: string): boolean {
  if (value.length > 254 || LINE_BREAKING.test(value)) return false;
  if (!ADDRESS.test(value)) return false;
  return value.split("@")[0].length <= 64;
}

export function validateBusinessEmail(input: unknown): Validation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["input must be an object"] };
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_FIELDS.has(key)) errors.push(`"${key}" cannot be set; From and Reply-To are fixed`);
  }

  // TO
  let to = "";
  if (Array.isArray(raw.to)) errors.push("exactly one recipient is allowed");
  else if (typeof raw.to !== "string") errors.push("a recipient address is required");
  else {
    to = raw.to.trim();
    if (!isSingleAddress(to)) errors.push("recipient must be a single plain email address");
  }

  // SUBJECT
  let subject = "";
  if (typeof raw.subject !== "string") errors.push("a subject is required");
  else {
    subject = raw.subject.trim();
    if (!subject) errors.push("subject is empty");
    else if (LINE_BREAKING.test(subject)) errors.push("subject cannot contain line breaks or control characters");
    else if (subject.length > LIMITS.subject) errors.push(`subject is longer than ${LIMITS.subject} characters`);
  }

  // BODY. Newlines are normalized rather than rejected: a draft saved on Windows
  // has CRLF, and that is not an attack.
  let text = "";
  if (typeof raw.text !== "string") errors.push("a message body is required");
  else {
    text = raw.text.replace(/\r\n?/g, "\n").replace(BOM, "").trim();
    if (!text) errors.push("message body is empty");
    else if (BODY_CONTROL.test(text)) errors.push("message body contains control characters");
    else if (text.length > LIMITS.body) errors.push(`message body is longer than ${LIMITS.body} characters`);
  }

  // IN-REPLY-TO, optional. Brackets are added if missing, since mail clients
  // display the id both ways.
  let inReplyTo: string | undefined;
  if (raw.inReplyTo !== undefined && raw.inReplyTo !== "") {
    if (typeof raw.inReplyTo !== "string") errors.push("In-Reply-To must be a string");
    else {
      const trimmed = raw.inReplyTo.trim();
      const bracketed = trimmed.startsWith("<") ? trimmed : `<${trimmed}>`;
      if (bracketed.length > LIMITS.messageId || LINE_BREAKING.test(bracketed) || !MESSAGE_ID.test(bracketed)) {
        errors.push("In-Reply-To must be a single Message-ID such as <abc123@mail.example.com>");
      } else inReplyTo = bracketed;
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, email: { to, subject, text, ...(inReplyTo ? { inReplyTo } : {}) } };
}

/** The exact JSON body Resend receives. From and Reply-To are not inputs. */
export function buildResendPayload(email: BusinessEmail): Record<string, unknown> {
  return {
    from: BUSINESS_FROM,
    to: [email.to],
    reply_to: BUSINESS_REPLY_TO,
    subject: email.subject,
    text: email.text,
    // Resend documents In-Reply-To and References as the way to thread a
    // reply. With only the one id known, References is that id.
    ...(email.inReplyTo ? { headers: { "In-Reply-To": email.inReplyTo, References: email.inReplyTo } } : {}),
  };
}

/**
 * Same message, same key, for 24 hours (Resend's idempotency window).
 *
 * Re-running the command after a timeout — when the first attempt may in fact
 * have gone through — returns the original email instead of sending a second
 * copy. Derived from the content, so it carries no correspondence itself.
 */
export function idempotencyKey(email: BusinessEmail): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([email.to.toLowerCase(), email.subject, email.text, email.inReplyTo ?? ""]))
    .digest("hex");
  return `manual-email/${digest.slice(0, 48)}`;
}

export interface SendOptions {
  apiKey: string;
  apiBase?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

/**
 * Send one validated message.
 *
 * Never throws, and an error string never contains the API key, the body, or
 * the raw provider response — only the HTTP status and Resend's error name,
 * which is a fixed vocabulary like "validation_error".
 */
export async function sendBusinessEmail(email: BusinessEmail, opts: SendOptions): Promise<SendResult> {
  if (!opts.apiKey) return { ok: false, error: "RESEND_API_KEY is not set" };

  // Re-validate: this function is the boundary, and a caller that skipped the
  // check must not be able to reach Resend with an unchecked recipient.
  const checked = validateBusinessEmail(email);
  if (!checked.ok) return { ok: false, error: `refused: ${checked.errors.join("; ")}` };

  const base = (opts.apiBase || "https://api.resend.com").replace(/\/+$/, "");
  const doFetch = opts.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(`${base}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey(checked.email),
      },
      body: JSON.stringify(buildResendPayload(checked.email)),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch {
    return {
      ok: false,
      error: "could not reach Resend (network error or timeout). It may or may not have sent; re-running is safe for 24 hours.",
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // A non-JSON body is reported by status alone.
  }

  if (!res.ok) {
    const name = (body as { name?: unknown } | null)?.name;
    const label = typeof name === "string" && /^[a-z_]{1,64}$/.test(name) ? `: ${name}` : "";
    return { ok: false, error: `Resend rejected the email (HTTP ${res.status}${label})` };
  }

  const id = (body as { id?: unknown } | null)?.id;
  return { ok: true, id: typeof id === "string" ? id : null };
}
