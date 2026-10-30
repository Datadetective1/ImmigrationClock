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
//
// ONE EMAIL BOX, TOO. Pressing one plan's button with no verified address
// turns that button into an email form, and the other button stayed on screen
// below it. Pressing that one as well put a second, identical email form under
// the first, so the page asked for the address twice. Inside a group, once one
// plan is asking for an email the other button steps aside, and the form
// offers a way back to choose the other plan instead.
interface PlanGroup {
  optIn: boolean;
  /** The plan whose button is asking for an email, if any. */
  picked: Interval | null;
  pick: (interval: Interval | null) => void;
}
export const PlanGroupContext = createContext<PlanGroup | null>(null);

const PLAN_NAME: Record<Interval, string> = { monthly: "monthly", annual: "yearly" };

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

// THE OPT-IN, HELD FOR THE TRIP THROUGH THE INBOX.
//
// Kept in this browser only, for one plan, for as long as a sign-in link lives.
// A link opened in a different browser finds nothing here and continues with
// the box unticked, which is the safe reading of an answer we cannot see.
const OPT_IN_KEY = "ic_checkout_optin";
const OPT_IN_TTL_MS = 30 * 60 * 1000;

function saveOptIn(interval: Interval, optIn: boolean): void {
  try {
    window.localStorage.setItem(OPT_IN_KEY, JSON.stringify({ interval, optIn, at: Date.now() }));
  } catch {
    // Storage blocked: the resumed checkout simply records no consent.
  }
}

