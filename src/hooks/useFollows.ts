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
import { track } from "@/lib/analytics";
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

  const commit = useCallback(
    (next: string[]) => {
      adopt(next);
      writeStoredFollows(next);
      try {
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: next }));
      } catch {
        // Nothing to do: this instance is already correct, and the others will
        // catch up on the next render or reload.
      }
    },
    [adopt]
  );

  const toggle = useCallback(
    (entityId: string) => {
      const next = toggleFollowPure(latest.current, entityId);
      // entity_follow was declared in the taxonomy and never emitted, so the one
      // feature built specifically to bring readers back was the one we could
      // not tell was being used. The entity id is a public slug from our own
      // vocabulary (country:mexico, visa:h-1b) — it names a topic, not a person,
      // and the follow list itself still never leaves the browser.
      track("entity_follow", {
        entity: entityId,
        action: next.length > latest.current.length ? "follow" : "unfollow",
        total: next.length,
      });
      commit(next);
    },
    [commit]
  );

  const clear = useCallback(() => commit([]), [commit]);

  return { follows, toggle, clear, hydrated };
}
