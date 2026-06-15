import { timelineEvents, eventDataContext, type EventCategory } from "@/lib/events";
import { ProvenanceTag } from "./ProvenanceTag";
import { formatDate } from "@/lib/format";

const CAT: Record<EventCategory, { label: string; dot: string; text: string }> = {
  policy: { label: "Policy", dot: "bg-accent", text: "text-accent" },
  legal: { label: "Legal", dot: "bg-fuchsia-400", text: "text-fuchsia-300" },
  enforcement: { label: "Enforcement", dot: "bg-status-red", text: "text-status-red" },
  visa: { label: "Visas", dot: "bg-status-amber", text: "text-status-amber" },
  border: { label: "Border", dot: "bg-status-green", text: "text-status-green" },
  political: { label: "Political", dot: "bg-slate-400", text: "text-slate-300" },
};

/**
 * Vertical timeline of major immigration events (newest first), each with a
 * category, a primary-source link, and — where the event maps to a data series —
 * the real figure for that fiscal year, connecting policy to the numbers.
 */
export function EventTimeline({ limit }: { limit?: number }) {
  let events = timelineEvents();
  if (limit) events = events.slice(0, limit);

  return (
    <ol className="relative space-y-6 border-l border-white/10 pl-6">
      {events.map((e, i) => {
        const c = CAT[e.category];
        const ctx = eventDataContext(e);
        return (
          <li key={`${e.date}-${i}`} className="relative">
            <span
              className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ring-ink-950 ${c.dot}`}
              aria-hidden
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <time className="font-mono text-xs text-slate-400">{formatDate(e.date)}</time>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${c.text}`}>{c.label}</span>
            </div>
            <h3 className="mt-1 text-sm font-bold leading-snug text-white sm:text-base">{e.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{e.summary}</p>

            {ctx ? (
              <p className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-1 text-[12px] text-slate-300">
                <span className="text-slate-500">↳ data at the time:</span> {ctx.text}
                <ProvenanceTag provenance={ctx.reported ? "reported" : "projected"} />
              </p>
            ) : null}

            <div className="mt-1.5">
              <a
                href={e.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-slate-500 transition-colors hover:text-accent-soft"
              >
                ◆ {e.sourceName}
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
