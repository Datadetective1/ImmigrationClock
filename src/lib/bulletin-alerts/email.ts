// =============================================================================
// FREE VISA BULLETIN ALERT EMAILS
//
// Three messages, all table-based with inline styles and no images (see the
// note at the top of ../welcome-email.ts for why):
//
//   confirmEmail   the double opt-in link. Says what was asked for, stores nothing.
//   welcomeEmail   after the click: the dates for their pick in the newest month.
//   alertEmail     each new month: the two dates, how they moved, the source.
//
// Every one after the first carries an unsubscribe link and the postal
// address. Each mentions the Pro free trial once, quietly, after the dates.
// No affiliate or partner links ever go in these emails.
// =============================================================================

import { EMAIL_COLOR as C, EMAIL_FONT as F, emailButton, escapeEmailHtml as esc } from "@/lib/email/style";
import { OPERATOR, SITE } from "@/lib/site";
import {
  OFFICIAL_INDEX_URL,
  ROW_HINT,
  bulletinPath,
  cutoffFor,
  formatCutoff,
  movement,
  type Bulletin,
  type Chargeability,
  type Cutoff,
  type Movement,
  type Row,
} from "@/lib/visa-bulletin";
import { WAIT_PAIRS, waitPath } from "@/lib/visa-bulletin/wait-time";
import { ALERTS_PAGE_PATH, CONFIRM_TTL_SECONDS, pickLabel, sectionOf } from "./index";

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

export interface Pick {
  row: Row;
  country: Chargeability;
}

/** "moved ahead 3 mo", "no change", "now current". */
export function movementWords(m: Movement): string {
  switch (m.kind) {
    case "ahead":
      return `moved ahead ${m.gap}`;
    case "back":
      return `moved back ${m.gap}`;
    case "same":
      return "no change";
    case "now-current":
      return "now current";
    case "now-unavailable":
      return "now unavailable";
    case "now-dated":
      return "now has a cut-off date";
    default:
      return "";
  }
}

export interface PickDates {
  finalAction: Cutoff | undefined;
  filing: Cutoff | undefined;
  finalMove: Movement | null;
  filingMove: Movement | null;
  previousLabel: string | null;
}

export function datesFor(pick: Pick, bulletin: Bulletin, previous: Bulletin | null): PickDates {
  const section = sectionOf(pick.row);
  const fa = cutoffFor(bulletin, section, "finalAction", pick.row, pick.country);
  const df = cutoffFor(bulletin, section, "filing", pick.row, pick.country);
  if (!previous) return { finalAction: fa, filing: df, finalMove: null, filingMove: null, previousLabel: null };
  return {
    finalAction: fa,
    filing: df,
    finalMove: movement(cutoffFor(previous, section, "finalAction", pick.row, pick.country), fa),
    filingMove: movement(cutoffFor(previous, section, "filing", pick.row, pick.country), df),
    previousLabel: previous.label,
  };
}

/** The page on the site for this pick: its wait-time page when there is one. */
export function pickPath(pick: Pick, bulletin: Bulletin): string {
  const pair = WAIT_PAIRS.find((p) => p.row === pick.row && p.country === pick.country);
  return pair ? waitPath(pair) : bulletinPath(bulletin);
}

// -----------------------------------------------------------------------------
// LAYOUT
// -----------------------------------------------------------------------------

function wordmark(): string {
  return `<div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:700;color:${C.ink}">Immigration<span style="color:${C.accent}">Clock</span></div>`;
}

function frame(inner: string, footer: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${C.line};border-radius:12px">
<tr><td style="padding:24px 24px 8px">${wordmark()}</td></tr>
<tr><td style="padding:8px 24px 24px;font-family:${F};font-size:15px;line-height:1.55;color:${C.body}">${inner}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:16px 24px;font-family:${F};font-size:12px;line-height:1.5;color:${C.muted}">${footer}</td></tr></table>
</td></tr></table></body></html>`;
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 12px;font-family:${F};font-size:20px;line-height:1.3;color:${C.ink}">${esc(text)}</h1>`;
}

function p(html: string, extra = ""): string {
  return `<p style="margin:0 0 14px;${extra}">${html}</p>`;
}

function link(href: string, text: string): string {
  return `<a href="${esc(href)}" style="color:${C.accent};text-decoration:underline">${esc(text)}</a>`;
}

