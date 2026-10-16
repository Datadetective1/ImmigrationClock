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
  if (input.testMode) lines.push("TEST MODE — sent from a deployment running on Stripe test keys.", "");
  lines.push(`${headline}:`, "");
  for (const it of items) {
    lines.push(
      `• ${it.title}`,
      `  ${formatDate(it.date)} · ${it.detail}`,
      `  Matched: ${it.because}`,
      `  ${it.url}`,
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
  lines.push("", `${SITE.name} — ${SITE.tagline}`);

  const itemHtml = items
    .map(
      (it) => `<tr><td style="padding:14px 0;border-top:1px solid #e2e8f0">
        <a href="${escapeHtml(it.url)}" style="font-size:15px;font-weight:600;color:#0f172a;text-decoration:none">${escapeHtml(it.title)}</a>
        <div style="margin-top:4px;font-size:13px;line-height:1.5;color:#475569">${escapeHtml(formatDate(it.date))} · ${escapeHtml(it.detail)}</div>
        <div style="margin-top:4px;font-size:12px;color:#64748b">Matched: ${escapeHtml(it.because)}</div>
      </td></tr>`
    )
    .join("");

  const html = `<div style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    ${
      input.testMode
        ? `<div style="background:#fef3c7;border-bottom:1px solid #fde68a;padding:12px 24px;color:#92400e;font-size:13px">
      <strong>Test mode.</strong> Sent from a deployment running on Stripe test keys.
    </div>`
        : ""
    }
    <div style="padding:24px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">${escapeHtml(SITE.name)} Pro · Watchlist</p>
      <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:#0f172a">${escapeHtml(headline)}</h1>
      <table style="width:100%;border-collapse:collapse">${itemHtml}</table>
      <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#64748b">
        Each change links to its official source. This is information, not legal advice.
      </p>
    </div>
    <div style="padding:16px 24px 24px;border-top:1px solid #e2e8f0">
      <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#64748b">
        You get this because you subscribe to ${escapeHtml(SITE.name)} Pro and follow these topics.
        <a href="${escapeHtml(`${origin}/following`)}" style="color:#0f172a">Change what you follow</a> ·
        <a href="${escapeHtml(accountUrl)}" style="color:#0f172a">Manage subscription</a> ·
        <a href="${escapeHtml(input.unsubscribeUrl)}" style="color:#0f172a">Stop these alerts</a>
      </p>
      ${
        input.supportEmail
          ? `<p style="margin:0 0 6px;font-size:12px;color:#64748b">Questions? <a href="mailto:${escapeHtml(input.supportEmail)}" style="color:#0f172a">${escapeHtml(input.supportEmail)}</a></p>`
          : ""
      }
      <p style="margin:0;font-size:12px;color:#94a3b8">${escapeHtml(SITE.name)} — ${escapeHtml(SITE.tagline)}</p>
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
