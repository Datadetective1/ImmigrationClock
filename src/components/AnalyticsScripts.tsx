"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getConsent } from "./ConsentBanner";

/**
 * Privacy-first analytics with accurate App Router pageview tracking.
 *
 *   • NEXT_PUBLIC_PLAUSIBLE_DOMAIN — Plausible (cookieless). Loaded immediately;
 *     its script auto-tracks SPA navigations.
 *   • NEXT_PUBLIC_GA_ID — Google Analytics 4 (uses cookies). Loaded ONLY after the
 *     visitor accepts the cookie banner.
 *
 * GA4 firing model (this is what makes `collect` requests actually fire):
 *   - gtag MUST push the raw `arguments` object to dataLayer — Google's library
 *     fails to process plain arrays, which silently drops every hit.
 *   - `gtag('config', ID)` sends the initial page_view automatically (the
 *     guaranteed first `collect`).
 *   - Because Next.js client navigations don't reload the page, we send a manual
 *     `page_view` on each subsequent route change — skipping the first one so the
 *     initial view isn't double-counted.
 */
const PLAUSIBLE_DOMAIN = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

type Win = {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  plausible?: (...args: unknown[]) => void;
  __plq?: unknown[];
};

function loadPlausible() {
  if (!PLAUSIBLE_DOMAIN || document.getElementById("plausible-js")) return;
  const s = document.createElement("script");
  s.id = "plausible-js";
  s.defer = true;
  s.setAttribute("data-domain", PLAUSIBLE_DOMAIN);
  s.src = "https://plausible.io/js/script.tagged-events.js";
  document.head.appendChild(s);
  const w = window as unknown as Win;
  w.plausible =
    w.plausible ||
    function (...args: unknown[]) {
      (w.__plq = w.__plq || []).push(args);
    };
}

function AnalyticsInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [gaReady, setGaReady] = useState(false);
  const lastTracked = useRef<string | null>(null);

  // Plausible — cookieless, safe to load without consent.
  useEffect(() => {
    loadPlausible();
  }, []);

  // GA4 — uses cookies, so load only after cookie consent (re-checked on the
  // consent-change event the banner dispatches on Accept).
  useEffect(() => {
    if (!GA_ID) return;

    function load() {
      if (getConsent() !== "accepted") return;
      const w = window as unknown as Win;
      if (!document.getElementById("ga-js")) {
        const s = document.createElement("script");
        s.id = "ga-js";
        s.async = true;
        s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
        document.head.appendChild(s);
        w.dataLayer = w.dataLayer || [];
        // Must push the `arguments` object, not a spread array (Google requirement).
        const gtag: (...args: unknown[]) => void = function () {
          // eslint-disable-next-line prefer-rest-params
          w.dataLayer!.push(arguments);
        };
        w.gtag = gtag;
        gtag("js", new Date());
        gtag("config", GA_ID); // sends the initial page_view automatically
      }
      setGaReady(true);
    }

    load();
    window.addEventListener("ic-consent-change", load);
    return () => window.removeEventListener("ic-consent-change", load);
  }, []);

  // Track client-side route changes. The first run after GA is ready is the page
  // `config` already counted, so we record it as the baseline and skip it.
  useEffect(() => {
    if (!GA_ID || !gaReady) return;
    const w = window as unknown as Win;
    if (typeof w.gtag !== "function") return;

    const qs = searchParams?.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;

    if (lastTracked.current === null) {
      lastTracked.current = path; // baseline: counted by config's auto page_view
      return;
    }
    if (path === lastTracked.current) return;
    lastTracked.current = path;

    w.gtag("event", "page_view", {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [gaReady, pathname, searchParams]);

  return null;
}

export function AnalyticsScripts() {
  // useSearchParams() must sit inside a Suspense boundary — required by Next.js
  // and for the static export to keep prerendering the rest of each page.
  return (
    <Suspense fallback={null}>
      <AnalyticsInner />
    </Suspense>
  );
}
