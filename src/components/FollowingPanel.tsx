"use client";

// =============================================================================
// FOLLOWING PANEL — "show me only what affects me"
//
// The archive answers "what changed". This answers "what changed FOR ME", which
// for most readers is the only question they actually have.
//
// WHAT THE PRIMARY ACTION IS, AND WHY IT SAYS SO
// A visitor arriving from "Follow a country or visa" wants to pick a country or
// a visa. The panel used to open with suggested chips and a button labelled
// "Choose topics", which named neither of the two things they came for, so the
// first move was a guess. The button now names the categories out loud and
// opens a searchable picker with Countries, Visas, Agencies and Topics as
// visible sections — the suggestions demoted to what they always were, a quick
// start for someone with no particular country in mind.
//
// THE PROMISE THIS MAKES, AND KEEPS
// Follows never leave the browser. There is no account and no identifier. The
// panel states that in one line and leaves the detail to "How this works" on
// /following — the full explanation used to run before the reader had any
// experience of the feature to attach it to.
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

import { useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { labelForEntity, SHORT_TYPE_LABEL } from "@/lib/entity-labels";
import { useFollows } from "@/hooks/useFollows";
import { EVENT_INDEX, type IndexedEvent } from "@/lib/event-index";
import {
  buildFollowCatalog,
  groupCatalog,
  orderGroupsForPicker,
  filterGroups,
  eventsForFollows,
  matchedFollows,
  PRIMARY_FOLLOW_TYPES,
  MAX_FOLLOWS,
  type FollowableType,
} from "@/lib/follows";

/** Ids present in the archive — used to drop stale follows read from storage. */
const CATALOG = buildFollowCatalog(EVENT_INDEX, labelForEntity);
const KNOWN_IDS: ReadonlySet<string> = new Set(CATALOG.map((c) => c.entityId));
const GROUPED = orderGroupsForPicker(groupCatalog(CATALOG));

/** The categories offered as one-tap filters, minus any the archive lacks. */
const CATEGORY_FILTERS = PRIMARY_FOLLOW_TYPES.filter((t) => GROUPED.some((g) => g.type === t));

/** Exactly what the button says, so a test can hold us to it. */
export const CHOOSE_CTA = "Choose countries, visas & topics";

/** The one thing a quiet feed is allowed to mean. */
export const NO_MATCHES_COPY = "No recorded changes currently match what you're following.";

/** …and the caveat that must travel with it, everywhere it appears. */
export const ARCHIVE_CAVEAT =
  "That describes the archive we have recorded, not the whole world. Check the official source before acting.";

/** What to say to someone who has followed nothing yet. */
export const NOTHING_FOLLOWED_COPY =
  "Choose something to follow and ImmigrationClock will organize the relevant changes here.";

/**
 * One-tap starting points for a reader who has never followed anything.
 *
 * The busiest entities in the archive, because a suggestion that returns an
 * empty feed teaches the reader the feature is broken. Countries and visas are
 * preferred over agencies where counts allow — "DHS" is the biggest number and
 * the least useful thing for a person to follow, since almost everything is a
 * DHS document.
 */
const SUGGESTED = (() => {
  const preferred = CATALOG.filter((c) => c.type === "visa" || c.type === "country")
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 5);
  const topics = CATALOG.filter((c) => c.type === "topic")
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 3);
  return [...preferred, ...topics].slice(0, 7);
})();

function MatchReason({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <p className="mt-1 text-xs text-slate-500">
      Matched because you follow {ids.map((id) => labelForEntity(id)).join(", ")}
    </p>
  );
}

/**
 * One matched change.
 *
 * Exported because /following renders its digest through ChangesForYou rather
 * than through this panel, and a second copy of this markup would be two
 * renderings of the same event that drift apart.
 */
