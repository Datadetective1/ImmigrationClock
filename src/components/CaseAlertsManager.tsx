"use client";

// =============================================================================
// A Pro subscriber's tracked USCIS cases: add one, see its last status, remove
// one or all. Everything goes through /api/pro/cases, which checks the
// subscription and asks USCIS's official API. Nothing is kept in the browser.
// =============================================================================

import { useState } from "react";

export interface CaseRow {
  receipt: string;
  formType: string | null;
  status: string | null;
  lastCheckedAt: number | null;
  lastChangedAt: number | null;
}

function masked(r: string): string {
  return `${r.slice(0, 3)}•••••${r.slice(-5)}`;
}

function when(seconds: number | null): string {
  if (!seconds) return "Not checked yet";
  return new Date(seconds * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function CaseAlertsManager({ initial, max }: { initial: CaseRow[]; max: number }) {
  const [cases, setCases] = useState<CaseRow[]>(initial);
  const [receipt, setReceipt] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const field =
    "w-full rounded-lg border border-white/15 bg-ink-900 px-3 py-2 font-mono text-sm uppercase tracking-wide text-white focus:border-accent focus:outline-none";

  async function call(method: "POST" | "DELETE", body: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/pro/cases", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        setMessage({ tone: "error", text: typeof data.message === "string" ? data.message : "Something went wrong. Try again." });
        return null;
      }
      return data;
    } catch {
      setMessage({ tone: "error", text: "Could not reach ImmigrationClock. Check your connection." });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const data = await call("POST", { receipt, consent });
    if (!data?.case) return;
    setCases((c) => [data.case as CaseRow, ...c]);
    setReceipt("");
    setConsent(false);
    setMessage({ tone: "ok", text: "Added. We'll email you when USCIS shows a new status." });
  }

  async function remove(r: string) {
    if (await call("DELETE", { receipt: r })) setCases((c) => c.filter((x) => x.receipt !== r));
  }

  async function removeAll() {
    if (!window.confirm("Delete all your tracked cases?")) return;
    if (await call("DELETE", { all: true })) {
      setCases([]);
      setMessage({ tone: "ok", text: "All cases deleted." });
    }
  }

  const full = cases.length >= max;

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="panel space-y-3 p-4 sm:p-6">
        <label className="block text-xs font-medium text-slate-400">
          Receipt number
          <input
            className={`mt-1 ${field}`}
            value={receipt}
            onChange={(e) => setReceipt(e.target.value)}
            placeholder="EAC2190012345"
            autoComplete="off"
            spellCheck={false}
            maxLength={20}
            disabled={busy || full}
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy || full} />
          <span>This is my case, or I have the case owner&apos;s permission to track it.</span>
        </label>
        <button
          type="submit"
          disabled={busy || full || !consent || receipt.trim().length < 13}
          className="min-h-[40px] rounded-lg bg-accent px-4 text-sm font-semibold text-ink-950 disabled:opacity-40"
        >
          {busy ? "Checking with USCIS…" : "Track this case"}
        </button>
        {full ? <p className="text-xs text-slate-400">You track {max} cases, the most allowed. Remove one to add another.</p> : null}
      </form>

      <div aria-live="polite">
        {message ? (
          <p
            className={`rounded-xl border p-3 text-sm ${
              message.tone === "ok" ? "border-status-green/40 bg-status-green/10 text-slate-200" : "border-status-red/40 bg-status-red/10 text-slate-200"
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </div>

      {cases.length ? (
        <ul className="space-y-2">
          {cases.map((c) => (
            <li key={c.receipt} className="panel flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="font-mono text-sm text-white">
                  {c.formType ? <span className="mr-2 text-accent">{c.formType}</span> : null}
                  {masked(c.receipt)}
                </div>
                <div className="mt-1 truncate text-sm text-slate-200">{c.status ?? "Waiting for the first check"}</div>
                <div className="text-xs text-slate-500">Checked {when(c.lastCheckedAt)}</div>
              </div>
              <button
                type="button"
                onClick={() => remove(c.receipt)}
                disabled={busy}
                className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs text-slate-300 hover:text-white"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-slate-400">No cases yet.</p>
      )}

      {cases.length ? (
        <button type="button" onClick={removeAll} disabled={busy} className="text-xs text-slate-400 underline decoration-dotted hover:text-white">
          Delete all my cases
        </button>
      ) : null}
    </div>
  );
}
