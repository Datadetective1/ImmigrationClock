"use client";

// =============================================================================
// EVENT EXPLORER — search and filtering over the whole archive
//
// The problem this solves: backfilling to January 2025 took /what-changed to 190
// events across 110 days. Everything in the store is real, and a reader looking
// for "did anything change about H-1B" should not have to scroll thirty screens
// to find out.
//
// TWO MODES, ONE COMPONENT
//   • No filters  — the server-rendered recent feed stays visible underneath,
//                   with full event cards. Nothing changes for a casual reader.
//   • Any filter  — results replace it, drawn from the whole archive.
//
// That split is deliberate. The default view is the editorial one, ordered by
// what changed; search is a tool you reach for. Making search the default would
// present an empty box as the answer to "what changed".
//
// WHAT A RESULT ROW DOES NOT DO
// A row shows title, date, severity, classification, source, and a summary
// snippet, and links to the government document. It does NOT show the impact
// record or the limitations, because the index does not carry them — and a
// truncated limitation is worse than none. Anything that would let a reader draw
// a conclusion about their own case lives on the full card, which keeps its
// caveats attached.
// =============================================================================

import { useMemo, useState, useEffect, useId } from "react";
import { formatDate } from "@/lib/format";
import { trackSearch } from "@/lib/analytics";
import { SOURCE_BY_KEY } from "@/lib/sources";
import {
  EVENT_INDEX,
  filterEvents,
  hasActiveFilters,
  facetCounts,
  groupByDay,
  sortResults,
  type EventFilters,
  type IndexedEvent,
  type SortOrder,
} from "@/lib/event-index";
import type { EventSeverity } from "@/domains/graph/events";

const SEVERITY_LABEL: Record<EventSeverity, string> = {
  major: "Changes what someone can or must do",
  notable: "Meaningful movement",
  routine: "Routine",
};

const SEVERITY_SHORT: Record<EventSeverity, string> = {
  major: "Major",
  notable: "Notable",
  routine: "Routine",
};

const CLASSIFICATION_LABEL: Record<string, string> = {
  new_information: "New information",
  updated_information: "Updated",
  correction: "Correction",
  historical_revision: "Historical revision",
  announcement: "Announcement",
  data_release: "Data release",
  proposed_rule: "Proposed rule — not in force",
  final_rule: "Final rule",
  executive_action: "Executive action",
  court_decision: "Court decision",
  legislative_action: "Legislative action",
  deadline: "Deadline",
};

