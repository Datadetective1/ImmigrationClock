"use client";

// =============================================================================
// WHETHER PRO CAN BE BOUGHT — decided when the reader asks, not when the site
// was built.
//
// THE DEFECT THIS EXISTS TO FIX
// -----------------------------
// /pricing is statically prerendered — it is a marketing and SEO page and must
// stay that way. But it called `billingStatus().checkoutReady` directly, and on
// a static page that runs ONCE, at build time. The answer was then frozen into
// the HTML that every visitor receives.
//
// So the Subscribe button's existence was a property of the last deploy rather
// than of the current configuration:
//
//   • Set BILLING_ENABLED and the Stripe secrets in production, and the
//     pricing page still says "Not for sale yet" — silently, with no error
//     anywhere — until somebody happens to redeploy. The product cannot be
//     bought and nothing says so.
//   • The documented rollout reaches exactly that state by design: it creates
//     the webhook endpoint AFTER the first deploy, so the first build has no
//     STRIPE_WEBHOOK_SECRET and therefore no buy button.
//   • The test-mode banner was frozen the same way, so a deployment could show
//     "Test mode. No real card is charged" while running live keys, or hide it
//     while running test ones. That banner exists precisely so a live-looking
//     deployment cannot quietly be a test one, and a build-time answer cannot
//     keep that promise.
//
// HOW IT DECIDES NOW
// ------------------
// `GET /api/billing/checkout` is dynamic, already exists for exactly this
// question, and deliberately returns only `{checkoutReady, webhookReady,
// testMode}` — no variable names, no `missing` list, nothing an unauthenticated
// caller should not see. This asks it once on mount.
//
// The server's build-time answer is still used for the FIRST paint, so a
// correctly-built deployment renders the right thing immediately and the probe
// merely confirms it. Only a deployment whose configuration has changed since
// its build sees anything move.
//
// A FAILED PROBE CHANGES NOTHING. Offline, a 500, a blocked request: the panel
// keeps whatever the server said. Hiding a working Subscribe button because one
// request failed would be the same silent-unbuyable failure in a new costume,
// and clicking through still gets an honest answer from the checkout route,
// which is the only authority either way.
// =============================================================================

import { useEffect, useState } from "react";

interface Props {
  /** The build-time answer. Used for the first paint, then confirmed. */
  initialReady: boolean;
  initialTestMode: boolean;
  /** The Subscribe buttons, composed by the server component. */
  forSale: React.ReactNode;
  /** The "Not for sale yet" explanation, composed by the server component. */
  notForSale: React.ReactNode;
}

export function PurchasePanel({ initialReady, initialTestMode, forSale, notForSale }: Props) {
  const [ready, setReady] = useState(initialReady);
  const [testMode, setTestMode] = useState(initialTestMode);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/billing/checkout", { cache: "no-store" });
        // 503 is a legitimate answer here, not a failure: it is how the route
        // reports that billing is switched off, and the body still carries the
        // flags. Only an unreadable response leaves the server's answer alone.
        const body = (await res.json()) as { checkoutReady?: unknown; testMode?: unknown };
        if (cancelled) return;
        if (typeof body.checkoutReady === "boolean") setReady(body.checkoutReady);
        if (typeof body.testMode === "boolean") setTestMode(body.testMode);
      } catch {
        // Keep the server's answer. See the header.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return <>{notForSale}</>;

  return (
    <div className="mt-6 space-y-3">
      {forSale}
      {testMode ? (
        <p className="rounded-md border border-status-amber/30 bg-status-amber/[0.06] px-3 py-2 text-center text-[11px] text-status-amber">
          Test mode. No real card is charged, and any subscription created here is not a real one.
        </p>
      ) : null}
    </div>
  );
}
