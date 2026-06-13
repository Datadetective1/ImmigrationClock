"use client";

import { useEffect } from "react";
import { getConsent } from "./ConsentBanner";

/**
 * Loads the Google AdSense script only after the visitor has accepted cookies,
 * so no advertising cookies are set without consent. Does nothing until
 * NEXT_PUBLIC_ADSENSE_CLIENT_ID is configured.
 */
export function AdSenseScript() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  useEffect(() => {
    if (!client) return;

    function load() {
      if (getConsent() !== "accepted") return;
      if (document.getElementById("adsbygoogle-js")) return;
      const s = document.createElement("script");
      s.id = "adsbygoogle-js";
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
      document.head.appendChild(s);
    }

    load();
    window.addEventListener("ic-consent-change", load);
    return () => window.removeEventListener("ic-consent-change", load);
  }, [client]);

  return null;
}
