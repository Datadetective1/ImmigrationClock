// =============================================================================
// NEWSLETTER SIGNUP — "Immigration Pulse"
//
// A SERVER component. That is the whole point of the split: whether signups are
// open depends on RESEND_API_KEY, a server-only secret. Resolving the state here
// means the decision is made where the credential actually is, instead of being
// mirrored into a NEXT_PUBLIC_ flag
// that can drift out of sync with them and leave the form promising something
// the server cannot deliver.
//
// The interactive half lives in PulseSignupForm ("use client").
//
// CONFIGURATION IS READ AT BUILD TIME. These pages are statically generated, so
// adding the Resend variables to Vercel requires a redeploy before the form
// appears — the same way NEXT_PUBLIC_* has always behaved here.
//
// With nothing configured the panel renders no email field at all. We ask for an
// address only when we can actually store it.
// =============================================================================

import Link from "next/link";
import { newsletterState, canSubscribe } from "@/lib/newsletter";
import { PulseSignupForm } from "./PulseSignupForm";

function resolveState() {
  return newsletterState({
    // The API key is the whole requirement. Resend Audiences are deprecated and
    // the current Contacts API is account-level, so there is no audience id to
    // check for — requiring one would keep the form hidden forever.
    resendConfigured: Boolean(process.env.RESEND_API_KEY),
    buttondownUsername: process.env.NEXT_PUBLIC_BUTTONDOWN_USERNAME,
    customEndpoint: process.env.NEXT_PUBLIC_NEWSLETTER_ENDPOINT,
    mode: process.env.NEXT_PUBLIC_NEWSLETTER_MODE,
  });
}

/** Shared "we can't take signups yet" copy — honest, and never a fake success. */
function NotOpenNotice({ compact = false, devMode }: { compact?: boolean; devMode: boolean }) {
  return (
    <p className={`${compact ? "text-xs" : "text-sm"} leading-relaxed text-slate-400`}>
      {devMode ? (
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
  const state = resolveState();
  const open = canSubscribe(state);
  const devMode = state.kind === "dev-disabled";

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-accent/15 bg-accent/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-300">
          <span aria-hidden>📬</span> <strong className="text-white">Immigration Pulse</strong> — the 5
          biggest changes each week.
        </div>
        {open ? (
          <Link
            href="/pulse#subscribe"
            className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-center text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft"
          >
            Subscribe
          </Link>
        ) : (
          <NotOpenNotice compact devMode={devMode} />
        )}
      </div>
    );
  }

  // Padding trimmed p-5/sm:p-6 -> p-4/sm:p-5. Same panel, same trust messaging,
  // less vertical cost on the dashboard.
  return (
    <section id="subscribe" className="panel relative overflow-hidden p-4 sm:p-5">
      <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-accent/60 to-transparent" />
      <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr] sm:items-center">
        <div>
          <div className="eyebrow mb-1 text-accent">Newsletter</div>
          <h2 className="text-lg font-bold text-white sm:text-xl">Get the weekly Immigration Pulse</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
            Five things that changed in U.S. immigration, every week — sourced and labelled, no spin.
          </p>
          {/* What a subscriber is actually agreeing to. "Five things, weekly" is
              a pitch; this is the contract, and a reader deciding whether to
              hand over an address should not have to infer it. */}
          <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-400">
            <li className="flex gap-2">
              <span className="text-accent" aria-hidden>—</span>
              <span>One email a week. Nothing else, ever — no partner mail, no sponsor blasts.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent" aria-hidden>—</span>
              <span>
                Each item links to the government document it came from, so you can check it yourself.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent" aria-hidden>—</span>
              <span>
                Unsubscribe from any issue in one click. We never sell or share your address.
              </span>
            </li>
          </ul>
          <p className="mt-3 text-sm">
            <Link href="/pulse" className="link-accent">
              Read this week&rsquo;s edition before subscribing →
            </Link>
          </p>
        </div>
        <div>
          {open ? (
            <PulseSignupForm
              provider={state.provider}
              endpoint={state.provider === "external" ? state.endpoint : undefined}
            />
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <NotOpenNotice devMode={devMode} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
