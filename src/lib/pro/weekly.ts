// =============================================================================
// THE WEEKLY INTELLIGENCE SUMMARY — useful in a quiet week, honest in any week
//
// Sent on Mondays to Pro subscribers with Intelligence on. It is built from
// the landscape and the Briefing timeline, so it says the same things the
// page says, and nothing the records do not:
//
//   • per follow: records published in the last seven days, or plainly "no new
//     records" with the date of the newest one; open proposals; records
//     whose stated effective date has passed (never "in force");
//   • stated effective dates in the next 90 days, for primary matches only;
//   • what was checked: the sources in the latest refresh, the ones that were
//     quiet or failed, and the ones we cannot ingest. A quiet week in our
//     sources is said to be exactly that, never "nothing changed";
//   • for a subscriber whose alerts are a weekly digest, that digest's alerts,
//     so Monday brings one email rather than two.
//
// Deterministic: no AI calls.
// =============================================================================

import type { Alert } from "@/lib/billing/alerts";
import type { ChangeInput } from "@/lib/intelligence/change";
import { EVENTS } from "@/lib/event-store";
import { SITE } from "@/lib/site";
import { buildBriefing } from "./feed";
import { buildLandscape, type Landscape } from "./landscape";

export const WEEK_DAYS = 7;
export const AHEAD_DAYS = 90;

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);

export interface WeeklyFollow {
  label: string;
  newThisWeek: { title: string; path: string; date: string }[];
  latestRecord: string | null;
  openProposals: number;
  tookEffect: number;
  archivePath: string;
}

export interface WeeklySummary {
  weekOf: string;
  follows: WeeklyFollow[];
  comingUp: { title: string; path: string; date: string; daysUntil: number }[];
  /** True when nothing new matched any follow this week. */
  quiet: boolean;
  coverage: Landscape["coverage"];
}

export function buildWeeklySummary(
  options: { follows: readonly string[]; savedIds?: readonly string[]; today: string },
  events: readonly ChangeInput[] = EVENTS as unknown as ChangeInput[]
): WeeklySummary {
  const { follows, today } = options;
  const landscape = buildLandscape({ follows, today }, events);
  const briefing = buildBriefing({ follows, savedIds: options.savedIds ?? [], today }, events);

  // New this week: primary matches only, from the same assessment the page uses.
  const fresh = briefing.feed.filter((i) => {
    const age = days(i.change.publishedDate, today);
    return i.assessment.primary && age >= 0 && age < WEEK_DAYS;
  });

  const weeklyFollows: WeeklyFollow[] = landscape.follows.map((l) => ({
    label: l.label,
    newThisWeek: fresh
      .filter((i) => i.assessment.matches.some((m) => m.follow === l.follow && (m.strength === "named" || m.strength === "categorized")))
      .map((i) => ({ title: i.change.title, path: i.path, date: i.change.publishedDate })),
    latestRecord: l.latestRecord,
    openProposals: l.proposals.length,
    tookEffect: l.tookEffect.length,
    archivePath: l.archivePath,
  }));

  return {
    weekOf: today,
    follows: weeklyFollows,
    comingUp: briefing.timeline
      .filter((t) => t.daysUntil <= AHEAD_DAYS)
      .map((t) => ({ title: t.title, path: t.path, date: t.effectiveDate, daysUntil: t.daysUntil })),
    quiet: weeklyFollows.every((f) => f.newThisWeek.length === 0),
    coverage: landscape.coverage,
  };
}