function datesTable(d: PickDates): string {
  const row = (label: string, value: Cutoff | undefined, move: Movement | null) => {
    const words = move ? movementWords(move) : "";
    const tone =
      move?.kind === "ahead" || move?.kind === "now-current"
        ? "#047857"
        : move?.kind === "back" || move?.kind === "now-unavailable"
          ? "#b91c1c"
          : C.muted;
    return `<tr>
<td style="padding:10px 12px;border-top:1px solid ${C.line};font-family:${F};font-size:13px;color:${C.muted}">${esc(label)}</td>
<td style="padding:10px 12px;border-top:1px solid ${C.line};font-family:${F};font-size:16px;font-weight:700;color:${C.ink}">${esc(formatCutoff(value))}${
      words ? `<div style="font-size:12px;font-weight:600;color:${tone}">${esc(words)}${d.previousLabel ? ` since ${esc(d.previousLabel)}` : ""}</div>` : ""
    }</td></tr>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px;border:1px solid ${C.line};border-radius:10px;border-collapse:separate">
${row("Final action date", d.finalAction, d.finalMove).replace(/border-top:1px solid [^;]+;/g, "")}
${row("Date for filing", d.filing, d.filingMove)}
</table>`;
}

function datesText(d: PickDates): string[] {
  const line = (label: string, value: Cutoff | undefined, move: Movement | null) => {
    const words = move ? movementWords(move) : "";
    return `${label}: ${formatCutoff(value)}${words ? ` (${words}${d.previousLabel ? ` since ${d.previousLabel}` : ""})` : ""}`;
  };
  return [line("Final action date", d.finalAction, d.finalMove), line("Date for filing", d.filing, d.filingMove)];
}

function proBlock(origin: string, trialDays: number): { html: string; text: string } {
  const lead = `Want to know when your own priority date may be reached? ImmigrationClock Pro gives you a forecast by month for your date, email alerts on a watchlist of policy changes, and your Briefing.`;
  return {
    html: `<div style="margin:18px 0 0;padding:16px;border:1px solid ${C.line};border-radius:10px;background:${C.page}">
${p(esc(lead), "font-size:14px")}
${emailButton(`${origin}/trial`, `Try Pro free for ${trialDays} days`)}
</div>`,
    text: `${lead}\nTry Pro free for ${trialDays} days: ${origin}/trial`,
  };
}

function footer(reason: string, unsubscribe: string | null): { html: string; text: string } {
  const lines = [
    reason,
    unsubscribe ? `Unsubscribe: ${unsubscribe}` : null,
    "Dates are copied from the U.S. Department of State Visa Bulletin and checked against it. This is information, not legal advice.",
    `${OPERATOR.dba}, ${OPERATOR.postalAddress}`,
  ].filter((l): l is string => Boolean(l));
  const html = [
    esc(reason),
    unsubscribe ? `${link(unsubscribe, "Unsubscribe")} from these emails with one click.` : null,
    "Dates are copied from the U.S. Department of State Visa Bulletin and checked against it. This is information, not legal advice.",
    esc(`${OPERATOR.dba}, ${OPERATOR.postalAddress}`),
  ]
    .filter(Boolean)
    .map((l) => `<p style="margin:0 0 6px">${l}</p>`)
    .join("");
  return { html, text: lines.join("\n") };
}

// -----------------------------------------------------------------------------
// 1. CONFIRM
// -----------------------------------------------------------------------------

export function confirmEmail(input: { pick: Pick; confirmUrl: string; origin: string }): BuiltEmail {
  const label = pickLabel(input.pick.row, input.pick.country);
  const days = Math.round(CONFIRM_TTL_SECONDS / 86400);
  const subject = "Confirm your free Visa Bulletin alert";
  const inner = [
    h1("Confirm your free Visa Bulletin alert"),
    p(`Someone, hopefully you, asked ImmigrationClock to email this address when we publish each new Visa Bulletin month, with the dates for <strong>${esc(label)}</strong>.`),
    `<div style="margin:6px 0 18px">${emailButton(input.confirmUrl, "Confirm my alert")}</div>`,
    p(`The link works for ${days} days. If you did not ask for this, ignore this email: nothing is stored until the link is used, and you will not hear from us again.`, `font-size:13px;color:${C.muted}`),
  ].join("\n");
  const f = footer("You are getting this one email because this address was entered on immigrationclock.com.", null);
  const text = [
    "Confirm your free Visa Bulletin alert",
    "",
    `Someone, hopefully you, asked ImmigrationClock to email this address when we publish each new Visa Bulletin month, with the dates for ${label}.`,
    "",
    `Confirm: ${input.confirmUrl}`,
    "",
    `The link works for ${days} days. If you did not ask for this, ignore this email: nothing is stored until the link is used.`,
    "",
    f.text,
  ].join("\n");
  return { subject, html: frame(inner, f.html), text };
}

// -----------------------------------------------------------------------------
// 2. WELCOME (after confirming)
// -----------------------------------------------------------------------------

export function welcomeEmail(input: {
  pick: Pick;
  bulletin: Bulletin;
  previous: Bulletin | null;
  origin: string;
  unsubscribeUrl: string;
  trialDays: number;
}): BuiltEmail {
  const { pick, bulletin, origin } = input;
  const label = pickLabel(pick.row, pick.country);
  const d = datesFor(pick, bulletin, input.previous);
  const page = `${origin}${pickPath(pick, bulletin)}`;
  const pro = proBlock(origin, input.trialDays);
  const subject = `You're set: Visa Bulletin alerts for ${label}`;
  const inner = [
    h1(`You're set: ${label}`),
    p(`We will email you when we publish each new Visa Bulletin month on ImmigrationClock, with these two dates for ${esc(label)} (${esc(ROW_HINT[pick.row])}). Here is where they stand in the <strong>${esc(bulletin.label)}</strong> bulletin:`),
    datesTable(d),
    p(`${link(page, `See ${label} on ImmigrationClock`)} &middot; ${link(bulletin.sourceUrl, "Official bulletin")}`, "font-size:14px"),
    pro.html,
  ].join("\n");
  const f = footer(`You confirmed free Visa Bulletin alerts for ${label} on immigrationclock.com.`, input.unsubscribeUrl);
  const text = [
    `You're set: Visa Bulletin alerts for ${label}`,
    "",
    `We will email you when we publish each new Visa Bulletin month on ImmigrationClock. In the ${bulletin.label} bulletin:`,
    ...datesText(d),
    "",
    `${label} on ImmigrationClock: ${page}`,
    `Official bulletin: ${bulletin.sourceUrl}`,
    "",
    pro.text,
    "",
    f.text,
  ].join("\n");
  return { subject, html: frame(inner, f.html), text };
}

// -----------------------------------------------------------------------------
// 3. THE MONTHLY ALERT
// -----------------------------------------------------------------------------

/** The subject line: the news first. */
export function alertSubject(label: string, bulletin: Bulletin, d: PickDates): string {
  const name = label.replace(", ", " ");
  const words = d.finalMove ? (d.finalMove.kind === "same" ? "unchanged" : movementWords(d.finalMove)) : "";
  const headline = words ? `${name} ${words}` : `${name} at ${formatCutoff(d.finalAction)}`;
  return `${bulletin.label} Visa Bulletin: ${headline}`;
}

export function alertEmail(input: {
  pick: Pick;
  bulletin: Bulletin;
  previous: Bulletin | null;
  origin: string;
  unsubscribeUrl: string;
  trialDays: number;
}): BuiltEmail {
  const { pick, bulletin, origin } = input;
  const label = pickLabel(pick.row, pick.country);
  const d = datesFor(pick, bulletin, input.previous);
  const page = `${origin}${pickPath(pick, bulletin)}`;
  const table = `${origin}${bulletinPath(bulletin)}`;
  const pro = proBlock(origin, input.trialDays);
  const subject = alertSubject(label, bulletin, d);
  const inner = [
    h1(`${bulletin.label} Visa Bulletin: ${label}`),
    p(`The ${esc(bulletin.label)} Visa Bulletin is now on ImmigrationClock. Your two dates:`),
    datesTable(d),
    p(
      `A green card can be approved when the priority date is earlier than the final action date. USCIS says each month which chart it accepts for adjustment of status.`,
      `font-size:14px`
    ),
    p(`${link(page, `${label} wait time`)} &middot; ${link(table, `Full ${bulletin.label} table`)} &middot; ${link(bulletin.sourceUrl, "Official bulletin")}`, "font-size:14px"),
    pro.html,
  ].join("\n");
  const f = footer(`You asked for free Visa Bulletin alerts for ${label} on immigrationclock.com.`, input.unsubscribeUrl);
  const text = [
    `${bulletin.label} Visa Bulletin: ${label}`,
    "",
    `The ${bulletin.label} Visa Bulletin is now on ImmigrationClock. Your two dates:`,
    ...datesText(d),
    "",
    "A green card can be approved when the priority date is earlier than the final action date. USCIS says each month which chart it accepts for adjustment of status.",
    "",
    `${label} wait time: ${page}`,
    `Full table: ${table}`,
    `Official bulletin: ${bulletin.sourceUrl}`,
    `All bulletins: ${OFFICIAL_INDEX_URL}`,
    "",
    pro.text,
    "",
    f.text,
  ].join("\n");
  return { subject, html: frame(inner, f.html), text };
}

/** For the List-Unsubscribe headers (RFC 8058 one-click). */
export function listUnsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export const ALERTS_PAGE_URL = `${SITE.url}${ALERTS_PAGE_PATH}`;
