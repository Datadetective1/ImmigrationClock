// =============================================================================
// IDENTITY — an emailed link, and nothing else
//
// A paid subscriber has to be able to come back on a new device. That needs
// identity, and identity is where products acquire an authentication stack
// they will maintain forever. This one does not:
//
//   • No passwords. Nothing to store, leak, reset or rate-limit into the
//     ground, and nobody reuses a password they never made.
//   • No OAuth. Signing in to an immigration site with Google tells Google
//     you use an immigration site.
//   • No auth library, no session table, no JWT parser.
//
// The email IS the identity, which is already true of the two things it has to
// agree with: Stripe knows the subscriber by billing email, and the newsletter
// knows a reader by address. Resend is already configured with a full-access
// key, so the delivery half exists.
//
// THE FLOW
//   1. "Email me a sign-in link" -> a random 32-byte token, stored HASHED
//      against the person's key with a 15-minute expiry.
//   2. The link lands; the token is exchanged ONCE (GETDEL) for the key.
//   3. The subscription is re-read from the store; if it is live, an
//      entitlement cookie is minted the same way checkout mints one.
//
// WHAT THE LINK CANNOT DO: it cannot grant Pro on its own. It proves control
// of an address; the entitlement still comes from a subscription record that
// Stripe wrote. A link emailed to someone who never paid signs them in to
// nothing.
//
// ENUMERATION: the request endpoint answers identically whether or not the
// address is a subscriber. Otherwise it becomes a way to ask "does this person
// follow US immigration policy", which on this site is a question with
// consequences.
// =============================================================================

import { randomBytes } from "node:crypto";

/** Long enough that guessing is hopeless, short enough to survive an email client. */
export const LOGIN_TOKEN_BYTES = 32;

/** Fifteen minutes. Long enough for a slow inbox, short enough that a forwarded mail is stale. */
export const LOGIN_TTL_SECONDS = 15 * 60;

export function newLoginToken(): string {
  return randomBytes(LOGIN_TOKEN_BYTES).toString("base64url");
}

/** The shape of a sign-in link. The token is a query parameter, never a path segment. */
export function loginUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/account?signin=${encodeURIComponent(token)}`;
}

/**
 * Is this plausibly an email address?
 *
 * Deliberately loose. The address is not trusted here — nothing is granted on
 * the strength of typing one, and the only consequence of a wrong address is
 * that nobody receives a link. Strict validation rejects real addresses.
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 6 && trimmed.length <= 254 && /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(trimmed);
}

export interface SignInEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * The email itself.
 *
 * Plain, short, and it says what to do if you did not ask for it. No tracking
 * pixel, no marketing, no unsubscribe footer — this is a transactional message
 * someone just requested, and dressing it as a newsletter is how it lands in
 * spam.
 */
export function buildSignInEmail(link: string, siteName: string): SignInEmail {
  const subject = `Your ${siteName} sign-in link`;
  const text = [
    `Use this link to sign in to ${siteName}:`,
    "",
    link,
    "",
    "It works once and expires in 15 minutes.",
    "",
    "If you did not ask for this, you can ignore it — nothing has changed and",
    "no one can sign in without opening the link above.",
  ].join("\n");

  const html = [
    `<p>Use this link to sign in to ${escapeHtml(siteName)}:</p>`,
    `<p><a href="${escapeHtml(link)}">Sign in to ${escapeHtml(siteName)}</a></p>`,
    `<p style="color:#64748b;font-size:14px">It works once and expires in 15 minutes.</p>`,
    `<p style="color:#64748b;font-size:14px">If you did not ask for this, you can ignore it — nothing has changed, and no one can sign in without opening the link above.</p>`,
  ].join("\n");

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
