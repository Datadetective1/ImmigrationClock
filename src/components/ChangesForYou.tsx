"use client";

// =============================================================================
// CHANGES FOR YOU — personalization that stays in the reader's browser
//
// A digest of the changes matching what someone follows, computed entirely on
// their own device from localStorage. Nothing is transmitted, nothing is stored
// server-side, and no email address is ever associated with a set of
// immigration interests.
//
// That constraint is the product, not a limitation. /methodology promises "no
// individual immigrant profiles, tracking, or identifying personal data", and a
// record that a given address follows Venezuela, TPS and asylum is exactly the
// dataset that promise exists to prevent — and exactly the one worth
// subpoenaing. This component is what personalization looks like when you
// refuse to hold it.
//
// WHAT PERIOD THIS COVERS
// -----------------------
// A single timestamp in localStorage beside the follow set. It never leaves the
// browser and identifies nobody. When it exists, the digest is honestly headed
// "Since your last visit" — and the stamp is only advanced once a day, because
// re-stamping on every page load would quietly redefine "your last visit" as
// "ten minutes ago" and make the section report nothing forever. See
// shouldAdvanceLastSeen().
//
// When it does NOT — a first visit, cleared storage, a different device — the
// answer is not the same list under vaguer words. There is no last visit to
// measure from, so the digest widens to the whole archive and says so:
// "Relevant changes from the archive". Someone who has just followed their
// first country should see everything we hold on it, and should never be told
// it arrived "since your last visit". That decision is in digestWindow(), where
// it can be tested.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFollows } from "@/hooks/useFollows";
import { buildDigest, digestWindow, shouldAdvanceLastSeen } from "@/lib/follows";
import { EVENT_INDEX } from "@/lib/event-index";
import {
  FollowedEvent,
  NO_MATCHES_COPY,
  ARCHIVE_CAVEAT,
  NOTHING_FOLLOWED_COPY,
} from "@/components/FollowingPanel";

/** Separate key from the follow set: clearing follows should not erase this. */
const LAST_SEEN_KEY = "immigrationclock.lastSeen.v1";

/** How many matched changes are listed before the reader is sent to the archive. */
const MAX_LISTED = 8;

export function ChangesForYou() {
  const { follows, hydrated } = useFollows();
  const [previousVisit, setPreviousVisit] = useState<string | null>(null);
  const [visitRead, setVisitRead] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LAST_SEEN_KEY);
    } catch {
      // Private mode, or storage disabled. Fall through to the archive-wide view.
    }
    setPreviousVisit(stored);
    setVisitRead(true);

    // Stamp AFTER reading, so this visit does not erase the window it is about
    // to describe — and only when a day has passed, so a second look this
    // afternoon does not erase this morning either.
    if (!shouldAdvanceLastSeen(stored, Date.now())) return;
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    } catch {
      // Nothing to do — the digest still works, it just covers the archive next
      // time instead of the gap since now.
    }
  }, []);

  const period = useMemo(() => digestWindow(previousVisit), [previousVisit]);
  const since = period.since;

  const digest = useMemo(() => buildDigest(EVENT_INDEX, follows, since), [follows, since]);

  // Before hydration the follow set is unknown; before the effect runs the
  // period is. Rendering either as "0 changes" would be wrong, not empty.
  if (!hydrated || !visitRead) return null;

  const { total, significant, routine } = digest;
  // All-routine weeks are real. Showing a count with nothing under it would
  // look like a rendering failure.
  const listed = (significant.length > 0 ? significant : routine).slice(0, MAX_LISTED);

  return (
    <section
      aria-labelledby="changes-for-you"
      className="rounded-2xl border border-accent/25 bg-accent/[0.05] p-4 sm:p-5"
    >
      <h2 id="changes-for-you" className="text-base font-semibold text-white">
        Changes for you
      </h2>

      {follows.length === 0 ? (
        <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{NOTHING_FOLLOWED_COPY}</p>
      ) : (
        <>
          {/* The period is stated before the number, because the number means
              nothing without it — and it is never described as a last visit we
              do not have a record of. */}
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-accent-soft/80">
            {period.label}
          </p>

          {total === 0 ? (
            <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
              {NO_MATCHES_COPY} {ARCHIVE_CAVEAT}
            </p>
          ) : (
            <>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                <span className="font-semibold text-white">
                  {total} {total === 1 ? "change" : "changes"}
                </span>{" "}
                {total === 1 ? "matches" : "match"} what you follow
                {significant.length > 0 && significant.length !== total
                  ? ` — ${significant.length} beyond routine paperwork`
                  : ""}
                .
              </p>
              <ul className="mt-2">
                {listed.map((e) => (
                  <FollowedEvent key={e.id} event={e} follows={follows} />
                ))}
              </ul>
              {significant.length > listed.length ? (
                <p className="mt-2 text-xs text-slate-500">
                  Showing the {listed.length} most recent of {significant.length}.
                </p>
              ) : null}
              {significant.length > 0 && routine.length > 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Plus {routine.length} routine {routine.length === 1 ? "update" : "updates"} —
                  form edition dates, notices and similar.
                </p>
              ) : null}
            </>
          )}
        </>
      )}

      <Link
        href="/what-changed"
        className="mt-3 inline-block text-sm font-semibold text-accent hover:text-accent-soft"
      >
        See every change &rarr;
      </Link>
    </section>
  );
}
