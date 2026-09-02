"use client";

import { useState } from "react";
import { trackShare } from "@/lib/analytics";

/** Share via Web Share API where available, else copy link to clipboard. */
export function ShareButton({
  title,
  text,
  path,
  compact = false,
  surface = "page",
  story,
}: {
  title: string;
  text?: string;
  path?: string;
  compact?: boolean;
  /** Which kind of thing is being shared: "change", "explainer", "signal", "page". */
  surface?: string;
  /** The record's public key ("change:abc123") when the button belongs to one. */
  story?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    // Recorded before the share sheet opens, because a cancelled sheet is still
    // a reader who wanted to share this — and the outcome cannot be observed.
    trackShare(surface, story);
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}${path ?? window.location.pathname}`
        : path ?? "";
    const shareData = { title, text: text ?? title, url };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      /* user cancelled — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  return (
    <button
      type="button"
      onClick={onShare}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 font-medium text-slate-200 transition-colors hover:border-accent/40 hover:text-accent-soft ${
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"
      }`}
      aria-label="Share"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
      </svg>
      {copied ? "Link copied" : "Share"}
    </button>
  );
}
