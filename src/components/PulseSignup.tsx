"use client";

import { useState } from "react";
import Link from "next/link";

// Set NEXT_PUBLIC_NEWSLETTER_ENDPOINT to your provider's subscribe URL (Buttondown,
// Mailchimp, ConvertKit, Formspree, …). Until then the form shows a "coming soon"
// state — we never pretend to capture an address we can't store.
const ENDPOINT = process.env.NEXT_PUBLIC_NEWSLETTER_ENDPOINT;
const CONFIGURED = Boolean(ENDPOINT);

type State = "idle" | "loading" | "done" | "error";

/**
 * Weekly "Immigration Pulse" email capture. Replaces the ad placeholders until
 * real ads run, and builds the audience for the newsletter. `card` is the full
 * panel; `inline` is a slim banner-row variant.
 */
export function PulseSignup({ variant = "card" }: { variant?: "card" | "inline" }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/.+@.+\..+/.test(email)) {
      setState("error");
      return;
    }
    if (!CONFIGURED) {
      setState("done"); // optimistic — provider not wired yet (see env note)
      return;
    }
    setState("loading");
    try {
      await fetch(ENDPOINT as string, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email }).toString(),
      });
      setState("done");
    } catch {
      setState("error");
    }
  }

  const done = state === "done";
  const note = CONFIGURED ? "No spam. Unsubscribe anytime." : "Email signup launching soon.";

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-accent/15 bg-accent/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-300">
          <span aria-hidden>📬</span> <strong className="text-white">Immigration Pulse</strong> — the 5 biggest
          changes each week.
        </div>
        {done ? (
          <span className="text-sm font-medium text-status-green">✓ You&rsquo;re on the list.</span>
        ) : (
          <form onSubmit={submit} className="flex gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              aria-label="Email address"
              className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:border-accent/50 focus:outline-none sm:w-56"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft"
            >
              {state === "loading" ? "…" : "Subscribe"}
            </button>
          </form>
        )}
      </div>
    );
  }

  return (
    <section className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-accent/60 to-transparent" />
      <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr] sm:items-center">
        <div>
          <div className="eyebrow mb-1 text-accent">Newsletter</div>
          <h2 className="text-lg font-bold text-white sm:text-xl">Get the weekly Immigration Pulse</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Five things that changed in U.S. immigration, every week — sourced and labelled, no spin.{" "}
            <Link href="/pulse" className="link-accent">See this week&rsquo;s Pulse →</Link>
          </p>
        </div>
        <div>
          {done ? (
            <div className="rounded-xl border border-status-green/25 bg-status-green/10 p-4 text-sm text-status-green">
              ✓ {CONFIGURED ? "You're subscribed — see you next week." : "Thanks! We'll email you when the Pulse launches."}
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                aria-label="Email address"
                className={`w-full rounded-lg border bg-ink-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none ${
                  state === "error" ? "border-status-red/60" : "border-white/10 focus:border-accent/50"
                }`}
              />
              <button
                type="submit"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft"
              >
                {state === "loading" ? "Subscribing…" : "Subscribe"}
              </button>
              <p className="text-[11px] text-slate-500">
                {state === "error" ? "Please enter a valid email." : note}
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
