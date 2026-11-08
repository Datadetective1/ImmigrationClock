"use client";

// =============================================================================
// WHAT GETS EMAILED — said accurately to whoever is reading
//
// The "How this works" list on /following said "Nothing is emailed unless you
// subscribe" and that the weekly Pulse "is not personalized from what you
// follow here". True for a free reader. A Pro subscriber, whose alerts are
// built from exactly this list, read that their follows never reach an email.
// Same probe as FollowStorageNote, so this costs no extra request.
// =============================================================================

import { useEffect, useState } from "react";
import { SYNC_STATUS_EVENT, lastKnownSyncStatus, type SyncStatus } from "@/lib/billing/watchlist-client";

export function FollowEmailNote() {
  const [status, setStatus] = useState<SyncStatus>("off");

  useEffect(() => {
    setStatus(lastKnownSyncStatus());
    const onStatus = (e: Event) => setStatus((e as CustomEvent<SyncStatus>).detail);
    window.addEventListener(SYNC_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, onStatus);
  }, []);

  if (status === "on") {
    return (
      <li>
        <span className="font-medium text-slate-200">Your Pro alerts use this list.</span> When a
        recorded change touches something you follow, we email you. Choose daily or weekly, or turn
        alerts off, in{" "}
        <a href="/briefing" className="link-accent">
          your Briefing
        </a>
        . The weekly Immigration Pulse is separate and is the same issue for everyone.
      </li>
    );
  }

  return (
    <li>
      <span className="font-medium text-slate-200">Nothing is emailed unless you subscribe.</span>{" "}
      The weekly Immigration Pulse is the same issue for everyone. It is not personalized from what you
      follow here, and subscribing to it tells us nothing about your interests.
    </li>
  );
}
