"use client";

// =============================================================================
// useFollows — the browser binding for the follow set
//
// All the rules live in @/lib/follows as pure functions. This hook does four
// things and nothing else: read once on mount, write on change, keep other tabs
// in sync, and keep the components on THIS page in sync with each other.
//
// WHY THE IN-PAGE BROADCAST EXISTS
// /following renders the picker and the digest as two components, so there are
// two instances of this hook holding two copies of the same list. The browser
// fires `storage` only in OTHER tabs, so without a same-page signal, following
// a country would update the chips and leave the digest below them showing the
// previous answer until a reload — the one moment the feature has to feel
// immediate. The event carries the list to the other instances in this page and
// nowhere else; it is a DOM event, not a network call.
//
// WHY IT READS AFTER MOUNT RATHER THAN DURING RENDER
// The site is statically exported, so the HTML is built without any reader's
// preferences in it. Reading localStorage during the first render would produce
// markup that disagrees with the server's and trigger a hydration mismatch, so
// the hook starts empty and fills in immediately after. `hydrated` is exposed so
// callers can avoid flashing "you follow nothing" before the real answer
// arrives.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { track, watchlistSizeBucket } from "@/lib/analytics";
import {
  fetchServerWatchlist,
  hasSessionHint,
  refreshSession,
  saveServerWatchlist,
  type SyncStatus,
} from "@/lib/billing/watchlist-client";
import { readSyncState, resolveLoad, writeSyncState } from "@/lib/billing/watchlist-sync";
import {
  readStoredFollows,
  writeStoredFollows,
  toggleFollow as toggleFollowPure,
  sanitizeFollows,
  STORAGE_KEY,
} from "@/lib/follows";

/** Same-page signal. Never crosses the page boundary — see the header note. */
const SYNC_EVENT = "immigrationclock:follows-changed";

