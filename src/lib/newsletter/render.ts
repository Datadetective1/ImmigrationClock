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
import { CORE_WATCH, LOCALES, RESEND_UNSUBSCRIBE_TOKEN } from "./types";
import { agencyShort, excerpt, headline } from "./excerpt";

const ACCENT = "#0ea5e9";
const INK = "#0f172a";
const BODY = "#334155";
const MUTED = "#64748b";
const HAIRLINE = "#e5e7eb";
const CANVAS = "#f3f4f6";
const PANEL = "#f8fafc";
/** Deep sky: buttons and links. White on it clears 4.5:1, which #0ea5e9 does not. */
const BUTTON = "#0369a1";
/** Masthead and the alerts panel. */
const NIGHT = "#0b1324";
/** Left rule on the verbatim excerpt. */
const QUOTE_RULE = "#cbd5e1";
/** A watched topic that recorded something this week: a tint, not an alarm. */
const NEWS_BG = "#e0f2fe";
const NEWS_BORDER = "#7dd3fc";
const NEWS_INK = "#075985";
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
  // CANONICAL COUNTS. `shown` drives the subject, preheader and story sections
  // — the product promises five things and must not promise six. `recorded` is
  // what "By the numbers" totals. They are allowed to differ; the opening
  // sentence names both whenever they do, which is the part that was missing
  // when the first issue shipped "5 changes" beside a total of 6.
  const shown = issue.counts.shown;
  const recorded = issue.counts.recorded;
  const n = shown;

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

  // ---- The week in one line --------------------------------------------------
  // The subject, the preview line and the h1 all answer the question most
  // subscribers open the email for: did anything change for H-1B or for an
  // employment-based green card? The answer comes from the same silence check
  // as the status board, so the subject can never claim more than we detected.
  const quietKeys = new Set(issue.unchanged.map((w) => w.key));
  const coreNews = CORE_WATCH.filter((k) => !quietKeys.has(k)).map((k) => t.core[k] ?? k);
  const allShown = [...(issue.lead?.items ?? []), ...issue.items];
  const topStory = allShown[0];
  const clip = (s: string, max: number) => {
    if (s.length <= max) return s;
    const at = s.lastIndexOf(" ", max);
    return `${s.slice(0, at > 0 ? at : max).replace(/[,;:]$/, "")}…`;
  };
  const topHeadline = topStory ? clip(headline(topStory.title), 80) : undefined;
  const heroTitle = n > 0 ? t.hero.title(coreNews) : t.hero.quietWeek;

  // ---- Status board ----------------------------------------------------------
  // Every watched topic, quiet or not, BEFORE any story. Most readers have one
  // or two topics they care about; this lets them find theirs in a glance and
  // stop scrolling if that is all they needed. Status is a word plus a mark,
  // never colour alone, and never red or green: the platform reports whether
  // something changed, not whether the change is good.
  const watch = issue.watch ?? issue.unchanged.map((w) => ({ key: w.key, changed: false }));
  const boardTiles = watch
    .filter((w) => t.unchanged.topics[w.key])
    .map((w) => {
      const bg = w.changed ? NEWS_BG : PANEL;
      const border = w.changed ? NEWS_BORDER : HAIRLINE;
      const mark = w.changed ? "&#9679;" : "&#10003;";
      const status = w.changed ? t.board.news : t.board.noChange;
      const statusColor = w.changed ? NEWS_INK : MUTED;
      return `<td width="50%" valign="top" style="padding:4px;vertical-align:top;height:100%;">
          <table role="presentation" width="100%" height="100%" cellpadding="0" cellspacing="0" border="0" style="height:100%;background:${bg};border:1px solid ${border};border-radius:10px;">
            <tr><td bgcolor="${bg}" valign="top" style="padding:10px 12px;vertical-align:top;" align="${align}">
              <p style="margin:0 0 4px;font:700 11px Arial,sans-serif;color:${statusColor};text-transform:uppercase;letter-spacing:.05em;"><span aria-hidden="true">${mark}</span>&nbsp;${esc(status)}</p>
              <p style="margin:0;font:700 14px/1.3 Arial,sans-serif;color:${INK};">${esc(t.unchanged.topics[w.key])}</p>
            </td></tr>
          </table>
        </td>`;
    });
  const boardRows: string[] = [];
  for (let i = 0; i < boardTiles.length; i += 2) {
    boardRows.push(`<tr>${boardTiles[i]}${boardTiles[i + 1] ?? `<td width="50%" style="padding:4px;"></td>`}</tr>`);
  }

  // ---- Category chips --------------------------------------------------------
  // The old "This week at a glance" and "By the numbers" blocks said the same
  // counts twice, in two boxes, before and after the news. One row of chips
  // under the opening carries them now; the plain-text part keeps the full
  // table with its total.
  const chip = (label: string, strong: boolean) =>
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:5px 10px;border-radius:999px;background:${strong ? "#eef2f7" : "#ffffff"};border:1px solid ${HAIRLINE};font:${strong ? 700 : 400} 12px Arial,sans-serif;color:${strong ? INK : MUTED};">${label}</span>`;
  const chips = [
    ...issue.stats.filter((x) => t.stats[x.key] && x.key !== "total_recorded").map((x) => chip(`${x.value} &middot; ${esc(t.stats[x.key])}`, true)),
    ...issue.absentStats.filter((k) => t.stats[k]).map((k) => chip(esc(t.snapshot.none(t.stats[k])), false)),
  ].join("");

  // ---- Story cards -----------------------------------------------------------
  // One card renderer for the personalized lead group and the general feed.
  //
  // What changed from the first version, and why:
  //   • a kicker ("Court decision · Immigration courts (EOIR)") so a reader
  //     knows what kind of thing this is before reading a word of it;
  //   • the government summary is EXCERPTED in whole sentences rather than
  //     printed in full. It is still verbatim and labelled as official text;
  //     one Department of Labor summary was 170 words on its own;
  //   • one filled button, on the top story only. Five identical blue buttons
  //     gave the eye nowhere to land. The rest are text links.
  const renderCard = (it: Issue["items"][number], index: number, featured: boolean) => {
    const ex = excerpt(it.summary, featured ? 320 : 240);
    const forceBadge = it.notInForce
      ? `<span style="display:inline-block;margin-${rtl ? "right" : "left"}:6px;padding:2px 7px;border-radius:6px;background:${WARN};color:#ffffff;font:700 11px Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em;">${esc(t.item.notInForce)}</span>`
      : "";
    const severity = it.severity === "major" ? ` &middot; <span style="color:${INK};">${esc(t.item.severity.major)}</span>` : "";
    const kicker = `${esc(t.kind[it.classification] ?? it.classification)} &middot; ${esc(agencyShort(it.agency))}${severity}`;
    const dateLabel = it.scheduled ? t.item.scheduled : t.item.published;
    const why = it.whyItMatters
      ? `<p style="margin:12px 0 0;padding:12px 14px;background:${PANEL};border-${rtl ? "right" : "left"}:3px solid ${ACCENT};font:400 14px/1.6 Arial,sans-serif;color:${BODY};">
           <strong style="color:${INK};">${esc(t.item.whyItMatters)}:</strong> ${esc(it.whyItMatters)}
         </p>`
      : "";
    const link = featured
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
           <td bgcolor="${BUTTON}" style="background:${BUTTON};border-radius:8px;">
             <a href="${esc(it.sourceUrl)}" style="display:block;padding:14px 22px;font:700 15px Arial,sans-serif;color:#ffffff;text-decoration:none;">${esc(t.item.readDocument)}&nbsp;&rarr;</a>
           </td>
         </tr></table>`
      : `<p style="margin:14px 0 0;"><a href="${esc(it.sourceUrl)}" style="font:700 14px Arial,sans-serif;color:${BUTTON};text-decoration:none;">${esc(t.item.readDocument)}&nbsp;&rarr;</a></p>`;
    const number = `<td width="36" valign="top" style="vertical-align:top;padding-${rtl ? "left" : "right"}:12px;">
        <div style="width:30px;height:30px;line-height:30px;border-radius:15px;text-align:center;background:${featured ? BUTTON : "#eef2f7"};color:${featured ? "#ffffff" : INK};font:800 14px/30px Arial,sans-serif;">${index}</div>
      </td>`;

    return `<tr><td style="padding:0 0 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid ${HAIRLINE};${featured ? `border-top:4px solid ${BUTTON};` : ""}border-radius:12px;">
        <tr><td style="padding:${featured ? "20px 22px 22px" : "18px 20px"};" align="${align}">
          ${featured ? `<p style="margin:0 0 10px;font:800 11px Arial,sans-serif;color:${BUTTON};text-transform:uppercase;letter-spacing:.08em;">${esc(t.item.top)}</p>` : ""}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            ${number}
            <td valign="top" style="vertical-align:top;" align="${align}">
              <p style="margin:0 0 6px;font:700 11px/1.5 Arial,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.05em;">${kicker}${forceBadge}</p>
              <h3 style="margin:0;font:700 ${featured ? 20 : 17}px/1.3 Arial,sans-serif;color:${INK};">${esc(featured ? headline(it.title) : clip(headline(it.title), 110))}</h3>
            </td>
          </tr></table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
            <td style="border-${rtl ? "right" : "left"}:3px solid ${QUOTE_RULE};padding-${rtl ? "right" : "left"}:14px;" align="${align}">
              <p style="margin:0 0 4px;font:700 10px Arial,sans-serif;color:${MUTED};text-transform:uppercase;letter-spacing:.08em;">${esc(t.item.fromDocument)}</p>
              <p style="margin:0;font:400 15px/1.6 Arial,sans-serif;color:${BODY};">${esc(ex.text)}</p>
            </td>
          </tr></table>
          ${why}
          <p style="margin:12px 0 0;font:400 12px Arial,sans-serif;color:${MUTED};">${esc(dateLabel)}: ${esc(t.date(it.publishedAt))}</p>
          ${link}
        </td></tr>
      </table>
    </td></tr>`;
  };

  let cardIndex = 0;
  const renderCards = (items: Issue["items"]) =>
    items
      .map((it) => {
        cardIndex += 1;
        return renderCard(it, cardIndex, cardIndex === 1);
      })
      .join("");
  const leadCards = issue.lead && issue.lead.items.length ? renderCards(issue.lead.items) : "";
  const feedCards = n > 0 ? renderCards(issue.items) : "";

  // ---- Coming up -------------------------------------------------------------
  // Three, not four, each with a calendar tile so the date is read first.
  const monthDay = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const opts = { timeZone: "UTC", numberingSystem: "latn" } as const;
    return {
      month: d.toLocaleDateString(t.htmlLang, { ...opts, month: "short" }).replace(/\.$/, ""),
      day: d.toLocaleDateString(t.htmlLang, { ...opts, day: "numeric" }),
      year: d.toLocaleDateString(t.htmlLang, { ...opts, year: "numeric" }),
    };
  };
  const upcomingRows = issue.upcoming
    .slice(0, 3)
    .map((u) => {
      const tile = u.date
        ? (() => {
            const md = monthDay(u.date!);
            return `<p style="margin:0;font:700 11px Arial,sans-serif;color:${BUTTON};text-transform:uppercase;">${esc(md.month)}</p>
              <p style="margin:0;font:800 22px/1.1 Arial,sans-serif;color:${INK};">${esc(md.day)}</p>
              <p style="margin:0;font:400 10px Arial,sans-serif;color:${MUTED};">${esc(md.year)}</p>`;
          })()
        : `<p style="margin:0;font:700 11px/1.3 Arial,sans-serif;color:${BUTTON};">${esc(u.cadence ?? t.upcoming.recurring)}</p>`;
      return `<tr><td style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="62" valign="top" align="center" style="vertical-align:top;padding-${rtl ? "left" : "right"}:12px;">
            <table role="presentation" width="56" cellpadding="0" cellspacing="0" border="0" style="background:${PANEL};border:1px solid ${HAIRLINE};border-radius:8px;"><tr><td align="center" style="padding:7px 4px;">${tile}</td></tr></table>
          </td>
          <td valign="top" style="vertical-align:top;" align="${align}">
            <p style="margin:0 0 3px;font:700 15px/1.35 Arial,sans-serif;color:${INK};">${esc(u.title)}</p>
            <p style="margin:0 0 4px;font:400 13px/1.5 Arial,sans-serif;color:${BODY};">${esc(u.detail)}</p>
            <a href="${esc(u.sourceUrl)}" style="font:400 12px Arial,sans-serif;color:${MUTED};text-decoration:underline;">${esc(u.sourceName)}</a>
          </td>
        </tr></table>
      </td></tr>`;
    })
    .join("");

  // ---- More on ImmigrationClock ----------------------------------------------
  // Three of six, rotated weekly by the selector, as one row of pills.
  const resourceLinks = (issue.resources.length
    ? issue.resources
        .filter((r) => t.explore[r.key as keyof typeof t.explore])
        .map((r) => ({ label: t.explore[r.key as keyof typeof t.explore], href: `${base}${r.href}` }))
    : exploreTargets(base).map((e) => ({ label: t.explore[e.key], href: e.href }))
  )
    .map(
      (r) =>
        `<a href="${tagged(r.href, issue, base)}" style="display:inline-block;margin:0 6px 8px 0;padding:9px 14px;border-radius:999px;border:1px solid ${HAIRLINE};background:#ffffff;font:700 14px Arial,sans-serif;color:${BUTTON};text-decoration:none;">${esc(r.label)}&nbsp;&rarr;</a>`
    )
    .join("");

  const alertsUrl = tagged(`${base}/visa-bulletin-alerts`, issue, base);
  // Zero-width padding after the preheader stops clients from filling the rest
  // of the preview line with the first words of the body.
  const preheaderPad = "&#8199;&#65279;&#847; ".repeat(40);

  const html = `<!doctype html>
<html lang="${t.htmlLang}" dir="${dir}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(t.brand.tagline)} | ${esc(t.issueLabel(issue.from, issue.to))}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};-webkit-text-size-adjust:100%;" dir="${dir}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(t.preheader(n, topHeadline))}${preheaderPad}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};padding:20px 10px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${CANVAS};">

    <!-- Language selector, above the masthead so a reader who opened the wrong
         language can switch before reading anything. -->
    <tr><td align="${align}" style="padding:0 8px 10px;font:400 12px Arial,sans-serif;color:${MUTED};">
      ${esc(t.footer.readIn)}: ${languageRow}
    </td></tr>

    <tr><td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid ${HAIRLINE};border-radius:16px;overflow:hidden;">

        <!-- Masthead: the week in one line. The h1 answers the same question as
             the subject, so the first thing read after opening is the answer. -->
        <tr><td bgcolor="${NIGHT}" style="background:${NIGHT};background-image:linear-gradient(135deg,${NIGHT} 0%,#0f2747 55%,#0c4a6e 100%);padding:24px 28px 26px;" align="${align}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td align="${align}" style="font:800 17px Arial,sans-serif;color:#ffffff;letter-spacing:-.01em;"><span dir="ltr">Immigration<span style="color:${ACCENT};">Clock</span></span></td>
            <td align="${rtl ? "left" : "right"}" style="font:700 11px Arial,sans-serif;color:#7dd3fc;text-transform:uppercase;letter-spacing:.1em;">${esc(t.brand.tagline)}</td>
          </tr></table>
          <h1 style="margin:22px 0 10px;font:800 26px/1.22 Arial,sans-serif;color:#ffffff;letter-spacing:-.01em;">${esc(heroTitle)}</h1>
          <p style="margin:0;font:400 14px/1.5 Arial,sans-serif;color:#cbd5e1;">${esc(t.hero.meta(n, issue.readingMinutes))}</p>
          <p style="margin:4px 0 0;font:400 12px/1.5 Arial,sans-serif;color:#94a3b8;">${esc(t.issueLabel(issue.from, issue.to))}</p>
        </td></tr>
        <tr><td height="4" bgcolor="${ACCENT}" style="height:4px;line-height:4px;font-size:0;background:${ACCENT};background-image:linear-gradient(90deg,#38bdf8,#0ea5e9 50%,#6366f1);">&nbsp;</td></tr>

        <!-- 1. STATUS BOARD — every watched topic, before any story. -->
        ${
          boardRows.length
            ? `<tr><td style="padding:24px 23px 0;" align="${align}">
                 <div style="padding:0 5px;">${sectionTitle(ICON.unchanged, t.board.title)}</div>
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${boardRows.join("")}</table>
                 <p style="margin:8px 5px 0;font:400 12px/1.6 Arial,sans-serif;color:${MUTED};">${esc(t.board.note)}</p>
               </td></tr>`
            : ""
        }

        <!-- 2a. PERSONALIZED LEAD — only when the segment asked for it. -->
        ${
          leadCards
            ? `<tr><td style="padding:26px 28px 0;" align="${align}">
                 ${sectionTitle(ICON.changes, t.leadGroup(issue.lead!.label))}
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${leadCards}</table>
               </td></tr>`
            : ""
        }

        <!-- 2b. WHAT CHANGED THIS WEEK — opening, category chips, cards. -->
        <tr><td style="padding:26px 28px 0;" align="${align}">
          ${sectionTitle(ICON.changes, t.sections.topChanges)}
          <p style="margin:0 0 12px;font:400 15px/1.6 Arial,sans-serif;color:${BODY};">${esc(n > 0 ? t.opening.withChanges(shown, recorded) : t.opening.noChanges)}</p>
          ${chips ? `<div style="margin:0 0 14px;">${chips}</div>` : ""}
          ${feedCards ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${feedCards}</table>` : ""}
        </td></tr>

        <!-- 3. FREE VISA BULLETIN ALERTS — the one thing to do after reading.
             Mirrors the promise on /visa-bulletin-alerts word for word. -->
        <tr><td style="padding:12px 28px 0;" align="${align}">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${NIGHT};border-radius:14px;">
            <tr><td bgcolor="${NIGHT}" style="background:${NIGHT};background-image:linear-gradient(135deg,${NIGHT} 0%,#0c4a6e 100%);border-radius:14px;padding:22px 24px;" align="${align}">
              <p style="margin:0 0 6px;font:800 11px Arial,sans-serif;color:#7dd3fc;text-transform:uppercase;letter-spacing:.1em;">${esc(t.cta.kicker)}</p>
              <h2 style="margin:0 0 8px;font:800 20px/1.3 Arial,sans-serif;color:#ffffff;">${esc(t.cta.title)}</h2>
              <p style="margin:0 0 16px;font:400 14px/1.6 Arial,sans-serif;color:#cbd5e1;">${esc(t.cta.body)}</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td bgcolor="#ffffff" style="background:#ffffff;border-radius:8px;">
                  <a href="${alertsUrl}" style="display:block;padding:13px 20px;font:800 15px Arial,sans-serif;color:${NIGHT};text-decoration:none;">${esc(t.cta.button)}&nbsp;&rarr;</a>
                </td>
              </tr></table>
            </td></tr>
          </table>
        </td></tr>

        <!-- 4. COMING UP -->
        ${
          upcomingRows
            ? `<tr><td style="padding:26px 28px 0;" align="${align}">
                 ${sectionTitle(ICON.upcoming, t.sections.upcoming)}
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${upcomingRows}</table>
                 <p style="margin:10px 0 0;font:400 12px/1.6 Arial,sans-serif;color:${MUTED};">${esc(t.upcoming.note)}</p>
               </td></tr>`
            : ""
        }

        <!-- 5. MORE ON IMMIGRATIONCLOCK — three of six, rotated weekly. -->
        <tr><td style="padding:24px 28px 0;" align="${align}">
          ${sectionTitle(ICON.resources, t.sections.explore)}
          <div>${resourceLinks}</div>
        </td></tr>

        <!-- Trust -->
        <tr><td style="padding:18px 28px 24px;" align="${align}">
          <p style="margin:0;font:400 13px/1.6 Arial,sans-serif;color:${BODY};">${esc(t.trust.statement)}</p>
          ${locale === "en" ? "" : `<p style="margin:8px 0 0;font:400 12px/1.6 Arial,sans-serif;color:${MUTED};">${esc(t.trust.sourceLanguageNote)}</p>`}
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
               An opt-out a reader has to hunt for produces a spam complaint
               instead, and a spam complaint is charged to every future issue.
               preflight.ts enforces both the colour and the position. -->
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
  // spam signal. Same order as the HTML.
  const lines: string[] = [
    `${t.brand.productName.toUpperCase()} | ${t.brand.tagline.toUpperCase()}`,
    t.issueLabel(issue.from, issue.to),
    "",
    heroTitle,
    t.hero.meta(n, issue.readingMinutes),
    "",
  ];

  // Status board.
  const boardLines = watch.filter((w) => t.unchanged.topics[w.key]);
  if (boardLines.length) {
    lines.push(t.board.title.toUpperCase(), "");
    for (const w of boardLines) lines.push(`  - ${t.unchanged.topics[w.key]}: ${w.changed ? t.board.news : t.board.noChange}`);
    lines.push("", t.board.note, "");
  }

  lines.push(n > 0 ? t.opening.withChanges(shown, recorded) : t.opening.noChanges, "");

  // Snapshot.
  const snapLines = [
    ...issue.stats.filter((x) => t.stats[x.key] && x.key !== "total_recorded").map((x) => `  - ${x.value} ${t.stats[x.key]}`),
    ...issue.absentStats.filter((k) => t.stats[k]).map((k) => `  - ${t.snapshot.none(t.stats[k])}`),
  ];
  if (snapLines.length) {
    lines.push(t.sections.snapshot.toUpperCase(), "", ...snapLines, "", t.snapshot.readingTime(issue.readingMinutes), "");
  }

  let textIndex = 0;
  const textCard = (it: (typeof issue.items)[number]) => {
    textIndex += 1;
    const ex = excerpt(it.summary, textIndex === 1 ? 320 : 240);
    lines.push(`${textIndex}. ${headline(it.title)}`);
    lines.push(
      `   ${t.kind[it.classification] ?? it.classification} | ${agencyShort(it.agency)}` +
        `${it.severity === "major" ? ` | ${t.item.severity.major}` : ""}${it.notInForce ? ` | ${t.item.notInForce}` : ""}`
    );
    lines.push(`   ${t.item.fromDocument}: "${ex.text}"`);
    if (it.whyItMatters) lines.push(`   ${t.item.whyItMatters}: ${it.whyItMatters}`);
    lines.push(`   ${it.scheduled ? t.item.scheduled : t.item.published}: ${t.date(it.publishedAt)}`);
    lines.push(`   ${t.item.readDocument}: ${it.sourceUrl}`);
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

  // Free alerts.
  lines.push(t.cta.title.toUpperCase(), t.cta.body, `${t.cta.button}: ${alertsUrl}`, "");

  // Coming up.
  if (issue.upcoming.length) {
    lines.push(t.sections.upcoming.toUpperCase(), "");
    for (const u of issue.upcoming.slice(0, 3)) {
      lines.push(`  ${u.title} - ${u.date ? t.date(u.date) : (u.cadence ?? t.upcoming.recurring)}`);
      lines.push(`    ${u.detail}`);
      lines.push(`    ${u.sourceName}: ${u.sourceUrl}`);
    }
    lines.push("", t.upcoming.note, "");
  }

  const usableStats = issue.stats.filter((s) => t.stats[s.key] && s.key !== "total_recorded");
  if (usableStats.length) {
    lines.push(t.sections.quickNumbers.toUpperCase(), "");
    for (const s of usableStats) lines.push(`  ${t.stats[s.key]}: ${s.value}`);
    // Same total as the canonical count, so the printed rows add up.
    if (recorded > 0) lines.push(`  ${t.stats.total_recorded}: ${recorded}`);
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
  lines.push("", t.trust.statement, "");
  if (locale !== "en") lines.push(t.trust.sourceLanguageNote, "");
  lines.push(`${t.footer.viewOnline}: ${archiveUrl}`);
  if (contactEmail) lines.push(`${t.footer.contact}: ${contactEmail}`);
  // The opt-out belongs in the text part too: several clients and most screen
  // readers render this instead of the HTML, and Resend substitutes the token
  // in both parts of the broadcast.
  lines.push(`${t.footer.unsubscribe}: ${unsub}`, "", t.footer.disclaimer);

  return { subject: t.subject(n, coreNews), html, text: lines.join("\n") };
}

/** Locale codes as an array, exported so scripts do not re-import types. */
export { LOCALES };
export type { Locale };
