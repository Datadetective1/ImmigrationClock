"use client";

// =============================================================================
// "Manage billing" — one call, then Stripe's own portal.
//
// The customer id is NOT sent from here. The portal route reads it from the
// signed entitlement cookie, so this button cannot be pointed at anyone else's
// billing by editing a request.
// =============================================================================

import { useState } from "react";
import { trackBillingPortalOpen } from "@/lib/analytics";

export function ManageBillingButton() {
  const [state, setState] = useState<"idle" | "opening" | "failed">("idle");
  const [message, setMessage] = useState("");

  async function open() {
    if (state === "opening") return;
    setState("opening");
    trackBillingPortalOpen();
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const body = (await res.json()) as { url?: string; message?: string };
      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setState("failed");
      setMessage(body.message || "Could not open the billing page.");
    } catch {
      setState("failed");
      setMessage("Could not reach the billing service.");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={open}
        disabled={state === "opening"}
        className="rounded-lg border border-white/15 bg-white/[0.02] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-accent/50 hover:bg-accent/10 hover:text-white disabled:opacity-60"
      >
        {state === "opening" ? "Opening…" : "Manage billing"}
      </button>
      {state === "failed" ? (
        <p role="status" className="mt-2 text-xs text-slate-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}