export function FollowedEvent({ event, follows }: { event: IndexedEvent; follows: string[] }) {
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
      {/* h3, not h4: this sits directly under a panel's h2. Skipping a level
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

export function FollowingPanel({
  /**
   * Whether the panel renders the matched changes itself.
   *
   * True on /what-changed and /for-you, where the panel IS the personalized
   * feed. False on /following, where ChangesForYou renders a fuller digest
   * directly below and two lists of the same events would read as a bug.
   */
  showChanges = true,
  /**
   * Whether a reader who follows nothing arrives with the picker already open.
   *
   * True only on /following, where choosing IS the page: a visitor who followed
   * the "Follow a country or visa" CTA should see countries, not a button that
   * leads to countries. On /what-changed and /for-you the panel is one section
   * among many, and a list of 106 options unfurled by default would shove the
   * rest of the page off the screen.
   */
  openWhenEmpty = false,
}: {
  showChanges?: boolean;
  openWhenEmpty?: boolean;
} = {}) {
  const { follows, toggle, clear, hydrated } = useFollows(KNOWN_IDS);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FollowableType | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  /** Set only by a click, so an automatic open never steals focus on load. */
  const focusOnOpen = useRef(false);
  const autoOpened = useRef(false);

  const matched = useMemo(() => eventsForFollows(EVENT_INDEX, follows), [follows]);
  const significant = useMemo(() => matched.filter((e) => e.severity !== "routine"), [matched]);

  const visibleGroups = useMemo(
    () => filterGroups(GROUPED, { query, type: category }),
    [query, category]
  );
  const visibleCount = useMemo(
    () => visibleGroups.reduce((n, g) => n + g.items.length, 0),
    [visibleGroups]
  );

  // A visitor who follows nothing gets the picker already open, once. If they
  // close it, it stays closed — the automatic open is a starting position, not
  // a state the component insists on.
  useEffect(() => {
    if (!hydrated || autoOpened.current) return;
    autoOpened.current = true;
    if (openWhenEmpty && follows.length === 0) setPicking(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Opening the picker with the keyboard should land the caret where the work
  // happens, not leave the reader to tab through the chips to reach it. Only on
  // a real click: moving focus during page load drops a screen reader user into
  // the middle of a page they have not heard the top of yet.
  useEffect(() => {
    if (picking && focusOnOpen.current) searchRef.current?.focus();
    focusOnOpen.current = false;
  }, [picking]);

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
    <section
      id="follow"
      aria-labelledby="following-heading"
      className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="following-heading" className="text-base font-semibold text-white">
            {follows.length > 0 ? "You're following" : "Choose what to follow"}
          </h2>
          {follows.length === 0 ? (
            <p className="mt-1 text-sm leading-relaxed text-slate-400">
              Pick a country, visa, agency or topic and this becomes a feed of only the changes that
              touch it.
            </p>
          ) : null}
        </div>
        {/* THE primary action. It names the categories rather than saying
            "topics", because "topics" is the one word that describes none of
            the things a visitor arrives here looking for. */}
        <button
          type="button"
          onClick={() => {
            focusOnOpen.current = true;
            setPicking((p) => !p);
          }}
          aria-expanded={picking}
          aria-controls="follow-picker"
          className={`w-full shrink-0 rounded-lg px-5 py-3 text-sm font-semibold transition-colors sm:w-auto ${
            picking
              ? "border border-white/15 text-slate-200 hover:border-white/30 hover:text-white"
              : "bg-accent text-ink-950 shadow-card hover:bg-accent-soft"
          }`}
        >
          {picking ? "Done choosing" : CHOOSE_CTA}
        </button>
      </div>

      {/* Current follows, directly under the heading that names them, always
          visible so a reader can see and undo them without opening anything. */}
      {follows.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {follows.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              className="group rounded-full border border-accent/50 bg-accent/15 px-3.5 py-2 text-sm text-white transition-colors hover:border-status-amber/60"
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
            className="rounded-lg px-2 py-2 text-sm text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}

      {picking ? (
        <div id="follow-picker" className="mt-4 border-t border-white/5 pt-4">
          <label htmlFor="follow-search" className="block text-sm font-medium text-slate-200">
            Search countries, visas, agencies, or topics
          </label>
          <input
            id="follow-search"
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Try “Venezuela”, “H-1B”, “USCIS”…"
            // 16px — see SearchBar. Below that, iOS zooms on focus. And no
            // focus:outline-none here: it would beat the global focus ring,
            // which is the only thing telling a keyboard user where they are.
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-ink-850/80 px-3 py-2.5 text-base text-white placeholder:text-slate-500 focus:border-accent/50"
          />

          {/* The four categories, as one-tap filters. The section headings below
              say the same thing, but they are only visible once you scroll to
              them — these say it before the reader has done anything. */}
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => setCategory(null)}
              aria-pressed={category === null}
              className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                category === null
                  ? "border-accent/60 bg-accent/15 text-white"
                  : "border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200"
              }`}
            >
              All
            </button>
            {CATEGORY_FILTERS.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setCategory((c) => (c === type ? null : type))}
                aria-pressed={category === type}
                className={`rounded-full border px-3.5 py-2 text-sm transition-colors ${
                  category === type
                    ? "border-accent/60 bg-accent/15 text-white"
                    : "border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-200"
                }`}
              >
                {SHORT_TYPE_LABEL[type] ?? type}
              </button>
            ))}
          </div>

          {atCap ? (
            <p className="mt-2 text-sm text-status-amber">
              You are following the maximum of {MAX_FOLLOWS}. Remove one to add another.
            </p>
          ) : null}

          {/* Screen reader users get no benefit from a list visibly shrinking. */}
          <p className="sr-only" aria-live="polite">
            {visibleCount} {visibleCount === 1 ? "option" : "options"} available
          </p>

          <div className="scroll-thin mt-3 max-h-96 space-y-4 overflow-y-auto pr-1">
            {visibleGroups.length === 0 ? (
              <p className="text-sm text-slate-400">
                Nothing in the archive matches that. Only countries, visas, agencies and topics that
                actually appear in a recorded change can be followed — we do not offer coverage we do
                not have.
              </p>
            ) : (
              visibleGroups.map((group) => (
                <div key={group.type}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {SHORT_TYPE_LABEL[group.type] ?? group.type}
                  </h3>
                  {/* NO COUNTS ON AGENCIES, deliberately. USCIS and DHS carry
                      the two biggest numbers on the page — not because they are
                      the most useful things to follow, but because almost every
                      document we record is a DHS document. Showing those counts
                      recommends the two worst choices in the picker. */}
                  {group.type === "agency" ? (
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Nearly every recorded change names an agency, so following one is a wide net.
                      A country, visa or topic gives a sharper feed.
                    </p>
                  ) : null}
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
                          className={`rounded-full border px-3.5 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                            on
                              ? "border-accent/60 bg-accent/15 text-white"
                              : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/25 hover:text-slate-200"
                          }`}
                        >
                          {item.label}
                          {item.type === "agency" ? null : (
                            <span className="ml-1.5 tabular-nums text-slate-500">{item.eventCount}</span>
                          )}
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

      {/* SUGGESTIONS, demoted twice over. They are a quick start for a reader
          with nothing particular in mind, not the way to reach a country — that
          is the button above — and they disappear entirely the moment the
          reader has follows of their own, so the page's centre of gravity moves
          to their list and their changes rather than to our recommendations. */}
      {!picking && follows.length === 0 ? (
        <div className="mt-4 border-t border-white/5 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Popular things to follow
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Every suggestion is unfollowed here by construction: this block
                only renders when the follow set is empty. */}
            {SUGGESTED.map((item) => (
              <button
                key={item.entityId}
                type="button"
                onClick={() => toggle(item.entityId)}
                disabled={atCap}
                aria-label={`Follow ${item.label}`}
                className="rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-2 text-sm text-slate-300 transition-colors hover:border-accent/50 hover:bg-accent/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span aria-hidden>+ </span>
                {item.label}
                <span className="ml-1.5 tabular-nums text-slate-500">{item.eventCount}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            The number is how many recorded changes already touch it. Your list stays in this browser
            — no account, nothing sent to us.
          </p>
        </div>
      ) : null}

      {showChanges && follows.length > 0 ? (
        <div className="mt-4 border-t border-white/5 pt-4">
          {matched.length === 0 ? (
            // Never "nothing has changed" — only "we have recorded nothing".
            <p className="text-sm leading-relaxed text-slate-400">
              {NO_MATCHES_COPY} {ARCHIVE_CAVEAT}
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
