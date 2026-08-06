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
import { LOCALES, RESEND_UNSUBSCRIBE_TOKEN } from "./types";

const ACCENT = "#0ea5e9";
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const HAIRLINE = "#e5e7eb";
const CANVAS = "#f3f4f6";
const PANEL = "#f8fafc";
/** Amber, used only for "not in force" — the one factual warning we render. */
const WARN = "#b45309";

/**
 * Section icons.
 *
 * Unicode glyphs, not images. Every client blocks remote images by default, so
 * an icon set built from <img> arrives as a row of broken boxes on first open —
 * and an icon font is worse. These render everywhere, survive dark mode, and
 * cost nothing. They are decorative, so the plain-text version omits them.
 */
const ICON = {
  snapshot: "◷",   // ◷ clock face — the week at a glance
  changes: "◆",    // ◆ solid diamond — the substantive section
  unchanged: "✓",  // ✓ check — nothing moved
  upcoming: "→",   // → forward arrow — what is next
  numbers: "▦",    // ▦ grid — counts
  resources: "★",  // ★ star — popular destinations
} as const;

/**
 * Tag an INTERNAL link for analytics.
 *
 * Applied to immigrationclock.com URLs only. A government source URL is never
 * touched: appending our tracking parameters to a federalregister.gov link
 * would alter a citation, and on a platform whose promise is "this is the
 * document" that is not a tradeoff worth making — some agency URLs are also
 * sensitive to unexpected query strings.
 */
