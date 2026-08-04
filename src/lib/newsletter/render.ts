// =============================================================================
// NEWSLETTER RENDERER — one template, every language, every edition type
//
// A pure function: (Issue, baseUrl, contact) -> { subject, html, text }. No I/O,
// no clock, no store access. That is what lets the whole pipeline be tested
// without a network and previewed without a key.
//
// EMAIL CONSTRAINTS — each is a client that breaks otherwise. Same set the
// welcome email documents, and for the same reasons:
//   • tables, not flex/grid (Outlook uses Word's HTML engine)
//   • inline styles, no <style> block (Gmail strips it)
//   • no images at all, including the logo (clients block remote images, so an
//     image-based header arrives as a broken box on first open)
//   • bulletproof buttons: background on a <td>, not padding on an <a>
//   • explicit colours on every cell, so dark-mode auto-inversion cannot
//     produce grey-on-grey
//
// RTL is a `dir` attribute and mirrored padding, not a second template.
// =============================================================================

import { isRtl, type Issue, type Locale } from "./types";
import { stringsFor } from "./locales";
import { LOCALES } from "./types";

const ACCENT = "#0ea5e9";
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const HAIRLINE = "#e5e7eb";
const CANVAS = "#f3f4f6";
const PANEL = "#f8fafc";
/** Amber, used only for "not in force" — the one factual warning we render. */
const WARN = "#b45309";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Where each explore button points. Paths verified to exist in the app. */
function exploreTargets(base: string) {
  return [
    { key: "searchVisa" as const, href: `${base}/search` },
    { key: "latestChanges" as const, href: `${base}/what-changed` },
    { key: "processingTimes" as const, href: `${base}/key-dates` },
    { key: "countries" as const, href: `${base}/migration-map` },
    { key: "greenCard" as const, href: `${base}/for-you` },
    { key: "citizenship" as const, href: `${base}/explained` },
    { key: "h1b" as const, href: `${base}/h1b/employers` },
  ];
}

