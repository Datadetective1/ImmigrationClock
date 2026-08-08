// =============================================================================
// POST /api/subscribe — the only server-side surface on this site
//
// Adds an address to the Resend audience behind the weekly Immigration Pulse,
// then sends a welcome email so the subscription is confirmed in the subscriber's
// own inbox rather than only in our dashboard.
//
// THIS IS A PUBLIC, UNAUTHENTICATED ENDPOINT that writes to a mailing list, so
// it is written for the internet rather than for the happy path:
//
//   • It never reports whether an address is already subscribed. Doing so turns
//     a signup box into an account-enumeration oracle — "is this person a
//     reader of an immigration site" is exactly the kind of question this
//     platform's audience cannot afford to have answered.
//   • It rate-limits per IP, best-effort (see RATE_LIMIT).
//   • It carries a honeypot field that real users never fill.
//   • It never echoes the Resend response back to the client. Upstream errors
//     become a generic failure; the detail goes to the server log.
//
// SINGLE OPT-IN. The address is added on submit and a welcome email follows.
// Double opt-in — where the address is only stored after the recipient clicks a
// confirmation link — is stronger, both against list-poisoning and for GDPR
// consent evidence, and it is recorded as a roadmap item rather than done here.
// It needs a token store or signed-token flow and a second route, which is more
// surface than this launch should add. The welcome email is what makes single
// opt-in defensible: nobody is added silently.
// =============================================================================

import { isPlausibleEmail } from "@/lib/newsletter";
import { buildWelcomeEmail, unsubscribeHeader } from "@/lib/welcome-email";
import { SITE } from "@/lib/site";

// Node runtime: this calls a third-party API with a secret and does not need to
// run at the edge.
export const runtime = "nodejs";
// Never prerender or cache a mutation.
export const dynamic = "force-dynamic";

/**
 * Resend's base URL. Overridable ONLY so the signup can be exercised end-to-end
 * against a local stub without anyone's live API key — the alternative is
 * testing the happy path in production against a real audience. Unset in every
 * real deployment, which is the value that matters.
 */
const RESEND_API = process.env.RESEND_API_BASE || "https://api.resend.com";
const UPSTREAM_TIMEOUT_MS = 10_000;

/**
 * The sender. Configurable, defaulting to the address whose domain is verified
 * in Resend. Transactional mail must not come from the human inbox — a reply to
 * a welcome email should reach a person, which is why replyTo is separate.
 */
const FROM = process.env.RESEND_FROM_EMAIL || "Immigration Clock <noreply@immigrationclock.com>";
const REPLY_TO = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "";

/**
 * Best-effort per-IP rate limiting.
 *
 * HONEST LIMITATION: serverless instances are ephemeral and horizontally scaled,
 * so this Map is per-instance and resets on cold start. It raises the cost of
 * casual abuse and will not stop a determined distributed attacker. Real
 * protection belongs at the edge (Vercel WAF / Cloudflare), and that is recorded
 * in ROADMAP.md rather than pretended to here.
 */
