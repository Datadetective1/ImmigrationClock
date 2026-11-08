"use client";

// =============================================================================
// One optional text box, behind a small link (or open, where the page has
// already asked the question). Nothing here blocks anything: closing it, or
// never opening it, costs the subscriber nothing. Answers go through
// /api/pro/feedback to our own inbox.
// =============================================================================

import { useState } from "react";
import type { FeedbackSource } from "@/lib/pro/feedback";

const MAX = 2000;

export function FeedbackBox({
  source,
  label,
  question,
  hint,
  placeholder,
  open: startOpen = false,
  className = "",
}: {
  source: FeedbackSource;
  /** The link text, and the question once open unless `question` is given. */
  label: string;
  /** The question once the box is open, when it differs from the link text. */
  question?: string;
  /** One short line under the question. */
  hint?: string;
  placeholder?: string;
  /** Show the box straight away instead of behind the link. */
  open?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(startOpen);
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [message, setMessage] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (state === "sending" || text.trim().length < 2) return;
    setState("sending");
    try {
      const res = await fetch("/api/pro/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, message: text }),
      });
      if (res.ok) {
        setState("sent");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      setState("failed");
      setMessage(body.message || "That did not go through. Please try again.");
    } catch {
      setState("failed");
      setMessage("That did not go through. Please try again.");
    }
  }

  if (state === "sent") {
    return (
      <p role="status" className={`text-xs text-slate-400 ${className}`}>
        Thanks. It went straight to us, and we read every one.
      </p>
    );
  }

  if (!open) {
    return (
      <p className={`text-xs ${className}`}>
        <button type="button" onClick={() => setOpen(true)} className="text-accent hover:underline">
          {label}
        </button>
      </p>
    );
  }

  const id = `feedback-${source}`;
  return (
    <form onSubmit={send} className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {question ?? label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
      <textarea
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX))}
        rows={3}
        maxLength={MAX}
        placeholder={placeholder}
        className="mt-2 w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-accent/60 focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={state === "sending" || text.trim().length < 2}
          className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-sm font-medium text-slate-100 hover:border-accent/50 hover:bg-accent/10 disabled:opacity-50"
        >
          {state === "sending" ? "Sending..." : "Send"}
        </button>
        {startOpen ? null : (
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 hover:text-white">
            Not now
          </button>
        )}
        {state === "failed" ? (
          <span role="status" className="text-xs text-status-amber">
            {message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
