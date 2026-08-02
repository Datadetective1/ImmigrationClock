"use client";

// =============================================================================
// FOLLOWING PANEL — "show me only what affects me"
//
// The archive answers "what changed". This answers "what changed FOR ME", which
// for most readers is the only question they actually have.
//
// THE PROMISE THIS MAKES, AND KEEPS
// Follows never leave the browser. There is no account and no identifier, and
// the panel says so where the reader is deciding whether to use it — because a
// list of the countries and visa categories a person cares about IS sensitive
// for this audience, and the only safe place for it is somewhere we cannot read.
//
// WHAT IT WILL NOT DO
//   • It never claims a followed entity is unaffected. A quiet feed says the
//     archive has nothing, not that nothing happened.
//   • It only offers entities that actually appear in the archive. Offering
//     "follow Bhutan" when no event has mentioned Bhutan would promise coverage
//     we do not have.
//   • It shows WHY each event reached the reader, so a personalized feed is
//     never a black box.
// =============================================================================

import { useMemo, useState } from "react";
import { formatDate } from "@/lib/format";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { labelForEntity, TYPE_LABEL } from "@/lib/entity-labels";
import { useFollows } from "@/hooks/useFollows";
import { EVENT_INDEX, type IndexedEvent } from "@/lib/event-index";
import {
  buildFollowCatalog,
  groupCatalog,
  eventsForFollows,
  matchedFollows,
  MAX_FOLLOWS,
} from "@/lib/follows";

/** Ids present in the archive — used to drop stale follows read from storage. */
const CATALOG = buildFollowCatalog(EVENT_INDEX, labelForEntity);
const KNOWN_IDS: ReadonlySet<string> = new Set(CATALOG.map((c) => c.entityId));
const GROUPED = groupCatalog(CATALOG);

function MatchReason({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-slate-500">
      Matched because you follow {ids.map((id) => labelForEntity(id)).join(", ")}
    </p>
  );
}

function FollowedEvent({ event, follows }: { event: IndexedEvent; follows: string[] }) {
  const source = SOURCE_BY_KEY[event.sourceKey];
  const isProposal = event.classification === "proposed_rule";
  return (
    <li className="border-t border-white/5 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className={event.severity === "routine" ? "text-slate-500" : "font-semibold text-slate-200"}>
          {event.severity === "major" ? "Major" : event.severity === "notable" ? "Notable" : "Routine"}
        </span>
        <span className="text-slate-600" aria-hidden>·</span>
        {/* A proposal must not read as a rule anywhere it appears. */}
        {isProposal ? (
          <span className="font-semibold text-status-amber">Proposed — not in force</span>
        ) : null}
        {source ? <span className="text-slate-400">{source.name}</span> : null}
        <span className="text-slate-600" aria-hidden>·</span>
        <span className="text-slate-500">{formatDate(event.publishedAt)}</span>
      </div>
      {/* h3, not h4: this sits directly under the panel's h2. Skipping a level
          breaks heading-by-heading navigation for screen reader users, who use
          it as the table of contents this page does not otherwise have. */}
      <h3 className="mt-1 text-sm font-semibold leading-snug text-white">{event.title}</h3>
      <MatchReason ids={matchedFollows(event, follows)} />
      <a
        href={event.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-0.5 inline-block py-1.5 text-xs font-medium text-accent underline-offset-2 hover:underline"
      >
        Read the original
      </a>
    </li>
  );
}

export function FollowingPanel() {
  const { follows, toggle, clear, hydrated } = useFollows(KNOWN_IDS);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");

  const matched = useMemo(() => eventsForFollows(EVENT_INDEX, follows), [follows]);
  const significant = useMemo(() => matched.filter((e) => e.severity !== "routine"), [matched]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPED;
    return GROUPED.map((g) => ({
      type: g.type,
      items: g.items.filter((i) => i.label.toLowerCase().includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  // Before hydration we genuinely do not know what the reader follows. Showing
  // the empty state would flash "you follow nothing" at someone who follows
  // twelve things.
  if (!hydrated) {
    return (
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <p className="text-sm text-slate-500">Loading your followed topics…</p>
      </div>
    );
  }

  const atCap = follows.length >= MAX_FOLLOWS;

  return (
    <section aria-labelledby="following-heading" className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="following-heading" className="text-sm font-semibold text-white">
            {follows.length > 0 ? "Changes affecting what you follow" : "Follow what matters to you"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Follow a visa category, country, agency, or topic and this becomes a feed of only the changes
            that touch it.{" "}
            <span className="text-slate-500">
              Your list is stored in this browser and never sent to us — so there is no account, and it
              does not follow you to another device.
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPicking((p) => !p)}
          aria-expanded={picking}
          className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-white/25 hover:text-white"
        >
          {picking ? "Done" : follows.length > 0 ? "Edit follows" : "Choose topics"}
        </button>
      </div>

      {/* Current follows, always visible so a reader can see and undo them. */}
      {follows.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {follows.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="group rounded-full border border-accent/50 bg-accent/15 px-3 py-1 text-xs text-white hover:border-status-amber/60"
              aria-label={`Stop following ${labelForEntity(id)}`}
              title={`Stop following ${labelForEntity(id)}`}
            >
              {labelForEntity(id)}
              <span className="ml-1.5 text-slate-400 group-hover:text-status-amber" aria-hidden>
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={clear}
            className="text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {picking ? (
        <div className="mt-4 border-t border-white/5 pt-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter topics — “Venezuela”, “H-1B”, “USCIS”…"
            aria-label="Filter followable topics"
            className="w-full rounded-lg border border-white/10 bg-ink-850/80 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent/50 focus:outline-none"
          />
          {atCap ? (
            <p className="mt-2 text-xs text-status-amber">
              You are following the maximum of {MAX_FOLLOWS}. Remove one to add another.
            </p>
          ) : null}

          <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
            {visibleGroups.length === 0 ? (
              <p className="text-xs text-slate-400">
                Nothing in the archive matches that. Only topics that actually appear in a recorded
                change can be followed — we do not offer a topic we have no coverage of.
              </p>
            ) : (
              visibleGroups.map((group) => (
                <div key={group.type}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {TYPE_LABEL[group.type] ?? group.type}
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {group.items.map((item) => {
                      const on = follows.includes(item.entityId);
                      return (
                        <button
                          key={item.entityId}
                          type="button"
                          onClick={() => toggle(item.entityId)}
                          aria-pressed={on}
                          disabled={!on && atCap}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            on
                              ? "border-accent/60 bg-accent/15 text-white"
                              : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/25 hover:text-slate-200"
                          }`}
                        >
                          {item.label}
                          <span className="ml-1.5 tabular-nums text-slate-500">{item.eventCount}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      {follows.length > 0 ? (
        <div className="mt-4 border-t border-white/5 pt-4">
          {matched.length === 0 ? (
            // Never "nothing has changed" — only "we have recorded nothing".
            <p className="text-sm leading-relaxed text-slate-400">
              Nothing in the archive touches what you follow yet. That is a statement about what we have
              recorded, not a guarantee that nothing has happened — see the coverage note below for which
              sources feed this page.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-300">
                <span className="font-semibold text-white">{significant.length}</span> significant
                {significant.length === 1 ? " change" : " changes"} affect what you follow
                {matched.length > significant.length
                  ? `, plus ${matched.length - significant.length} routine.`
                  : "."}
              </p>
              <ul className="mt-2">
                {significant.slice(0, 12).map((e) => (
                  <FollowedEvent key={e.id} event={e} follows={follows} />
                ))}
              </ul>
              {significant.length > 12 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Showing the 12 most recent. Use the search below to see the rest.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
