import { buildChangeFeed } from "@/lib/changes";
import { ProvenanceTag } from "./ProvenanceTag";

const GROUP: Record<string, { label: string; cls: string }> = {
  border: { label: "Border", cls: "text-status-green" },
  workforce: { label: "Workforce", cls: "text-status-amber" },
  enforcement: { label: "Enforcement", cls: "text-status-red" },
  visa: { label: "Visas", cls: "text-accent" },
};

const ARROW: Record<string, string> = { UP: "▲", DOWN: "▼", FLAT: "▬", none: "" };

/**
 * Cross-source "what changed" feed. Each item shows real movement with a neutral
 * direction marker (no good/bad colouring), an integrity label, and its source.
 */
export function ChangeFeed({ limit, items: passed }: { limit?: number; items?: ReturnType<typeof buildChangeFeed> }) {
  let items = passed ?? buildChangeFeed();
  if (limit) items = items.slice(0, limit);

  return (
    <ul className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-white/[0.02]">
      {items.map((it) => {
        const g = GROUP[it.group];
        return (
          <li key={it.key} className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
            {it.direction !== "none" || it.metric ? (
              <div className="flex w-14 shrink-0 flex-col items-center pt-0.5">
                <span className="text-sm leading-none text-slate-400" aria-hidden>
                  {ARROW[it.direction] ?? ""}
                </span>
                {it.metric ? (
                  <span className="mt-1 font-mono text-xs font-semibold tabular-nums text-slate-200">
                    {it.metric}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="w-14 shrink-0" aria-hidden />
            )}

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${g.cls}`}>{g.label}</span>
                <span className="text-[11px] text-slate-500">{it.period}</span>
                <ProvenanceTag provenance={it.provenance} />
              </div>
              <p className="text-sm font-semibold leading-snug text-white">
                {it.href ? (
                  <a href={it.href} className="transition-colors hover:text-accent-soft">
                    {it.title}
                  </a>
                ) : (
                  it.title
                )}
              </p>
              {it.detail ? <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{it.detail}</p> : null}
              <a
                href={it.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-block text-[11px] text-slate-500 transition-colors hover:text-accent-soft"
              >
                ◆ {it.sourceName}
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
