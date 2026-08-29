// =============================================================================
// RESEND — the two facts the sender and the preflight must agree about
//
// WHY THIS FILE EXISTS
// --------------------
// Resend renamed Audiences to Segments. `scripts/send-newsletter.ts` was
// updated for that and `scripts/newsletter-preflight.ts` was not, so for weeks
// the two halves of one pipeline asked the same question of two different
// endpoints:
//
//   sender      GET /segments/{id}/contacts, falling back to /audiences/{id}/…
//   preflight   GET /audiences/{id}/contacts, and nothing else
//
// That is not a cosmetic divergence. Preflight treats a non-OK response as
// BLOCKING and, when every locale fails, adds "no Resend audience could be
// verified — treating delivery as unsafe". So the moment RESEND_API_KEY was
// set, the gate would have withheld delivery on four spurious 404s — reporting
// an outage at Resend, on a week when nothing was wrong with Resend at all.
//
// The lesson is the one the segment/audience env-var split already taught this
// codebase once: when two places encode one fact and nothing enforces that they
// agree, they will disagree, and the symptom will be silence. So the fact is
// declared once, here, and both callers read it.
//
// WHAT IS DELIBERATELY *NOT* HERE
// -------------------------------
// No fetching. The sender wraps its requests in a retrying `get()` with its own
// timeout and error taxonomy; the preflight uses a plain fetch with a short
// deadline because it is allowed to give up. Forcing one HTTP layer on both
// would couple far more than the thing that actually drifted.
// =============================================================================

/**
 * Where a segment's contacts can be read from, most current first.
 *
 * BOTH PATHS, IN THIS ORDER, EVERY TIME. `/segments` is what the current API
 * reference documents; `/audiences` is what existing ids were created under and
 * still resolve through. A caller that tries only one will be wrong for half
 * the accounts in existence, and which half depends on when the account was
 * set up — which is exactly the kind of environment-dependent failure that does
 * not show up until production.
 *
 * Both are read-only GETs, so trying the first and falling back costs one
 * request on an account that has migrated and nothing at all on one that has.
 */
export function contactPaths(segmentId: string): string[] {
  return [`/segments/${segmentId}/contacts`, `/audiences/${segmentId}/contacts`];
}

/**
 * How many contacts would actually receive a broadcast, from a contacts
 * response body.
 *
 * UNSUBSCRIBED CONTACTS ARE NOT RECIPIENTS. They remain in the segment and they
 * are returned by the API; counting them inflates the one number an operator
 * confirms before an irreversible send, and inflates it in the direction that
 * makes a mistake look safer than it is.
 *
 * Returns null — never 0 — when the body is not a contacts response. The
 * difference matters at both call sites: the sender prints "unknown" rather
 * than a reassuring zero, and the preflight reports a shape it did not expect
 * rather than an empty audience.
 */
export function liveContactCount(body: unknown): number | null {
  const data = (body as { data?: unknown })?.data;
  if (!Array.isArray(data)) return null;
  return data.filter((c) => !(c as { unsubscribed?: boolean })?.unsubscribed).length;
}
