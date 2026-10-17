// =============================================================================
// /briefing, REDESIGNED (FEATURE_UX_V2)
//
// A Pro subscriber opens this on a phone to answer one question: what needs my
// attention? So the page leads with three counts that jump to their lists,
// then dates coming up, then what is new, each as the same compact card the
// public list uses (stage, date, title, the document's own summary, source).
// Why a record is here, the evidence quotes, a next step and its limitations
// are one tap away on the card.
//
// Follows, saved research, older records, settings, alert history and how the
// page works follow in that order; everything after "Saved" is collapsed.
// Nothing the old page had is dropped: the same data, gates and settings.
// =============================================================================

import Link from "next/link";
import { BriefingSettings, type BriefingSettingsValue } from "./BriefingSettings";
import { LandscapeSection } from "./LandscapeSection";
import { StagePill } from "./StagePill";
import { formatDate } from "@/lib/format";
import { labelForEntity } from "@/lib/entity-labels";
import { importanceOf, stageOf } from "@/lib/stage";
import type { FeedItem } from "@/lib/pro/feed";
import type { Landscape } from "@/lib/pro/landscape";
import type { HistoryEntry } from "@/lib/pro/history";

const STRENGTH: Record<string, string> = {
  named: "Named in the document",
  categorized: "Same topic",
  mentioned: "Mentioned in the body",
  weak: "Possible match",
};

