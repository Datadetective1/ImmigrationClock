// =============================================================================
// POST /api/billing/signout — give this browser back to nobody
//
// WHAT IT DOES NOT DO IS THE POINT. It clears the entitlement cookie and
// nothing else. The account keeps its subscription, and it keeps its watchlist:
// signing out of a browser is not a request to be forgotten, and a person who
// signs out on a library machine and back in at home must find their follows
// where they left them.
//
// So: no store write, no watchlist delete, no subscription change. One expired
// cookie.
//
// There is no CSRF token here because there is nothing to protect. The worst a
// forged request can achieve is signing somebody out, which they can do
// themselves, which destroys nothing, and which they undo with one email link.
// =============================================================================

import { clearedCookie, clearedSessionHintCookie } from "@/lib/billing/entitlement";
import { json, serializeCookie } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const secure = new URL(req.url).protocol === "https:";
  const res = json({ signedOut: true }, 200);
  res.headers.append("Set-Cookie", serializeCookie(clearedCookie(secure)));
  res.headers.append("Set-Cookie", serializeCookie(clearedSessionHintCookie(secure)));
  return res;
}