function Chip({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-accent/60 bg-accent/15 text-white"
          : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200"
      }`}
    >
      {children}
      {count !== undefined ? <span className="ml-1.5 tabular-nums text-slate-500">{count}</span> : null}
    </button>
  );
}

function ResultRow({ event }: { event: IndexedEvent }) {
  const source = SOURCE_BY_KEY[event.sourceKey];
  const isProposal = event.classification === "proposed_rule";

  return (
    <li className="border-t border-white/5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={event.severity === "routine" ? "text-slate-500" : "font-semibold text-slate-200"}>
          {SEVERITY_SHORT[event.severity]}
        </span>
        <span className="text-slate-600" aria-hidden>
          ·
        </span>
        {/* A proposal must never read as a rule, even in a compact row. */}
        <span className={isProposal ? "font-semibold text-status-amber" : "text-slate-400"}>
          {CLASSIFICATION_LABEL[event.classification] ?? event.classification}
        </span>
        {source ? (
          <>
            <span className="text-slate-600" aria-hidden>
              ·
            </span>
            <span className="text-slate-400">{source.name}</span>
          </>
        ) : null}
        <span className="text-slate-600" aria-hidden>
          ·
        </span>
        <span className="text-slate-500">
          {event.scheduled
            ? `Scheduled for ${formatDate(event.publishedAt)}`
            : formatDate(event.publishedAt)}
        </span>
      </div>

      <h3 className="mt-1 text-sm font-semibold leading-snug text-white">{event.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">{event.summary}</p>

      <a
        href={event.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-xs font-medium text-accent underline-offset-2 hover:underline"
      >
        Read the original
      </a>
    </li>
  );
}

/**
 * Results are paged rather than dumped.
 *
 * At 190 events rendering everything is survivable; at a few thousand it is a
 * multi-second layout and a scroll bar that means nothing. Paging is a property
 * of the component rather than the data, so the archive can grow without this
 * page changing.
 */
const PAGE_SIZE = 25;

const SORT_LABEL: Record<SortOrder, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  importance: "Most important first",
};

export function EventExplorer({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<EventSeverity[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [order, setOrder] = useState<SortOrder>("newest");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const searchId = useId();

  const filters: EventFilters = useMemo(
    () => ({
      q,
      severity,
      sourceKey: sources,
      classification: classifications.length ? (classifications as EventFilters["classification"]) : undefined,
    }),
    [q, severity, sources, classifications]
  );
  const active = hasActiveFilters(filters);
  const results = useMemo(
    () => (active ? sortResults(filterEvents(EVENT_INDEX, filters), order) : []),
    [active, filters, order]
  );

  // Any change to the query resets paging: leaving a reader 200 rows deep in a
  // result set they just replaced is disorienting.
  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [q, severity, sources, classifications, order]);

  // Facets are computed against everything EXCEPT the facet being offered, so a
  // count never reads as zero for an option that would actually return results.
  const severityFacets = useMemo(
    () => facetCounts(filterEvents(EVENT_INDEX, { q, sourceKey: sources })).bySeverity,
    [q, sources]
  );
  const sourceFacets = useMemo(
    () => facetCounts(filterEvents(EVENT_INDEX, { q, severity })).bySource,
    [q, severity]
  );

  // A search that returns nothing is the most valuable signal the platform has:
  // it is a question a reader had that we could not answer. Debounced so a
  // half-typed word is not reported as a failure.
  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => trackSearch(q, results.length), 700);
    return () => clearTimeout(t);
  }, [q, results.length]);

  // Only the visible page is grouped and rendered. Grouping the whole result set
  // would do the expensive work regardless of what is on screen.
  const page = useMemo(() => results.slice(0, visible), [results, visible]);
  const grouped = useMemo(() => groupByDay(page), [page]);

  const availableSources = useMemo(
    () => [...new Set(EVENT_INDEX.map((e) => e.sourceKey))].sort(),
    []
  );
  const availableClassifications = useMemo(
    () => [...new Set(EVENT_INDEX.map((e) => e.classification))].sort(),
    []
  );
  const classificationFacets = useMemo(
    () => facetCounts(filterEvents(EVENT_INDEX, { q, severity, sourceKey: sources })).byClassification,
    [q, severity, sources]
  );

  function toggle<T>(list: T[], value: T, set: (v: T[]) => void) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  function clearAll() {
    setQ("");
    setSeverity([]);
    setSources([]);
    setClassifications([]);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-850/80 px-3 py-2.5 focus-within:border-accent/50">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="shrink-0 text-slate-500"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search all 190+ recorded changes — try “H-1B”, “asylum”, “fee”…"
            aria-label="Search recorded immigration policy changes"
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Importance</span>
          {(["major", "notable", "routine"] as EventSeverity[]).map((s) => (
            <Chip
              key={s}
              active={severity.includes(s)}
              onClick={() => toggle(severity, s, setSeverity)}
              count={severityFacets[s] ?? 0}
            >
              <span title={SEVERITY_LABEL[s]}>{SEVERITY_SHORT[s]}</span>
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Source</span>
          {availableSources.map((key) => (
            <Chip
              key={key}
              active={sources.includes(key)}
              onClick={() => toggle(sources, key, setSources)}
              count={sourceFacets[key] ?? 0}
            >
              {SOURCE_BY_KEY[key]?.name ?? key}
            </Chip>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Kind</span>
          {availableClassifications.map((c) => (
            <Chip
              key={c}
              active={classifications.includes(c)}
              onClick={() => toggle(classifications, c, setClassifications)}
              count={classificationFacets[c] ?? 0}
            >
              {CLASSIFICATION_LABEL[c] ?? c}
            </Chip>
          ))}
        </div>

        {active ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-3">
            <p className="text-sm text-slate-300">
              <span className="font-semibold text-white">{results.length}</span>{" "}
              {results.length === 1 ? "change" : "changes"} found across the whole archive
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor={`${searchId}-sort`} className="text-xs text-slate-500">
                Sort
              </label>
              <select
                id={`${searchId}-sort`}
                value={order}
                onChange={(e) => setOrder(e.target.value as SortOrder)}
                className="rounded-lg border border-white/10 bg-ink-850/80 px-2 py-1 text-xs text-slate-200 focus:border-accent/50 focus:outline-none"
              >
                {(Object.keys(SORT_LABEL) as SortOrder[]).map((o) => (
                  <option key={o} value={o}>
                    {SORT_LABEL[o]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={clearAll}
                className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-300 hover:border-white/20 hover:text-white"
              >
                Clear filters
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {active ? (
        results.length === 0 ? (
          // An empty result must not read as "nothing has happened". It means
          // our archive does not answer this question, which is our gap.
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            <p className="text-sm text-slate-200">Nothing in the archive matches that.</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              That is a statement about what we have recorded, not about what has happened. The archive
              covers the sources listed on the methodology page from January 2025 onward — a change
              published elsewhere, or before then, will not appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map(({ date, events }) => (
              <section key={date} aria-labelledby={`result-day-${date}`}>
                <h3
                  id={`result-day-${date}`}
                  className="text-sm font-semibold text-slate-300"
                >
                  {formatDate(date)}
                  <span className="ml-2 font-normal text-slate-500">
                    {events.length} {events.length === 1 ? "change" : "changes"}
                  </span>
                </h3>
                <ul className="mt-1">
                  {events.map((e) => (
                    <ResultRow key={e.id} event={e} />
                  ))}
                </ul>
              </section>
            ))}
            {results.length > visible ? (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:border-accent/50 hover:text-white"
                >
                  Show {Math.min(PAGE_SIZE, results.length - visible)} more
                </button>
                <p className="text-xs text-slate-500">
                  Showing {visible} of {results.length}
                </p>
              </div>
            ) : null}

            <p className="text-xs leading-relaxed text-slate-500">
              Search results are summaries. Each links to the government document it came from — open the
              original before relying on it, and read the full entry for the caveats that apply.
            </p>
          </div>
        )
      ) : (
        children
      )}
    </div>
  );
}
