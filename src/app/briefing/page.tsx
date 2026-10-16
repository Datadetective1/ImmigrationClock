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

const BUCKET_TONE: Record<string, string> = {
  needs_attention: "border-status-amber/40 text-status-amber",
  effective_soon: "border-accent/40 text-accent",
  potentially_relevant: "border-white/15 text-slate-400",
  superseded: "border-white/15 text-slate-400",
};

function FeedCard({ item }: { item: FeedItem }) {
  const quote = item.brief.evidence.find((e) => e.quote && e.quote !== "(no quote stored)");
  return (
    <li className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide">
        <span className={`rounded-full border px-2 py-0.5 ${BUCKET_TONE[item.bucket] ?? "border-white/15 text-slate-300"}`}>
          {item.bucket === "recently_changed" ? "Recent" : item.bucket.replace(/_/g, " ")}
        </span>
        {item.saved ? <span className="rounded-full border border-white/15 px-2 py-0.5 text-slate-300">Saved</span> : null}
        {item.change.status === "proposed" ? (
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-slate-300">Proposed — not in force</span>
        ) : null}
      </div>
      <Link href={item.path} className="mt-2 block text-sm font-semibold text-white hover:underline">
        {item.change.title}
      </Link>
      <p className="mt-1 text-xs text-slate-400">{item.because}</p>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
        <div>
          <dt className="inline">Published </dt>
          <dd className="inline text-slate-200">{formatDate(item.change.publishedDate)}</dd>
        </div>
        <div>
          <dt className="inline">Effective </dt>
          <dd className="inline text-slate-200">
            {item.change.effectiveDate ? formatDate(item.change.effectiveDate) : "not stated"}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Source</dt>
          <dd>
            <a href={item.change.source.url} className="underline decoration-dotted hover:text-white" rel="noopener noreferrer">
              {item.change.source.name}
            </a>
          </dd>
        </div>
      </dl>
      {quote ? (
        <p className="mt-2 border-l-2 border-white/10 pl-3 text-xs italic text-slate-400">
          “{quote.quote.length > 240 ? `${quote.quote.slice(0, 237)}…` : quote.quote}”
        </p>
      ) : null}
    </li>
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
  const attention = briefing.feed.filter((i) => i.bucket === "needs_attention").length;
  const soon = briefing.timeline.filter((t) => t.daysUntil <= 30).length;

  return (
    <div>
      {header}
      <div className="container-page max-w-3xl space-y-6 py-8">
        <section aria-label="Summary" className="grid grid-cols-3 gap-2 text-center">
          {[
            [attention, "need attention"],
            [soon, "take effect in 30 days"],
            [saved.length, "saved"],
          ].map(([n, label]) => (
            <div key={label as string} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
              <p className="text-2xl font-semibold text-white">{n}</p>
              <p className="text-[11px] text-slate-400">{label}</p>
            </div>
          ))}
        </section>

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

        <section aria-labelledby="feed-heading">
          <h2 id="feed-heading" className="section-title">Your feed</h2>
          <p className="mt-1 text-xs text-slate-400">
            Followed or saved changes, most urgent first. Published in the last 30 days, taking effect in the next 30,
            or recorded as major.
          </p>
          {briefing.feed.length === 0 ? (
            <p className="mt-3 rounded-xl border border-white/5 p-4 text-sm text-slate-400">
              Nothing matched. That means no recorded change touched what you follow in that window — not that nothing
              happened.
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {briefing.feed.map((item) => (
                <FeedCard key={item.change.recordId} item={item} />
              ))}
            </ul>
          )}
        </section>

        <section className="panel panel-pad" aria-labelledby="timeline-heading">
          <h2 id="timeline-heading" className="section-title">Coming into effect</h2>
          <p className="mt-1 text-xs text-slate-400">
            Stated effective dates still ahead, for changes you follow or saved. Also in your calendar feed below.
          </p>
          {briefing.timeline.length === 0 ? (
            <p className="mt-3 text-sm text-slate-400">No stated effective dates ahead.</p>
          ) : (
            <ol className="mt-3 space-y-2">
              {briefing.timeline.slice(0, 30).map((t) => (
                <li key={t.recordId} className="flex gap-3 text-sm">
                  <span className="w-24 shrink-0 text-xs text-slate-400">
                    {formatDate(t.effectiveDate)}
                    <span className="block">{t.daysUntil === 0 ? "today" : `in ${t.daysUntil} d`}</span>
                  </span>
                  <Link href={t.path} className="text-slate-200 hover:underline">
                    {t.title}
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

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
              initial={{
                frequency: prefs.frequency,
                relevance: prefs.relevance,
                reminders: prefs.reminders,
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
