"use client";

// =============================================================================
// THE UPGRADE BUTTON — the only thing on the site that starts a payment
//
// It asks /api/billing/checkout for a Stripe Checkout URL and navigates there.
// It does not load Stripe.js, so the site's Content-Security-Policy needs no
// new script source, and no card field ever exists on this origin.
//
// WHEN BILLING IS OFF, IT SAYS SO RATHER THAN FAILING. The route answers 503
// with what is missing; this renders that as a plain sentence. A button that
// spins forever because a secret is absent is how a broken checkout ships
// unnoticed.
// =============================================================================

import { useState } from "react";
import { trackCheckoutStarted } from "@/lib/analytics";
import type { Interval } from "@/lib/billing/plans";

interface Props {
  interval: Interval;
  /** Which surface this button sits on, for the funnel. Never a page a person typed. */
  placement: string;
  label?: string;
  className?: string;
}

export function UpgradeButton({ interval, placement, label = "Upgrade to Pro", className = "" }: Props) {
  const [state, setState] = useState<"idle" | "starting" | "unavailable">("idle");
  const [message, setMessage] = useState("");

  async function start() {
    if (state === "starting") return;
    setState("starting");
    setMessage("");
    // Fired before the redirect, so a drop-off between the click and Stripe is
    // visible rather than invisible.
    trackCheckoutStarted(interval, placement);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const body = (await res.json()) as { url?: string; message?: string };

      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }
      setState("unavailable");
      setMessage(body.message || "Checkout is not available right now.");
    } catch {
      setState("unavailable");
      setMessage("Could not reach the checkout service. Please try again.");
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={start}
        disabled={state === "starting"}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft disabled:opacity-60"
      >
        {state === "starting" ? "Opening checkout…" : label}
      </button>
      {message ? (
        <p role="status" className="mt-2 text-xs text-slate-400">
          {message}
        </p>
      ) : null}
    </div>
  );
}
