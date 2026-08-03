"use client";

import { useState, useId } from "react";

/** Lightweight accessible tooltip triggered by an info dot (hover + focus). */
export function Tooltip({ text, label = "What does this mean?" }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        // The visible dot stays 16px; the TARGET is expanded to 24x24 with a
        // centred transparent pseudo-element. WCAG 2.2 AA 2.5.8 measures the hit
        // area, not the ink, so this passes without changing the layout — and
        // this control appears 13 times on the dashboard alone, which is a lot of
        // 16px targets for a thumb.
        className="relative flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] font-bold text-slate-400 transition-colors hover:border-accent hover:text-accent before:absolute before:left-1/2 before:top-1/2 before:h-6 before:w-6 before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']"
      >
        i
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-white/10 bg-ink-800 p-3 text-xs leading-relaxed text-slate-200 shadow-glow"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