export interface WeeklyEmail {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

function esc(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

const ALERT_LABEL: Record<Alert["kind"], string> = {
  change: "New",
  effective_reminder: "Takes effect soon",
  warn_notice: "WARN notice",
  h1b_export: "H-1B data",
};

export const QUIET_NOTE =
  "A quiet week in the sources we track is not proof that nothing changed. Sources we cannot ingest are listed below.";

export function renderWeeklyEmail(
  summary: WeeklySummary,
  input: {
    origin: string;
    unsubscribeUrl: string;
    testMode: boolean;
    /** The subscriber's weekly digest, carried here so Monday is one email. */
    alerts?: readonly Alert[];
  }
): WeeklyEmail {
  const origin = input.origin.replace(/\/$/, "");
  const alerts = input.alerts ?? [];
  const newCount = summary.follows.reduce((n, f) => n + f.newThisWeek.length, 0);
  const counts = [
    ...(alerts.length > 0 ? [`${alerts.length} alert${alerts.length === 1 ? "" : "s"}`] : []),
    ...(newCount > 0 ? [`${newCount} new ${newCount === 1 ? "record" : "records"}`] : []),
  ];
  const subject =
    (input.testMode ? "[TEST] " : "") +
    `Your week in immigration policy: ${counts.length > 0 ? counts.join(", ") : "no new records"}` +
    (summary.comingUp.length > 0 ? `, ${summary.comingUp.length} date${summary.comingUp.length === 1 ? "" : "s"} ahead` : "");

  const followLine = (f: WeeklyFollow) => {
    const state =
      f.newThisWeek.length > 0
        ? `${f.newThisWeek.length} new this week`
        : `No new records this week${f.latestRecord ? ` · newest ${fmt(f.latestRecord)}` : " · none in our archive"}`;
    const extra = [
      f.openProposals ? `${f.openProposals} open proposal${f.openProposals === 1 ? "" : "s"} (no final rule in our archive)` : "",
      f.tookEffect ? `${f.tookEffect} with a stated effective date that has passed` : "",
    ].filter(Boolean);
    return { state, extra };
  };

  const t: string[] = [];
  if (input.testMode) t.push("TEST MODE — sent from a deployment running on Stripe test keys.", "");
  t.push(`Week of ${fmt(summary.weekOf)}`, "");
  if (summary.quiet && alerts.length === 0) t.push("No new records matched what you follow this week.", QUIET_NOTE, "");
  if (alerts.length > 0) {
    t.push("YOUR ALERTS THIS WEEK (your weekly digest, included here)");
    for (const a of alerts) t.push(`• ${ALERT_LABEL[a.kind]}: ${a.title} (${fmt(a.date)}) ${origin}${a.href}`, `    ${a.detail}`);
    t.push("");
  }
  t.push("WHAT YOU FOLLOW");
  for (const f of summary.follows) {
    const { state, extra } = followLine(f);
    t.push(`• ${f.label}: ${state}`);
    for (const n of f.newThisWeek.slice(0, 3)) t.push(`    – ${n.title} (${fmt(n.date)}) ${origin}${n.path}`);
    if (extra.length) t.push(`    ${extra.join(" · ")}`);
  }
  t.push("", "COMING UP (stated effective dates, next 90 days)");
  if (summary.comingUp.length === 0) t.push("None stated for what you follow.");
  for (const c of summary.comingUp) t.push(`• ${fmt(c.date)} (in ${c.daysUntil} days): ${c.title} ${origin}${c.path}`);
  t.push(
    "",
    "WHAT WE CHECKED",
    `Latest refresh: ${fmt(summary.coverage.lastRefresh)} — ${summary.coverage.checked.join(", ")}.`,
    ...(summary.coverage.quietOrFailed.length ? [`Returned nothing or failed: ${summary.coverage.quietOrFailed.join(", ")}.`] : []),
    ...(summary.coverage.notCovered.length ? [`Not covered: ${summary.coverage.notCovered.join(", ")}.`] : []),
    "",
    "Information about published government records, not legal advice.",
    `Your Briefing: ${origin}/briefing`,
    `Stop these emails: ${input.unsubscribeUrl}`,
    "",
    `${SITE.name} — ${SITE.tagline}`
  );

  // ---- HTML: the redesign's light palette, one column, phone first ---------
  // Inline styles only (email clients drop <style>); tables for layout where
  // Outlook needs them. Colours are the site's light theme.
  const C = { ink: "#0b1220", body: "#334155", muted: "#556274", line: "#e5e7eb", page: "#f6f7f9", accent: "#0369a1", amber: "#b45309" };
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const h2 = (label: string) =>
    `<h2 style="margin:24px 0 8px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${C.muted}">${esc(label)}</h2>`;
  const link = (href: string, text: string) =>
    `<a href="${esc(href)}" style="color:${C.ink};font-weight:600;text-decoration:none">${esc(text)}</a>`;
  const pill = (text: string, color: string) =>
    `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border:1px solid ${color}33;border-radius:999px;font-size:12px;font-weight:600;color:${color}">${esc(text)}</span>`;

  const pills = [
    ...(alerts.length ? [pill(`${alerts.length} alert${alerts.length === 1 ? "" : "s"}`, C.accent)] : []),
    pill(newCount > 0 ? `${newCount} new` : "No new records", newCount > 0 ? C.accent : C.muted),
    ...(summary.comingUp.length ? [pill(`${summary.comingUp.length} date${summary.comingUp.length === 1 ? "" : "s"} ahead`, C.amber)] : []),
  ].join("");

  const alertHtml =
    alerts.length === 0
      ? ""
      : h2("Your alerts this week") +
        alerts
          .map(
            (a) => `<div style="padding:12px 0;border-top:1px solid ${C.line}">
          <div style="font-size:12px;color:${C.muted}">${esc(ALERT_LABEL[a.kind])} · ${esc(fmt(a.date))}</div>
          <div style="margin-top:2px;font-size:15px;line-height:1.35">${link(origin + a.href, a.title)}</div>
          <div style="margin-top:2px;font-size:13px;line-height:1.45;color:${C.body}">${esc(a.detail)}</div>
        </div>`
          )
          .join("");

  const comingHtml =
    summary.comingUp.length === 0
      ? `<p style="margin:0;font-size:13px;color:${C.muted}">No stated effective dates in the next 90 days for what you follow.</p>`
      : summary.comingUp
          .map(
            (c) => `<table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid ${C.line}"><tr>
          <td style="width:74px;padding:12px 12px 12px 0;vertical-align:top">
            <div style="font-size:13px;font-weight:700;color:${C.ink}">${esc(fmt(c.date).replace(/, \d{4}$/, ""))}</div>
            <div style="font-size:12px;color:${c.daysUntil <= 30 ? C.amber : C.muted}">in ${c.daysUntil} day${c.daysUntil === 1 ? "" : "s"}</div>
          </td>
          <td style="padding:12px 0;vertical-align:top;font-size:14px;line-height:1.4">${link(origin + c.path, c.title)}</td>
        </tr></table>`
          )
          .join("");

  const followHtml = summary.follows
    .map((f) => {
      const { state, extra } = followLine(f);
      const items = f.newThisWeek
        .slice(0, 3)
        .map((n) => `<div style="margin-top:6px;font-size:14px;line-height:1.4">${link(origin + n.path, n.title)} <span style="color:${C.muted};font-size:12px">${esc(fmt(n.date))}</span></div>`)
        .join("");
      return `<div style="padding:12px 0;border-top:1px solid ${C.line}">
        <div style="font-size:14px;font-weight:600;color:${C.ink}">${esc(f.label)} <span style="font-weight:400;color:${f.newThisWeek.length ? C.accent : C.muted}">· ${esc(state)}</span></div>
        ${items}
        ${extra.length ? `<div style="margin-top:4px;font-size:12px;color:${C.muted}">${esc(extra.join(" · "))}</div>` : ""}
      </div>`;
    })
    .join("");

  const cov = summary.coverage;
  const html = `<div style="margin:0;padding:16px 12px;background:${C.page};font-family:${font}">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${C.line};border-radius:16px;overflow:hidden">
    ${input.testMode ? `<div style="background:#fef3c7;padding:10px 20px;color:#92400e;font-size:13px"><strong>Test mode.</strong></div>` : ""}
    <div style="padding:20px 20px 4px">
      <div style="font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:700;color:${C.ink}">Immigration<span style="color:${C.accent}">Clock</span> <span style="font-family:${font};font-weight:600;color:${C.muted}">Pro</span></div>
      <h1 style="margin:12px 0 10px;font-size:22px;line-height:1.25;color:${C.ink}">Your week, ${esc(fmt(summary.weekOf))}</h1>
      <div>${pills}</div>
      ${summary.quiet && alerts.length === 0 ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.5;color:${C.body}">No new records matched what you follow this week. ${esc(QUIET_NOTE)}</p>` : ""}
      ${alertHtml}
      ${h2("Coming up")}
      ${comingHtml}
      ${h2("What you follow")}
      ${followHtml}
      <div style="margin:24px 0 20px">
        <a href="${esc(origin + "/briefing")}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:${C.accent};color:#ffffff;font-size:14px;font-weight:600;text-decoration:none">Open your Briefing</a>
      </div>
    </div>
    <div style="padding:14px 20px 18px;background:${C.page};border-top:1px solid ${C.line};font-size:12px;line-height:1.55;color:${C.muted}">
      <p style="margin:0">Checked ${esc(fmt(cov.lastRefresh))}: ${esc(cov.checked.join(", "))}.${
        cov.quietOrFailed.length ? ` Returned nothing or failed: ${esc(cov.quietOrFailed.join(", "))}.` : ""
      }${cov.notCovered.length ? ` Not covered: ${esc(cov.notCovered.join(", "))}.` : ""}</p>
      <p style="margin:8px 0 0">Information about published government records, not legal advice. <a href="${esc(input.unsubscribeUrl)}" style="color:${C.muted}">Stop these emails</a></p>
    </div>
  </div>
</div>`;

  return {
    subject,
    text: t.join("\n"),
    html,
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}
