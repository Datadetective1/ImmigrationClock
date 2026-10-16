"use client";

// =============================================================================
// Briefing settings: how often, how selective, reminders, the calendar link,
// and erasing what Briefing keeps. Everything goes through /api/pro/prefs and
// /api/pro/data, which check the subscription against the store.
// =============================================================================

import { useState } from "react";

export interface BriefingSettingsValue {
  frequency: "daily" | "weekly";
  relevance: "all" | "priority";
  reminders: boolean;
  summary: boolean;
  calendarUrl: string;
}

function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (v: T) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">{name}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={`cursor-pointer rounded-lg border p-3 text-sm ${
            value === o.value ? "border-accent/60 bg-accent/[0.06] text-white" : "border-white/10 text-slate-300"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
            className="sr-only"
          />
          <span className="font-semibold">{o.label}</span>
          <span className="mt-0.5 block text-xs text-slate-400">{o.hint}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function BriefingSettings({
  initial,
  alertsOn,
  intelligence = false,
}: {
  initial: BriefingSettingsValue;
  alertsOn: boolean;
  intelligence?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);

  async function save(patch: Record<string, unknown>, done: string) {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/pro/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      setValue((await res.json()) as BriefingSettingsValue);
      setNote(done);
    } catch {
      setNote("Could not save that. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function erase() {
    if (!window.confirm("Erase your saved changes, alert history and Briefing settings? Your watchlist and subscription are kept.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pro/data", { method: "DELETE" });
      if (!res.ok) throw new Error();
      window.location.reload();
    } catch {
      setNote("Could not erase that. Try again in a moment.");
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value.calendarUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNote("Copy failed — select the link and copy it by hand.");
    }
  }

  return (
    <div className="space-y-5">
      {!alertsOn ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs text-slate-400">
          Email alerts are off. These settings apply when you turn them back on from{" "}
          <a href="/account" className="underline decoration-dotted">your account</a>.
        </p>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-semibold text-white">How often</p>
        <Choice
          name="frequency"
          value={value.frequency}
          disabled={busy}
          onChange={(frequency) => save({ frequency }, "Saved.")}
          options={[
            { value: "daily", label: "Daily", hint: "One email on any day something you follow changed." },
            { value: "weekly", label: "Weekly digest", hint: "One email on Mondays with the week's changes." },
          ]}
        />
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-white">What to include</p>
        <Choice
          name="relevance"
          value={value.relevance}
          disabled={busy}
          onChange={(relevance) => save({ relevance }, "Saved.")}
          options={[
            { value: "all", label: "Every match", hint: "Every recorded change that touches something you follow." },
            {
              value: "priority",
              label: "Priority only",
              hint: "Matches recorded as major, or with a stated effective date in the next 30 days.",
            },
          ]}
        />
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={value.reminders}
          disabled={busy}
          onChange={(e) => save({ reminders: e.target.checked }, "Saved.")}
          className="mt-1"
        />
        <span>
          Effective-date reminders
          <span className="block text-xs text-slate-400">
            One email a week before a followed change takes effect — only when its record states the date.
          </span>
        </span>
      </label>

      {intelligence ? (
        <label className="flex items-start gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={value.summary}
            disabled={busy}
            onChange={(e) => save({ summary: e.target.checked }, "Saved.")}
            className="mt-1"
          />
          <span>
            Weekly intelligence summary (optional, separate email)
            <span className="block text-xs text-slate-400">
              Off unless you turn it on. Separate from your alerts above, which stay as they are. Mondays: what
              changed for each follow, open proposals, dates in the next 90 days, and what we checked — including in
              quiet weeks.
            </span>
          </span>
        </label>
      ) : null}

      <div>
        <p className="text-sm font-semibold text-white">Calendar feed</p>
        <p className="mt-1 text-xs text-slate-400">
          Subscribe in Google Calendar, Apple Calendar or Outlook to see stated effective dates of what you follow
          and save. This link is private: anyone with it sees those dates, so reset it if it leaks.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            readOnly
            value={value.calendarUrl}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Private calendar link"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 font-mono text-base text-slate-300"
          />
          <div className="flex gap-2">
            <button type="button" onClick={copy} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:border-accent/50">
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => save({ resetCalendar: true }, "New calendar link created. The old one no longer works.")}
              className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200 hover:border-accent/50 disabled:opacity-60"
            >
              Reset link
            </button>
          </div>
        </div>
      </div>

      <p className="min-h-[1rem] text-xs text-slate-400" role="status">{note}</p>

      <div className="border-t border-white/5 pt-4">
        <button type="button" onClick={erase} disabled={busy} className="text-xs text-slate-400 underline decoration-dotted hover:text-white">
          Erase my Briefing data
        </button>
        <span className="mt-0.5 block text-xs text-slate-500">
          Removes saved changes, alert history and these settings, and revokes the calendar link.
        </span>
      </div>
    </div>
  );
}