export function useFollows(knownIds?: ReadonlySet<string>) {
  const [follows, setFollows] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  /**
   * Whether this browser's list is being kept on the account.
   *
   * "off" until the server says otherwise, so a reader who is not paying — or
   * not signed in, or offline — sees exactly the experience they had before
   * any of this existed. Nothing here decides what is ALLOWED; the route
   * re-reads the subscription from the store on every write.
   */
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("off");
  /** Read synchronously by commit(), which cannot wait for a re-render. */
  const syncing = useRef(false);
  /**
   * The list as of the last write, readable synchronously.
   *
   * Two clicks in the same frame must not both compute from the same stale
   * render, and the alternative — doing the write inside a state updater —
   * puts a side effect somewhere React is allowed to call twice.
   */
  const latest = useRef<string[]>([]);

  const adopt = useCallback((next: string[]) => {
    latest.current = next;
    setFollows(next);
  }, []);

  useEffect(() => {
    adopt(readStoredFollows(knownIds));
    setHydrated(true);
    // knownIds is a stable set built once from the index; re-running on identity
    // change would clobber the reader's state for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Two tabs open on the same site must not disagree about what is followed.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      try {
        adopt(sanitizeFollows(e.newValue ? JSON.parse(e.newValue) : [], knownIds));
      } catch {
        /* another tab wrote something unreadable; keep what we have */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // …and neither must two components on the same page.
  useEffect(() => {
    function onSync(e: Event) {
      adopt(sanitizeFollows((e as CustomEvent<unknown>).detail, knownIds));
    }
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Push the list to the account, and adopt whatever the server stored.
   *
   * The server is allowed to return something different from what it was sent —
   * it applies the same follow vocabulary and the same cap — and taking its
   * answer back is what keeps the browser from believing in an id the account
   * does not actually hold.
   *
   * Failure is deliberately silent. Following is an enhancement; a reader who
   * has just clicked a chip should not be shown a network error about a feature
   * whose whole promise is that they do not have to think about it. The local
   * write has already happened, and the next load reconciles.
   */
  const push = useCallback(
    async (next: string[]) => {
      if (!syncing.current) return;
      const result = await saveServerWatchlist(next);
      if (result.status === "on") {
        const stored = sanitizeFollows(result.entityIds, knownIds);
        if (stored.join("\u0000") !== next.join("\u0000")) adopt(stored);
      } else if (result.status === "off") {
        // Entitlement ended between load and click — a cancellation, a sign-out
        // in another tab. Stop claiming to sync rather than retrying forever.
        syncing.current = false;
        setSyncStatus("off");
      }
      // "unknown" keeps syncing on: a dropped request is not a lost subscription.
    },
    // knownIds is a stable set built once from the index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adopt]
  );

  // --- THE FIRST SIGN-IN MERGE, AND EVERY LOAD AFTER IT ---------------------
  //
  // Runs once per mount, after local state has hydrated so there is something
  // to merge. Three outcomes:
  //
  //   not entitled  -> nothing happens, local storage is untouched
  //   first time    -> server UNION local, pushed, and the device is marked
  //   thereafter    -> the server's list wins, so an unfollow on another
  //                    device is an unfollow here
  //
  // See watchlist-sync.ts for why the union runs once and not on every load.
  useEffect(() => {
    if (!hydrated) return;
    // AN ANONYMOUS READER ASKS NOTHING. Without this the probe ran on every
    // page load for everybody, and a visitor with no account collected a 503
    // in their console for a feature they do not have.
    if (!hasSessionHint()) return;
    const controller = new AbortController();

    (async () => {
      let server = await fetchServerWatchlist(controller.signal);
      if (controller.signal.aborted) return;

      // ONE RETRY BEHIND A LAPSED CLAIM.
      //
      // The entitlement claim is short-lived on purpose, and it was only ever
      // renewed on /account — which an annual subscriber has no reason to
      // visit. On day 31 the watchlist route answered 401, this classified it
      // as "off", and sync stopped silently for somebody eleven months into a
      // year they had paid for.
      //
      // A 401 while the browser holds a session hint is worth exactly one
      // refresh: the server re-reads the authoritative record and re-mints, or
      // answers 402 and clears the cookie because the subscription really did
      // end. Both outcomes are correct; guessing "off" was not.
      if (server.httpStatus === 401 && (await refreshSession(controller.signal))) {
        if (controller.signal.aborted) return;
        server = await fetchServerWatchlist(controller.signal);
        if (controller.signal.aborted) return;
      }

      if (server.status !== "on") {
        setSyncStatus(server.status === "unknown" ? "off" : "off");
        return;
      }

      syncing.current = true;
      setSyncStatus("on");

      // The decision itself is a pure function so it can be tested; see
      // resolveLoad() for why the account wins after the first merge.
      const alreadyMerged = readSyncState()?.merged === true;
      const merged = resolveLoad({
        merged: alreadyMerged,
        server: server.entityIds,
        local: latest.current,
        knownIds,
      });
      adopt(merged.entityIds);
      writeStoredFollows(merged.entityIds);
      if (alreadyMerged) return;

      // THE DEVICE IS STAMPED ONLY ONCE THE UNION IS SAFELY ON THE SERVER.
      //
      // This used to stamp first. A failed PUT — offline, a 500, a closed tab —
      // then left the flag set with the merge never performed, so the next load
      // took the "already merged, the server wins" path and overwrote the local
      // list with the PRE-merge server one. Every follow built in this browser
      // was deleted, permanently and silently, by the one mechanism that exists
      // to protect them.
      //
      // Nothing to push is a legitimate completion: the union equals what the
      // server already holds, so there is nothing that could fail.
      if (!merged.changed) {
        writeSyncState(Math.floor(Date.now() / 1000));
        return;
      }

      const saved = await saveServerWatchlist(merged.entityIds, controller.signal);
      if (controller.signal.aborted) return;
      if (saved.status === "on") {
        const stored = sanitizeFollows(saved.entityIds, knownIds);
        adopt(stored);
        writeStoredFollows(stored);
        // Confirmed stored. Only now is this device's merge genuinely done.
        writeSyncState(Math.floor(Date.now() / 1000));
      }
      // A failed save leaves the device UNSTAMPED, so the next load merges
      // again — a union is idempotent, so retrying costs nothing and losing
      // the retry costs the reader their list.
    })();

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const commit = useCallback(
    (next: string[]) => {
      adopt(next);
      writeStoredFollows(next);
      void push(next);
      try {
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
      } catch {
        // Nothing to do: this instance is already correct, and the others will
        // catch up on the next render or reload.
      }
    },
    [adopt, push]
  );

  const toggle = useCallback(
    (entityId: string) => {
      const next = toggleFollowPure(latest.current, entityId);
      // THE CATEGORY, NEVER THE SELECTION.
      //
      // This sent the exact entity id — country:venezuela, visa:tps — with the
      // reasoning that a public slug from our own vocabulary "names a topic,
      // not a person". On most sites that would be true. Here the topic IS the
      // person: a browser that follows country:venezuela and visa:tps has
      // disclosed a nationality and an immigration status to a third party,
      // and those two events are correlatable within a session.
      //
      // The product question is "are readers following things, and which
      // categories" — which the type answers without the disclosure. The exact
      // count is bucketed for the same reason: a precise watchlist size narrows
      // a browser to a small group when combined with anything else.
      track("entity_follow", {
        entity_type: entityId.split(":")[0],
        action: next.length > latest.current.length ? "follow" : "unfollow",
        total: watchlistSizeBucket(next.length),
      });
      commit(next);
    },
    [commit]
  );

  const clear = useCallback(() => commit([]), [commit]);

  return { follows, toggle, clear, hydrated, syncStatus };
}
