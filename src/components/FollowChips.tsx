"use client";

// One Follow button per entity — the For You hub and change records. Writes to
// the same follow list as the Following page, through the same hook.

import { useFollows } from "@/hooks/useFollows";

export function FollowChips({ follows }: { follows: { id: string; label: string }[] }) {
  const { follows: followed, toggle, hydrated } = useFollows();
  return (
    <div className="flex flex-wrap gap-2">
      {follows.map((f) => {
        const on = hydrated && followed.includes(f.id);
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(f.id)}
            className={`min-h-[36px] rounded-full border px-3 text-sm font-medium transition-colors ${
              on
                ? "border-accent/60 bg-accent/15 text-white"
                : "border-white/15 text-slate-300 hover:border-accent/40 hover:text-white"
            }`}
          >
            <span aria-hidden>{on ? "✓ " : "+ "}</span>
            {on ? `Following ${f.label}` : `Follow ${f.label}`}
          </button>
        );
      })}
    </div>
  );
}
