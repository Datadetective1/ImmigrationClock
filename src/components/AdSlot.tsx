"use client";

import { useEffect } from "react";

type AdFormat = "top-banner" | "sidebar" | "in-content" | "bottom-banner";

const FORMAT_META: Record<AdFormat, { className: string; label: string; slotKey: string }> = {
  "top-banner": {
    className: "min-h-[90px] w-full",
    label: "Advertisement",
    slotKey: "NEXT_PUBLIC_ADSENSE_SLOT_TOP",
  },
  sidebar: {
    className: "min-h-[600px] w-full",
    label: "Advertisement",
    slotKey: "NEXT_PUBLIC_ADSENSE_SLOT_SIDEBAR",
  },
  "in-content": {
    className: "min-h-[250px] w-full",
    label: "Advertisement",
    slotKey: "NEXT_PUBLIC_ADSENSE_SLOT_INCONTENT",
  },
  "bottom-banner": {
    className: "min-h-[90px] w-full",
    label: "Advertisement",
    slotKey: "NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM",
  },
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * Google AdSense slot. Renders a labelled placeholder until
 * NEXT_PUBLIC_ADSENSE_CLIENT_ID is set, then injects a real <ins> unit.
 */
export function AdSlot({
  format,
  slot,
  className = "",
}: {
  format: AdFormat;
  slot?: string;
  className?: string;
}) {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
  const meta = FORMAT_META[format];
  const adSlot = slot ?? "0000000000";

  useEffect(() => {
    if (!client) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* AdSense not ready yet — ignore */
    }
  }, [client]);

  if (!client) {
    return (
      <div
        className={`flex ${meta.className} ${className} items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-[11px] uppercase tracking-widest text-slate-600`}
        aria-hidden
      >
        Ad space · {format}
      </div>
    );
  }

  return (
    <div className={`${className}`}>
      <span className="mb-1 block text-center text-[10px] uppercase tracking-widest text-slate-600">
        {meta.label}
      </span>
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
