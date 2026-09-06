"use client";

// =============================================================================
// "Email me a sign-in link" — how a subscriber gets back in
//
// Two jobs. It requests a link, and it consumes one when the reader arrives
// with ?signin=… in the URL.
//
// The answer to a request is deliberately the same whether or not the address
// is a subscriber, because the endpoint answers that way: on an immigration
// site, a form that reveals which addresses are known is a way to ask about a
// person. The component must not undo that by rendering a different message.
//
// The token is stripped from the address bar before anything else happens, so
// it is not left in history or leaked in a referrer.
// =============================================================================

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type State = "idle" | "sending" | "sent" | "verifying" | "failed";

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  // Arriving from a sign-in link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("signin");
    if (!token) return;

    window.history.replaceState({}, "", window.location.pathname);
    setState("verifying");

    (async () => {
      try {
        const res = await fetch("/api/billing/signin/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = (await res.json()) as { plan?: string; message?: string };
        if (res.ok && body.plan) {
          // A TERMINAL STATE, NOT JUST A REFRESH. Leaving the component on
          // "Signing you in…" made the page look hung, and the natural response
          // — reloading — used to destroy the identity that had just been
          // proved. The reload is harmless now, but a screen that never
          // finishes is still the wrong thing to show someone.
          setState("idle");
          router.refresh();
          return;
        }
        setState("failed");
        setMessage(body.message || "That sign-in link did not work.");
      } catch {
        setState("failed");
        setMessage("Could not reach the sign-in service.");
      }
    })();
  }, [router]);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/billing/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string };
      // The same words on success and on "we have never heard of you", because
      // the endpoint returns the same words. Only a malformed address differs.
      setState(res.ok ? "sent" : "failed");
      setMessage(body.message || (res.ok ? "Check your email." : "Something went wrong."));
    } catch {
      setState("failed");
      setMessage("Could not reach the sign-in service.");
    }
  }

  if (state === "verifying") {
    return (
      <p role="status" className="text-sm text-slate-300">
        Signing you in…
      </p>
    );
  }

  return (
    <div>
      <form onSubmit={request} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="signin-email" className="sr-only">
          Your subscription email
        </label>
        <input
          id="signin-email"
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
      {message ? (
        <p role="status" className="mt-2 text-xs text-slate-400">
          {message}
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          Use the email address your subscription is billed to. The link works once and expires in 15
          minutes.
        </p>
      )}
    </div>
  );
}
