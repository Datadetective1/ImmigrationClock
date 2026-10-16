// =============================================================================
// /briefing — a Pro subscriber's working page
//
// What changed for me, what takes effect when, what I have kept, and what I
// have already been told — on one page, built from the subscriber's synced
// watchlist and saved changes. Every item carries its source, its dates and
// the reason it is here; the page never says more than the records do.
//
// Behind the pro_briefing flag: while it is off this route is a 404.
// Dynamic and noindex, because its content depends on who is asking.
// =============================================================================

import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { BriefingSettings } from "@/components/BriefingSettings";
import { LandscapeSection } from "@/components/LandscapeSection";
import { flagOn } from "@/lib/flags";
import { buildLandscape } from "@/lib/pro/landscape";
import { COOKIE_NAME } from "@/lib/billing/entitlement";
import { parseCursor } from "@/lib/billing/alerts";
import { billingOrigin } from "@/lib/billing/config";
import { labelForEntity } from "@/lib/entity-labels";
import { buildMetadata } from "@/lib/seo";
import { proGate } from "@/lib/pro/caller";
import { calendarUrl } from "@/lib/pro/calendar";
import { buildBriefing, type FeedItem } from "@/lib/pro/feed";
import { parseHistory } from "@/lib/pro/history";
import { parsePrefs } from "@/lib/pro/prefs";
import { parseSaved } from "@/lib/pro/saved";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Your Briefing",
  description: "Changes that touch what you follow, what takes effect when, and your saved research.",
  path: "/briefing",
  noindex: true,
});

function formatDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

const TONE: Record<string, string> = {
  attention: "border-status-amber/40 bg-status-amber/10 text-status-amber",
  info: "border-accent/30 text-accent",
  muted: "border-white/10 text-slate-400",
};

const STRENGTH_NOTE: Record<string, string> = {
  named: "Named",
  categorized: "Topic",
  mentioned: "Body mention",
  weak: "Possible",
};

/**
 * One record, compact. The explanation comes first and is the document's own
 * summary plus why it is here; the evidence, source and limitations are one
 * tap away rather than the first thing a reader has to parse.
 */
