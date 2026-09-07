"use client";

// =============================================================================
// WHERE YOUR FOLLOWS ARE KEPT — said accurately to whoever is reading
//
// THE DEFECT THIS FIXES. The "How this works" list on /following was written
// when follows were local-only, and stated it as flat fact:
//
//   "Your choices stay on this device."
//   "That means they do not sync. Follow something here and it will not appear
//    on your phone."
//
// Watchlist sync then shipped, and it is the ONE capability Pro sells today.
// So a subscriber who had just paid $19 saw the panel above say "Synced — saved
// to your account and available on your devices", and this section directly
// below it tell them the opposite, in bold. The page contradicted itself, and
// the half that was wrong was the half describing the thing they had bought.
//
// The third bullet did mention that a Pro subscriber can sync — but as a
// hypothetical ("Unless you ask us to"), which reads as not-yet-true to the
// person for whom it is already true.
//
// WHY A CLIENT COMPONENT. /following is a static page; it cannot know who is
// reading. The status comes from the same probe the panel above already made —
// see announceSyncStatus in watchlist-client.ts — so this costs no extra
// request and starts no second merge. An anonymous reader makes no probe at
// all, and "off" is the truth for them.
//
// THE PRIVACY CLAIM IS NOT WEAKENED, IT IS MADE SPECIFIC. Both states still say
// exactly what is held and on what terms: nothing server-side when sync is off,
// and when it is on, the list stored against a one-way hash of the address
// rather than the address itself.
// =============================================================================

import { useEffect, useState } from "react";
import {
  SYNC_STATUS_EVENT,
  lastKnownSyncStatus,
  type SyncStatus,
} from "@/lib/billing/watchlist-client";

export function FollowStorageNote() {
  // Starts from whatever the page already learned, so a listener that mounts
  // after the probe finished is not stuck on the anonymous copy.
  const [status, setStatus] = useState<SyncStatus>("off");

  useEffect(() => {
    setStatus(lastKnownSyncStatus());
    const onStatus = (e: Event) => setStatus((e as CustomEvent<SyncStatus>).detail);
    window.addEventListener(SYNC_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, onStatus);
  }, []);

  // "unknown" means we asked and could not tell. It is not "on": claiming a
  // sync we have not confirmed is the same class of error as denying one.
  if (status === "on") {
    return (
      <>
        <li>
          <span className="font-medium text-slate-200">Your follows are saved to your account.</span>{" "}
          They are on this device and on your account, so they survive clearing this browser and
          appear on every device you sign in on.
        </li>
        <li>
          <span className="font-medium text-slate-200">We hold the list because you asked us to.</span>{" "}
          That is what your subscription turned on. It is stored against a one-way hash of your email
          rather than the address itself, used for your account and nothing else, never sent to
          analytics, and deleted when you ask.
        </li>
      </>
    );
  }

  return (
    <>
      <li>
        <span className="font-medium text-slate-200">Your choices stay on this device.</span> They are
        saved in your browser&rsquo;s local storage. We never receive them, so they are not attached
        to your email address and not attached to you.
      </li>
      <li>
        <span className="font-medium text-slate-200">That means they do not sync.</span> Follow
        something here and it will not appear on your phone. Syncing would require us to hold the
        list, and a record of who follows which immigration topics is not something we keep by
        default — for anyone, paying or not.
      </li>
      <li>
        <span className="font-medium text-slate-200">Unless you ask us to.</span> A Pro subscriber can
        choose to sync this list so it survives a cleared browser and appears on their other devices.
        That is the only circumstance in which we hold it: stored against a one-way hash of your email
        rather than the address, used for your account and nothing else, never sent to analytics, and
        deleted when you ask.{" "}
        <a href="/pricing" className="link-accent">
          What Pro includes
        </a>
        .
      </li>
    </>
  );
}
