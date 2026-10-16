"use client";

// =============================================================================
// "Save to Briefing" on a change page, for Pro subscribers.
//
// The change pages are static and public, so this decides on the client
// whether to appear at all. No signed-in hint cookie, no request — a reader
// without an account never triggers a call. A signed-in reader who is not Pro,
// or a site with Briefing switched off, gets a refusal from /api/pro/saved
// and the button stays hidden. It never advertises a feature the reader
// cannot use from here.
// =============================================================================

import { useEffect, useState } from "react";
import { hasSessionHint } from "@/lib/billing/watchlist-client";

export function SaveChangeButton({ recordId }: { recordId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!hasSessionHint()) return;
    fetch("/api/pro/saved")
      .then((res) => (res.ok ? (res.json() as Promise<{ items: { id: string }[] }>) : null))
      .then((body) => {
        if (body) setSaved(body.items.some((i) => i.id === recordId));
      })
      .catch(() => undefined);
  }, [recordId]);

  if (saved === null) return null;

  async function toggle() {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch("/api/pro/saved", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: recordId, saved: !saved }),
      });
      if (res.ok) {
        setSaved(!saved);
      } else {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setNote(body?.message ?? "Could not save that. Try again in a moment.");
      }
    } catch {
      setNote("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent/[0.04] p-4">
      <div>
        <p className="text-sm font-semibold text-white">{saved ? "Saved to your Briefing" : "Save to your Briefing"}</p>
        <p className="mt-1 text-xs text-slate-400">
          {note ||
            (saved
              ? "In your saved research and in the brief you can download. Its effective date, if stated, is on your calendar feed."
              : "Keep this record with your research, include it in a downloadable brief, and put its effective date on your calendar.")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {saved ? (
          <a href="/briefing" className="text-xs text-slate-400 underline decoration-dotted hover:text-white">
            Open Briefing
          </a>
        ) : null}
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={saved}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:border-accent/50 hover:text-white disabled:opacity-60"
        >
          {saved ? "Remove" : "Save"}
        </button>
      </div>
    </div>
  );
}