function FeedCard({ item }: { item: FeedItem }) {
  const a = item.assessment;
  return (
    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className={`rounded-full border px-2 py-0.5 font-semibold ${TONE[a.urgency.tone]}`}>{a.urgency.label}</span>
        {item.change.status === "proposed" ? (
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-slate-300">Proposed rule</span>
        ) : null}
        {item.saved ? <span className="rounded-full border border-white/15 px-2 py-0.5 text-slate-300">Saved</span> : null}
        {a.relevance === "mentioned" || a.relevance === "weak" ? (
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-slate-400">Possibly incidental</span>
        ) : null}
      </div>

      <Link href={item.path} className="mt-2 block text-[15px] font-semibold leading-snug text-white hover:underline">
        {item.change.title}
      </Link>

      <dl className="mt-2 space-y-1.5 text-[13px] leading-snug">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">What changed</dt>
          <dd className="text-slate-300">{a.whatChanged}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Why it&rsquo;s here</dt>
          <dd className="text-slate-300">
            {a.matches.length > 0 ? a.matches[0].reason : "You saved this record."}
            {a.matches.length > 1 ? (
              <span className="text-slate-500"> Also matches {a.matches.slice(1).map((m) => m.label).join(", ")}.</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-slate-500">Status</dt>
          <dd className="text-slate-300">
            {a.status}
            {a.recordedMajor && a.section === "historical" ? (
              <span className="text-slate-500"> Recorded as a major change when published.</span>
            ) : null}
          </dd>
        </div>
        <div className="flex flex-wrap gap-x-4 text-xs text-slate-400">
          {a.dates.map((d) => (
            <span key={d.label}>
              {d.label} <span className="text-slate-200">{formatDate(d.date)}</span>
            </span>
          ))}
          {!item.change.effectiveDate && item.change.status !== "proposed" ? <span>No effective date stated</span> : null}
        </div>
      </dl>

      <details className="mt-3 text-xs text-slate-400">
        <summary className="cursor-pointer select-none text-slate-300 hover:text-white">Review next, evidence and source</summary>
        <div className="mt-2 space-y-2">
          <p>
            <span className="text-slate-300">Review next: </span>
            {item.brief.suggestedProfessionalAction}
          </p>
          {a.matches.length > 0 ? (
            <ul className="space-y-1.5">
              {a.matches.map((m) => (
                <li key={m.follow}>
                  <span className="text-slate-300">
                    {m.label} · {STRENGTH_NOTE[m.strength]}
                  </span>{" "}
                  — {m.reason}
                  {m.quote ? (
                    <q className="mt-1 block border-l-2 border-white/10 pl-2 italic">
                      {m.quote.length > 300 ? `${m.quote.slice(0, 297)}…` : m.quote}
                    </q>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p>
            Source:{" "}
            <a href={item.change.source.url} className="underline decoration-dotted hover:text-white" rel="noopener noreferrer">
              {item.change.source.name}
            </a>{" "}
            · <Link href={item.path} className="underline decoration-dotted hover:text-white">Full record</Link>
          </p>
          {item.brief.limitations.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 text-slate-500">
              {item.brief.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function FeedSection({ id, title, hint, items, empty }: { id: string; title: string; hint: string; items: FeedItem[]; empty: string }) {
  return (
    <section aria-labelledby={id}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="section-title">{title}</h2>
        <span className="text-xs text-slate-500">{items.length}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
      {items.length === 0 ? (
        <p className="mt-3 rounded-xl border border-white/5 p-4 text-sm text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((item) => (
            <FeedCard key={item.change.recordId} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Gate({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="container-page max-w-2xl py-10">
      <section className="panel panel-pad">
        <h2 className="section-title">{title}</h2>
        <p className="mt-2 text-sm text-slate-300">{body}</p>
        <Link
          href={href}
          className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-accent-soft"
        >
          {cta}
        </Link>
      </section>
    </div>
  );
}

export default async function BriefingPage() {
  const gate = await proGate(cookies().get(COOKIE_NAME)?.value);
  if (!gate.ok && gate.reason === "off") notFound();

  const header = (
    <PageHeader
      eyebrow="Pro"
      title="Your Briefing"
      description="What changed in what you follow, what takes effect when, and the research you have kept — each item with its source."
      crumbs={[
        { href: "/", label: "Home" },
        { href: "/briefing", label: "Briefing" },
      ]}
    />
  );

  if (!gate.ok) {
    return (
      <div>
        {header}
        {gate.reason === "not_signed_in" ? (
          <Gate title="Sign in to see your Briefing" body="Briefing is part of Pro. Sign in with the email you subscribed with." href="/account" cta="Sign in" />
        ) : gate.reason === "not_pro" ? (
          <Gate title="Briefing is part of Pro" body="Your account does not have an active Pro subscription." href="/pricing" cta="See Pro" />
        ) : (
          <Gate title="Briefing is unavailable" body="Briefing could not be loaded right now. Your data is safe; try again shortly." href="/" cta="Home" />
        )}
      </div>
    );
  }

  const { store, key, now, secret } = gate;
  const today = new Date(now * 1000).toISOString().slice(0, 10);
  const [watch, savedRaw, prefsRaw, historyRaw, cursorRaw] = await Promise.all([
    store.getWatchlist(key),
    store.getProDoc("saved", key),
    store.getProDoc("prefs", key),
    store.getProDoc("history", key),
    store.getAlertCursor(key),
  ]);
  const follows = watch?.entityIds ?? [];
  const saved = parseSaved(savedRaw);
  const prefs = parsePrefs(prefsRaw);
  const history = parseHistory(historyRaw);
  const alertsOn = typeof parseCursor(cursorRaw).pausedAt !== "number";

  const briefing = buildBriefing({ follows, savedIds: saved.map((s) => s.id), today });
  const intelligence = flagOn("pro_intelligence");
  const { upcoming, current, historical } = briefing.sections;
  const soon = upcoming.filter((i) => i.assessment.urgency.tone === "attention").length;

  return (
    <div>
      {header}
      <div className="container-page max-w-3xl space-y-6 py-8">
        <section aria-label="Summary" className="grid grid-cols-3 gap-2 text-center">
          {[
            [soon, "take effect in 30 days"],
            [current.length, "new or recent"],
            [saved.length, "saved"],
          ].map(([n, label]) => (
            <div key={label as string} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-2xl font-semibold text-white">{n}</p>
              <p className="text-[11px] text-slate-400">{label}</p>
            </div>
          ))}
        </section>

        {intelligence && follows.length > 0 ? (
          <LandscapeSection landscape={buildLandscape({ follows, today })} />
        ) : (
          <section className="panel panel-pad" aria-labelledby="following-heading">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="following-heading" className="section-title">You follow</h2>
              <Link href="/following" className="text-xs text-slate-400 underline decoration-dotted hover:text-white">
                Edit
              </Link>
            </div>
            {follows.length === 0 ? (
              <p className="mt-2 text-sm text-slate-300">
                Nothing yet. <Link href="/following" className="underline">Choose visas, countries, agencies or topics</Link>{" "}
                and your Briefing fills with the changes that touch them.
              </p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {follows.map((f) => (
                  <li key={f} className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-slate-300">
                    {labelForEntity(f)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <FeedSection
          id="upcoming-heading"
          title="Coming up"
          hint="Followed or saved changes with an effective date the document states, in date order. Proposals are never dated here."
          items={upcoming}
          empty="No stated effective dates ahead for what you follow."
        />

        <FeedSection
          id="current-heading"
          title="Current"
          hint="Published, or took effect, in the last 30 days."
          items={current}
          empty="Nothing new in the last 30 days for what you follow — not that nothing happened."
        />

        <details className="group">
          <summary className="cursor-pointer select-none list-none">
            <span className="section-title">Historical research</span>{" "}
            <span className="text-xs text-slate-500">
              {historical.length} older record{historical.length === 1 ? "" : "s"} · tap to show
            </span>
          </summary>
          <p className="mt-1 text-xs text-slate-400">
            Older records that match what you follow. Kept for research; none of them is due now because of its age or
            how significant it was when published.
          </p>
          {historical.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {historical.map((item) => (
                <FeedCard key={item.change.recordId} item={item} />
              ))}
            </ul>
          ) : null}
        </details>

        <section className="panel panel-pad" aria-labelledby="research-heading">
          <h2 id="research-heading" className="section-title">Saved research</h2>
          <p className="mt-1 text-xs text-slate-400">
            Save a change from its page. A brief carries each record&rsquo;s source, dates, evidence quotes and
            limitations.
          </p>
          {saved.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">
              Nothing saved yet. Open any change in{" "}
              <Link href="/what-changed" className="underline">What changed</Link> and choose Save.
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {saved.length > 0 ? (
              <>
                <a href="/api/pro/brief?scope=saved&format=html" target="_blank" rel="noopener" className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-accent/50">
                  Saved brief (print / PDF)
                </a>
                <a href="/api/pro/brief?scope=saved&format=md" className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-accent/50">
                  Saved brief (Markdown)
                </a>
              </>
            ) : null}
            {briefing.feed.length > 0 ? (
              <a href="/api/pro/brief?scope=feed&format=html" target="_blank" rel="noopener" className="rounded-lg border border-white/15 px-3 py-1.5 text-slate-200 hover:border-accent/50">
                Feed brief (print / PDF)
              </a>
            ) : null}
          </div>
        </section>

        <section className="panel panel-pad" aria-labelledby="settings-heading">
          <h2 id="settings-heading" className="section-title">Alerts and calendar</h2>
          <div className="mt-3">
            <BriefingSettings
              alertsOn={alertsOn}
              intelligence={intelligence}
              initial={{
                frequency: prefs.frequency,
                relevance: prefs.relevance,
                reminders: prefs.reminders,
                summary: prefs.summary,
                calendarUrl: calendarUrl(billingOrigin(), key, prefs.calendarVersion, secret),
              }}
            />
          </div>
        </section>

        <section className="panel panel-pad" aria-labelledby="history-heading">
          <h2 id="history-heading" className="section-title">Alert history</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">No alert emails recorded yet. Each one you are sent appears here.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {history.map((h) => (
                <li key={h.sentAt}>
                  <p className="text-xs text-slate-400">
                    {new Date(h.sentAt * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC ·{" "}
                    {h.items.length} item{h.items.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {h.items.map((i) => (
                      <li key={i.id} className="text-sm">
                        <Link href={i.href} className="text-slate-200 hover:underline">{i.title}</Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Limitations" className="space-y-2 text-xs text-slate-500">
          {briefing.limitations.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p>
            Briefing stores your watchlist, saved change ids, delivery settings and a list of alerts sent — nothing about
            your immigration status, case or personal dates.
          </p>
        </section>
      </div>
    </div>
  );
}
