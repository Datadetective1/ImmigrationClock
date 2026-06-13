"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "ic-ad-consent"; // "accepted" | "declined"

export function getConsent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Lightweight cookie/consent banner. Until the visitor accepts, the AdSense
 * script is not loaded (see AdSenseScript), so no advertising cookies are set.
 *
 * NOTE: For personalized ads to EEA/UK/CH visitors, AdSense policy requires a
 * Google-certified CMP. Enable it free in AdSense → "Privacy & messaging"; this
 * banner is the baseline cookie notice + load gate for other regions.
 */
export function ConsentBanner() {
  const [mounted, setMounted] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setChoice(getConsent());
    function reopen() {
      setChoice(null);
    }
    window.addEventListener("ic-open-consent", reopen);
    return () => window.removeEventListener("ic-open-consent", reopen);
  }, []);

  function decide(v: "accepted" | "declined") {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* storage blocked — proceed without persisting */
    }
    setChoice(v);
    window.dispatchEvent(new CustomEvent("ic-consent-change", { detail: v }));
  }

  if (!mounted || choice) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="container-page">
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-ink-850/95 p-4 shadow-glow backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-slate-300 sm:max-w-2xl">
            We use cookies, including from Google AdSense, to show ads and keep the site running. You can
            accept these, or decline to browse without advertising cookies. See our{" "}
            <Link href="/privacy" className="text-accent hover:text-accent-soft">
              Privacy Policy
            </Link>
            .
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => decide("declined")}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10"
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => decide("accepted")}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-ink-950 hover:bg-accent-soft"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Footer control to re-open the consent choice. */
export function CookieSettingsButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("ic-open-consent"))}
      className={className}
    >
      Cookie settings
    </button>
  );
}
