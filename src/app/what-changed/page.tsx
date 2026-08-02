// =============================================================================
// /what-changed — Phase 2C, the flagship surface
//
// Until this page existed, the event pipeline was write-only: four adapters,
// validated events, a committed store, and no reader could see any of it. This
// is the first consumer of @/lib/event-store.
//
// THE THING THIS PAGE MUST NOT DO
// -------------------------------
// A "what changed" feed has a natural failure mode: when the sources are quiet,
// it fills the space with whatever it has, and routine paperwork starts looking
// like policy change. That is manufacturing importance, and the Directive names
// it specifically.
//
// So the page is built the other way round. Significant events lead. Routine
// notices are present, complete, and honest — but behind a disclosure, clearly
// labelled as routine, because a reader scanning for "does this affect me" is
// not served by fifty information-collection notices.
//
// AND WHAT IT MUST ALWAYS DO
// --------------------------
// Say what it does not cover. `eventCoverageNote()` reports how many sources are
// actually feeding the store and since when, and a failed adapter is surfaced
// rather than swallowed — otherwise a quiet feed reads as a quiet month, when
// the truth may be that we lost a source.
// =============================================================================

import { buildMetadata } from "@/lib/seo";
import { PageHeader } from "@/components/PageHeader";
import { MethodologyNote } from "@/components/MethodologyNote";
import { EventCard } from "@/components/EventCard";
import { formatDate } from "@/lib/format";
import {
  EVENTS,
  EVENT_STORE_META,
  eventCoverageNote,
  failedAdapters,
} from "@/lib/event-store";
import { sortEvents } from "@/domains/graph/events";

export const metadata = buildMetadata({
  title: "What Changed — U.S. Immigration Policy Tracker",
  description:
    "Every U.S. immigration policy change we can trace to an official government source: rules, executive actions, USCIS guidance, and court decisions — each with who is affected, what the document says, and a link to the original.",
  path: "/what-changed",
  keywords: [
    "immigration policy changes",
    "new immigration rules",
    "USCIS policy updates",
    "immigration executive orders",
    "what changed immigration",
  ],
});

/** Newest first, grouped by publication day. */
function groupByDay(events: typeof EVENTS) {
  const days = new Map<string, typeof EVENTS>();
  for (const e of sortEvents(events)) {
    const list = days.get(e.publishedAt) ?? [];
    list.push(e);
    days.set(e.publishedAt, list);
  }
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

export default function WhatChangedPage() {
  const significant = EVENTS.filter((e) => e.severity !== "routine");
  const routine = EVENTS.filter((e) => e.severity === "routine");
  const days = groupByDay(significant);
  const failed = failedAdapters();

  return (
    <div>
      <PageHeader
        eyebrow="What changed"
        title="U.S. immigration policy changes, traced to the source"
        description="Rules, executive actions, agency guidance, and court decisions — each one linked to the government document it came from, with what that document says about who is affected. We report what changed; we do not tell you what it means for your case."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/what-changed", label: "What changed" },
        ]}
        share
      />

      <div className="container-page max-w-3xl space-y-8 py-10">
        {/* Coverage, stated up front. A reader should never have to guess how
            much of the landscape this represents. */}
        <p className="text-xs leading-relaxed text-slate-400">{eventCoverageNote()}</p>

        {/* A lost source is not a quiet month, and must never be mistaken for
            one. This is the difference between silence and a gap. */}
        {failed.length > 0 ? (
          <div className="rounded-xl border border-status-amber/30 bg-status-amber/5 p-4">
            <h2 className="text-sm font-semibold text-status-amber">Some sources did not report</h2>
            <ul className="mt-2 space-y-1">
              {failed.map((a) => (
                <li key={a.key} className="text-xs leading-relaxed text-slate-300">
                  <span className="font-medium">{a.name}</span> failed on the most recent run, so recent
                  items from it may be missing here.
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {days.length === 0 ? (
          <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-300">
            No significant changes have been recorded in the current window. That is a statement about
            what our sources published, not a guarantee that nothing happened — see the coverage note
            above for which sources are feeding this page.
          </p>
        ) : (
          <div className="space-y-10">
            {days.map(([date, events]) => (
              <section key={date} aria-labelledby={`day-${date}`}>
                <h2
                  id={`day-${date}`}
                  className="sticky top-0 z-10 -mx-1 bg-ink-950/90 px-1 py-2 text-sm font-semibold text-slate-300 backdrop-blur"
                >
                  {formatDate(date)}
                  <span className="ml-2 font-normal text-slate-500">
                    {events.length} {events.length === 1 ? "change" : "changes"}
                  </span>
                </h2>
                <div className="mt-3 space-y-4">
                  {events.map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Routine notices are real documents and stay visible. They are just
            not allowed to crowd out the answer to "what changed". */}
        {routine.length > 0 ? (
          <details className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">
              {routine.length} routine notice{routine.length === 1 ? "" : "s"} in the same period
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Scheduled statistical releases, paperwork notices, and technical updates the publisher
              itself describes as non-substantive. Kept here in full so nothing is hidden, and kept out
              of the feed above so it still answers the question it claims to.
            </p>
            <div className="mt-4 space-y-4">
              {sortEvents(routine).map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </details>
        ) : null}

        <MethodologyNote>
          Every event here comes from an official U.S. government source and links to the original
          document. Classification and severity are assigned by explicit, published rules per source —
          never by a language model, and never by how much attention an item might attract. Where a
          document states who is affected, we quote it; where we inferred something, it is labelled as
          our inference. We do not summarise legal requirements as advice. The store was last built{" "}
          {formatDate(EVENT_STORE_META.generatedAt.slice(0, 10))} and covers documents published since{" "}
          {formatDate(EVENT_STORE_META.since)}.
        </MethodologyNote>
      </div>
    </div>
  );
}
