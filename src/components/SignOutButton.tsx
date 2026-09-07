"use client";

// =============================================================================
// SIGN OUT — and the careful part is what it does NOT delete
//
// Signing out ends an IDENTITY on this browser. It is not a request to be
// forgotten, and it is not a reset button:
//
//   CLEARED  the entitlement cookie and its readable hint, both server-side.
//   STAMPED  the per-device sync flag, marking this browser as one that has
//            hosted an account session.
//   KEPT     the subscription itself, the server-side watchlist, and the local
//            follow list in this browser.
//
// THE STAMP IS THE NON-OBVIOUS PART, AND IT IS THE OPPOSITE OF WHAT IT LOOKS
// LIKE IT SHOULD BE.
//
// The flag records that this device has already folded its local follows into
// an account. The instinct on sign-out is to CLEAR it, so the next sign-in
// merges rather than overwrites. That is backwards, because the merge runs in
// the direction nobody thinks about first: it PUSHES this browser's local
// follows up into whichever account signs in next. On a shared laptop that
// means Alice signs out, Bob signs in, and Alice's follows are uploaded to
// Bob's account and land on Bob's phone. A follow here can imply a
// nationality, so that is one reader's interests disclosed to another — not a
// caching annoyance.
//
// A union is only ever right on a device that has NEVER hosted a session,
// where the local list can only belong to the person signing in. After a
// sign-out this device is not that, so it is stamped and the next sign-in
// takes the server-wins path.
//
// The local follow list stays because it is public-platform data: following
// things works with no account at all, and deleting somebody's reading
// preferences because they signed out of billing would be a surprise. It is
// simply no longer treated as evidence about who the next person is.
// =============================================================================

import { useRouter } from "next/navigation";
import { useState } from "react";
import { announceIdentityChange } from "@/lib/billing/identity-signal";
import { writeSyncState } from "@/lib/billing/watchlist-sync";

export function SignOutButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");

  async function signOut() {
    if (state === "working") return;
    setState("working");
    try {
      const res = await fetch("/api/billing/signout", { method: "POST" });
      if (!res.ok) {
        setState("failed");
        return;
      }
      // This device has hosted a session, so its local list is no longer
      // evidence about who signs in next. Stamping it makes the next sign-in
      // take its list FROM the account instead of pushing this one INTO it.
      writeSyncState(Math.floor(Date.now() / 1000));
      // THE HEADER IS NOT ON THIS ROUTE AND IS NOT REMOUNTED BY A REFRESH.
      //
      // `router.refresh()` re-renders the SERVER components, which is what
      // turns this panel back into the sign-in form. The account control in the
      // header is a client component that reads the hint cookie, and nothing
      // navigated — so without this announcement it kept offering "Account"
      // above a page saying "Sign in with your email". The signal also reaches
      // the site's other open tabs.
      announceIdentityChange();
      router.refresh();
    } catch {
      setState("failed");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={signOut}
        disabled={state === "working"}
        className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:text-white disabled:opacity-60"
      >
        {state === "working" ? "Signing out…" : "Sign out"}
      </button>
      {state === "failed" ? (
        <p role="status" className="mt-2 text-xs text-slate-400">
          Could not sign out. Check your connection and try again.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Signs this browser out. Your subscription and your synced follows stay exactly as they
          are, and signing back in restores them.
        </p>
      )}
    </div>
  );
}
