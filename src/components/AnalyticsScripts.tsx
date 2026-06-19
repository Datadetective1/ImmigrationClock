"use client";

import { useEffect } from "react";
import { getConsent } from "./ConsentBanner";

/**
 * Privacy-first analytics loader. Both providers are optional and off until you
 * set their env var:
 *   • NEXT_PUBLIC_PLAUSIBLE_DOMAIN — Plausible (cookieless, GDPR-friendly). Loaded
 *     immediately because it sets no cookies and collects no personal data.
 *   • NEXT_PUBLIC_GA_ID — Google Analytics 4 (uses cookies). Loaded ONLY after the
 *     visitor accepts cookies, mirroring AdSenseScript.
 *
 * Once loaded, window.plausible / window.gtag exist, so the partner-click and
 * key-date events fired from partner-link.ts start recording real data.
 */
export function AnalyticsScripts() {
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  // Plausible — cookieless, safe to load without consent.
  useEffect(() => {
    if (!plausibleDomain) return;
    if (document.getElementById("plausible-js")) return;
    const s = document.createElement("script");
    s.id = "plausible-js";
    s.defer = true;
    s.setAttribute("data-domain", plausibleDomain);
    s.src = "https://plausible.io/js/script.tagged-events.js";
    document.head.appendChild(s);
    // Lightweight queue so plausible() calls before load are not lost.
    const w = window as unknown as { plausible?: (...a: unknown[]) => void; __plq?: unknown[] };
    w.plausible =
      w.plausible ||
      function (...args: unknown[]) {
        (w.__plq = w.__plq || []).push(args);
      };
  }, [plausibleDomain]);

  // GA4 — uses cookies, so load only after cookie consent (and re-check on change).
  useEffect(() => {
    if (!gaId) return;

    function load() {
      if (getConsent() !== "accepted") return;
      if (document.getElementById("ga-js")) return;
      const s = document.createElement("script");
      s.id = "ga-js";
      s.async = true;
      s.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
      document.head.appendChild(s);

      const w = window as unknown as { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void };
      w.dataLayer = w.dataLayer || [];
      w.gtag = function (...args: unknown[]) {
        w.dataLayer!.push(args);
      };
      w.gtag("js", new Date());
      w.gtag("config", gaId);
    }

    load();
    window.addEventListener("ic-consent-change", load);
    return () => window.removeEventListener("ic-consent-change", load);
  }, [gaId]);

  return null;
}
