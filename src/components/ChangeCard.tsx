// =============================================================================
// CHANGE CARD — one change, answered in four lines
//
//   1. what it is and the date that matters   (stage pill · key date)
//   2. what it is called                      (title → its record)
//   3. what the document says it does         (its own summary, two lines)
//   4. where to check it                      (source link)
//
// Everything else on a record (who it names, the quoted evidence, limitations,
// how it was classified) lives on the record's own page, once. The whole card
// opens the record; the source link is its own target.
// =============================================================================

import Link from "next/link";
import { formatDate } from "@/lib/format";
import { changePath } from "@/lib/share";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { importanceOf, stageOf } from "@/lib/stage";
import { StagePill } from "./StagePill";

export interface ChangeCardData {
  id: string;
  title: string;
  publishedAt: string;
  effectiveAt?: string | null;
  classification: string;
  severity: string;
  sourceKey: string;
  sourceUrl: string;
  summary?: string | null;
  amendedBy?: string[];
}

/** The publisher's own placeholder is not a summary. */
const NO_SUMMARY = /^\s*no abstract was published with this document\.?\s*$/i;

const DAY = 86_400_000;

export function ChangeCard({ event, today }: { event: ChangeCardData; today: string }) {
  const stage = stageOf(
    {
      classification: event.classification,
      effectiveDate: event.effectiveAt ? event.effectiveAt.slice(0, 10) : null,
      publishedDate: event.publishedAt.slice(0, 10),
      amendedBy: event.amendedBy ?? [],
    },
    today
  );
  const importance = importanceOf(event);
  const source = SOURCE_BY_KEY[event.sourceKey];
  const summary = event.summary && !NO_SUMMARY.test(event.summary) ? event.summary : null;
  const key = stage.keyDate;
  const daysAhead = key && stage.kind === "final_ahead" ? Math.round((Date.parse(key.date) - Date.parse(today)) / DAY) : null;

  return (
    <article className="relative rounded-xl border border-white/10 bg-white/[0.02] p-3.5 transition-colors hover:border-accent/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StagePill stage={stage} />
        {key ? (
          <span className="text-xs text-slate-400">
            {key.label} <span className="font-medium text-slate-200">{formatDate(key.date)}</span>
            {daysAhead !== null && daysAhead <= 30 ? <span className="text-status-amber"> · in {daysAhead} days</span> : null}
          </span>
        ) : null}
      </div>

      <h3 className="mt-2 text-[15px] font-semibold leading-snug text-white">
        <Link href={changePath(event)} className="after:absolute after:inset-0 after:rounded-xl hover:underline">
          {event.title}
        </Link>
      </h3>

      {summary ? <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-slate-400">{summary}</p> : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 inline-flex min-h-[32px] items-center font-medium text-accent hover:underline"
        >
          {source?.name ?? "Official source"} ↗
        </a>
        {importance.kind === "changes_requirements" ? <span className="text-slate-300">{importance.label}</span> : null}
        {stage.amended ? <span className="text-status-amber">A later record amends this one</span> : null}
      </div>
    </article>
  );
}
