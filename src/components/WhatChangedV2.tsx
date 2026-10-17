// =============================================================================
// WHAT CHANGED, REDESIGNED (FEATURE_UX_V2)
//
// The previous page rendered every record in full: about 90 phone screens, with
// the same caveats repeated on every card. Here each change is one compact card
// (stage, date, title, its own summary, source) and the full record is one tap
// away on its own page, which is also where search engines read it.
//
// The page answers "what changed" first: the 20 newest important changes, then
// the rest of the 30-day window and the routine notices behind one tap each.
// Every item is still in the HTML, so the page stays static and crawlable.
// Coverage is stated in one line, with real gaps (a source that failed) shown
// prominently, and the full explanation on Sources & coverage.
// =============================================================================

import Link from "next/link";
import { ChangeCard } from "./ChangeCard";
import { EventExplorer } from "./EventExplorer";
import { FollowingPanel } from "./FollowingPanel";
import { PageHeader } from "./PageHeader";
import { PulseSignup } from "./PulseSignup";
import { ReportError } from "./ReportError";
import { formatDate } from "@/lib/format";
import type { ImmigrationEvent } from "@/domains/graph/events";

/** How many important changes show before "show more". */
export const LEAD_COUNT = 20;

function DayGroups({ days, today }: { days: [string, ImmigrationEvent[]][]; today: string }) {
  return (
    <div className="space-y-6">
      {days.map(([date, events]) => (
        <section key={date} aria-labelledby={`day-${date}`}>
          <h2
            id={`day-${date}`}
            className="sticky top-16 z-10 -mx-1 bg-ink-950/90 px-1 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400 backdrop-blur"
          >
            {formatDate(date)}
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
              {events.length} {events.length === 1 ? "change" : "changes"}
            </span>
          </h2>
          <div className="mt-2 space-y-2">
            {events.map((e) => (
              <ChangeCard key={e.id} event={e} today={today} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Split day groups after `count` events, keeping each day whole on its first side. */
function splitDays(days: [string, ImmigrationEvent[]][], count: number) {
  const lead: [string, ImmigrationEvent[]][] = [];
  const rest: [string, ImmigrationEvent[]][] = [];
  let n = 0;
  for (const [date, events] of days) {
    if (n < count) {
      const take = events.slice(0, count - n);
      lead.push([date, take]);
      if (take.length < events.length) rest.push([date, events.slice(take.length)]);
      n += take.length;
    } else rest.push([date, events]);
  }
  return { lead, rest };
}

export function WhatChangedV2({
  days,
  routine,
  today,
  totalRecorded,
  earliest,
  lastChecked,
  olderCount,
  failed,
  methodology,
}: {
  /** Important (non-routine) changes in the window, newest day first. */
  days: [string, ImmigrationEvent[]][];
  /** Routine notices in the same window. */
  routine: ImmigrationEvent[];
  today: string;
  totalRecorded: number;
  earliest: string | null;
  lastChecked: string | null;
  /** Important changes older than the window (reachable through search). */
  olderCount: number;
  failed: { key: string; name: string }[];
  methodology: React.ReactNode;
}) {
  const { lead, rest } = splitDays(days, LEAD_COUNT);
  const restCount = rest.reduce((n, [, e]) => n + e.length, 0);

  return (
    <div>
      <PageHeader
        compact
        title="What changed in U.S. immigration"
        description="Rules, proposals, announcements and court decisions, newest first, each linked to its official document."
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/what-changed", label: "What changed" },
        ]}
        share
      />

      <div className="container-page max-w-3xl space-y-4 py-4">
        <p className="text-xs text-slate-400">
          {lastChecked ? `Sources checked ${formatDate(lastChecked)} · ` : ""}
          {totalRecorded.toLocaleString()} changes recorded{earliest ? ` since ${formatDate(earliest)}` : ""} ·{" "}
          <Link href="/sources" className="text-accent hover:underline">
            Sources &amp; coverage
          </Link>
        </p>

        {failed.length > 0 ? (
          <div className="rounded-xl border border-status-amber/30 bg-status-amber/5 p-3.5">
            <p className="text-sm font-semibold text-status-amber">Some sources did not report on the latest check</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              {failed.map((a) => a.name).join(", ")}: recent items from {failed.length === 1 ? "it" : "them"} may be
              missing below.
            </p>
          </div>
        ) : null}

        <EventExplorer compact>
          {lead.length === 0 ? (
            <p className="rounded-xl border border-white/10 p-4 text-sm text-slate-300">
              No important changes are recorded in the last 30 days. That describes the sources we cover, not
              everything that happened. See{" "}
              <Link href="/sources" className="text-accent hover:underline">
                Sources &amp; coverage
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-6">
              <DayGroups days={lead} today={today} />

              {restCount > 0 ? (
                <details className="group">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-center rounded-xl border border-white/10 text-sm font-medium text-slate-200 hover:border-accent/40">
                    <span className="group-open:hidden">
                      Show {restCount} more from the last 30 days
                    </span>
                    <span className="hidden group-open:inline">Showing the last 30 days</span>
                  </summary>
                  <div className="mt-4">
                    <DayGroups days={rest} today={today} />
                  </div>
                </details>
              ) : null}

              {routine.length > 0 ? (
                <details className="group">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-white/10 px-3.5 text-sm text-slate-300 hover:border-accent/40">
                    <span>
                      {routine.length} routine notice{routine.length === 1 ? "" : "s"}
                      <span className="text-slate-500"> · paperwork, scheduled data, technical updates</span>
                    </span>
                    <span aria-hidden className="text-slate-500 group-open:rotate-180">
                      ▾
                    </span>
                  </summary>
                  <div className="mt-3 space-y-2">
                    {routine.map((e) => (
                      <ChangeCard key={e.id} event={e} today={today} />
                    ))}
                  </div>
                </details>
              ) : null}

              {olderCount > 0 ? (
                <p className="text-xs text-slate-500">
                  {olderCount.toLocaleString()} older important change{olderCount === 1 ? " is" : "s are"} in the archive:
                  search above to find {olderCount === 1 ? "it" : "them"}.
                </p>
              ) : null}
            </div>
          )}
        </EventExplorer>

        {/* Secondary on a phone: one tap away, with everything it did before. */}
        <details className="group rounded-xl border border-white/10">
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-sm text-slate-200">
            <span>Follow visas, countries or agencies</span>
            <span aria-hidden className="text-slate-500 group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="p-2 pt-0">
            <FollowingPanel />
          </div>
        </details>

        <PulseSignup variant="inline" placement="what_changed" />

        {methodology}

        <ReportError context="What Changed" compact />
      </div>
    </div>
  );
}

