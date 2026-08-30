"use client";

// =============================================================================
// PULSE SIGNUP FORM — the interactive half of the newsletter panel
//
// Correctness rule, inherited and unchanged: this must never tell someone they
// are subscribed unless a provider actually received their address. An earlier
// version rendered "✓ You're on the list" with no provider configured and
// discarded every address typed into it (docs/data-corrections.md).
//
// TWO SUBMISSION PATHS, for one real reason
// -----------------------------------------
//   • provider "self"     — same-origin fetch to /api/subscribe. The response is
//                           readable, so success and failure are REPORTED rather
//                           than assumed, and the reader stays on the page.
//   • provider "external" — native form POST to a third-party endpoint. A
//                           cross-origin fetch would have to run in `no-cors`,
//                           which makes the response unreadable and would force
//                           the page to guess. Handing the browser to the
//                           provider means the visitor sees the provider's own
//                           confirmation instead of our guess.
//
// The asymmetry is the point: we only claim to know an outcome when we can
// actually observe it.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isPlausibleEmail } from "@/lib/newsletter";
import { track } from "@/lib/analytics";
import { LOCALES, type Locale } from "@/lib/newsletter/types";

const CONSENT_TEXT = "Email me the weekly Immigration Pulse. I can unsubscribe from any email.";

/**
 * Languages, in their own script.
 *
 * Endonyms, because "Arabic" written in English is not the word an Arabic
 * reader is scanning for. This is the same list the newsletter renders in its
 * "Read in" row — those links switch which archived edition you are READING;
 * this choice decides which one is MAILED to you. Two different things, and the
 * copy below says so.
 */
const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  ar: "العربية",
};

/**
 * A likely language, for HIGHLIGHTING only.
 *
 * Never pre-selects. An assumed language is indistinguishable from a chosen one
 * once it is stored, and the subscriber is the only one who knows which they
 * meant. This narrows a four-way choice to an obvious first glance and leaves
 * the decision where it belongs.
 */
function suggestedLocale(): Locale | null {
  if (typeof navigator === "undefined") return null;
  for (const tag of navigator.languages ?? [navigator.language]) {
    const base = tag?.toLowerCase().split("-")[0];
    if (base && (LOCALES as readonly string[]).includes(base)) return base as Locale;
  }
  return null;
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function PulseSignupForm({
  provider,
  endpoint,
  /** Which surface this form is on. Kept to a short fixed vocabulary so the
   *  analytics dimension stays low-cardinality and carries nothing personal. */
  placement = "page",
}: {
  provider: "self" | "external";
  endpoint?: string;
  placement?: string;
}) {
  const [consented, setConsented] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // null until chosen. There is no default, on purpose.
  const [language, setLanguage] = useState<Locale | null>(null);
  const [suggested, setSuggested] = useState<Locale | null>(null);

  // Read after mount: navigator is unavailable during SSR, and reading it in
  // the first render would make the server and client markup disagree.
  useEffect(() => setSuggested(suggestedLocale()), []);

  const ordered = useMemo(
    () => (suggested ? [suggested, ...LOCALES.filter((l) => l !== suggested)] : [...LOCALES]),
    [suggested]
  );

  // ---- External provider: native POST, no interception ----------------------
  if (provider === "external") {
    return (
      <form action={endpoint} method="post" target="_blank" rel="noopener noreferrer" className="flex flex-col gap-2">
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
          className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-accent/50 focus:outline-none"
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
    );
  }

  // ---- Our own endpoint: fetch, and report what actually happened ------------
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting") return;

    // Validated with the SAME predicate the server uses, so the field never
    // accepts something the API then rejects.
    if (!isPlausibleEmail(email)) {
      setStatus({ kind: "error", message: "That does not look like an email address." });
      return;
    }

    // Same rule the server enforces. Checked here too so the reader is told
    // what is missing without a round trip.
    if (!language) {
      setStatus({ kind: "error", message: "Choose the language you would like the newsletter in." });
      return;
    }

    setStatus({ kind: "submitting" });
    // Newsletter conversion was entirely unmeasurable: both events below were
    // declared in the analytics taxonomy and never once emitted, so there was
    // no way to tell a signup funnel that leaks from one nobody reaches. Fired
    // after validation passes, so a typo is not counted as an attempt.
    track("newsletter_signup_started", { placement });
    const form = e.currentTarget;
    const honeypot = (form.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), consent: consented, website: honeypot, language }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        track("newsletter_signup_submitted", { placement, language });
        setStatus({ kind: "done" });
        return;
      }
      setStatus({
        kind: "error",
        message: data.error || "We could not complete the signup. Try again shortly.",
      });
    } catch {
      // A network failure is OUR failure to report, not a silent success.
      setStatus({ kind: "error", message: "We could not reach the server. Check your connection." });
    }
  }

  if (status.kind === "done") {
    return (
      // role=status so a screen reader is told the outcome without moving focus.
      <div role="status" className="rounded-xl border border-accent/30 bg-accent/[0.06] p-4">
        <p className="text-sm font-semibold text-white">Check your inbox.</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          A confirmation is on its way now, and your first Pulse arrives with the next weekly issue. If
          the confirmation doesn&rsquo;t show up within a few minutes, check spam — and if it
          isn&rsquo;t there either, the signup did not complete.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
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
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status.kind === "error") setStatus({ kind: "idle" });
        }}
        aria-invalid={status.kind === "error"}
        aria-describedby={status.kind === "error" ? "pulse-error" : undefined}
        className="w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-accent/50 focus:outline-none"
      />

      {/* Honeypot. Hidden from people, tempting to bots. Not `display:none`,
          which some bots detect and skip. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      {/* Language. A radiogroup rather than a <select>: four options is few
          enough to show at once, and a dropdown hides three of them behind a
          tap on the device most of this audience uses. Each label is in its own
          script so a reader scans for the word they actually recognise. */}
      <fieldset className="mt-1">
        <legend className="text-[11px] font-semibold text-slate-300">Which language should we send?</legend>
        <div role="radiogroup" aria-required="true" className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {ordered.map((l) => {
            const active = language === l;
            return (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={active}
                lang={l}
                dir={l === "ar" ? "rtl" : undefined}
                onClick={() => {
                  setLanguage(l);
                  if (status.kind === "error") setStatus({ kind: "idle" });
                }}
                className={
                  "rounded-lg border px-2.5 py-2 text-sm transition-colors " +
                  (active
                    ? "border-accent bg-accent/15 font-semibold text-white"
                    : "border-white/10 bg-ink-950/60 text-slate-300 hover:border-white/25 hover:text-white")
                }
              >
                {LANGUAGE_LABELS[l]}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
          Every issue links to all four translations — this is the one that arrives in your inbox.
        </p>
      </fieldset>

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
        disabled={!consented || !language || status.kind === "submitting"}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {status.kind === "submitting" ? "Subscribing…" : "Subscribe"}
      </button>

      {status.kind === "error" ? (
        <p id="pulse-error" role="alert" className="text-[11px] leading-relaxed text-status-amber">
          {status.message}
        </p>
      ) : null}

      <p className="text-[11px] text-slate-500">
        One email a week. Unsubscribe from any email. We store your address with our email provider and
        use it for nothing else — see our{" "}
        <Link href="/privacy" className="link-accent">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
