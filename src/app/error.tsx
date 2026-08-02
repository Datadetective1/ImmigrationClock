"use client";

// =============================================================================
// ERROR BOUNDARY
//
// Without this, an exception anywhere in a client component leaves a blank page
// and no way back. The site is a static export, so there is no server to catch
// anything — the browser is the only place a failure can be handled.
//
// WHAT THIS SCREEN MUST NOT SAY
// -----------------------------
// It must not imply anything about the DATA. "No data available", "nothing
// found", or "no changes to show" would all be claims about U.S. immigration
// policy, made by a component that has no idea what the data says — it only
// knows that rendering threw.
//
// On a platform whose entire promise is that a quiet feed means a quiet feed and
// a gap is always disclosed as a gap, letting a crash masquerade as an answer
// would be the worst possible failure mode. So this says exactly one thing: the
// page failed to display, the archive is unaffected, and here is how to get
// back to it.
// =============================================================================

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console rather than sent anywhere. The platform
    // collects no per-visitor data, and an error report carrying a URL and a
    // stack trace from someone reading about asylum policy is exactly the kind
    // of record /methodology promises not to hold.
    console.error("[ImmigrationClock] render failed:", error);
  }, [error]);

  return (
    <div className="container-page max-w-2xl py-16">
      <h1 className="text-2xl font-semibold text-white sm:text-3xl">This page failed to load</h1>

      <p className="mt-4 text-sm leading-relaxed text-slate-300">
        Something went wrong displaying this page. This is a fault in the site, not a statement about
        immigration policy — no data has changed, and nothing has been added to or removed from the
        archive.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-100 hover:border-accent/50 hover:text-white"
        >
          Try again
        </button>
        <Link
          href="/what-changed"
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-white/25 hover:text-white"
        >
          Go to What changed
        </Link>
        <Link
          href="/"
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:border-white/25 hover:text-white"
        >
          Go to the dashboard
        </Link>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-slate-500">
        Every figure and event on this site links to the government document it came from. If this page
        stays broken, those originals are still reachable through{" "}
        <Link href="/sources" className="text-accent underline-offset-2 hover:underline">
          the source list
        </Link>
        .
        {error.digest ? <span className="ml-1 font-mono text-slate-600">Ref: {error.digest}</span> : null}
      </p>
    </div>
  );
}
