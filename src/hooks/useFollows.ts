"use client";

// =============================================================================
// useFollows — the browser binding for the follow set
//
// All the rules live in @/lib/follows as pure functions. This hook does three
// things and nothing else: read once on mount, write on change, and keep other
// tabs in sync.
//
// WHY IT READS AFTER MOUNT RATHER THAN DURING RENDER
// The site is statically exported, so the HTML is built without any reader's
// preferences in it. Reading localStorage during the first render would produce
// markup that disagrees with the server's and trigger a hydration mismatch, so
// the hook starts empty and fills in immediately after. `hydrated` is exposed so
// callers can avoid flashing "you follow nothing" before the real answer
// arrives.
// =============================================================================

import { useCallback, useEffect, useState } from "react";
import {
  readStoredFollows,
  writeStoredFollows,
  toggleFollow as toggleFollowPure,
  sanitizeFollows,
  STORAGE_KEY,
} from "@/lib/follows";

export function useFollows(knownIds?: ReadonlySet<string>) {
  const [follows, setFollows] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFollows(readStoredFollows(knownIds));
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
        setFollows(sanitizeFollows(e.newValue ? JSON.parse(e.newValue) : [], knownIds));
      } catch {
        /* another tab wrote something unreadable; keep what we have */
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback((entityId: string) => {
    setFollows((current) => {
      const next = toggleFollowPure(current, entityId);
      writeStoredFollows(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setFollows([]);
    writeStoredFollows([]);
  }, []);

  return { follows, toggle, clear, hydrated };
}
