"use client";

import { formatDate } from "@/lib/format";
import { trackSourceClick } from "@/lib/analytics";

/**
 * Compact provenance badge: source name + last-updated date, linking out to the
 * government source.
 *
 * The outbound click is measured because it is the strongest available signal
 * that the trust layer is doing its job — a reader who follows a figure back to
 * the agency is exactly the behaviour the Founder Directive is built to produce.
 * Only the source key and the surface are recorded; no reader is identified.
 */
export function SourceBadge({
  sourceName,
  sourceUrl,
  sourceUpdatedAt,
  paceEstimated = false,
  surface = "unknown",
}: {
  sourceName: string;
  sourceUrl: string;
  sourceUpdatedAt: string;
  paceEstimated?: boolean;
  /** Short slug for where this badge rendered, e.g. "state", "employer". */
  surface?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackSourceClick(sourceName, surface)}
        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 font-medium text-slate-300 transition-colors hover:border-accent/40 hover:text-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