export function renderIssue(
  issue: Issue,
  baseUrl: string,
  contactEmail: string
): RenderedEmail {
  const base = baseUrl.replace(/\/$/, "");
  const locale = issue.segment.locale;
  const t = stringsFor(locale);
  const rtl = isRtl(locale);
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const n = issue.items.length;

  const archiveUrl = `${base}/newsletter/${issue.id}/${locale}.html`;
  const unsub = contactEmail
    ? `mailto:${contactEmail}?subject=${encodeURIComponent("Unsubscribe from Immigration Pulse")}`
    : `${base}/pulse`;

  // ---- Language selector -----------------------------------------------------
  // Points at the archived copy of THIS issue in each language, so switching
  // language never loses the reader's place.
  const languageRow = LOCALES.map((l) => {
    const label = esc(stringsFor(l).endonym);
    if (l === locale) {
      return `<span style="color:${INK};font-weight:700;">${label}</span>`;
    }
    return `<a href="${base}/newsletter/${issue.id}/${l}.html" style="color:${MUTED};text-decoration:underline;">${label}</a>`;
  }).join(`<span style="color:#cbd5e1;"> &nbsp;/&nbsp; </span>`);

  // ---- Story cards -----------------------------------------------------------
  const cards = issue.items
    .map((it) => {
      const badge = (text: string, color: string, bg: string) =>
        `<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:${bg};color:${color};font:700 11px Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em;">${esc(text)}</span>`;

      const severityBadge = badge(
        t.item.severity[it.severity],
        it.severity === "major" ? "#ffffff" : BODY,
        it.severity === "major" ? INK : "#e2e8f0"
      );
      // A proposal must never read as a rule. This is the only coloured badge.
      const forceBadge = it.notInForce ? ` ${badge(t.item.notInForce, "#ffffff", WARN)}` : "";
      const dateLabel = it.scheduled ? t.item.scheduled : t.item.published;

      const why = it.whyItMatters
        ? `<p style="margin:12px 0 0;padding:12px 14px;background:${PANEL};border-${rtl ? "right" : "left"}:3px solid ${ACCENT};font:400 14px/1.6 Arial,sans-serif;color:${BODY};">
             <strong style="color:${INK};">${esc(t.item.whyItMatters)}:</strong> ${esc(it.whyItMatters)}
           </p>`
        : "";

      return `<tr><td style="padding:0 0 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid ${HAIRLINE};border-radius:12px;">
          <tr><td style="padding:20px 22px;" align="${align}">
            <div style="margin-bottom:10px;">${severityBadge}${forceBadge}</div>
            <h2 style="margin:0 0 10px;font:700 18px/1.35 Arial,sans-serif;color:${INK};">${esc(it.title)}</h2>
            <p style="margin:0 0 12px;font:400 15px/1.6 Arial,sans-serif;color:${BODY};">${esc(it.summary)}</p>
            <p style="margin:0;font:400 13px/1.6 Arial,sans-serif;color:${MUTED};">
              <strong style="color:${BODY};">${esc(t.item.agency)}:</strong> ${esc(it.agency)}
              &nbsp;&middot;&nbsp;
              <strong style="color:${BODY};">${esc(dateLabel)}:</strong> ${esc(it.publishedAt)}
            </p>
            ${why}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
              <td bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:8px;">
                <a href="${esc(it.sourceUrl)}" style="display:block;padding:12px 20px;font:700 14px Arial,sans-serif;color:#ffffff;text-decoration:none;">${esc(t.item.readDocument)} &rarr;</a>
              </td>
            </tr></table>
          </td></tr>
        </table>
      </td></tr>`;
    })
    .join("");

  // ---- Quick numbers ---------------------------------------------------------
  const statRows = issue.stats
    .filter((s) => t.stats[s.key])
    .map(
      (s) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${HAIRLINE};font:400 14px Arial,sans-serif;color:${BODY};" align="${align}">${esc(t.stats[s.key])}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${HAIRLINE};font:700 14px Arial,sans-serif;color:${INK};" align="${rtl ? "left" : "right"}">${s.value}</td>
      </tr>`
    )
    .join("");

  const exploreCells = exploreTargets(base)
    .map(
      (e) =>
        `<tr><td style="padding:7px 0;border-bottom:1px solid ${HAIRLINE};" align="${align}">
          <a href="${e.href}" style="font:600 15px Arial,sans-serif;color:${ACCENT};text-decoration:none;">${esc(t.explore[e.key])} &rarr;</a>
        </td></tr>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="${t.htmlLang}" dir="${dir}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(t.brand.tagline)} — ${esc(t.issueLabel(issue.from, issue.to))}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-text-size-adjust:100%;" dir="${dir}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(t.preheader(n))}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${CANVAS};">

    <!-- Language selector, above the masthead so a reader who opened the wrong
         language can switch before reading anything. -->
    <tr><td align="${align}" style="padding:0 8px 12px;font:400 12px Arial,sans-serif;color:${MUTED};">
      ${esc(t.footer.readIn)}: ${languageRow}
    </td></tr>

    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid ${HAIRLINE};border-radius:14px;overflow:hidden;">

        <!-- Masthead -->
        <tr><td style="background:${INK};padding:26px 28px;" align="${align}">
          <div style="font:800 21px Arial,sans-serif;color:#ffffff;letter-spacing:-.01em;">Immigration<span style="color:${ACCENT};">Clock</span></div>
          <div style="margin-top:8px;font:700 15px Arial,sans-serif;color:#ffffff;">${esc(t.brand.tagline)}</div>
          <div style="margin-top:4px;font:400 13px Arial,sans-serif;color:#94a3b8;">${esc(t.issueLabel(issue.from, issue.to))}</div>
          <div style="margin-top:10px;font:400 12px/1.5 Arial,sans-serif;color:#94a3b8;">${esc(t.brand.strapline)}</div>
        </td></tr>

        <!-- Opening summary -->
        <tr><td style="padding:26px 28px 6px;" align="${align}">
          <p style="margin:0;font:400 16px/1.65 Arial,sans-serif;color:${BODY};">
            ${esc(n > 0 ? t.opening.withChanges(n) : t.opening.noChanges)}
          </p>
        </td></tr>

        ${
          n > 0
            ? `<tr><td style="padding:22px 28px 0;" align="${align}">
                 <p style="margin:0 0 14px;font:700 12px Arial,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;">${esc(t.sections.topChanges)}</p>
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cards}</table>
               </td></tr>`
            : ""
        }

        ${
          statRows
            ? `<tr><td style="padding:6px 28px 0;" align="${align}">
                 <p style="margin:0 0 8px;font:700 12px Arial,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;">${esc(t.sections.quickNumbers)}</p>
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${statRows}</table>
               </td></tr>`
            : ""
        }

        <!-- Continue exploring -->
        <tr><td style="padding:24px 28px 0;" align="${align}">
          <p style="margin:0 0 8px;font:700 12px Arial,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.06em;">${esc(t.sections.explore)}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${exploreCells}</table>
        </td></tr>

        <!-- Trust -->
        <tr><td style="padding:24px 28px 26px;" align="${align}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PANEL};border:1px solid ${HAIRLINE};border-radius:10px;">
            <tr><td style="padding:16px 18px;" align="${align}">
              <p style="margin:0 0 8px;font:400 14px/1.65 Arial,sans-serif;color:${BODY};">${esc(t.trust.statement)}</p>
              <p style="margin:0;font:400 12px/1.6 Arial,sans-serif;color:${MUTED};">${esc(t.trust.sourceLanguageNote)}</p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:${PANEL};padding:20px 28px;border-top:1px solid ${HAIRLINE};" align="${align}">
          <p style="margin:0 0 10px;font:400 13px Arial,sans-serif;color:${MUTED};">
            <a href="${archiveUrl}" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.viewOnline)}</a>
            <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>
            <a href="${base}/about" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.about)}</a>
            <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>
            <a href="${base}/methodology" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.methodology)}</a>
            <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>
            <a href="${base}/sources" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.sources)}</a>
            <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>
            <a href="${base}/privacy" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.privacy)}</a>
            ${contactEmail ? `<span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span><a href="mailto:${esc(contactEmail)}" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.contact)}</a>` : ""}
            <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>
            <a href="${unsub}" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.unsubscribe)}</a>
          </p>
          <p style="margin:0;font:400 12px/1.6 Arial,sans-serif;color:#94a3b8;">${esc(t.footer.disclaimer)}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  // ---- Plain text ------------------------------------------------------------
  // Not an afterthought: screen readers and several clients render this instead
  // of the HTML, and a text part that is missing or empty is itself a strong
  // spam signal.
  const lines: string[] = [
    `${t.brand.productName.toUpperCase()} — ${t.brand.tagline.toUpperCase()}`,
    t.issueLabel(issue.from, issue.to),
    t.brand.strapline,
    "",
    n > 0 ? t.opening.withChanges(n) : t.opening.noChanges,
    "",
  ];

  if (n > 0) {
    lines.push(t.sections.topChanges.toUpperCase(), "");
    for (const it of issue.items) {
      lines.push(`[${t.item.severity[it.severity]}]${it.notInForce ? ` [${t.item.notInForce}]` : ""}`);
      lines.push(it.title);
      lines.push(it.summary);
      if (it.whyItMatters) lines.push(`${t.item.whyItMatters}: ${it.whyItMatters}`);
      lines.push(`${t.item.agency}: ${it.agency}`);
      lines.push(`${it.scheduled ? t.item.scheduled : t.item.published}: ${it.publishedAt}`);
      lines.push(`${t.item.readDocument}: ${it.sourceUrl}`);
      lines.push("");
    }
  }

  const usableStats = issue.stats.filter((s) => t.stats[s.key]);
  if (usableStats.length) {
    lines.push(t.sections.quickNumbers.toUpperCase(), "");
    for (const s of usableStats) lines.push(`  ${t.stats[s.key]}: ${s.value}`);
    lines.push("");
  }

  lines.push(t.sections.explore.toUpperCase(), "");
  for (const e of exploreTargets(base)) lines.push(`  ${t.explore[e.key]}: ${e.href}`);
  lines.push("", t.trust.statement, "", t.trust.sourceLanguageNote, "");
  lines.push(`${t.footer.viewOnline}: ${archiveUrl}`);
  if (contactEmail) lines.push(`${t.footer.contact}: ${contactEmail}`);
  lines.push(`${t.footer.unsubscribe}: ${unsub}`, "", t.footer.disclaimer);

  return { subject: t.subject(n), html, text: lines.join("\n") };
}

/** Locale codes as an array, exported so scripts do not re-import types. */
export { LOCALES };
export type { Locale };
