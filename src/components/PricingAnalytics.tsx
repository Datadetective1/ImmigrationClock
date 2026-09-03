"use client";

// =============================================================================
// One event when the pricing page opens, with the surface that sent the reader.
//
// `from` comes from the referrer's PATHNAME only — never the full URL, never a
// query string. A query string on this site can carry a search term, and a
// search term on an immigration site can carry something about a person.
// =============================================================================

import { useEffect } from "react";
import { trackPricingView } from "@/lib/analytics";

/** Path segments we are willing to attribute to. Anything else becomes "other". */
const KNOWN = new Set([
  "/",
  "/what-changed",
  "/h1b/employers",
  "/h1b/top-sponsors",
  "/layoffs",
  "/layoffs-vs-h1b",
  "/following",
  "/for-you",
  "/insights",
  "/explained",
  "/account",
  "/developers",
  "/data",
]);

export function PricingAnalytics() {
  useEffect(() => {
    let from = "direct";
    try {
      const ref = document.referrer;
      if (ref) {
        const url = new URL(ref);
        if (url.origin === window.location.origin) {
          from = KNOWN.has(url.pathname) ? url.pathname : "other";
        } else {
          from = "external";
        }
      }
    } catch {
      from = "direct";
    }
    trackPricingView(from);
  }, []);

  return null;
}
