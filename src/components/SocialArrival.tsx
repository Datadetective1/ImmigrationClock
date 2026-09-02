"use client";

// =============================================================================
// SOCIAL ARRIVAL — one event when a reader lands from one of our own posts
//
// Mounted once in the root layout, inside a Suspense boundary because
// useSearchParams() would otherwise force the whole static shell to render on
// the client. It renders nothing; its only job is to read the UTM parameters
// the share URL carried (src/lib/share.ts) and fire `social_post_click` with
// the story key — once per story per browser session, guarded by
// sessionStorage so a reload or a back-navigation does not count twice.
//
// It never touches the URL. Plausible reads utm_* itself; stripping them would
// remove the attribution this component exists to extend. sessionStorage is
// wrapped because Safari private windows and some enterprise browsers throw on
// access, and measurement must never break a page.
// =============================================================================

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { claimSocialArrival, trackSocialArrival, type OnceStore } from "@/lib/analytics";

function sessionStore(): OnceStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function SocialArrival() {
  const search = useSearchParams();
  const pathname = usePathname();
  const query = search?.toString() ?? "";

  useEffect(() => {
    if (!query) return;
    const t = claimSocialArrival(query, sessionStore());
    if (t) trackSocialArrival(t, pathname || "/");
  }, [query, pathname]);

  return null;
}
