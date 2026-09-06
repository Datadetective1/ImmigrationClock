"use client";

// =============================================================================
// The last step of checkout, and the only place a subscription becomes real to
// this browser.
//
// Stripe redirects to /account?session_id=cs_…. That id is in the URL bar, so
// it proves nothing on its own — this posts it to /api/billing/activate, which
// asks Stripe whether the session was actually paid before minting anything.
//
// The id is then removed from the address bar with replaceState, so it is not
// left in history, copied into a shared link, or sent to anyone as a referrer.
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { trackCheckoutCompleted, trackSubscriptionActive } from "@/lib/analytics";

type State = "idle" | "activating" | "done" | "failed";

export function AccountActivation() {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (!sessionId) {
      // NO CHECKOUT TO CONFIRM — SO RENEW THE CLAIM INSTEAD.
      //
      // The entitlement cookie is capped at MAX_TTL_DAYS so a cancellation
      // cannot keep working. Nothing renewed it, so an annual subscriber was
      // signed out on day 31 of a year they had paid for. Visiting the account
      // page re-reads the store and re-issues the claim if the subscription is
      // still live — and clears it if it is not.
      if (!/(?:^|;\s*)ic_session=1(?:;|$)/.test(document.cookie || "")) return;
      (async () => {
        try {
          const res = await fetch("/api/billing/session/refresh", { method: "POST" });
          // 402 means the subscription ended and the cookie was just cleared;
          // re-render so the page stops claiming Pro.
          if (res.status === 402) router.refresh();
        } catch {
          // Offline or a blip. The existing claim is untouched.
        }
      })();
      return;
    }

    // Clear it from the address bar immediately, before any await.
    window.history.replaceState({}, "", window.location.pathname);
    setState("activating");
    trackCheckoutCompleted();

    (async () => {
      try {
        const res = await fetch("/api/billing/activate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const body = (await res.json()) as { plan?: string; message?: string };
        if (res.ok && body.plan) {
          trackSubscriptionActive(body.plan);
          setState("done");
          // The page reads the cookie on the server, so it has to be re-fetched
          // to show the subscription that was just granted.
          router.refresh();
          return;
        }
        setState("failed");
        setMessage(body.message || "We could not confirm that checkout.");
      } catch {
        setState("failed");
        setMessage("We could not reach the billing service.");
      }
    })();
  }, [router]);

  if (state === "idle") return null;

  return (
    <div
      role="status"
      className={`panel panel-pad ${state === "failed" ? "border-status-red/30" : "border-accent/25"}`}
    >
      {state === "activating" ? <p className="text-sm text-slate-300">Confirming your subscription…</p> : null}
      {state === "done" ? (
        <p className="text-sm text-white">
          <strong>You&rsquo;re subscribed.</strong> Thank you — your Pro access is active on this browser.
        </p>
      ) : null}
      {state === "failed" ? (
        <p className="text-sm text-slate-300">
          {message} If you were charged, nothing is lost — contact us and we will sort it out.
        </p>
      ) : null}
    </div>
  );
}
