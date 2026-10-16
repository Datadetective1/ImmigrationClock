// =============================================================================
// THE WEEKLY INTELLIGENCE SUMMARY — useful in a quiet week, honest in any week
//
// Sent on Mondays to Pro subscribers with Intelligence on. It is built from
// the landscape and the Briefing timeline, so it says the same things the
// page says, and nothing the records do not:
//
//   • per follow: records published in the last seven days, or plainly "no new
//     records" with the date of the newest one; open proposals; what took
//     effect;
//   • stated effective dates in the next 90 days, for primary matches only;
//   • what was checked: the sources in the latest refresh, the ones that were
//     quiet or failed, and the ones we cannot ingest. A quiet week in our
//     sources is said to be exactly that, never "nothing changed".
//
// Deterministic: no AI calls.
// =============================================================================

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

export const QUIET_NOTE =
  "A quiet week in the sources we track is not proof that nothing changed. Sources we cannot ingest are listed below.";

export function renderWeeklyEmail(
  summary: WeeklySummary,
  input: { origin: string; unsubscribeUrl: string; testMode: boolean }
): WeeklyEmail {
  const origin = input.origin.replace(/\/$/, "");
  const newCount = summary.follows.reduce((n, f) => n + f.newThisWeek.length, 0);
  const subject =
    (input.testMode ? "[TEST] " : "") +
    `Your week in immigration policy: ${newCount === 0 ? "no new records" : `${newCount} new ${newCount === 1 ? "record" : "records"}`}` +
    (summary.comingUp.length > 0 ? `, ${summary.comingUp.length} date${summary.comingUp.length === 1 ? "" : "s"} ahead` : "");

  const followLine = (f: WeeklyFollow) => {
    const state =
      f.newThisWeek.length > 0
        ? `${f.newThisWeek.length} new this week`
        : `No new records this week${f.latestRecord ? ` · newest ${fmt(f.latestRecord)}` : " · none in our archive"}`;
    const extra = [
      f.openProposals ? `${f.openProposals} open proposal${f.openProposals === 1 ? "" : "s"} (no final rule in our archive)` : "",
      f.tookEffect ? `${f.tookEffect} took effect (stated date passed)` : "",
    ].filter(Boolean);
    return { state, extra };
  };

  const t: string[] = [];
  if (input.testMode) t.push("TEST MODE — sent from a deployment running on Stripe test keys.", "");
  t.push(`Week of ${fmt(summary.weekOf)}`, "");
  if (summary.quiet) t.push("No new records matched what you follow this week.", QUIET_NOTE, "");
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

  const followHtml = summary.follows
    .map((f) => {
      const { state, extra } = followLine(f);
      const items = f.newThisWeek
        .slice(0, 3)
        .map((n) => `<li><a href="${esc(origin + n.path)}" style="color:#0f172a">${esc(n.title)}</a> <span style="color:#64748b">${esc(fmt(n.date))}</span></li>`)
        .join("");
      return `<tr><td style="padding:10px 0;border-top:1px solid #e2e8f0">
        <div style="font-size:14px;font-weight:600;color:#0f172a">${esc(f.label)}</div>
        <div style="font-size:13px;color:#475569">${esc(state)}</div>
        ${items ? `<ul style="margin:4px 0 0 16px;padding:0;font-size:13px">${items}</ul>` : ""}
        ${extra.length ? `<div style="margin-top:4px;font-size:12px;color:#64748b">${esc(extra.join(" · "))}</div>` : ""}
      </td></tr>`;
    })
    .join("");
  const comingHtml =
    summary.comingUp.length === 0
      ? `<p style="font-size:13px;color:#475569;margin:4px 0">None stated for what you follow.</p>`
      : `<ul style="margin:4px 0 0 16px;padding:0;font-size:13px">${summary.comingUp
          .map((c) => `<li>${esc(fmt(c.date))} (in ${c.daysUntil} days): <a href="${esc(origin + c.path)}" style="color:#0f172a">${esc(c.title)}</a></li>`)
          .join("")}</ul>`;
  const cov = summary.coverage;
  const html = `<div style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
    ${input.testMode ? `<div style="background:#fef3c7;padding:12px 24px;color:#92400e;font-size:13px"><strong>Test mode.</strong></div>` : ""}
    <div style="padding:24px">
      <p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b">${esc(SITE.name)} Pro · Weekly intelligence</p>
      <h1 style="margin:0 0 8px;font-size:20px;line-height:1.3;color:#0f172a">Week of ${esc(fmt(summary.weekOf))}</h1>
      ${summary.quiet ? `<p style="font-size:13px;color:#475569">No new records matched what you follow this week. ${esc(QUIET_NOTE)}</p>` : ""}
      <h2 style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:16px 0 0">What you follow</h2>
      <table style="width:100%;border-collapse:collapse">${followHtml}</table>
      <h2 style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:16px 0 0">Coming up · stated effective dates, next 90 days</h2>
      ${comingHtml}
      <h2 style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:16px 0 0">What we checked</h2>
      <p style="font-size:12px;line-height:1.6;color:#64748b;margin:4px 0">Latest refresh ${esc(fmt(cov.lastRefresh))}: ${esc(cov.checked.join(", "))}.${
        cov.quietOrFailed.length ? ` Returned nothing or failed: ${esc(cov.quietOrFailed.join(", "))}.` : ""
      }${cov.notCovered.length ? ` Not covered: ${esc(cov.notCovered.join(", "))}.` : ""}</p>
      <p style="font-size:12px;color:#64748b;margin:12px 0 0">Information about published government records, not legal advice.</p>
    </div>
    <div style="padding:16px 24px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
      <a href="${esc(origin + "/briefing")}" style="color:#0f172a">Open your Briefing</a> ·
      <a href="${esc(input.unsubscribeUrl)}" style="color:#0f172a">Stop these emails</a>
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
