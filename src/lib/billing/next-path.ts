// =============================================================================
// WHERE TO GO AFTER SIGNING IN
//
// A reader who pressed "Sign in" on the Briefing should land back on the
// Briefing, not on /account with the job of finding their way again. The page
// they came from rides along as `?next=`, on the account page and on the
// emailed link.
//
// It is a value from a URL, so it is allow-listed by SHAPE before anything
// navigates to it: a same-origin path of letters, digits, "/", "_" and "-",
// whose second character is a letter or digit. That rules out "//evil.com"
// (protocol-relative), "/\evil.com", schemes, queries and fragments. /account
// and /api are refused too: one is where the reader already is, the other is
// not a page.
//
// No node imports: the sign-in form uses this in the browser.
// =============================================================================

export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v.length < 2 || v.length > 100) return null;
  if (!/^\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(v)) return null;
  if (v === "/account" || v.startsWith("/account/") || v === "/api" || v.startsWith("/api/")) return null;
  return v;
}

/** A sign-in code as typed: spaces and dashes forgiven, exactly six digits kept. */
export function normalizeLoginCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}