const RATE_LIMIT = { windowMs: 60_000, max: 5 };
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  // Bound the map so a long-lived instance cannot grow it without limit.
  if (hits.size > 5_000) hits.clear();
  return recent.length > RATE_LIMIT.max;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function resend(path: string, key: string, payload?: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(`${RESEND_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // Segment assignment is a bodyless POST — the ids are in the path.
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Put the contact in the segment the weekly broadcast targets.
 *
 * WHY THIS IS A SEPARATE CALL, not `segments: [{ id }]` on contact creation.
 * Two reasons, both about failure:
 *
 *   • A bad or revoked segment id would make the CREATE fail, losing the
 *     subscriber entirely. Assignment is the less important half of this
 *     operation and must not be able to take the important half down with it.
 *   • It has to run for contacts that already exist. Someone who signed up
 *     before this segment existed hits the duplicate branch, where no contact
 *     is created and `segments` on the create call would never be sent. Running
 *     the same step on both paths is what makes a retry actually repair
 *     something rather than no-op.
 *
 * Idempotent by construction: Resend treats re-adding an existing member as a
 * no-op, and the "already" case is read as success either way. Calling this
 * twice for the same address cannot produce a duplicate.
 *
 * NEVER throws and never fails the signup. The address is stored by this point;
 * telling the visitor their signup failed would produce a duplicate attempt for
 * a problem only an operator can fix. A loud server log is the right channel.
 */
async function addToSegment(email: string, key: string): Promise<void> {
  const segmentId = process.env.RESEND_NEWSLETTER_SEGMENT_ID?.trim();

  // Not configured is a known gap, not a failure — the same rule the Congress
  // adapter and the send script follow. It is logged at error level anyway,
  // because the consequence is subscribers who never receive an issue.
  if (!segmentId) {
    console.error(
      "[subscribe] RESEND_NEWSLETTER_SEGMENT_ID is not set — the contact was stored but NOT " +
        "added to the Immigration Pulse segment, so this subscriber will not receive the " +
        "weekly broadcast. See docs/newsletter.md §5."
    );
    return;
  }

  // Encoded because both values land in the URL path. The address is already
  // validated, but building a path out of user input without encoding it is the
  // kind of thing that is only ever one validation bug away from a real problem.
  const path = `/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segmentId)}`;

  try {
    const res = await resend(path, key);
    if (res.ok) return;

    const detail = await res.text().catch(() => "");
    // Already a member. The point of the call is the end state, not the change.
    if (res.status === 409 || /already|exists|duplicate/i.test(detail)) return;

    console.error(
      `[subscribe] could not add contact to segment (${res.status}): ${detail.slice(0, 300)} — ` +
        "the contact exists but will not receive the weekly broadcast. Check that " +
        "RESEND_NEWSLETTER_SEGMENT_ID names a segment in this Resend account."
    );
  } catch (err) {
    console.error(`[subscribe] segment assignment failed: ${(err as Error)?.message}`);
  }
}

export async function POST(req: Request): Promise<Response> {
  const key = process.env.RESEND_API_KEY;

  // Configuration is a server problem, not the visitor's fault, and it must not
  // masquerade as success. The UI only renders the form when the key is set at
  // build time, so reaching this branch means the deployment drifted.
  if (!key) {
    console.error("[subscribe] RESEND_API_KEY is not configured");
    return json(
      { ok: false, error: "Signups are not available right now. Nothing was stored." },
      503
    );
  }

  let body: { email?: unknown; consent?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Malformed request." }, 400);
  }

  // Honeypot: a hidden field no human sees. Silently accept so a bot learns
  // nothing from the response, but store nothing.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json({ ok: true }, 200);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!isPlausibleEmail(email)) {
    return json({ ok: false, error: "That does not look like an email address." }, 400);
  }

  // Consent is recorded as an explicit act, not inferred from submission.
  if (body.consent !== true) {
    return json({ ok: false, error: "Please confirm you want the weekly email." }, 400);
  }

  if (rateLimited(clientIp(req))) {
    return json({ ok: false, error: "Too many attempts. Try again in a minute." }, 429);
  }

  // ---- Store the contact -----------------------------------------------------
  // Account-level contacts. Resend Audiences are deprecated and the current
  // Contacts API no longer takes an audience id — this is the REST equivalent of
  // `resend.contacts.create({ email, unsubscribed: false })`, called with fetch
  // rather than the SDK so the project keeps its dependency-light build and this
  // route stays a single file with no runtime package to track.
  let contactRes: Response;
  try {
    contactRes = await resend("/contacts", key, { email, unsubscribed: false });
  } catch (err) {
    console.error(`[subscribe] contact request failed: ${(err as Error)?.message}`);
    return json({ ok: false, error: "We could not reach the email service. Try again shortly." }, 502);
  }

  if (!contactRes.ok) {
    const detail = await contactRes.text().catch(() => "");
    // A duplicate is a success from the visitor's point of view, and saying
    // otherwise would confirm that the address is on the list.
    const duplicate = contactRes.status === 409 || /already|exists|duplicate/i.test(detail);
    if (!duplicate) {
      // A sending-only API key can send email but cannot create contacts, which
      // fails HERE and nowhere else — the welcome email would still go out, so
      // the symptom is "subscribers receive mail but the list stays empty".
      // Named explicitly because that is a genuinely confusing thing to debug
      // from a generic 502.
      if (contactRes.status === 401 || contactRes.status === 403) {
        console.error(
          `[subscribe] Resend rejected contact creation (${contactRes.status}). ` +
            "Creating contacts requires a FULL ACCESS API key; a sending-only key is not enough. " +
            "Check the key's permission at https://resend.com/api-keys — and run " +
            "`node scripts/verify-resend.mjs` to confirm."
        );
      } else {
        console.error(`[subscribe] Resend contact ${contactRes.status}: ${detail.slice(0, 300)}`);
      }
      return json({ ok: false, error: "We could not complete the signup. Try again shortly." }, 502);
    }
    // Already subscribed: report the same success, and do not re-send a welcome.
    //
    // Segment assignment still runs. This is what makes the endpoint safe to
    // retry AND what backfills anyone who subscribed before the segment
    // existed: re-submitting a known address repairs its membership instead of
    // quietly doing nothing.
    await addToSegment(email, key);
    return json({ ok: true }, 200);
  }

  // ---- Segment membership ----------------------------------------------------
  // The contact is account-level; the segment is what the weekly broadcast
  // actually targets. A contact outside it is stored and unreachable.
  await addToSegment(email, key);

  // ---- Welcome email ---------------------------------------------------------
  // A failure here does NOT fail the request: the address is already stored, and
  // telling someone their signup failed when it succeeded would be a lie that
  // produces a duplicate attempt.
  try {
    const welcome = buildWelcomeEmail(SITE.url, REPLY_TO);
    const unsubHeader = unsubscribeHeader(REPLY_TO);
    const mailRes = await resend("/emails", key, {
      from: FROM,
      to: [email],
      ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
      subject: welcome.subject,
      text: welcome.text,
      html: welcome.html,
      // Makes Gmail and Apple Mail render their own unsubscribe control, which
      // is both a courtesy and a deliverability signal: readers who can find
      // the unsubscribe use it instead of marking the message as spam.
      ...(unsubHeader ? { headers: { "List-Unsubscribe": unsubHeader } } : {}),
    });
    if (!mailRes.ok) {
      console.error(`[subscribe] welcome email ${mailRes.status}: ${(await mailRes.text().catch(() => "")).slice(0, 300)}`);
    }
  } catch (err) {
    console.error(`[subscribe] welcome email failed: ${(err as Error)?.message}`);
  }

  return json({ ok: true }, 200);
}

/** Anything other than POST is a mistake worth naming rather than a 404. */
export async function GET(): Promise<Response> {
  return json({ ok: false, error: "Use POST to subscribe." }, 405);
}
