// =============================================================================
// THE WATCHLIST ALERT EMAIL
//
// What a Pro subscriber receives when something they follow changes. The
// selection — what counts as new, and what may honestly be said about it —
// lives in alerts.ts. This file only turns a batch into a message.
//
// Three things every alert email carries, and tests assert each:
//   • WHY it reached them: the followed entity each item matched.
//   • A link to the change's own page, where the source document is.
//   • A one-click way to stop. Alerts are a feature a subscriber chose, not a
//     transaction notice, so they get an unsubscribe link and the
//     List-Unsubscribe headers mail clients use for their own button.
// =============================================================================

import type { Alert } from "./alerts";
import { labelForEntity } from "@/lib/entity-labels";
import { SITE } from "@/lib/site";
import { flagOn } from "@/lib/flags";
import { EMAIL_COLOR, EMAIL_FONT, emailButton, emailPill, emailWordmark } from "@/lib/email/style";

export interface AlertEmailInput {
  alerts: Alert[];
  /** Site origin, no trailing slash needed. */
  origin: string;
  /** Absolute, signed one-click unsubscribe URL. */
  unsubscribeUrl: string;
  /** True when billing runs on Stripe test keys. */
  testMode: boolean;
  supportEmail?: string;
}

export interface AlertEmail {
  subject: string;
  text: string;
  html: string;
  /** Extra headers for the send: List-Unsubscribe and its one-click partner. */
  headers: Record<string, string>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function buildAlertEmail(input: AlertEmailInput): AlertEmail {
  const origin = input.origin.replace(/\/$/, "");
  const accountUrl = `${origin}/account`;
  const n = input.alerts.length;
  const noun = n === 1 ? "update" : "updates";
  const lead = input.alerts[0]?.title ?? "";
  const subject =
    (input.testMode ? "[TEST] " : "") +
    (n === 1 ? `Watchlist: ${lead}`.slice(0, 140) : `${n} ${noun} on your ${SITE.name} watchlist`);

  // A reminder is not news: it is about a change already published. The
  // headline says which is which instead of calling everything "new".
  const reminders = input.alerts.filter((a) => a.kind === "effective_reminder").length;
  const fresh = n - reminders;
  const headline =
    [
      fresh > 0 ? `${fresh} new ${fresh === 1 ? "update" : "updates"}` : "",
      reminders > 0 ? `${reminders} effective-date ${reminders === 1 ? "reminder" : "reminders"}` : "",
    ]
      .filter(Boolean)
      .join(" and ") + " on what you follow";

  const items = input.alerts.map((a) => ({
    ...a,
    url: `${origin}${a.href}`,
    because: a.matched.map(labelForEntity).join(", "),
  }));

  const lines: string[] = [];
  if (input.testMode) lines.push("TEST MODE: sent from a deployment running on Stripe test keys.", "");
  lines.push(`${headline}:`, "");
  for (const it of items) {
    lines.push(
      `• ${it.title}`,
      `  ${formatDate(it.date)} · ${it.detail}`,
      `  Matched: ${it.because}`,
      `  ${it.url}`,
      ...(it.source ? [`  Source: ${it.source.name} ${it.source.url}`] : []),
      ""
    );
  }
  lines.push(
    "Each change links to its official source. This is information, not legal advice.",
    "",
    `Change what you follow: ${origin}/following`,
    `Manage your subscription: ${accountUrl}`,
    `Stop these alerts: ${input.unsubscribeUrl}`
  );
  if (input.supportEmail) lines.push(`Questions: ${input.supportEmail}`);
  lines.push("", `${SITE.name} | ${SITE.tagline}`);

  // ---- HTML: the same look as the weekly summary (lib/email/style.ts) -----
  const C = EMAIL_COLOR;
  const kindLabel = (k: Alert["kind"]) =>
    k === "effective_reminder" ? "Reminder" : k === "warn_notice" ? "WARN notice" : k === "h1b_export" ? "H-1B data" : "New";
  const itemHtml = items
    .map(
      (it) => `<div style="padding:14px 0;border-top:1px solid ${C.line}">
        <div style="font-size:12px;color:${it.kind === "effective_reminder" ? C.amber : C.muted}">${escapeHtml(kindLabel(it.kind))} · ${escapeHtml(formatDate(it.date))}</div>
        <a href="${escapeHtml(it.url)}" style="display:block;margin-top:3px;font-size:15px;line-height:1.35;font-weight:600;color:${C.ink};text-decoration:none">${escapeHtml(it.title)}</a>
        <div style="margin-top:3px;font-size:13px;line-height:1.45;color:${C.body}">${escapeHtml(it.detail)}</div>
        <div style="margin-top:6px;font-size:12px;color:${C.muted}">Matches ${escapeHtml(it.because)}${
          it.source ? ` · <a href="${escapeHtml(it.source.url)}" style="color:${C.accent};font-weight:600;text-decoration:none">${escapeHtml(it.source.name)} ↗</a>` : ""
        }</div>
      </div>`
    )
    .join("");

  const pills = [
    ...(fresh > 0 ? [emailPill(`${fresh} new`, C.accent)] : []),
    ...(reminders > 0 ? [emailPill(`${reminders} reminder${reminders === 1 ? "" : "s"}`, C.amber)] : []),
  ].join("");

  const html = `<div style="margin:0;padding:16px 12px;background:${C.page};font-family:${EMAIL_FONT}">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${C.line};border-radius:16px;overflow:hidden">
    ${input.testMode ? `<div style="background:#fef3c7;padding:10px 20px;color:#92400e;font-size:13px"><strong>Test mode.</strong> Sent from a deployment running on Stripe test keys.</div>` : ""}
    <div style="padding:20px 20px 4px">
      ${emailWordmark()}
      <h1 style="margin:12px 0 10px;font-size:22px;line-height:1.25;color:${C.ink}">${reminders > 0 && fresh === 0 ? "Coming up on what you follow" : "New on what you follow"}</h1>
      <div>${pills}</div>
      ${itemHtml}
      <div style="margin:20px 0">${
        // The Briefing exists only while its flag is on; otherwise the page the
        // subscriber already uses is what they follow.
        flagOn("pro_briefing") ? emailButton(`${origin}/briefing`, "Open your Briefing") : emailButton(`${origin}/following`, "See what you follow")
      }</div>
    </div>
    <div style="padding:14px 20px 18px;background:${C.page};border-top:1px solid ${C.line};font-size:12px;line-height:1.55;color:${C.muted}">
      <p style="margin:0">Each item links to its record and its official source. Information about published government records, not legal advice.</p>
      <p style="margin:8px 0 0">You follow these in ${escapeHtml(SITE.name)} Pro.
        <a href="${escapeHtml(`${origin}/following`)}" style="color:${C.muted}">Change what you follow</a> ·
        <a href="${escapeHtml(accountUrl)}" style="color:${C.muted}">Manage subscription</a> ·
        <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${C.muted}">Stop these alerts</a>${
          input.supportEmail ? ` · <a href="mailto:${escapeHtml(input.supportEmail)}" style="color:${C.muted}">${escapeHtml(input.supportEmail)}</a>` : ""
        }</p>
    </div>
  </div>
</div>`;

  return {
    subject,
    text: lines.join("\n"),
    html,
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
