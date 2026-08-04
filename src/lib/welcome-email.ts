// =============================================================================
// WELCOME EMAIL — the first thing a subscriber sees after trusting us
//
// Lives in lib/ rather than inside the API route so it can be unit-tested and
// previewed without standing up the route or holding a Resend key.
//
// WHY THIS IS BUILT THE WAY IT IS
// -------------------------------
// Email is not the web. The constraints below are not stylistic preferences —
// each one is a client that breaks if you ignore it:
//
//   • TABLES, not flexbox or grid. Outlook 2016-2021 renders through Word's
//     HTML engine, which supports neither. A div-based layout collapses to a
//     single unstyled column for a large share of professional inboxes, and
//     immigration attorneys are exactly that share.
//   • INLINE STYLES, not a <style> block. Gmail strips <head> styles on
//     forwarded mail and in some webmail contexts.
//   • NO IMAGES AT ALL, including the logo. Most clients block remote images by
//     default until the reader clicks "display images", so an image-based
//     header arrives as a broken placeholder — the worst possible first
//     impression for a product whose entire pitch is reliability. The wordmark
//     is live text, which also means it survives dark mode and screen readers.
//   • BULLETPROOF BUTTON. Outlook ignores padding on <a>, so the CTA is a table
//     cell with a background colour and the link stretched inside it.
//   • Colours stated explicitly on every cell. Clients that auto-invert for
//     dark mode mangle anything relying on defaults.
//
// The palette and 600px frame match src/lib/newsletter/render.ts deliberately.
// The welcome note and the weekly issue should read as the same product.
// =============================================================================

const ACCENT = "#0ea5e9";
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const HAIRLINE = "#e5e7eb";
const CANVAS = "#f3f4f6";

function checkRow(text: string): string {
  // Two cells rather than a list: Outlook's list rendering is inconsistent, and
  // a fixed-width first cell keeps every tick on the same optical column.
  return `<tr>
    <td width="22" valign="top" style="padding:0 0 10px;font:700 15px Arial,sans-serif;color:${ACCENT};line-height:1.5;">&#10003;</td>
    <td valign="top" style="padding:0 0 10px;font:400 15px/1.5 Arial,sans-serif;color:${BODY};">${text}</td>
  </tr>`;
}

function sectionTitle(text: string): string {
  return `<p style="margin:0 0 12px;font:700 12px Arial,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;">${text}</p>`;
}

export interface WelcomeEmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Build the welcome email.
 *
 * `unsubscribeUrl` is a mailto by default. A one-click HTTP unsubscribe needs a
 * per-recipient token, which this single-opt-in flow does not mint — so rather
 * than render a dead "Unsubscribe" link, we give an address that a human
 * actually reads. The same value goes into the List-Unsubscribe header, which
 * is what makes Gmail and Apple Mail show their native unsubscribe control.
 */
