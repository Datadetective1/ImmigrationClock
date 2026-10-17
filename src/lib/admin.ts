// =============================================================================
// WHO MAY SEE THE ADMIN WORKSPACE
//
// Operational pages (data refresh status, newsletter builds, pipeline health,
// billing readiness) used to be public: hidden from navigation and search, but
// served to anyone who typed the address. Hiding a link is not access control.
//
// Two ways in, both checked on the server for every request:
//   • a person: a verified emailed-link session whose address is on the
//     ADMIN_EMAILS allowlist (comma-separated, server-only). Anyone can verify
//     an address, so the allowlist, not the session, is the authority;
//   • a machine (the smoke and pipeline-health workflows): MONITOR_TOKEN as a
//     bearer token, for /api/admin/* only.
//
// Everyone else gets a 404, so the workspace does not advertise itself. With
// ADMIN_EMAILS unset nobody is an admin, which is the safe default.
//
// Each admin PAGE calls requireAdminPage() itself. A check in a shared layout
// alone is not enough: layouts are not re-rendered on client-side navigation
// between pages beneath them, so a page's content could be fetched without it.
// =============================================================================

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { COOKIE_NAME, isVerifiedIdentity, verify } from "@/lib/billing/entitlement";
import { clientIp, json, rateLimited, readCookie } from "@/lib/billing/http";

type Env = Record<string, string | undefined>;

/** The allowlist, normalised. Empty when unset. */
export function adminEmails(env: Env = process.env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"))
  );
}

/** A verified session whose address is on the allowlist. */
export function isAdminSession(cookieValue: string | undefined | null, nowSeconds: number, env: Env = process.env): boolean {
  const secret = env.BILLING_SESSION_SECRET ?? "";
  const allowed = adminEmails(env);
  if (!secret || allowed.size === 0 || !cookieValue) return false;
  const entitlement = verify(cookieValue, secret, nowSeconds);
  if (!isVerifiedIdentity(entitlement, nowSeconds)) return false;
  return allowed.has(entitlement!.email.trim().toLowerCase());
}

/** `Authorization: Bearer <MONITOR_TOKEN>`, compared in constant time. */
export function monitorAuthorized(header: string | null, env: Env = process.env): boolean {
  const token = (env.MONITOR_TOKEN ?? "").trim();
  if (!token || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** For admin pages: renders the page for an admin, a 404 for anyone else. */
export function requireAdminPage(): void {
  const now = Math.floor(Date.now() / 1000);
  if (!isAdminSession(cookies().get(COOKIE_NAME)?.value, now)) notFound();
}

/** For /api/admin/* handlers: an admin session or the monitoring token, else 404. */
export function adminRoute(req: Request): Response | null {
  if (rateLimited(clientIp(req), 30)) return json({ error: "rate_limited", message: "Too many requests." }, 429);
  const now = Math.floor(Date.now() / 1000);
  if (monitorAuthorized(req.headers.get("authorization"))) return null;
  if (isAdminSession(readCookie(req, COOKIE_NAME), now)) return null;
  return json({ error: "not_found" }, 404);
}
