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
        className="flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-[10px] font-bold text-slate-400 transition-colors hover:border-accent hover:text-accent"
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
