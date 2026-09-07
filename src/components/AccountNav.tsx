"use client";

// =============================================================================
// THE ONE THING THE HEADER WAS MISSING
//
// ImmigrationClock has had verified identities, subscriptions and billing for
// some time, and no way to see any of it. A person could confirm their email,
// pay, and then find nothing in the interface that acknowledged either — no
// sign-in, no account, no sign-out. A paid product that hides its own account
// state reads as broken, and the support question it produces ("did my payment
// work?") is the most expensive one there is.
//
// WHY THIS IS A CLIENT COMPONENT, AND WHY IT READS A COOKIE RATHER THAN A ROUTE
// ----------------------------------------------------------------------------
// The header renders inside the root layout, which is what lets ~7,000 pages
// prerender. Reading `cookies()` there would make every one of them dynamic —
// paying for an account control with the performance of the entire public site,
// which is exactly the trade this project has refused everywhere else.
//
// So it reads `ic_session`, the deliberately readable companion cookie. That
// cookie carries no identity, no plan and no signature: one character meaning
// "somebody signed in on this browser". It is a HINT, not a gate — forging it
// buys you a link to a page that then asks you to sign in. Every real decision
// is still made server-side from the signed cookie and a live read of the
// subscription.
//
// HYDRATION: the server has no idea who this is, so the first paint is the
// signed-out state and the control corrects itself on mount. A brief "Sign in"
// for a signed-in person is the right way round: the opposite would flash
// "Account" at anonymous readers and imply the site knows them.
//
// STALENESS, WHICH IS THE WHOLE RISK OF READING A COOKIE IN THE CLIENT. Two
// tabs are the ordinary case, not the exotic one: sign out in one and the other
// keeps a header that says "Account" for as long as it is left open. So the
// cookie is re-read on three signals rather than one — route changes, the tab
// becoming visible, and the window regaining focus — which between them cover
// every way a person gets back to a tab they left. The read is a regex over
// document.cookie; there is no request and nothing to rate-limit.
// =============================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { onIdentityChange } from "@/lib/billing/identity-signal";

/** True when this browser has ever completed the magic-link flow. */
function hasSession(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)ic_session=1(?:;|$)/.test(document.cookie || "");
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a7 7 0 0 1 14 0v1" />
    </svg>
  );
}

interface Props {
  /** Rendered as a full-width row in the mobile menu instead of a header chip. */
  variant?: "header" | "mobile";
  onNavigate?: () => void;
}

export function AccountNav({ variant = "header", onNavigate }: Props) {
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const sync = useCallback(() => setSignedIn(hasSession()), []);

  // Re-read on every navigation: signing in or out happens on another route,
  // and the header is not remounted in between.
  useEffect(() => {
    sync();
  }, [pathname, sync]);

  // THE SIGNAL, WHICH IS THE ONLY ONE THAT IS IMMEDIATE.
  //
  // Signing out does not navigate — the button posts, the server expires the
  // cookies, and the SERVER component re-renders underneath a header that was
  // never told. So the page said "Sign in with your email" while the control
  // above it still offered "Account". Sign-in has the same shape: the magic
  // link is consumed by a fetch, not by a route change.
  //
  // The same signal reaches OTHER tabs through `storage`, which the browser
  // fires everywhere except the tab that wrote it. Cookies have no equivalent.
  useEffect(() => onIdentityChange(sync), [sync]);

  // The backstop, for a tab that was already open when any of this happened and
  // for browsers that throttle background tabs hard enough to drop the event.
  // `visibilitychange` covers a background tab returning; `focus` covers a
  // visible-but-unfocused window, which is the two-window case on a desktop.
  useEffect(() => {
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    return () => {
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
    };
  }, [sync]);

  const label = signedIn ? "Account" : "Sign in";
  // Signed-out goes to the sign-in surface; signed-in goes to the account page.
  // Both are /account today, which is deliberate: one place, two states, no
  // second URL to keep in step.
  const href = "/account";

  if (variant === "mobile") {
    return (
      <Link
        href={href}
        onClick={onNavigate}
        className={`mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
          pathname === "/account" ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"
        }`}
      >
        <UserIcon />
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={pathname === "/account" ? "page" : undefined}
      // Below 1330px the label is visual-hidden and the icon carries the
      // control, so the tooltip is the only thing a mouse user can check.
      title={label}
      // shrink-0 + nowrap: without them this control is the first thing the
      // header squeezes, and it loses that fight by breaking its own label.
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/10 px-2.5 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-accent/40 hover:text-accent-soft"
    >
      <UserIcon />
      {/* MEASURED, NOT GUESSED. The eight main nav items plus search filled
          the old max-w-7xl bar to the pixel, so a labelled control here made
          five of them wrap onto two lines. 1330px is where the label fits
          beside a single-line nav; below it the icon carries the control and
          the accessible name below keeps it announced. */}
      <span className="hidden min-[1330px]:inline">{label}</span>
      <span className="sr-only min-[1330px]:hidden">{label}</span>
    </Link>
  );
}
