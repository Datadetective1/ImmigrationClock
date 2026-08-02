"use client";

import { useState } from "react";
import Link from "next/link";

// =============================================================================
// NEWSLETTER SIGNUP — "Immigration Pulse"
//
// Correctness rule for this component: it must never tell someone they are
// subscribed unless a provider actually received their address. The previous
// version optimistically rendered "✓ You're on the list." with no provider
// configured, so every address typed into it was discarded. Fixed 2026-08-01;
// see docs/data-corrections.md.
//
// How it works now
// ----------------
// The form is a NATIVE HTML POST straight to the provider. That is deliberate:
// a fetch() to a cross-origin subscribe endpoint has to run in `no-cors` mode,
// which makes the response unreadable, so the page cannot tell success from
// failure and would have to guess. A native POST hands the browser to the
// provider, and the visitor sees the provider's real confirmation or error.
// No guessing, and no API key in client code.
//
// Configuration (all public, none secret):
//   NEXT_PUBLIC_BUTTONDOWN_USERNAME  — Buttondown newsletter username. Posts to
//                                      buttondown.com/api/emails/embed-subscribe/<username>.
//   NEXT_PUBLIC_NEWSLETTER_ENDPOINT  — full subscribe URL for any other provider.
//                                      Takes precedence over the Buttondown var.
//   NEXT_PUBLIC_NEWSLETTER_MODE      — "dev" disables submission entirely so local
//                                      and preview builds cannot add test
//                                      addresses to the live audience.
//
// With nothing configured the form does not render an email field at all. We ask
// for an address only when we can actually store it.
// =============================================================================

import { newsletterState, canSubscribe } from "@/lib/newsletter";

// Resolved once at module load. next.js inlines NEXT_PUBLIC_* at build time, so
// these must be referenced as full literal property accesses, not destructured.
const STATE = newsletterState({
  buttondownUsername: process.env.NEXT_PUBLIC_BUTTONDOWN_USERNAME,
  customEndpoint: process.env.NEXT_PUBLIC_NEWSLETTER_ENDPOINT,
  mode: process.env.NEXT_PUBLIC_NEWSLETTER_MODE,
});
const CAN_SUBSCRIBE = canSubscribe(STATE);
const ENDPOINT = STATE.kind === "open" ? STATE.endpoint : null;
const DEV_MODE = STATE.kind === "dev-disabled";

const CONSENT_TEXT =
  "Email me the weekly Immigration Pulse. I can unsubscribe from any email.";

/** Shared "we can't take signups yet" copy — honest, and never a fake success. */
function NotOpenNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`${compact ? "text-xs" : "text-sm"} leading-relaxed text-slate-400`}>
      {DEV_MODE ? (
        <>
          <strong className="text-slate-300">Signup disabled in this environment.</strong> This is a
          development or preview build, so the form is switched off to keep test addresses out of the
          live list.
        </>
      ) : (
        <>
          <strong className="text-slate-300">The Pulse isn&rsquo;t open for signups yet.</strong> We
          aren&rsquo;t collecting addresses until the newsletter provider is connected, so nothing is
          lost in the meantime. You can read the latest edition any time at{" "}
          <Link href="/pulse" className="link-accent">
            /pulse
          </Link>
          .
        </>
      )}
    </p>
  );
}

/**
 * Weekly "Immigration Pulse" email capture. `card` is the full panel; `inline`
 * is a slim banner-row variant used where ad slots would otherwise sit.
 */
export function PulseSignup({ variant = "card" }: { variant?: "card" | "inline" }) {
  const [consented, setConsented] = useState(false);

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-accent/15 bg-accent/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-300">
          <span aria-hidden>📬</span> <strong className="text-white">Immigration Pulse</strong> — the 5
          biggest changes each week.
        </div>
        {CAN_SUBSCRIBE ? (
          <Link
            href="/pulse#subscribe"
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-center text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft"
          >
            Subscribe
          </Link>
        ) : (
          <NotOpenNotice compact />
        )}
      </div>
    );
  }

  return (
    <section id="subscribe" className="panel relative overflow-hidden p-5 sm:p-6">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-accent/60 to-transparent" />
      <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr] sm:items-center">
        <div>
          <div className="eyebrow mb-1 text-accent">Newsletter</div>
          <h2 className="text-lg font-bold text-white sm:text-xl">Get the weekly Immigration Pulse</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Five things that changed in U.S. immigration, every week — sourced and labelled, no spin.{" "}
            <Link href="/pulse" className="link-accent">
              See this week&rsquo;s Pulse →
            </Link>
          </p>
        </div>
        <div>
          {CAN_SUBSCRIBE ? (
            <form
              action={ENDPOINT as string}
              method="post"
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col gap-2"
            >
              <label htmlFor="pulse-email" className="sr-only">
                Email address
              </label>
              <input
                id="pulse-email"
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="you@email.com"
                className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-accent/50 focus:outline-none"
              />
              <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-400">
                <input
                  type="checkbox"
                  name="consent"
                  required
                  checked={consented}
                  onChange={(e) => setConsented(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-white/20 bg-ink-950/60 accent-accent"
                />
                <span>{CONSENT_TEXT}</span>
              </label>
              <button
                type="submit"
                disabled={!consented}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                Subscribe
              </button>
              <p className="text-[11px] text-slate-500">
                Opens our email provider to confirm. One email a week. Unsubscribe from any email. See our{" "}
                <Link href="/privacy" className="link-accent">
                  privacy policy
                </Link>
                .
              </p>
            </form>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <NotOpenNotice />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
