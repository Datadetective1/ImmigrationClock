#!/usr/bin/env tsx
/**
 * ImmigrationClock — weekly "Immigration Pulse" email generator.
 *
 * Runs in `prebuild` (after build-dataset). It turns the cross-source change
 * feed into a ready-to-send weekly digest — subject + HTML + plain text +
 * markdown — written to src/lib/generated/pulse-email.json (read by the
 * /admin/pulse-email preview page) and to public/pulse-email.{html,txt} for
 * direct download. Connect an email provider and it's a one-paste send.
 *
 * Light, table-based, inline-styled HTML for broad email-client compatibility.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildChangeFeed } from "../src/lib/changes";
import { cbpRows, iceByFy, WARN_LIVE, CURRENT_FY } from "../src/lib/dataset";
import { LIVE_BLS } from "../src/lib/data";
import { formatCompact, formatNumber } from "../src/lib/format";
import { SITE } from "../src/lib/site";

const JSON_OUT = fileURLToPath(new URL("../src/lib/generated/pulse-email.json", import.meta.url));
const HTML_OUT = fileURLToPath(new URL("../public/pulse-email.html", import.meta.url));
const TXT_OUT = fileURLToPath(new URL("../public/pulse-email.txt", import.meta.url));

const BASE = SITE.url.replace(/\/$/, "");
const ACCENT = "#0ea5e9";
const PROV: Record<string, string> = { reported: "Reported", projected: "Projected", estimated: "Estimated" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function abs(href?: string): string {
  if (!href) return BASE;
  return /^https?:\/\//.test(href) ? href : `${BASE}${href}`;
}

function main() {
  const items = buildChangeFeed().slice(0, 5);
  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  const subject = `Immigration Pulse · ${dateStr} — ${items.length} things that changed`;
  const preheader = items[0] ? items[0].title : "The latest changes in U.S. immigration data.";

  // Key stats
  const borderYtd = cbpRows.find((r) => r.fiscalYear === CURRENT_FY && r.border === "nationwide");
  const removals = iceByFy[CURRENT_FY]?.removals;
  const stats: { label: string; value: string }[] = [
    { label: `Border encounters · FY${CURRENT_FY} YTD`, value: borderYtd ? formatCompact(borderYtd.totalEncounters) : "—" },
    { label: `ICE removals · FY${CURRENT_FY} YTD`, value: removals ? formatCompact(removals) : "—" },
    { label: "Texas layoffs · 2026 YTD", value: WARN_LIVE.ok && WARN_LIVE.ytdTotal != null ? formatNumber(WARN_LIVE.ytdTotal) : "—" },
    { label: "U.S. unemployment", value: LIVE_BLS.value != null ? `${LIVE_BLS.value}%` : "—" },
  ];

  // ---- Plain text ----
  const text = [
    `IMMIGRATION PULSE — ${dateStr}`,
    `${items.length} things that changed in U.S. immigration. Every figure is sourced and labelled.`,
    "",
    ...items.flatMap((it, i) => [
      `${i + 1}. ${it.title} [${PROV[it.provenance] ?? it.provenance}]`,
      `   ${it.detail ?? ""}`.trimEnd(),
      `   Source: ${it.sourceName} — ${it.sourceUrl}`,
      "",
    ]),
    "BY THE NUMBERS",
    ...stats.map((s) => `- ${s.label}: ${s.value}`),
    "",
    `Full Pulse: ${BASE}/pulse`,
    `Data context, not legal advice. Figures are labelled reported, projected, or estimated.`,
    `You can unsubscribe anytime.`,
  ].join("\n");

  // ---- Markdown ----
  const markdown = [
    `# Immigration Pulse — ${dateStr}`,
    "",
    `**${items.length} things that changed** in U.S. immigration. Every figure is sourced and labelled.`,
    "",
    ...items.map(
      (it, i) =>
        `**${i + 1}. ${it.title}** _(${PROV[it.provenance] ?? it.provenance})_\n${it.detail ?? ""}\n[${it.sourceName}](${it.sourceUrl})\n`
    ),
    `## By the numbers`,
    ...stats.map((s) => `- ${s.label}: **${s.value}**`),
    "",
    `[See the full Pulse →](${BASE}/pulse)`,
    "",
    `_Data context, not legal advice._`,
  ].join("\n");

  // ---- HTML ----
  const itemRows = items
    .map(
      (it, i) => `
      <tr><td style="padding:14px 0;border-top:1px solid #e5e7eb;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="top" style="width:28px;font:700 16px Arial,sans-serif;color:${ACCENT};">${i + 1}.</td>
          <td valign="top">
            <div style="font:700 16px Arial,sans-serif;color:#0f172a;">${esc(it.title)}
              <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:6px;background:#f1f5f9;color:#475569;font:600 10px Arial,sans-serif;text-transform:uppercase;letter-spacing:.04em;">${PROV[it.provenance] ?? it.provenance}</span>
            </div>
            ${it.detail ? `<div style="margin-top:4px;font:400 14px/1.5 Arial,sans-serif;color:#334155;">${esc(it.detail)}</div>` : ""}
            <div style="margin-top:6px;"><a href="${abs(it.sourceUrl)}" style="font:400 12px Arial,sans-serif;color:#64748b;text-decoration:none;">◆ ${esc(it.sourceName)}</a></div>
          </td>
        </tr></table>
      </td></tr>`
    )
    .join("");

  const statCells = stats
    .map(
      (s) => `<td align="center" style="padding:10px;width:25%;">
        <div style="font:700 18px Arial,sans-serif;color:#0f172a;">${esc(s.value)}</div>
        <div style="font:400 11px Arial,sans-serif;color:#64748b;">${esc(s.label)}</div>
      </td>`
    )
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
    <tr><td style="background:#0f172a;padding:22px 28px;">
      <div style="font:800 20px Arial,sans-serif;color:#ffffff;">Immigration<span style="color:${ACCENT};">Clock</span> · Pulse</div>
      <div style="font:400 13px Arial,sans-serif;color:#94a3b8;margin-top:2px;">${esc(dateStr)} — the ${items.length} biggest changes this week</div>
    </td></tr>
    <tr><td style="padding:20px 28px 4px;">
      <p style="font:400 14px/1.6 Arial,sans-serif;color:#334155;margin:0 0 8px;">The biggest changes in U.S. immigration data this week. Every figure is sourced and labelled <em>reported</em>, <em>projected</em>, or <em>estimated</em> — we show direction, not opinion.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${itemRows}</table>
    </td></tr>
    <tr><td style="padding:8px 28px 18px;">
      <div style="font:700 12px Arial,sans-serif;color:#0f172a;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">By the numbers</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;"><tr>${statCells}</tr></table>
    </td></tr>
    <tr><td align="center" style="padding:6px 28px 24px;">
      <a href="${BASE}/pulse" style="display:inline-block;background:${ACCENT};color:#ffffff;font:700 14px Arial,sans-serif;text-decoration:none;padding:10px 22px;border-radius:10px;">See the full Pulse →</a>
    </td></tr>
    <tr><td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e5e7eb;">
      <p style="font:400 11px/1.5 Arial,sans-serif;color:#94a3b8;margin:0;">Data context for informational purposes — not legal or immigration advice. Figures lag official reporting and are labelled accordingly.<br>${esc(BASE)} · You can unsubscribe anytime.</p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const payload = {
    generatedAt: new Date().toISOString(),
    subject,
    preheader,
    itemCount: items.length,
    stats,
    html,
    text,
    markdown,
  };

  return { payload, html, text };
}

async function run() {
  const { payload, html, text } = main();
  await mkdir(dirname(JSON_OUT), { recursive: true });
  await writeFile(JSON_OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
  await mkdir(dirname(HTML_OUT), { recursive: true });
  await writeFile(HTML_OUT, html, "utf8");
  await writeFile(TXT_OUT, text, "utf8");
  console.log(`[build-pulse-email] wrote ${payload.itemCount} items · subject: ${payload.subject}`);
}

run().catch((err) => {
  console.error(`[build-pulse-email] FAILED: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
