"use client";

// =============================================================================
// FREE VISA BULLETIN ALERT SIGNUP
//
// Email, category and country, one box to tick, one button. The server sends a
// confirmation link and stores nothing until it is clicked, so "Check your
// inbox" is the honest success state, never "You're subscribed".
//
// Analytics carry the placement name only. Never the category or country: a
// followed category can imply a reader's nationality.
// =============================================================================

import { useState } from "react";
import Link from "next/link";
import { isPlausibleEmail } from "@/lib/newsletter";
import { track } from "@/lib/analytics";
import { CONSENT_TEXT, COUNTRY_OPTIONS, ROW_OPTIONS, rowOptionLabel } from "@/lib/bulletin-alerts/options";
import type { Chargeability, Row } from "@/lib/visa-bulletin";

type Status = { kind: "idle" } | { kind: "submitting" } | { kind: "done" } | { kind: "error"; message: string };

const FIELD =
  "w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-base text-white placeholder:text-slate-500 focus:border-accent/50 focus:outline-none sm:text-sm";

export function BulletinAlertSignup({
  placement,
  defaultRow = "EB2",
  defaultCountry = "india",
  trialDays,
  heading = "Free Visa Bulletin email alerts",
  blurb = "Get a free email when we publish each new Visa Bulletin month, with the dates for your category and country.",
}: {
  /** Where the form sits, for the count. A fixed name, never a path. */
  placement: string;
  defaultRow?: Row;
  defaultCountry?: Chargeability;
  trialDays: number;
  heading?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState("");
  const [row, setRow] = useState<Row>(defaultRow);
  const [country, setCountry] = useState<Chargeability>(defaultCountry);
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const id = `balert-${placement}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting") return;
    if (!isPlausibleEmail(email.trim())) {
      setStatus({ kind: "error", message: "That does not look like an email address." });
      return;
    }
    if (!consented) {
      setStatus({ kind: "error", message: "Please tick the box to confirm you want these emails." });
      return;
    }
    setStatus({ kind: "submitting" });
    const honeypot = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value ?? "";
    try {
      const res = await fetch("/api/bulletin-alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), row, country, consent: true, website: honeypot }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        track("bulletin_alert_signup", { placement });
        setStatus({ kind: "done" });
        return;
      }
      setStatus({ kind: "error", message: data.error || "We could not complete the signup. Try again shortly." });
    } catch {
      setStatus({ kind: "error", message: "We could not reach the server. Check your connection." });
    }
  }

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="rounded-xl border border-accent/25 bg-accent/[0.05] p-4 sm:p-5"
      data-testid="bulletin-alert-signup"
    >
      <h2 id={`${id}-heading`} className="text-base font-bold text-white">
        {heading}
      </h2>
      <p className="mt-1 text-sm text-slate-400">{blurb}</p>

      {status.kind === "done" ? (
        <div role="status" className="mt-3 rounded-lg border border-accent/30 bg-ink-950/40 p-3" data-testid="bulletin-alert-done">
          <p className="text-sm font-semibold text-white">Check your inbox to confirm.</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            We sent a confirmation link. Nothing is saved until you click it. If it is not there in a few minutes,
            check spam.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={`${id}-email`} className="sr-only">
              Email address
            </label>
            <input
              id={`${id}-email`}
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status.kind === "error") setStatus({ kind: "idle" });
              }}
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor={`${id}-row`} className="mb-1 block text-xs font-medium text-slate-300">
              Category
            </label>
            <select id={`${id}-row`} name="row" value={row} onChange={(e) => setRow(e.target.value as Row)} className={FIELD}>
              {ROW_OPTIONS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.rows.map((r) => (
                    <option key={r} value={r}>
                      {rowOptionLabel(r)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-country`} className="mb-1 block text-xs font-medium text-slate-300">
              Country of chargeability
            </label>
            <select
              id={`${id}-country`}
              name="country"
              value={country}
              onChange={(e) => setCountry(e.target.value as Chargeability)}
              className={FIELD}
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute left-[-9999px] h-0 w-0 opacity-0"
          />

          <label className="flex items-start gap-2 text-xs leading-relaxed text-slate-400 sm:col-span-2">
            <input
              type="checkbox"
              name="consent"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-ink-950/60 accent-accent"
            />
            <span>{CONSENT_TEXT}</span>
          </label>

          <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="submit"
              disabled={status.kind === "submitting"}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status.kind === "submitting" ? "Sending…" : "Email me the new dates"}
            </button>
            <p className="text-xs text-slate-500">
              Free. One email a month. We store your email, category and country, nothing else.{" "}
              <Link href="/privacy" className="link-accent">
                Privacy
              </Link>
            </p>
          </div>
          {status.kind === "error" ? (
            <p role="alert" className="text-xs text-status-red sm:col-span-2">
              {status.message}
            </p>
          ) : null}
        </form>
      )}

      <p className="mt-3 border-t border-white/5 pt-3 text-xs text-slate-400">
        Want to know when your own priority date may be reached? Pro gives you a forecast by month for your date.{" "}
        <Link href="/trial" className="link-accent" onClick={() => track("premium_interest", { from: `alerts-${placement}` })}>
          Try Pro free for {trialDays} days
        </Link>
        .
      </p>
    </section>
  );
}
