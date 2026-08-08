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
// "SINCE YOUR LAST VISIT"
// -----------------------
// A single timestamp in localStorage beside the follow set. It never leaves the
// browser and identifies nobody. When it is absent — a first visit, cleared
// storage, a different device — the copy says "recent" instead, because
// claiming "since your last visit" without knowing when that was would be a
// small lie told to make a number look better.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFollows } from "@/hooks/useFollows";
import { buildDigest } from "@/lib/follows";
import { EVENT_INDEX } from "@/lib/event-index";

/** Separate key from the follow set: clearing follows should not erase this. */
const LAST_SEEN_KEY = "immigrationclock.lastSeen.v1";

/** How far back "recent" reaches when there is no previous visit to compare to. */
const RECENT_DAYS = 30;

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function ChangesForYou() {
  const { follows, hydrated } = useFollows();
  const [since, setSince] = useState<string | null>(null);
  const [knewLastVisit, setKnewLastVisit] = useState(false);

  useEffect(() => {
    let previous: string | null = null;
    try {
      previous = window.localStorage.getItem(LAST_SEEN_KEY);
    } catch {
      // Private mode, or storage disabled. Fall through to "recent".
    }

    const valid = previous && /^\d{4}-\d{2}-\d{2}$/.test(previous) ? previous : null;
    setKnewLastVisit(Boolean(valid));
    setSince(valid ?? iso(new Date(Date.now() - RECENT_DAYS * 86_400_000)));

    // Stamp AFTER reading, so this visit does not erase the window it is about
    // to describe.
    try {
      window.localStorage.setItem(LAST_SEEN_KEY, iso(new Date()));
    } catch {
      // Nothing to do — the digest still works, it just says "recent" next time.
    }
  }, []);

  const digest = useMemo(
    () => (since ? buildDigest(EVENT_INDEX, follows, since) : null),
    [follows, since]
  );

  // Before hydration the follow set is unknown; before the effect runs the
  // window is. Rendering either as "0 changes" would be wrong, not empty.
  if (!hydrated || !digest) return null;
  if (follows.length === 0) return null;

  const { total, significant } = digest;
  const period = knewLastVisit ? "since your last visit" : `in the last ${RECENT_DAYS} days`;

  return (
    <section
      aria-labelledby="changes-for-you"
      className="rounded-2xl border border-accent/25 bg-accent/[0.05] p-4 sm:p-5"
    >
      <h2 id="changes-for-you" className="text-sm font-semibold text-white">
        Changes for you
      </h2>

      {total === 0 ? (
        <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
          Nothing you follow has changed {period}. That describes our archive, not the whole world —
          keep checking the official source before acting.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
            <span className="font-semibold text-white">
              {total} {total === 1 ? "change" : "changes"}
            </span>{" "}
            {total === 1 ? "matches" : "match"} what you follow {period}
            {significant.length > 0 && significant.length !== total ? (
              <>
                {" "}
                — {significant.length} of {total === 1 ? "them" : "them"} beyond routine paperwork
              </>
            ) : null}
            .
          </p>
          <ul className="mt-3 space-y-2">
            {significant.slice(0, 3).map((e) => (
              <li key={e.id} className="text-sm leading-snug text-slate-200">
                <span className="text-slate-500">{e.publishedAt}</span> — {e.title}
              </li>
            ))}
          </ul>
        </>
      )}

      <Link
        href="/what-changed"
        className="mt-3 inline-block text-xs font-semibold text-accent hover:text-accent-soft"
      >
        See every change &rarr;
      </Link>
    </section>
  );
}
