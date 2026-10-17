// =============================================================================
// ONE CHANGE'S RECORD, REDESIGNED (FEATURE_UX_V2)
//
// The first screen answers the five questions: what it is (stage), the date
// that matters, whether it is important, what it is called, and where to check
// it (the source button). Then, in reading order: the document's own summary,
// what the record shows, who it names (with the quoted evidence), where it
// stands as a rule, related records, and one "About this record" block that
// carries every provenance and limitation note the record has.
//
// Nothing is dropped from the old page: the derived explanation, the impact
// lists with their completeness note, the limitations, the dates and the
// source check date are all here. What goes is repetition: the title, type and
// dates used to appear three times before the source link.
// =============================================================================

import Link from "next/link";
import { ChangeCard } from "./ChangeCard";
import { WhatThisMeans, WhoIsAffected } from "./EventCard";
import { PageHeader } from "./PageHeader";
import { SaveChangeButton } from "./SaveChangeButton";
import { StagePill } from "./StagePill";
import { TrackedLink } from "./TrackedLink";
import { formatDate } from "@/lib/format";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { importanceOf, stageOf, type Stage } from "@/lib/stage";
import { explainerPath } from "@/lib/share";
import { isScheduled, type ImmigrationEvent } from "@/domains/graph/events";

const NO_SUMMARY = /^\s*no abstract was published with this document\.?\s*$/i;

type Step = { label: string; value: string; state: "done" | "here" | "none" };

/** Where a rule stands, from the record's own dates and links only. */
function steps(stage: Stage, event: ImmigrationEvent): Step[] | null {
  const published = formatDate(event.publishedAt);
  const eff = event.effectiveAt ? formatDate(event.effectiveAt) : null;
  switch (stage.kind) {
    case "proposed":
      return [
        { label: "Proposed", value: published, state: "here" },
        { label: "Final rule", value: stage.amended ? "A later record amends this" : "None in our archive", state: stage.amended ? "done" : "none" },
        { label: "Effective date", value: "None stated", state: "none" },
      ];
    case "final_ahead":
      return [
        { label: "Published", value: published, state: "done" },
        { label: "Takes effect", value: eff!, state: "here" },
      ];
    case "final_date_passed":
      return [
        { label: "Published", value: published, state: "done" },
        { label: "Stated effective date", value: eff!, state: "here" },
      ];
    case "final_undated":
      return [
        { label: "Published", value: published, state: "here" },
        { label: "Effective date", value: "None stated in the document", state: "none" },
      ];
    default:
      return null;
  }
}

function StageTrack({ items }: { items: Step[] }) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((s) => (
        <li key={s.label} className="min-w-0">
          <div
            aria-hidden
            className={`h-1.5 rounded-full ${s.state === "none" ? "bg-white/10" : s.state === "here" ? "bg-accent" : "bg-accent/40"}`}
          />
          <p className="mt-1.5 text-[11px] uppercase tracking-wide text-slate-500">{s.label}</p>
          <p className={`text-sm ${s.state === "none" ? "text-slate-500" : "font-medium text-slate-100"}`}>{s.value}</p>
        </li>
      ))}
    </ol>
  );
}