function BriefingCard({ item, today }: { item: FeedItem; today: string }) {
  const a = item.assessment;
  const c = item.change;
  const stage = stageOf(
    {
      classification: c.classification,
      effectiveDate: c.effectiveDate,
      publishedDate: c.publishedDate,
      amendedBy: c.amendedBy,
    },
    today
  );
  const soon = a.urgency.tone === "attention";
  const incidental = a.relevance === "mentioned" || a.relevance === "weak";
  const important = importanceOf(c).kind === "changes_requirements";

  return (
    <li className="relative rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StagePill stage={stage} />
        {soon ? (
          <span className="text-xs font-semibold text-status-amber">{a.urgency.label}</span>
        ) : stage.keyDate ? (
          <span className="text-xs text-slate-400">
            {stage.keyDate.label} <span className="font-medium text-slate-200">{formatDate(stage.keyDate.date)}</span>
          </span>
        ) : null}
        {important ? <span className="text-xs text-slate-300">· Changes requirements</span> : null}
        {item.saved ? <span className="text-xs text-slate-400">· Saved</span> : null}
      </div>

      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-white">
        <Link href={item.path} className="hover:underline">
          {c.title}
        </Link>
      </h3>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-slate-400">{a.whatChanged}</p>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
        <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[32px] items-center font-medium text-accent hover:underline">
          {c.source.name} ↗
        </a>
        {a.matches.length > 0 ? (
          <span>
            {incidental ? "Possible match: " : "Matches "}
            <span className="text-slate-200">{a.matches.map((m) => m.label).join(", ")}</span>
          </span>
        ) : null}
      </p>

      <details className="text-xs text-slate-400">
        <summary className="inline-flex min-h-[28px] cursor-pointer select-none items-center text-slate-300 hover:text-white">
          Why it&rsquo;s here
        </summary>
        <div className="mt-1 space-y-2 border-t border-white/5 pt-2">
          {stage.caveat ? <p className="text-slate-300">{stage.caveat}</p> : null}
          {a.matches.length > 0 ? (
            <ul className="space-y-2">
              {a.matches.map((m) => (
                <li key={m.follow}>
                  <span className="text-slate-200">{m.label}</span> · {STRENGTH[m.strength]}. {m.reason}
                  {m.quote ? (
                    <q className="mt-1 block border-l-2 border-white/10 pl-2 italic">
                      {m.quote.length > 300 ? `${m.quote.slice(0, 297)}…` : m.quote}
                    </q>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p>You saved this record.</p>
          )}
          <p>
            <span className="text-slate-300">Next step: </span>
            {a.nextStep}
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

function CardList({ items, today }: { items: FeedItem[]; today: string }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((item) => (
        <BriefingCard key={item.change.recordId} item={item} today={today} />
      ))}
    </ul>
  );
}

function SectionHead({ id, title, count, note }: { id: string; title: string; count?: number; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-base font-semibold text-white">
        {title}
        {typeof count === "number" ? <span className="ml-1.5 text-sm font-normal text-slate-500">{count}</span> : null}
      </h2>
      {note ? <span className="text-xs text-slate-500">{note}</span> : null}
    </div>
  );
}

/** A collapsed section: one row on a phone until opened. */
function Fold({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-white/10">
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-sm">
        <span className="font-medium text-slate-100">{title}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {meta}
          <span aria-hidden className="group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <div className="border-t border-white/5 p-3.5">{children}</div>
    </details>
  );
}

export function BriefingV2({
  today,
  follows,
  upcoming,
  current,
  historical,
  savedItems,
  savedCount,
  feedCount,
  landscape,
  settings,
  alertsOn,
  intelligence,
  history,
  limitations,
}: {
  today: string;
  follows: string[];
  upcoming: FeedItem[];
  current: FeedItem[];
  historical: FeedItem[];
  /** Saved records, newest first, as they appear in the feed. */
  savedItems: FeedItem[];
  savedCount: number;
  feedCount: number;
  /** Present when Intelligence is on and something is followed. */
  landscape: Landscape | null;
  settings: BriefingSettingsValue;
  alertsOn: boolean;
  intelligence: boolean;
  history: HistoryEntry[];
  limitations: string[];
}) {
  const soon = upcoming.filter((i) => i.assessment.urgency.tone === "attention").length;
  const stats: [number, string, string][] = [
    [soon, "due in 30 days", "#upcoming-heading"],
    [current.length, "new", "#current-heading"],
    [savedCount, "saved", "#saved-heading"],
  ];

  return (
    <div className="container-page max-w-3xl space-y-6 py-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Your Briefing</h1>
        <p className="mt-1 text-xs text-slate-400">
          {formatDate(today)} · {follows.length} follow{follows.length === 1 ? "" : "s"} ·{" "}
          <Link href="/following" className="text-accent hover:underline">
            Edit
          </Link>
        </p>
      </div>

      <nav aria-label="Summary" className="grid grid-cols-3 gap-2">
        {stats.map(([n, label, href]) => (
          <a key={label} href={href} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 hover:border-accent/40">
            <span className={`block text-2xl font-semibold ${label === "due in 30 days" && n > 0 ? "text-status-amber" : "text-white"}`}>{n}</span>
            <span className="block text-[11px] text-slate-400">{label}</span>
          </a>
        ))}
      </nav>

      {follows.length === 0 ? (
        <section className="rounded-xl border border-accent/30 bg-accent/5 p-4">
          <p className="text-sm font-semibold text-white">Choose what to follow</p>
          <p className="mt-1 text-sm text-slate-300">Pick visas, countries, agencies or topics, and this page fills with the changes that touch them.</p>
          <Link href="/following" className="mt-3 inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-semibold text-ink-950 hover:bg-accent-soft">
            Choose follows
          </Link>
        </section>
      ) : null}

      <section aria-labelledby="upcoming-heading" className="scroll-mt-20">
        <SectionHead id="upcoming-heading" title="Coming up" count={upcoming.length} note="stated dates, soonest first" />
        {upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No stated effective dates ahead for what you follow.</p>
        ) : (
          <CardList items={upcoming} today={today} />
        )}
      </section>

      <section aria-labelledby="current-heading" className="scroll-mt-20">
        <SectionHead id="current-heading" title="New" count={current.length} note="last 30 days" />
        {current.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">
            No matching records in the last 30 days. That describes the sources we cover, not everything that happened.
          </p>
        ) : (
          <CardList items={current} today={today} />
        )}
      </section>

      {landscape ? (
        <LandscapeSection landscape={landscape} compact />
      ) : follows.length > 0 ? (
        <section aria-labelledby="following-heading">
          <SectionHead id="following-heading" title="You follow" />
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {follows.map((f) => (
              <li key={f} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">
                {labelForEntity(f)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="saved-heading" className="scroll-mt-20">
        <SectionHead id="saved-heading" title="Saved" count={savedCount} />
        {savedCount === 0 ? (
          <p className="mt-2 text-sm text-slate-400">
            Save any change from its page to keep it here.{" "}
            <Link href="/what-changed" className="text-accent hover:underline">
              Browse changes
            </Link>
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-white/5 rounded-xl border border-white/10">
            {savedItems.map((i) => (
              <li key={i.change.recordId} className="px-3.5 py-2.5 text-sm">
                <Link href={i.path} className="text-slate-100 hover:underline">
                  {i.change.title}
                </Link>
                <span className="block text-xs text-slate-500">
                  {formatDate(i.change.publishedDate)} · {i.change.source.name}
                </span>
              </li>
            ))}
          </ul>
        )}
        {savedCount > 0 || feedCount > 0 ? (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {savedCount > 0 ? (
              <>
                <a href="/api/pro/brief?scope=saved&format=html" target="_blank" rel="noopener" className="text-accent hover:underline">
                  Saved brief (PDF)
                </a>
                <a href="/api/pro/brief?scope=saved&format=md" className="text-accent hover:underline">
                  Saved brief (Markdown)
                </a>
              </>
            ) : null}
            {feedCount > 0 ? (
              <a href="/api/pro/brief?scope=feed&format=html" target="_blank" rel="noopener" className="text-accent hover:underline">
                Feed brief (PDF)
              </a>
            ) : null}
          </p>
        ) : null}
      </section>

      <div className="space-y-2">
        <Fold title="Earlier records" meta={`${historical.length}`}>
          {historical.length === 0 ? (
            <p className="text-sm text-slate-400">No older records match what you follow.</p>
          ) : (
            <>
              <p className="text-xs text-slate-400">Older matches, kept for research. None is due now.</p>
              <CardList items={historical} today={today} />
            </>
          )}
        </Fold>

        <Fold title="Email alerts and calendar" meta={alertsOn ? "On" : "Off"}>
          <BriefingSettings alertsOn={alertsOn} intelligence={intelligence} initial={settings} />
        </Fold>

        <Fold title="Alert history" meta={`${history.length}`}>
          {history.length === 0 ? (
            <p className="text-sm text-slate-400">No alert emails yet. Each one you are sent appears here.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((h) => (
                <li key={h.sentAt}>
                  <p className="text-xs text-slate-400">
                    {new Date(h.sentAt * 1000).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" })} ET ·{" "}
                    {h.items.length} item{h.items.length === 1 ? "" : "s"}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {h.items.map((i) => (
                      <li key={i.id} className="text-sm">
                        <Link href={i.href} className="text-slate-200 hover:underline">
                          {i.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Fold>

        <Fold title="How your Briefing works">
          <div className="space-y-2 text-xs leading-relaxed text-slate-400">
            {limitations.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <p>
              Briefing stores your follows, saved change ids, delivery settings and a list of alerts sent. Nothing about
              your immigration status, case or personal dates. Not legal advice.
            </p>
          </div>
        </Fold>
      </div>
    </div>
  );
}
