"use client";

// =============================================================================
// "Email alerts: on / off" on /account, for Pro subscribers.
//
// Reads and writes /api/billing/alerts/preferences, which checks the signed-in
// identity and the subscription against the store. The unsubscribe link in
// every alert lands here with ?alerts=off, so the reader sees that it worked
// and can undo it.
// =============================================================================

import { useEffect, useState } from "react";

export function AlertsToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("alerts");
    if (flag === "off") setNote("Alerts are off. You will not get another alert email unless you turn them back on.");
    if (flag === "error") setNote("That unsubscribe link was not valid. You can turn alerts off here instead.");
    fetch("/api/billing/alerts/preferences")
      .then((res) => (res.ok ? (res.json() as Promise<{ enabled: boolean }>) : null))
      .then((body) => setEnabled(body ? body.enabled : null))
      .catch(() => setEnabled(null));
  }, []);

  async function set(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/alerts/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        setEnabled(next);
        setNote(next ? "Alerts are on." : "Alerts are off.");
      } else {
        setNote("Could not save that. Try again in a moment.");
      }
    } catch {
      setNote("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {enabled === null ? (
        <span className="text-slate-400">Checking…</span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <span className={enabled ? "text-status-green" : "text-slate-300"}>{enabled ? "On" : "Off"}</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => set(!enabled)}
            className="rounded border border-white/15 px-2 py-0.5 text-xs text-slate-300 hover:border-accent/50 hover:text-white disabled:opacity-60"
          >
            {enabled ? "Turn off" : "Turn on"}
          </button>
        </span>
      )}
      <span className="mt-0.5 block text-xs text-slate-500">
        {note || "One email when a change touches something you follow. Checked daily; nothing sent when nothing changed."}
      </span>
    </>
  );
}