/** Read once and cleared, so an old answer is never reused for a later purchase. */
export function takeSavedOptIn(interval: Interval): boolean {
  try {
    const raw = window.localStorage.getItem(OPT_IN_KEY);
    window.localStorage.removeItem(OPT_IN_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as { interval?: unknown; optIn?: unknown; at?: unknown };
    const fresh = typeof saved.at === "number" && Date.now() - saved.at < OPT_IN_TTL_MS;
    return fresh && saved.interval === interval && saved.optIn === true;
  } catch {
    return false;
  }
}

export function NewsletterOptInGroup({ children }: { children: React.ReactNode }) {
  // UNCHECKED BY DEFAULT, ALWAYS, here as in a lone button.
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [picked, setPicked] = useState<Interval | null>(null);
  return (
    <PlanGroupContext.Provider value={{ optIn: newsletterOptIn, picked, pick: setPicked }}>
      <div className="space-y-3">
        <NewsletterCheckbox id="newsletter-optin" checked={newsletterOptIn} onChange={setNewsletterOptIn} />
        {children}
      </div>
    </PlanGroupContext.Provider>
  );
}

export function UpgradeButton({ interval, placement, label = "Upgrade to Pro", className = "", offer }: Props) {
  const [state, setState] = useState<
    "idle" | "starting" | "unavailable" | "verify" | "sending" | "sent" | "subscribed"
  >("idle");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  // When the next link may be asked for. The sign-in route allows one a minute.
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [resendBusy, setResendBusy] = useState(false);
  useEffect(() => {
    if (state !== "sent" || now >= resendAt) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [state, now, resendAt]);
  // UNCHECKED BY DEFAULT, ALWAYS. A pre-ticked marketing box is not consent,
  // and the purchase must complete identically whether or not it is touched.
  const [ownOptIn, setOwnOptIn] = useState(false);
  const group = useContext(PlanGroupContext);
  const newsletterOptIn = group ? group.optIn : ownOptIn;
  const root = useRef<HTMLDivElement>(null);

  // BACK FROM THE INBOX, STRAIGHT ON TO STRIPE. The sign-in link a Subscribe
  // button asked for returns here with ?resume=<this plan>. The buyer already
  // pressed Subscribe and already answered the opt-in before the detour, so
  // making them find the button and press it a second time was a step that
  // decided nothing. Checkout continues on its own with the answer they gave.
  // Stripe is still where the card is entered and the payment confirmed.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    if (resumeIntervalFrom(new URLSearchParams(window.location.search).get("resume")) !== interval) return;
    resumed.current = true;
    root.current?.scrollIntoView({ block: "center" });
    void start(takeSavedOptIn(interval), "Email confirmed. Opening secure checkout…");
    // start() is stable enough for a one-shot resume; re-running on its
    // identity would be the double-start this ref exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval]);

  async function start(optIn: boolean = newsletterOptIn, note = "") {
    if (state === "starting") return;
    setState("starting");
    setMessage(note);
    // Fired before the redirect, so a drop-off between the click and Stripe is
    // visible rather than invisible.
    trackCheckoutStarted(interval, placement);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval, newsletterOptIn: optIn, ...(offer ? { offer } : {}) }),
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
        setMessage(
          group
            ? `Enter your email for the ${PLAN_NAME[interval]} plan. We'll send a link that takes you straight to checkout.`
            : "Enter your email. We'll send a link that takes you straight to checkout."
        );
        group?.pick(interval);
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

  async function requestLink(e?: React.FormEvent) {
    e?.preventDefault();
    if (state === "sending" || resendBusy) return;
    const resending = state === "sent";
    if (resending) setResendBusy(true);
    else setState("sending");
    try {
      const res = await fetch("/api/billing/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The plan rides on the link, so opening it brings them back to this
        // button rather than to an account page that has forgotten it.
        body: JSON.stringify({ email, resume: interval, ...(offer ? { offer } : {}) }),
      });
      // The opt-in answer waits in this browser for the return trip, so the
      // checkout that continues on its own carries what they chose here.
      saveOptIn(interval, newsletterOptIn);
      const body = (await res.json()) as { message?: string };
      // ONE STATE AFTER A SEND, NEVER TWO. A link already on its way and a
      // "too many attempts" refusal shown together read as a failure, so a
      // buyer who already has a link only ever sees that it was sent.
      if (res.ok || (resending && res.status === 429)) {
        setState("sent");
        setMessage("");
        setResendAt(Date.now() + 60_000);
        setNow(Date.now());
        return;
      }
      setState("verify");
      setMessage(body.message || "Something went wrong.");
    } catch {
      setState(resending ? "sent" : "verify");
      setMessage("Could not reach the sign-in service. Please try again.");
    } finally {
      setResendBusy(false);
    }
  }

  function choosePlanAgain() {
    setState("idle");
    setMessage("");
    group?.pick(null);
  }

  // Another plan in this group is already asking for the email.
  if (group && group.picked !== null && group.picked !== interval) return null;

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
        {state === "sent" ? (
          <div role="status">
            <p className="text-sm leading-relaxed text-slate-200">
              We emailed a link to <span className="font-semibold text-white">{email}</span>. Open it on this device to
              continue to checkout.
            </p>
            <p className="mt-1 text-xs text-slate-500">It works once and expires in 15 minutes.</p>
            {message ? <p className="mt-1 text-xs text-slate-400">{message}</p> : null}
            <button
              type="button"
              onClick={() => void requestLink()}
              disabled={resendBusy || now < resendAt}
              className="mt-2 text-xs text-slate-400 underline-offset-2 hover:text-accent-soft hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
            >
              {resendBusy
                ? "Sending…"
                : now < resendAt
                  ? `Send it again in ${Math.ceil((resendAt - now) / 1000)}s`
                  : "Send it again"}
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs leading-relaxed text-slate-300">{message}</p>
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
          </>
        )}
        {group && state !== "sending" ? (
          <button
            type="button"
            onClick={choosePlanAgain}
            className="mt-2 text-xs text-slate-400 underline-offset-2 hover:text-accent-soft hover:underline"
          >
            Choose a different plan
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div ref={root} className={className}>
      {/* BEFORE CHECKOUT, NOT AFTER. The question has to be asked while the
          person is still deciding — asking once money has moved makes it look
          like part of what they bought. Nothing about entitlement reads this
          value, and checkout succeeds with it untouched. */}
      {!group ? (
        <NewsletterCheckbox id={`newsletter-optin-${interval}`} checked={ownOptIn} onChange={setOwnOptIn} />
      ) : null}

      <button
        type="button"
        onClick={() => void start()}
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
