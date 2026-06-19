"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getConsent } from "./ConsentBanner";

/**
 * Privacy-first analytics loader with accurate App Router pageview tracking.
 *
 *   • NEXT_PUBLIC_PLAUSIBLE_DOMAIN — Plausible (cookieless, GDPR-friendly). Loaded
 *     immediately; its script auto-tracks SPA navigations.
 *   • NEXT_PUBLIC_GA_ID — Google Analytics 4 (uses cookies). Loaded ONLY after the
 *     visitor accepts cookies. Automatic page_view is disabled (send_page_view:
 *     false) and we send a page_view manually on initial load and on every client
 *     route change — because Next.js navigations don't trigger a full page load,
 *     so gtag's one-time config would otherwise miss them.
 *
 * Once loaded, window.plausible / window.gtag exist, so the partner-click and
 * key-date events fired from partner-link.ts also record.
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

  // Plausible — cookieless, safe to load without consent.
  useEffect(() => {
    loadPlausible();
  }, []);

  // GA4 — uses cookies, so load only after cookie consent (and re-check on the
  // consent-change event). Disable the automatic page_view; we send them manually.
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
        w.gtag = function (...args: unknown[]) {
          w.dataLayer!.push(args);
        };
        w.gtag("js", new Date());
        w.gtag("config", GA_ID, { send_page_view: false });
      }
      setGaReady(true);
    }

    load();
    window.addEventListener("ic-consent-change", load);
    return () => window.removeEventListener("ic-consent-change", load);
  }, []);

  // Send a page_view on first load and on every route change, once GA is ready.
  // Depends on pathname + searchParams so App Router client navigations are
  // tracked; gaReady ensures the initial view fires even if consent comes later.
  useEffect(() => {
    if (!GA_ID || !gaReady) return;
    const w = window as unknown as Win;
    if (!w.gtag) return;
    const qs = searchParams?.toString();
    const path = qs ? `${pathname}?${qs}` : pathname;
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
