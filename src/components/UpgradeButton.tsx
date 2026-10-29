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

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { trackCheckoutStarted } from "@/lib/analytics";
import { resumeIntervalFrom, type Interval } from "@/lib/billing/plans";
import { CONSENT_HINT, CONSENT_TEXT } from "@/lib/billing/consent";

interface Props {
  interval: Interval;
  /** Which surface this button sits on, for the funnel. Never a page a person typed. */
  placement: string;
  label?: string;
  className?: string;
  /** A partner offer id. Sent with checkout and with the sign-in request. */
  offer?: string;
}

// ONE QUESTION, HOWEVER MANY BUTTONS. A page that offers monthly and yearly side
// by side asked the newsletter question twice, once above each button, which
// reads as a glitch and lets the two answers disagree. Wrapping the buttons in
// a NewsletterOptInGroup asks it once; each button inside sends that answer. A
// button on its own still asks for itself.
const OptInContext = createContext<boolean | null>(null);

function NewsletterCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="mb-3 flex cursor-pointer items-start gap-2.5 text-left">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/[0.03] accent-accent"
      />
      <span className="text-xs leading-relaxed text-slate-400">
        {CONSENT_TEXT}
        <span className="mt-0.5 block text-[11px] text-slate-500">{CONSENT_HINT}</span>
      </span>
    </label>
  );
}

export function NewsletterOptInGroup({ children }: { children: React.ReactNode }) {
  // UNCHECKED BY DEFAULT, ALWAYS, here as in a lone button.
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  return (
    <OptInContext.Provider value={newsletterOptIn}>
      <div className="space-y-3">
        <NewsletterCheckbox id="newsletter-optin" checked={newsletterOptIn} onChange={setNewsletterOptIn} />
        {children}
      </div>
    </OptInContext.Provider>
  );
}

export function UpgradeButton({ interval, placement, label = "Upgrade to Pro", className = "", offer }: Props) {
  const [state, setState] = useState<
    "idle" | "starting" | "unavailable" | "verify" | "sending" | "sent" | "subscribed"
  >("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  // UNCHECKED BY DEFAULT, ALWAYS. A pre-ticked marketing box is not consent,
  // and the purchase must complete identically whether or not it is touched.
  const [ownOptIn, setOwnOptIn] = useState(false);
  const group = useContext(OptInContext);
  const newsletterOptIn = group ?? ownOptIn;
  const root = useRef<HTMLDivElement>(null);

  // BACK FROM THE INBOX. The sign-in link a Subscribe button asked for returns
  // here with ?resume=<this plan>. Say so and put the button in view — but do
  // not press it for them: the opt-in above is theirs to answer, and Stripe is
  // one deliberate click away.
  useEffect(() => {
    if (resumeIntervalFrom(new URLSearchParams(window.location.search).get("resume")) !== interval) return;
    setMessage("Your email is confirmed. Continue to secure checkout when you are ready.");
    root.current?.scrollIntoView({ block: "center" });
  }, [interval]);

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
        body: JSON.stringify({ interval, newsletterOptIn, ...(offer ? { offer } : {}) }),
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

      // ALREADY PAYING. The route refuses the duplicate, which is correct, but
      // "Checkout is not available right now" is the wrong sentence for
      // somebody whose subscription is working — it reads as a fault. They
      // want the one link that answers what they actually asked.
      if (res.status === 409 && body.error === "already_subscribed") {
        setState("subscribed");
        setMessage(body.message || "You already have an active subscription.");
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
        // The plan rides on the link, so opening it brings them back to this
        // button rather than to an account page that has forgotten it.
        body: JSON.stringify({ email, resume: interval, ...(offer ? { offer } : {}) }),
      });
      const body = (await res.json()) as { message?: string };
      setState(res.ok ? "sent" : "verify");
      setMessage(body.message || (res.ok ? "Check your inbox." : "Something went wrong."));
    } catch {
      setState("verify");
      setMessage("Could not reach the sign-in service.");
    }
  }

  if (state === "subscribed") {
    return (
      <div className={className}>
        <p role="status" className="text-xs leading-relaxed text-slate-300">
          {message}
        </p>
        <a
          href="/account"
          className="mt-2 inline-block rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-slate-200 transition-colors hover:border-accent/50 hover:text-accent-soft"
        >
          Go to your account
        </a>
      </div>
    );
  }

  if (state === "verify" || state === "sending" || state === "sent") {
    return (
      <div className={className}>
        <p className="text-xs leading-relaxed text-slate-300">{message}</p>
        {state === "sent" ? (
          <p className="mt-2 text-xs text-slate-500">
            Open the link and it brings you straight back here to finish. It works once and expires
            in 15 minutes.
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
    <div ref={root} className={className}>
      {/* BEFORE CHECKOUT, NOT AFTER. The question has to be asked while the
          person is still deciding — asking once money has moved makes it look
          like part of what they bought. Nothing about entitlement reads this
          value, and checkout succeeds with it untouched. */}
      {group === null ? (
        <NewsletterCheckbox id={`newsletter-optin-${interval}`} checked={ownOptIn} onChange={setOwnOptIn} />
      ) : null}

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