function tagged(href: string, issue: Issue, base: string): string {
  if (!href.startsWith(base)) return href;
  const url = new URL(href);
  url.searchParams.set("utm_source", "newsletter");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", issue.id);
  url.searchParams.set("utm_content", issue.segment.cadence);
  url.searchParams.set("locale", issue.segment.locale);
  url.searchParams.set("edition", issue.id);
  url.searchParams.set("segment", issue.segment.id);
  return url.toString();
}

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

  // 18px section titles, per the mobile brief: at 12px these read as captions
  // on a phone and the eye skates past them.
  // <h2>, not <p>: a screen-reader user navigating this email by heading was
  // getting four story titles and no document structure. Explicit margin because
  // clients apply their own to headings.
  const sectionTitle = (icon: string, text: string) =>
    `<h2 style="margin:0 0 14px;font:700 18px/1.3 Arial,sans-serif;color:${INK};">` +
    `<span style="color:${ACCENT};" aria-hidden="true">${icon}</span>&nbsp;&nbsp;${esc(text)}</h2>`;

  const archiveUrl = `${base}/newsletter/${issue.id}/${locale}.html`;

  // THE OPT-OUT.
  //
  // A literal Resend Broadcasts token, not a URL — Resend swaps it for a
  // per-contact link at send time and records the unsubscribe against the
  // contact. It is the only value here that can actually unsubscribe anyone.
  //
  // What it replaced, and why neither worked:
  //   • `${base}/pulse` — the SIGNUP page. An opt-out that opens a sign-up form
  //     is a dark pattern, and it left the reader still subscribed.
  //   • `mailto:` the contact address — reaches a human inbox, not the contact
  //     record, and satisfies neither one-click nor the 48-hour rule Gmail and
  //     Yahoo enforce on bulk senders.
  //
  // The archived web copy of the issue is the same bytes the broadcast is built
  // from, so this token appears there too and is inert on the web. That is the
  // correct trade: the archive is a record of what was mailed, and validate.ts
  // and preflight.ts both refuse to ship an edition where it is missing.
  const unsub = RESEND_UNSUBSCRIBE_TOKEN;

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
  // One card renderer, used by both the personalized lead group and the general
  // feed. Two card layouts would drift.
  const renderCards = (items: Issue["items"]) =>
    items
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
            <h3 style="margin:0 0 10px;font:700 18px/1.35 Arial,sans-serif;color:${INK};">${esc(it.title)}</h3>
            <p style="margin:0 0 12px;font:400 15px/1.6 Arial,sans-serif;color:${BODY};">${esc(it.summary)}</p>
            <p style="margin:0;font:400 13px/1.6 Arial,sans-serif;color:${MUTED};">
              <strong style="color:${BODY};">${esc(t.item.agency)}:</strong> ${esc(it.agency)}
              &nbsp;&middot;&nbsp;
              <strong style="color:${BODY};">${esc(dateLabel)}:</strong> ${esc(it.publishedAt)}
            </p>
            ${why}
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
              <td bgcolor="${ACCENT}" style="background:${ACCENT};border-radius:8px;">
                <a href="${esc(it.sourceUrl)}" style="display:block;padding:14px 22px;font:700 15px Arial,sans-serif;color:#ffffff;text-decoration:none;">${esc(t.item.readDocument)} &rarr;</a>
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

  // ---- Weekly snapshot -------------------------------------------------------
  // Counts first, then the reassuring negatives, then how long this will take.
  const snapshotBullets = [
    ...issue.stats.filter((x) => t.stats[x.key]).map((x) => `${x.value} &mdash; ${esc(t.stats[x.key])}`),
    ...issue.absentStats.filter((k) => t.stats[k]).map((k) => esc(t.snapshot.none(t.stats[k]))),
  ]
    .map(
      (line) =>
        `<tr><td style="padding:5px 0;font:400 15px/1.5 Arial,sans-serif;color:${BODY};" align="${align}">
           <span style="color:${ACCENT};" aria-hidden="true">&bull;</span>&nbsp;&nbsp;${line}
         </td></tr>`
    )
    .join("");

  // ---- What did NOT change ---------------------------------------------------
  const unchangedRows = issue.unchanged
    .filter((w) => t.unchanged.topics[w.key])
    .map(
      (w) =>
        `<tr><td style="padding:6px 0;font:400 15px/1.5 Arial,sans-serif;color:${BODY};" align="${align}">
           <span style="color:${ACCENT};font-weight:700;" aria-hidden="true">&#10003;</span>&nbsp;&nbsp;${esc(t.unchanged.topics[w.key])}
         </td></tr>`
    )
    .join("");

  // ---- Coming up -------------------------------------------------------------
  const upcomingRows = issue.upcoming
    .map(
      (u) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};" align="${align}">
        <p style="margin:0 0 3px;font:700 15px Arial,sans-serif;color:${INK};">${esc(u.title)}</p>
        <p style="margin:0 0 4px;font:400 13px/1.5 Arial,sans-serif;color:${BODY};">${esc(u.detail)}</p>
        <p style="margin:0;font:400 12px Arial,sans-serif;color:${MUTED};">
          ${esc(u.date ?? u.cadence ?? t.upcoming.recurring)}
          &nbsp;&middot;&nbsp;
          <a href="${esc(u.sourceUrl)}" style="color:${MUTED};text-decoration:underline;">${esc(u.sourceName)}</a>
        </p>
      </td></tr>`
    )
    .join("");

  // ---- Rotating resources ----------------------------------------------------
  // Three of six, chosen by ISO week in the selector. Showing all six every
  // week trains readers to skip the block entirely.
  const resourceRows = issue.resources
    .filter((r) => t.explore[r.key as keyof typeof t.explore])
    .map(
      (r) => `<tr><td style="padding:9px 0;border-bottom:1px solid ${HAIRLINE};" align="${align}">
        <a href="${tagged(`${base}${r.href}`, issue, base)}" style="font:600 16px Arial,sans-serif;color:${ACCENT};text-decoration:none;">${esc(t.explore[r.key as keyof typeof t.explore])} &rarr;</a>
      </td></tr>`
    )
    .join("");

  const exploreCells = exploreTargets(base)
    .map(
      (e) =>
        `<tr><td style="padding:9px 0;border-bottom:1px solid ${HAIRLINE};" align="${align}">
          <a href="${tagged(e.href, issue, base)}" style="font:600 16px Arial,sans-serif;color:${ACCENT};text-decoration:none;">${esc(t.explore[e.key])} &rarr;</a>
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
          <h1 style="margin:8px 0 0;font:700 15px Arial,sans-serif;color:#ffffff;">${esc(t.brand.tagline)}</h1>
          <div style="margin-top:4px;font:400 13px Arial,sans-serif;color:#94a3b8;">${esc(t.issueLabel(issue.from, issue.to))}</div>
          <div style="margin-top:10px;font:400 12px/1.5 Arial,sans-serif;color:#94a3b8;">${esc(t.brand.strapline)}</div>
        </td></tr>

        <!-- Opening summary -->
        <tr><td style="padding:26px 28px 6px;" align="${align}">
          <p style="margin:0;font:400 16px/1.65 Arial,sans-serif;color:${BODY};">
            ${esc(n > 0 ? t.opening.withChanges(n) : t.opening.noChanges)}
          </p>
        </td></tr>

        <!-- 1. WEEKLY SNAPSHOT — the executive summary, before any story. -->
        ${
          snapshotBullets
            ? `<tr><td style="padding:24px 28px 0;" align="${align}">
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PANEL};border:1px solid ${HAIRLINE};border-radius:12px;">
                   <tr><td style="padding:20px 22px;" align="${align}">
                     ${sectionTitle(ICON.snapshot, t.sections.snapshot)}
                     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${snapshotBullets}</table>
                     <p style="margin:14px 0 0;padding-top:12px;border-top:1px solid ${HAIRLINE};font:700 14px Arial,sans-serif;color:${INK};">${esc(t.snapshot.readingTime(issue.readingMinutes))}</p>
                   </td></tr>
                 </table>
               </td></tr>`
            : ""
        }

        <!-- 2a. PERSONALIZED LEAD — only when the segment asked for it. -->
        ${
          issue.lead && issue.lead.items.length
            ? `<tr><td style="padding:26px 28px 0;" align="${align}">
                 ${sectionTitle(ICON.changes, t.leadGroup(issue.lead.label))}
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${renderCards(issue.lead.items)}</table>
               </td></tr>`
            : ""
        }

        <!-- 2b. WHAT CHANGED THIS WEEK -->
        ${
          n > 0
            ? `<tr><td style="padding:26px 28px 0;" align="${align}">
                 ${sectionTitle(ICON.changes, t.sections.topChanges)}
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${renderCards(issue.items)}</table>
               </td></tr>`
            : ""
        }

        <!-- 3. WHAT DID NOT CHANGE — the section that answers a weekly worry. -->
        <tr><td style="padding:20px 28px 0;" align="${align}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PANEL};border:1px solid ${HAIRLINE};border-radius:12px;">
            <tr><td style="padding:20px 22px;" align="${align}">
              ${sectionTitle(ICON.unchanged, t.sections.unchanged)}
              ${
                unchangedRows
                  ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${unchangedRows}</table>
                     <p style="margin:14px 0 0;font:400 13px/1.6 Arial,sans-serif;color:${MUTED};">${esc(t.unchanged.intro)}</p>`
                  : `<p style="margin:0;font:400 15px/1.6 Arial,sans-serif;color:${BODY};">${esc(t.unchanged.allChanged)}</p>`
              }
            </td></tr>
          </table>
        </td></tr>

        <!-- 4. COMING UP -->
        ${
          upcomingRows
            ? `<tr><td style="padding:24px 28px 0;" align="${align}">
                 ${sectionTitle(ICON.upcoming, t.sections.upcoming)}
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${upcomingRows}</table>
                 <p style="margin:12px 0 0;font:400 12px/1.6 Arial,sans-serif;color:${MUTED};">${esc(t.upcoming.note)}</p>
               </td></tr>`
            : ""
        }

        ${
          statRows
            ? `<tr><td style="padding:24px 28px 0;" align="${align}">
                 ${sectionTitle(ICON.numbers, t.sections.quickNumbers)}
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${statRows}</table>
               </td></tr>`
            : ""
        }

        <!-- 5. POPULAR RESOURCES — three of six, rotated weekly. -->
        <tr><td style="padding:24px 28px 0;" align="${align}">
          ${sectionTitle(ICON.resources, t.sections.explore)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${resourceRows || exploreCells}</table>
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
            <a href="${tagged(archiveUrl, issue, base)}" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.viewOnline)}</a>
            <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>
            <a href="${tagged(`${base}/about`, issue, base)}" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.about)}</a>
            <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>
            <a href="${tagged(`${base}/methodology`, issue, base)}" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.methodology)}</a>
            <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>
            <a href="${tagged(`${base}/sources`, issue, base)}" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.sources)}</a>
            <span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span>
            <a href="${tagged(`${base}/privacy`, issue, base)}" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.privacy)}</a>
            ${contactEmail ? `<span style="color:#cbd5e1;"> &nbsp;&middot;&nbsp; </span><a href="mailto:${esc(contactEmail)}" style="color:${MUTED};text-decoration:underline;">${esc(t.footer.contact)}</a>` : ""}
          </p>
          <!-- Unsubscribe, on its own line and NOT in the muted nav row above.
               It was the last item in that row at 13px #64748b, which cleared
               contrast but read as one more footer link. An opt-out a reader
               has to hunt for produces a spam complaint instead, and a spam
               complaint is charged to every future issue. Darker ink, its own
               line, same 13px. preflight.ts enforces both the colour and the
               position, so this cannot quietly regress. -->
          <p style="margin:0 0 12px;font:400 13px/1.6 Arial,sans-serif;color:${BODY};">
            <a href="${unsub}" style="color:${BODY};text-decoration:underline;font-weight:600;">${esc(t.footer.unsubscribe)}</a>
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

  // Snapshot, in the same order as the HTML.
  const snapLines = [
    ...issue.stats.filter((x) => t.stats[x.key]).map((x) => `  - ${x.value} ${t.stats[x.key]}`),
    ...issue.absentStats.filter((k) => t.stats[k]).map((k) => `  - ${t.snapshot.none(t.stats[k])}`),
  ];
  if (snapLines.length) {
    lines.push(t.sections.snapshot.toUpperCase(), "", ...snapLines, "", t.snapshot.readingTime(issue.readingMinutes), "");
  }

  const textCard = (it: (typeof issue.items)[number]) => {
    lines.push(`[${t.item.severity[it.severity]}]${it.notInForce ? ` [${t.item.notInForce}]` : ""}`);
    lines.push(it.title);
    lines.push(it.summary);
    if (it.whyItMatters) lines.push(`${t.item.whyItMatters}: ${it.whyItMatters}`);
    lines.push(`${t.item.agency}: ${it.agency}`);
    lines.push(`${it.scheduled ? t.item.scheduled : t.item.published}: ${it.publishedAt}`);
    lines.push(`${t.item.readDocument}: ${it.sourceUrl}`);
    lines.push("");
  };

  if (issue.lead && issue.lead.items.length) {
    lines.push(t.leadGroup(issue.lead.label).toUpperCase(), "");
    for (const it of issue.lead.items) textCard(it);
  }

  if (n > 0) {
    lines.push(t.sections.topChanges.toUpperCase(), "");
    for (const it of issue.items) textCard(it);
  }

  // What did NOT change.
  lines.push(t.sections.unchanged.toUpperCase(), "");
  const unchangedNames = issue.unchanged.filter((w) => t.unchanged.topics[w.key]);
  if (unchangedNames.length) {
    for (const w of unchangedNames) lines.push(`  - ${t.unchanged.topics[w.key]}`);
    lines.push("", t.unchanged.intro, "");
  } else {
    lines.push(t.unchanged.allChanged, "");
  }

  // Coming up.
  if (issue.upcoming.length) {
    lines.push(t.sections.upcoming.toUpperCase(), "");
    for (const u of issue.upcoming) {
      lines.push(`  ${u.title} - ${u.date ?? u.cadence ?? t.upcoming.recurring}`);
      lines.push(`    ${u.detail}`);
      lines.push(`    ${u.sourceName}: ${u.sourceUrl}`);
    }
    lines.push("", t.upcoming.note, "");
  }

  const usableStats = issue.stats.filter((s) => t.stats[s.key]);
  if (usableStats.length) {
    lines.push(t.sections.quickNumbers.toUpperCase(), "");
    for (const s of usableStats) lines.push(`  ${t.stats[s.key]}: ${s.value}`);
    lines.push("");
  }

  lines.push(t.sections.explore.toUpperCase(), "");
  const textResources = issue.resources.filter((r) => t.explore[r.key as keyof typeof t.explore]);
  if (textResources.length) {
    for (const r of textResources) {
      lines.push(`  ${t.explore[r.key as keyof typeof t.explore]}: ${tagged(`${base}${r.href}`, issue, base)}`);
    }
  } else {
    for (const e of exploreTargets(base)) lines.push(`  ${t.explore[e.key]}: ${tagged(e.href, issue, base)}`);
  }
  lines.push("", t.trust.statement, "", t.trust.sourceLanguageNote, "");
  lines.push(`${t.footer.viewOnline}: ${archiveUrl}`);
  if (contactEmail) lines.push(`${t.footer.contact}: ${contactEmail}`);
  // The opt-out belongs in the text part too: several clients and most screen
  // readers render this instead of the HTML, and Resend substitutes the token
  // in both parts of the broadcast.
  lines.push(`${t.footer.unsubscribe}: ${unsub}`, "", t.footer.disclaimer);

  return { subject: t.subject(n), html, text: lines.join("\n") };
}

/** Locale codes as an array, exported so scripts do not re-import types. */
export { LOCALES };
export type { Locale };
