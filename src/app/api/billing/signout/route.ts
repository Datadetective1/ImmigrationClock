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
// THERE IS NO CSRF TOKEN, AND THERE IS ONE CHEAP CHECK INSTEAD.
//
// A token would need somewhere to live, and the worst a forged request can
// achieve here is signing somebody out: nothing is destroyed, and one email
// link undoes it. That reasoning holds, so no token.
//
// But a forced sign-out is still a nuisance an unrelated site should not be
// able to inflict — and the browser already tells us where the request came
// from, for free. `Sec-Fetch-Site: cross-site` is refused; anything else,
// INCLUDING A MISSING HEADER, is allowed, so a browser too old to send it can
// still sign out. This is a courtesy, not a security boundary, and it is
// labelled as one so nobody later mistakes it for the reason CSRF is handled.
// =============================================================================

import { clearedCookie, clearedSessionHintCookie } from "@/lib/billing/entitlement";
import { json, serializeCookie } from "@/lib/billing/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  // Absent means an older browser, not an attacker: attackers cannot remove a
  // header the browser adds. Only an explicit cross-site origin is refused.
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "cross_site", message: "Sign out from ImmigrationClock itself." }, 403);
  }

  const secure = new URL(req.url).protocol === "https:";
  const res = json({ signedOut: true }, 200);
  res.headers.append("Set-Cookie", serializeCookie(clearedCookie(secure)));
  res.headers.append("Set-Cookie", serializeCookie(clearedSessionHintCookie(secure)));
  return res;
}
