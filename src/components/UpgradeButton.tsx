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
  const [state, setState] = useState<"idle" | "starting" | "unavailable" | "verify" | "sending" | "sent">("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");

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
      const body = (await res.json()) as { url?: string; message?: string; error?: string };

      if (res.ok && body.url) {
        window.location.assign(body.url);
        return;
      }

      // IDENTITY BEFORE PAYMENT — AND THE STEP HAS TO BE HERE.
      //
      // Checkout refuses without a verified address, because taking the buyer's
      // word for it at Stripe is what let $19 seize another subscriber's
      // account. But the only place to request a link was /account, so a first
      // -time buyer clicking Subscribe hit a 401 and a sentence telling them to
      // confirm an address with nothing on the page to confirm it with. That is
      // a dead end for every new customer, which is worse than the defect the
      // requirement fixes. The step is offered right here instead.
      if (res.status === 401 && body.error === "identity_required") {
        setState("verify");
        setMessage(body.message || "Confirm your email address before subscribing.");
        return;
      }

      setState("unavailable");
      setMessage(body.message || "Checkout is not available right now.");
    } catch {
      setState("unavailable");
      setMessage("Could not reach the checkout service. Please try again.");
    }
  }

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/billing/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as { message?: string };
      setState(res.ok ? "sent" : "verify");
      setMessage(body.message || (res.ok ? "Check your inbox." : "Something went wrong."));
    } catch {
      setState("verify");
      setMessage("Could not reach the sign-in service.");
    }
  }

  if (state === "verify" || state === "sending" || state === "sent") {
    return (
      <div className={className}>
        <p className="text-xs leading-relaxed text-slate-300">{message}</p>
        {state === "sent" ? (
          <p className="mt-2 text-xs text-slate-500">
            Open the link, then come back and subscribe. It works once and expires in 15 minutes.
          </p>
        ) : (
          <form onSubmit={requestLink} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <label htmlFor={`upgrade-email-${interval}`} className="sr-only">
              Your email address
            </label>
            <input
              id={`upgrade-email-${interval}`}
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/40"
            />
            <button
              type="submit"
              disabled={state === "sending"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Email me a link"}
            </button>
          </form>
        )}
      </div>
    );
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
