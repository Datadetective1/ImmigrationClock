// =============================================================================
// FREE VISA BULLETIN ALERTS
//
// A free email, once a month, when ImmigrationClock publishes a new Visa
// Bulletin month: the two dates for the one category and country the reader
// picked, how they moved, and a way into the Pro free trial.
//
// WHAT IS KEPT, AND WHAT IS NOT
// -----------------------------
// Exactly four things per person: the email address, the category, the
// country, and the consent (what they agreed to and when). Nothing is stored
// until the person clicks the confirmation link in their own inbox (double
// opt-in): the pending signup lives only inside the signed link we email
// them, so an address typed by someone else is never kept.
//
// WHEN AN ALERT GOES OUT
// ----------------------
// Alerts follow THIS SITE, not the State Department. A month reaches a reader
// after it has been typed from the official PDF into ../visa-bulletin/data.ts,
// checked and deployed, and the daily send job has run with sending switched
// on (BULLETIN_ALERTS_SEND). Copy must say "when we publish each new month",
// never that we watch the State Department's site.
// =============================================================================

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Chargeability, Row } from "@/lib/visa-bulletin";

export * from "./options";
import { CONFIRM_TTL_SECONDS, isCountry, isRow } from "./options";

// -----------------------------------------------------------------------------
// WHO IS SUBSCRIBED
// -----------------------------------------------------------------------------

export interface AlertConsent {
  /** The checkbox words, verbatim. */
  text: string;
  version: string;
  /** Unix seconds: when the form was submitted. */
  givenAt: number;
  /** Unix seconds: when the confirmation link was used. */
  confirmedAt: number;
}

export interface AlertSubscriber {
  email: string;
  row: Row;
  country: Chargeability;
  consent: AlertConsent;
  /**
   * The newest bulletin month on the site when they confirmed. They saw that
   * month's dates in the confirmation, so the first alert is the month after.
   * Not personal data: it is a month id.
   */
  sinceMonth: string;
}

// -----------------------------------------------------------------------------
// SIGNED LINKS
//
// Both links are HMACs under BILLING_SESSION_SECRET with their own label, so a
// confirmation link can never be replayed as an unsubscribe link or a Pro
// alert link, and neither can be forged without the secret.
// -----------------------------------------------------------------------------

function hmac(secret: string, label: string, value: string): string {
  return createHmac("sha256", secret).update(`${label}:${value}`).digest("base64url").slice(0, 43);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export interface PendingSignup {
  email: string;
  row: Row;
  country: Chargeability;
  /** Unix seconds. */
  givenAt: number;
}

/**
 * The confirmation token carries the whole pending signup, signed. That is
 * what lets double opt-in store nothing before the click.
 */
export function confirmToken(p: PendingSignup, secret: string): string {
  const body = Buffer.from(JSON.stringify([p.email, p.row, p.country, p.givenAt])).toString("base64url");
  return `${body}.${hmac(secret, "bulletin-alert-confirm", body)}`;
}

export function readConfirmToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): PendingSignup | null {
  if (!secret || typeof token !== "string" || token.length > 600) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, hmac(secret, "bulletin-alert-confirm", body))) return null;
  try {
    const [email, row, country, givenAt] = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof email !== "string" || !isRow(row) || !isCountry(country) || typeof givenAt !== "number") return null;
    if (nowSeconds - givenAt > CONFIRM_TTL_SECONDS || givenAt - nowSeconds > 300) return null;
    return { email, row, country, givenAt };
  } catch {
    return null;
  }
}

export function unsubscribeToken(key: string, secret: string): string {
  return hmac(secret, "bulletin-alert-unsubscribe", key);
}

export function verifyUnsubscribe(key: string, token: string, secret: string): boolean {
  if (!key || !token || !secret) return false;
  return safeEqual(token, unsubscribeToken(key, secret));
}

// -----------------------------------------------------------------------------
// WHERE LINKS POINT
// -----------------------------------------------------------------------------

/**
 * The origin a link in an email must use.
 *
 * Production: the canonical site. A preview deployment: that deployment's own
 * branch address, set by Vercel itself (never read from a request header), so
 * a test signup on a preview confirms against the code that sent it.
 */
export function alertsOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.VERCEL_ENV === "preview") {
    const host = (env.VERCEL_BRANCH_URL || env.VERCEL_URL || "").trim();
    if (host) return `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }
  return (env.NEXT_PUBLIC_SITE_URL || "https://immigrationclock.com").replace(/\/$/, "");
}

export function confirmUrl(origin: string, token: string): string {
  return `${origin}/api/bulletin-alerts/confirm?t=${encodeURIComponent(token)}`;
}

export function unsubscribeUrl(origin: string, key: string, secret: string): string {
  return `${origin}/api/bulletin-alerts/unsubscribe?k=${encodeURIComponent(key)}&t=${unsubscribeToken(key, secret)}`;
}
