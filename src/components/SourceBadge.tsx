import { formatDate } from "@/lib/format";

/** Compact provenance badge: source name + last-updated date, linking out. */
export function SourceBadge({
  sourceName,
  sourceUrl,
  sourceUpdatedAt,
  paceEstimated = false,
}: {
  sourceName: string;
  sourceUrl: string;
  sourceUpdatedAt: string;
  paceEstimated?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-medium text-slate-300 transition-colors hover:border-accent/40 hover:text-accent-soft"
      >
        <span aria-hidden>◆</span>
        <span className="max-w-[12rem] truncate">{sourceName}</span>
      </a>
      <span className="text-slate-500">Updated {formatDate(sourceUpdatedAt)}</span>
      {paceEstimated ? (
        <span className="rounded-md bg-status-amber/10 px-1.5 py-0.5 font-medium text-status-amber">
          pace est.
        </span>
      ) : null}
    </div>
  );
}
