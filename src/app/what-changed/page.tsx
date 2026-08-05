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
import { EventExplorer } from "@/components/EventExplorer";
import { FollowingPanel } from "@/components/FollowingPanel";
import { formatDate } from "@/lib/format";
import {
  EVENTS,
  EVENT_STORE_META,
  eventCoverageNote,
  failedAdapters,
} from "@/lib/event-store";
import { INDEX_COVERAGE } from "@/lib/event-index";
import { sortEvents } from "@/domains/graph/events";
import { ReportError } from "@/components/ReportError";

export const metadata = buildMetadata({
  title: "What Changed — U.S. Immigration Policy Tracker",
  description:
    "Every U.S. immigration policy change traced to its official government source — rules, executive actions, agency guidance and court decisions.",
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

/**
 * How many days of change the lead feed shows.
 *
 * Backfilling the archive to January 2025 took this page to 183 events across
 * 110 days — about 128,000 pixels, or thirty-five screens. Everything in the
 * store is real and none of it should be deleted, but a wall that long stops
 * answering "what changed" and starts being a database dump.
 *
 * So the feed is bounded and SAYS it is bounded, with the total stated above it.
 * Real filtering and search replace this in the next phase; until then a limit
 * the reader can see beats an unusable page.
 */
const LEAD_FEED_DAYS = 30;

export default function WhatChangedPage() {
  const significant = EVENTS.filter((e) => e.severity !== "routine");
  const allDays = groupByDay(significant);
  const days = allDays.slice(0, LEAD_FEED_DAYS);

  // Routine notices are bounded to the SAME window as the lead feed, which is
  // what the disclosure below has always claimed and what the code did not do.
  //
  // It filtered the whole archive. At 190 events that was 31 cards and nobody
  // noticed; after the backfill to 859 it was 460 fully-rendered cards — a 4MB
  // HTML document, and a label reading "in the same period" over events from
  // eighteen months earlier. Both halves of that are bugs, and the honesty one
  // is the worse of the two.
  const windowStart = days.length ? days[days.length - 1][0] : null;
  const allRoutine = EVENTS.filter((e) => e.severity === "routine");
  const routine = windowStart ? allRoutine.filter((e) => e.publishedAt >= windowStart) : [];
  const olderRoutineCount = allRoutine.length - routine.length;
  const shownCount = days.reduce((n, [, evts]) => n + evts.length, 0);
  const olderCount = significant.length - shownCount;
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

        {/* "What changed FOR ME" comes before "what changed", because for most
            readers it is the only question they actually have. Renders its own
            empty state when nothing is followed, so it is never dead space. */}
        <FollowingPanel />

        {/* Search and filtering wrap the feed rather than replacing it. With no
            filter set the editorial view below renders untouched; the moment one
            is set, results from the WHOLE archive take its place. Presenting an
            empty search box as the answer to "what changed" would be backwards. */}
        <EventExplorer>
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

        {/* The feed is bounded, so it has to say so. An unexplained cut-off
            reads as "this is everything", which would understate our own
            coverage — the opposite of the usual failure, and still wrong. */}
        {olderCount > 0 ? (
          <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-slate-300">
            Showing the most recent {days.length} days of change. The store holds{" "}
            <span className="font-semibold text-white">{olderCount}</span> older recorded change
            {olderCount === 1 ? "" : "s"}
            {EVENT_STORE_META.earliestEvent
              ? ` going back to ${formatDate(EVENT_STORE_META.earliestEvent)}`
              : ""}{" "}
            {" — use the search box above to reach "}
            {/* Not "the whole archive" when the search index is a payload-bounded
                window. The search box states its own reach; this must agree with
                it rather than promise more. */}
            {INDEX_COVERAGE.bounded ? `the ${INDEX_COVERAGE.indexed} most recent of them` : "the whole archive"}.
          </p>
        ) : null}

        {/* Routine notices are real documents and stay visible. They are just
            not allowed to crowd out the answer to "what changed". */}
        {routine.length > 0 ? (
          <details className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">
              {routine.length} routine notice{routine.length === 1 ? "" : "s"} in the same period
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Scheduled statistical releases, paperwork notices, and technical updates the publisher
              itself describes as non-substantive. Kept out of the feed above so it still answers the
              question it claims to.
              {olderRoutineCount > 0
                ? ` A further ${olderRoutineCount} routine notice${olderRoutineCount === 1 ? "" : "s"} published before this window ${olderRoutineCount === 1 ? "is" : "are"} in the archive rather than listed here — filter by “Routine” in the search above to read them.`
                : ""}
            </p>
            <div className="mt-4 space-y-4">
              {sortEvents(routine).map((e) => (
                <EventCard key={e.id} event={e} />
              ))}
            </div>
          </details>
        ) : null}
        </EventExplorer>

        <ReportError context="What Changed" />

        <MethodologyNote>
          Every event here comes from an official U.S. government source and links to the original
          document. Classification and severity are assigned by explicit, published rules per source —
          never by a language model, and never by how much attention an item might attract. Where a
          document states who is affected, we quote it; where we inferred something, it is labelled as
          our inference. We do not summarise legal requirements as advice. The store was last built{" "}
          {formatDate(EVENT_STORE_META.generatedAt.slice(0, 10))}
          {EVENT_STORE_META.earliestEvent
            ? ` and holds documents published from ${formatDate(EVENT_STORE_META.earliestEvent)} onward`
            : ""}
          . The most recent build looked back over documents published since{" "}
          {formatDate(EVENT_STORE_META.since)}; everything recorded before that is retained.
        </MethodologyNote>
      </div>
    </div>
  );
}
