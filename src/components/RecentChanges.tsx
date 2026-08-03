// =============================================================================
// RECENT CHANGES — the archive, made visible where people actually land
//
// The event store holds ~700 government changes and, until this component, the
// homepage showed none of them. A visitor arriving at the site was met with an
// H-1B origin map and six counters; the thing the product is actually FOR was
// two clicks away behind a nav item. That is the single largest gap between
// what this platform has and what a reader can see.
//
// Compact by design. This is a PREVIEW that earns the click to /what-changed —
// it shows enough to prove the archive is real and current, and deliberately
// does not repeat the full card's impact record or limitations. A truncated
// limitation is worse than none, which is the same rule the search rows follow.
//
// SEVERITY IS NOT COLOUR-CODED. A red badge would tell a reader a change is
// bad, which is an editorial claim this platform does not make.
// =============================================================================

import Link from "next/link";
import { formatDate } from "@/lib/format";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { CLASSIFICATION_LABEL, SEVERITY_SHORT, isNotInForce } from "@/lib/event-labels";
import { isScheduled, type ImmigrationEvent } from "@/domains/graph/events";

function ChangeRow({ event }: { event: ImmigrationEvent }) {
  const source = SOURCE_BY_KEY[event.sourceKey];
  const proposal = isNotInForce(event.classification);

  return (
    <li className="border-t border-white/5 py-4 first:border-t-0 first:pt-0 last:pb-0">
      {/* ROW 1 — importance and kind. What this is, before what it says.
          Importance is a weight, never a colour: a red badge would tell the
          reader a change is bad, which is an editorial claim this platform does
          not make. Only "not in force" gets colour, because that one is a
          factual warning rather than a judgement. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span
          className={
            event.severity === "major"
              ? "font-semibold text-white"
              : "font-medium text-slate-300"
          }
        >
          {SEVERITY_SHORT[event.severity]}
        </span>
        <span className="text-slate-600" aria-hidden>
          ·
        </span>
        <span className={proposal ? "font-semibold text-status-amber" : "text-slate-400"}>
          {CLASSIFICATION_LABEL[event.classification]}
        </span>
      </div>

      {/* ROW 2 — the title, given its own line and the most weight on the card. */}
      <h3 className="mt-1.5 text-sm font-semibold leading-snug text-white">
        <Link href="/what-changed" className="inline-block py-1 hover:text-accent">
          {event.title}
        </Link>
      </h3>

      {/* ROW 3 — provenance and action, on one baseline. Source and date belong
          together: they are the same question ("who said this, and when"), and
          separating them across rows made the reader hunt for half the answer. */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {source ? <span className="text-slate-400">{source.name}</span> : null}
        {source ? (
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
        ) : null}
        <span className="text-slate-500">
          {isScheduled(event)
            ? `Scheduled for ${formatDate(event.publishedAt)}`
            : formatDate(event.publishedAt)}
        </span>
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-block py-1 font-medium text-accent underline-offset-2 hover:underline"
        >
          Read the original ↗
        </a>
      </div>
    </li>
  );
}

/**
 * A short, honest window onto the archive.
 *
 * `events` is passed in rather than read here so the caller decides the slice —
 * the homepage wants what CHANGED (routine notices excluded), an entity page
 * wants everything touching that entity.
 */
export function RecentChanges({
  events,
  heading,
  intro,
  href = "/what-changed",
  linkLabel = "See every recorded change",
  emptyMessage,
}: {
  events: ImmigrationEvent[];
  heading: string;
  intro?: string;
  href?: string;
  linkLabel?: string;
  emptyMessage?: string;
}) {
  if (events.length === 0) {
    return emptyMessage ? (
      <p className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm leading-relaxed text-slate-400">
        {emptyMessage}
      </p>
    ) : null;
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow mb-1">Traced to the source</div>
          <h2 className="section-title">{heading}</h2>
        </div>
        <Link href={href} className="shrink-0 py-1.5 text-sm font-semibold text-accent hover:text-accent-soft">
          {linkLabel} →
        </Link>
      </div>
      {intro ? <p className="mb-4 text-sm leading-relaxed text-slate-400">{intro}</p> : null}
      <ul className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5">
        {events.map((e) => (
          <ChangeRow key={e.id} event={e} />
        ))}
      </ul>
    </section>
  );
}
