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

async function resend(path: string, key: string, payload: unknown): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(`${RESEND_API}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function welcomeEmail(email: string) {
  const text = [
    "You're subscribed to the Immigration Pulse.",
    "",
    "Once a week: the changes in U.S. immigration policy we can trace to an",
    "official government source — each one linked to the original document.",
    "We report what changed. We do not tell you what it means for your case,",
    "and we are not a law firm.",
    "",
    "If you did not sign up, you can ignore this email — you will not be",
    "emailed again if you unsubscribe using the link in any issue.",
    "",
    "https://immigrationclock.com/pulse",
  ].join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#0f172a;max-width:560px">
  <h1 style="font-size:18px;margin:0 0 12px">You&rsquo;re subscribed to the Immigration Pulse.</h1>
  <p style="margin:0 0 12px">Once a week: the changes in U.S. immigration policy we can trace to an official government source &mdash; each one linked to the original document.</p>
  <p style="margin:0 0 12px">We report what changed. We do not tell you what it means for your case, and we are not a law firm.</p>
  <p style="margin:0 0 12px;color:#475569;font-size:14px">If you did not sign up, you can ignore this email &mdash; and you can unsubscribe from any issue using the link at its foot.</p>
  <p style="margin:16px 0 0"><a href="https://immigrationclock.com/pulse" style="color:#0284c7">Read the latest edition</a></p>
</div>`;

  return {
    from: FROM,
    to: [email],
    ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
    subject: "You're subscribed to the Immigration Pulse",
    text,
    html,
  };
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
    return json({ ok: true }, 200);
  }

  // ---- Welcome email ---------------------------------------------------------
  // A failure here does NOT fail the request: the address is already stored, and
  // telling someone their signup failed when it succeeded would be a lie that
  // produces a duplicate attempt.
  try {
    const mailRes = await resend("/emails", key, welcomeEmail(email));
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