export function buildWelcomeEmail(baseUrl: string, contactEmail: string): WelcomeEmailContent {
  const base = baseUrl.replace(/\/$/, "");
  const unsub = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent("Unsubscribe from Immigration Pulse")}`
    : `${base}/pulse`;

  const receive = [
    "One email every week.",
    "The biggest U.S. immigration policy changes.",
    "Plain-English summaries, no jargon.",
    "A direct link to every original government document.",
    "Under five minutes to read.",
  ];

  const trust = [
    "Official government sources only.",
    "Every claim links back to the document it came from.",
    "Figures labelled reported, projected, or estimated.",
    "Public data only - we never track individuals.",
    "Independent, and open about what we do not cover.",
  ];

  const explore: [string, string][] = [
    ["See today&rsquo;s changes", `${base}/what-changed`],
    ["Search your visa type", `${base}/search`],
    ["Explore H-1B data", `${base}/h1b/employers`],
    ["Green card &amp; other situations", `${base}/for-you`],
    ["Read this week&rsquo;s Pulse", `${base}/pulse`],
  ];

  const footerLinks: [string, string][] = [
    ["About", `${base}/about`],
    ["Methodology", `${base}/methodology`],
    ["Sources", `${base}/sources`],
    ["Privacy", `${base}/privacy`],
  ];

  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Welcome to Immigration Pulse</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-text-size-adjust:100%;">
<!-- Preheader: the grey line beside the subject in most inboxes. Hidden in the
     body itself, so it does not repeat the headline the reader is about to see. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">One email a week. The biggest U.S. immigration changes, each linked to its official source.</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};padding:24px 12px;">
<tr><td align="center">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:14px;overflow:hidden;">

    <!-- Header -->
    <tr><td style="background:${INK};padding:28px 32px;">
      <div style="font:800 22px Arial,sans-serif;color:#ffffff;letter-spacing:-.01em;">Immigration<span style="color:${ACCENT};">Clock</span></div>
      <div style="margin-top:6px;font:600 11px Arial,sans-serif;color:#94a3b8;text-transform:uppercase;letter-spacing:.10em;">Facts first &middot; Sources included</div>
    </td></tr>

    <!-- Welcome + intro -->
    <tr><td style="padding:32px 32px 8px;">
      <h1 style="margin:0 0 14px;font:700 26px/1.25 Arial,sans-serif;color:${INK};letter-spacing:-.01em;">Welcome to Immigration&nbsp;Pulse.</h1>
      <p style="margin:0 0 14px;font:400 16px/1.6 Arial,sans-serif;color:${BODY};">
        Every week we read the official U.S. immigration sources &mdash; the Federal Register, USCIS, CBP, the courts &mdash; and send you the changes that matter.
      </p>
      <p style="margin:0;font:400 16px/1.6 Arial,sans-serif;color:${BODY};">
        Every item links straight to the government document it came from. No rumours, no politics, no legal advice. Verified public information, and the date it was published.
      </p>
    </td></tr>

    <!-- What you'll receive -->
    <tr><td style="padding:28px 32px 4px;">
      ${sectionTitle("What you&rsquo;ll receive")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${receive.map(checkRow).join("")}
      </table>
    </td></tr>

    <tr><td style="padding:8px 32px;"><div style="height:1px;background:${HAIRLINE};line-height:1px;font-size:0;">&nbsp;</div></td></tr>

    <!-- Trust -->
    <tr><td style="padding:20px 32px 4px;">
      ${sectionTitle("Why people trust ImmigrationClock")}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${trust.map(checkRow).join("")}
      </table>
    </td></tr>

    <!-- Primary CTA — bulletproof for Outlook -->
    <tr><td style="padding:24px 32px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
        <td align="center" bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:10px;">
          <a href="${base}" style="display:block;padding:16px 24px;font:700 16px Arial,sans-serif;color:#ffffff;text-decoration:none;">Open ImmigrationClock</a>
        </td>
      </tr></table>
    </td></tr>

    <!-- Secondary destinations -->
    <tr><td style="padding:4px 32px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        ${explore
          .map(
            ([label, href]) => `<tr><td style="padding:7px 0;border-bottom:1px solid ${HAIRLINE};">
              <a href="${href}" style="font:600 15px Arial,sans-serif;color:${ACCENT};text-decoration:none;">${label} &rarr;</a>
            </td></tr>`
          )
          .join("")}
      </table>
    </td></tr>

    <!-- Expectations -->
    <tr><td style="padding:0 32px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1px solid ${HAIRLINE};border-radius:10px;">
        <tr><td style="padding:18px 20px;">
          <p style="margin:0 0 8px;font:700 14px Arial,sans-serif;color:${INK};">What happens next</p>
          <p style="margin:0;font:400 14px/1.65 Arial,sans-serif;color:${BODY};">
            Your first issue arrives with the next weekly send. One email a week &mdash; nothing else.
            Unsubscribe any time in one click. We never sell or share your address.
          </p>
        </td></tr>
      </table>
    </td></tr>

    <!-- Footer -->
    <tr><td style="background:#f8fafc;padding:22px 32px;border-top:1px solid ${HAIRLINE};">
      <p style="margin:0 0 10px;font:400 13px Arial,sans-serif;color:${MUTED};">
        ${footerLinks
          .map(
            ([l, h]) =>
              `<a href="${h}" style="color:${MUTED};text-decoration:underline;">${l}</a>`
          )
          .join(`<span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>`)}
        ${contactEmail ? `<span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span><a href="mailto:${contactEmail}" style="color:${MUTED};text-decoration:underline;">Contact</a>` : ""}
        <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span><a href="${unsub}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>
      </p>
      <p style="margin:0;font:400 12px/1.6 Arial,sans-serif;color:#94a3b8;">
        ImmigrationClock reports public U.S. government data. It is not a law firm and does not give legal advice.
      </p>
    </td></tr>

  </table>

</td></tr></table>
</body></html>`;

  const text = [
    "WELCOME TO IMMIGRATION PULSE",
    "",
    "Every week we read the official U.S. immigration sources - the Federal",
    "Register, USCIS, CBP, the courts - and send you the changes that matter.",
    "Every item links straight to the government document it came from. No",
    "rumours, no politics, no legal advice.",
    "",
    "WHAT YOU'LL RECEIVE",
    ...receive.map((r) => `  - ${r}`),
    "",
    "WHY PEOPLE TRUST IMMIGRATIONCLOCK",
    ...trust.map((r) => `  - ${r}`),
    "",
    `Open ImmigrationClock: ${base}`,
    "",
    ...explore.map(([label, href]) => `  ${label.replace(/&rsquo;/g, "'").replace(/&amp;/g, "&")}: ${href}`),
    "",
    "WHAT HAPPENS NEXT",
    "Your first issue arrives with the next weekly send. One email a week -",
    "nothing else. Unsubscribe any time. We never sell or share your address.",
    "",
    footerLinks.map(([l, h]) => `${l}: ${h}`).join("\n"),
    contactEmail ? `Contact: ${contactEmail}` : null,
    "",
    "ImmigrationClock reports public U.S. government data. It is not a law firm",
    "and does not give legal advice.",
  ]
    // Only the optional contact line is dropped. Blank strings are deliberate
    // paragraph breaks - filtering them collapsed the whole text version
    // into an unreadable wall.
    .filter((l): l is string => l !== null)
    .join("\n");

  return { subject: "Welcome to Immigration Pulse", html, text };
}

/** The List-Unsubscribe header value, so inboxes render their native control. */
export function unsubscribeHeader(contactEmail: string): string | null {
  if (!contactEmail) return null;
  return `<mailto:${contactEmail}?subject=Unsubscribe>`;
}
