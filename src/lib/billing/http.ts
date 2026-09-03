// =============================================================================
// SHARED PLUMBING FOR THE BILLING ROUTES
//
// The same shapes /api/subscribe already uses — a JSON helper that never
// caches, a best-effort per-IP limiter with the same honest limitation — kept
// in one place because three billing routes need them and copying a rate
// limiter three times is how three subtly different ones appear.
// =============================================================================

export function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/**
 * Best-effort per-IP rate limiting.
 *
 * HONEST LIMITATION, the same one /api/subscribe records: serverless instances
 * are ephemeral and horizontally scaled, so this Map is per-instance and resets
 * on a cold start. It raises the cost of casual abuse and will not stop a
 * determined distributed attacker. Real protection belongs at the edge.
 *
 * Checkout is the surface that matters: each attempt creates a Stripe object.
 */
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function rateLimited(ip: string, max: number, nowMs = Date.now()): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => nowMs - t < WINDOW_MS);
  recent.push(nowMs);
  hits.set(ip, recent);
  if (hits.size > 5_000) hits.clear();
  return recent.length > max;
}

/** Test seam: the limiter is module state, and a test must be able to start clean. */
export function resetRateLimiter(): void {
  hits.clear();
}

/** Serialise a cookie the way Set-Cookie wants it. */
export function serializeCookie(c: {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: string;
  path: string;
  maxAge: number;
}): string {
  const parts = [`${c.name}=${c.value}`, `Path=${c.path}`, `Max-Age=${c.maxAge}`, `SameSite=${c.sameSite === "lax" ? "Lax" : c.sameSite}`];
  if (c.httpOnly) parts.push("HttpOnly");
  if (c.secure) parts.push("Secure");
  return parts.join("; ");
}

/** Read one cookie out of a request's Cookie header. */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}