export function ChangeRecordV2({
  event,
  title,
  path,
  canonical,
  storyKey,
  today,
  related,
  context,
  amendedBy = [],
}: {
  event: ImmigrationEvent;
  /** Ids of later records in the archive that amend this one. */
  amendedBy?: string[];
  title: string;
  path: string;
  canonical: string;
  storyKey: string;
  today: string;
  related: ImmigrationEvent[];
  context: { slug: string; title: string; kicker: string }[];
}) {
  const source = SOURCE_BY_KEY[event.sourceKey];
  const sourceName = source?.name ?? event.sourceKey;
  const stage = stageOf(
    {
      classification: event.classification,
      effectiveDate: event.effectiveAt ? event.effectiveAt.slice(0, 10) : null,
      publishedDate: event.publishedAt.slice(0, 10),
      amendedBy,
    },
    today
  );
  const importance = importanceOf(event);
  const track = steps(stage, event);
  const summary = NO_SUMMARY.test(event.summary)
    ? "The publisher gave no summary for this document. Its title is its own description; open the source for the full text."
    : event.summary;

  return (
    <div>
      <PageHeader
        compact
        title={title}
        crumbs={[
          { href: "/", label: "Home" },
          { href: "/what-changed", label: "What changed" },
          { href: path, label: title },
        ]}
        share
        shareSurface="change"
        shareStory={storyKey}
        sharePath={path}
      >
        <div className="-mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StagePill stage={stage} />
          {stage.keyDate ? (
            <span className="text-sm text-slate-400">
              {stage.keyDate.label} <span className="font-medium text-slate-100">{formatDate(stage.keyDate.date)}</span>
            </span>
          ) : null}
          {importance.kind === "changes_requirements" ? (
            <span className="text-sm text-slate-300">{importance.label}</span>
          ) : null}
        </div>
      </PageHeader>

      <div className="container-page max-w-3xl space-y-6 py-5">
        {stage.caveat ? (
          <p
            className={`rounded-xl border px-3.5 py-2.5 text-sm ${
              stage.kind === "proposed" || stage.amended
                ? "border-status-amber/30 bg-status-amber/5 text-status-amber"
                : "border-white/10 text-slate-300"
            }`}
          >
            {stage.caveat}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <a
            href={event.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-4 text-sm font-semibold text-ink-950 hover:bg-accent-soft"
          >
            Read on {sourceName} ↗
          </a>
        </div>
        <SaveChangeButton recordId={event.id} />

        {track ? (
          <section aria-labelledby="stage-heading">
            <h2 id="stage-heading" className="sr-only">
              Where it stands
            </h2>
            <StageTrack items={track} />
          </section>
        ) : null}

        <section aria-labelledby="summary-heading" className="space-y-2">
          <h2 id="summary-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            The document&rsquo;s summary
          </h2>
          <p className="text-[15px] leading-relaxed text-slate-200">{summary}</p>
          {event.whyItMatters ? <p className="text-sm leading-relaxed text-slate-400">{event.whyItMatters}</p> : null}
        </section>

        <WhatThisMeans event={event} footnote={false} />

        {event.impact ? <WhoIsAffected impact={event.impact} /> : null}

        {related.length > 0 ? (
          <section aria-labelledby="related-heading" className="space-y-2">
            <h2 id="related-heading" className="text-base font-semibold text-white">
              Related changes
            </h2>
            <div className="space-y-2">
              {related.slice(0, 5).map((r) => (
                <ChangeCard key={r.id} event={r} today={today} />
              ))}
            </div>
          </section>
        ) : null}

        {context.length > 0 ? (
          <section aria-labelledby="context-heading" className="space-y-2">
            <h2 id="context-heading" className="text-base font-semibold text-white">
              Explained
            </h2>
            <ul className="space-y-2">
              {context.map((x) => (
                <li key={x.slug}>
                  <TrackedLink
                    href={explainerPath(x.slug)}
                    surface="story-context"
                    relation="keyword"
                    className="block rounded-xl border border-white/10 p-3.5 transition-colors hover:border-accent/40"
                  >
                    <span className="block text-sm font-semibold text-white">{x.title}</span>
                    <span className="mt-0.5 block text-sm text-slate-400">{x.kicker}</span>
                  </TrackedLink>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <p className="text-sm text-slate-400">
          Want changes like this in one place?{" "}
          <Link href="/following" className="font-medium text-accent hover:underline">
            Follow the visas, countries and agencies it names
          </Link>
          .
        </p>

        <section aria-labelledby="about-heading" className="rounded-xl border border-white/10 p-4 text-xs leading-relaxed text-slate-400">
          <h2 id="about-heading" className="text-sm font-semibold text-slate-200">
            About this record
          </h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-slate-500">{isScheduled(event) ? "Scheduled for" : "Published"}</dt>
            <dd>{formatDate(event.publishedAt)}</dd>
            <dt className="text-slate-500">Effective date</dt>
            <dd>{event.effectiveAt ? `${formatDate(event.effectiveAt)} (as stated in the document)` : "None stated"}</dd>
            {event.dataThrough ? (
              <>
                <dt className="text-slate-500">Data through</dt>
                <dd>{formatDate(event.dataThrough)}</dd>
              </>
            ) : null}
            <dt className="text-slate-500">Source</dt>
            <dd>
              {sourceName}, checked {formatDate(event.lastVerifiedAt)}
            </dd>
            <dt className="text-slate-500">Review</dt>
            <dd>{event.reviewStatus === "approved" ? "Reviewed by a person against its source" : "Classified automatically; not reviewed by a person"}</dd>
          </dl>
          {event.limitations && event.limitations.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              {event.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2">
            Built from the linked government document by published rules, not by a language model; explanations
            restate the record&rsquo;s own fields. Information about a published document, not legal advice about
            anyone&rsquo;s case.{" "}
            <Link href="/methodology" className="text-accent hover:underline">
              Methodology
            </Link>{" "}
            ·{" "}
            <Link href={path} className="hover:underline">
              Permalink
            </Link>
          </p>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{canonical}</p>
        </section>
      </div>
    </div>
  );
}
