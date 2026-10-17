// =============================================================================
// ONE CHANGE'S RECORD, REDESIGNED (FEATURE_UX_V2)
//
// The first screen answers the five questions: what it is (stage), the date
// that matters, whether it is important, what it is called, and where to check
// it (the source button). Then, in reading order: the document's own summary,
// who it names with the document's own words for each, related records, and
// one "About this record" block with provenance and every limitation.
//
// EACH THING IS SAID ONCE. The key date is in the header and nowhere else
// (the track appears only where it adds a step: a proposal, a date ahead).
// The legal-status qualification is one line, specific to the record. The
// "whether this applies to you" qualification is one line under who it
// names. Field names and raw ISO dates never reach the reader.
// =============================================================================

import Link from "next/link";
import { ChangeCard } from "./ChangeCard";
import { entityName } from "./EventCard";
import { PageHeader } from "./PageHeader";
import { SaveChangeButton } from "./SaveChangeButton";
import { StagePill } from "./StagePill";
import { TrackedLink } from "./TrackedLink";
import { formatDate } from "@/lib/format";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { importanceOf, stageOf, type Stage } from "@/lib/stage";
import { explainerPath } from "@/lib/share";
import { isScheduled, type ImmigrationEvent } from "@/domains/graph/events";
import { forceClause } from "@/domains/graph/explain";
import type { EventImpact, ImpactedEntity } from "@/domains/graph/impact";

const NO_SUMMARY = /^\s*no abstract was published with this document\.?\s*$/i;

type Step = { label: string; value: string; state: "done" | "here" | "none" };

/**
 * Where a rule stands, from the record's own dates and links only. Shown only
 * where it adds a step the header cannot: a proposal with no final rule, or a
 * date still ahead. A passed or missing date is already the header's key date.
 */
function steps(stage: Stage, event: ImmigrationEvent): Step[] | null {
  const published = formatDate(event.publishedAt);
  switch (stage.kind) {
    case "proposed":
      return [
        { label: "Proposed", value: published, state: "here" },
        { label: "Final rule", value: stage.amended ? "A later record amends this" : "None in our archive", state: stage.amended ? "done" : "none" },
      ];
    case "final_ahead":
      return [
        { label: "Published", value: published, state: "done" },
        { label: "Takes effect", value: formatDate(event.effectiveAt!), state: "here" },
      ];
    default:
      return null;
  }
}

/**
 * Limitations that state what kind of document this is and what that means
 * legally. When a record carries one it is the record's own, more specific
 * wording of the status line, so it is shown there instead of being repeated
 * at the foot of the page.
 */
const STATUS_LIMITATION =
  /\bPROPOSED rule\b|\bdecision binds\b|\bbinding precedent\b|\bdecision's reach\b|\bannouncement describes\b|\bpresidential document directs\b|\bpolicy alert is USCIS guidance\b|\bcertification is not\b/;

/** The one line on legal status, and the limitations left for "About this record". */
const DATED_KINDS = new Set(["proposed", "final_ahead", "final_date_passed", "final_undated", "court"]);
function statusAndLimitations(
  stage: Stage,
  event: ImmigrationEvent,
  today: string,
  summaryReplaced: boolean
): { note: string | null; rest: string[] } {
  let rest = (event.limitations ?? []).filter((l) => !(summaryReplaced && /published no abstract/i.test(l)));
  // An amendment or a passed date is newer, record-specific information: it wins.
  if (stage.amended || stage.kind === "final_date_passed") return { note: stage.caveat, rest };
  const own = rest.find((l) => STATUS_LIMITATION.test(l));
  if (own) {
    rest = rest.filter((l) => l !== own);
    return { note: own, rest };
  }
  if (stage.caveat) return { note: stage.caveat, rest };
  return { note: DATED_KINDS.has(stage.kind) ? null : (forceClause(event, today)?.text ?? null), rest };
}

/**
 * Rulemaking explainers match on words every rule contains ("final rule",
 * "effective date"); on a record they are worth a tap only for the stage they
 * explain. Topic explainers (OPT, H-1B, courts…) already match on the record's
 * own subject words.
 */
const STAGE_EXPLAINERS: Record<string, readonly string[]> = {
  "proposed-rule-vs-final-rule": ["proposed"],
  "effective-date-vs-publication-date": ["final_ahead", "final_date_passed"],
};
function relevantToStage(slug: string, stage: Stage): boolean {
  const kinds = STAGE_EXPLAINERS[slug];
  return !kinds || kinds.includes(stage.kind);
}

/** "Countries", "Visa categories"… with the document's own words for each, readable on a phone. */
function NamedGroup({ label, items }: { label: string; items: ImpactedEntity[] }) {
  if (items.length === 0) return null;
  const quoted = items.filter((i) => i.evidence);
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm text-slate-100">{items.map((i) => entityName(i.entityId)).join(", ")}</p>
      {quoted.length > 0 ? (
        <details className="mt-1 text-xs text-slate-400">
          <summary className="cursor-pointer text-accent">Where the document says this</summary>
          <ul className="mt-1.5 space-y-1.5">
            {quoted.map((i) => (
              <li key={i.entityId}>
                <span className="text-slate-300">{entityName(i.entityId)}:</span> “{quote(i.evidence!)}”
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** Federal Register footnote markers ("\\17\\") are typesetting, not words. */
const quote = (s: string) => s.replace(/\\\d+\\/g, "").replace(/\s{2,}/g, " ");

/** One qualification for the whole section, specific to how complete the list is. */
function scopeNote(completeness: EventImpact["completeness"]): string {
  const applies = "Whether it applies to a particular person depends on facts this record does not have.";
  if (completeness === "exhaustive") return `The document publishes this as a closed list. ${applies}`;
  if (completeness === "partial") return `This list may be incomplete; the document may name others. ${applies}`;
  return applies;
}

function WhoItNames({ impact }: { impact: EventImpact }) {
  const stated = (xs: ImpactedEntity[]) => xs.filter((x) => x.basis !== "inferred");
  const groups: [string, ImpactedEntity[]][] = [
    ["Countries", stated(impact.countries)],
    ["Visa categories", stated(impact.visaCategories)],
    ["States", stated(impact.states)],
    ["Employers", stated(impact.employers)],
    ["Schools", stated(impact.universities)],
  ];
  const hasStated = groups.some(([, xs]) => xs.length > 0);
  const inferred = [...impact.countries, ...impact.visaCategories, ...impact.states, ...impact.employers, ...impact.universities].filter(
    (x) => x.basis === "inferred"
  );
  if (!hasStated && !impact.scopeDefinedElsewhere && !impact.actionRequired && !impact.undetermined && inferred.length === 0) return null;

  return (
    <section aria-labelledby="names-heading" className="space-y-3">
      <h2 id="names-heading" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Who the document names
      </h2>
      {groups.map(([label, xs]) => (
        <NamedGroup key={label} label={label} items={xs} />
      ))}
      {impact.undetermined && !hasStated ? <p className="text-sm text-slate-400">{impact.undetermined}</p> : null}
      {impact.scopeDefinedElsewhere ? (
        <p className="text-sm text-slate-300">
          {impact.scopeDefinedElsewhere.note}{" "}
          <span className="text-slate-500">“{impact.scopeDefinedElsewhere.evidence}”</span>
        </p>
      ) : null}
      {inferred.length > 0 ? (
        <NamedGroup label="Referenced elsewhere in the document (our reading, not a stated scope)" items={inferred} />
      ) : null}
      {impact.actionRequired ? (
        <div>
          <p className="text-xs text-slate-500">A requirement the document states</p>
          <blockquote className="mt-0.5 border-l-2 border-white/15 pl-3 text-sm italic text-slate-300">
            “{quote(impact.actionRequired.evidence)}”
          </blockquote>
        </div>
      ) : null}
      {hasStated || impact.actionRequired || inferred.length > 0 ? (
        <p className="text-xs leading-relaxed text-slate-500">{scopeNote(impact.completeness)}</p>
      ) : null}
    </section>
  );
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
  const summaryReplaced = NO_SUMMARY.test(event.summary);
  const { note, rest: limitations } = statusAndLimitations(stage, event, today, summaryReplaced);
  const explainers = context.filter((x) => relevantToStage(x.slug, stage));
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
        {note ? (
          <p
            className={`rounded-xl border px-3.5 py-2.5 text-sm ${
              stage.kind === "proposed" || stage.amended
                ? "border-status-amber/30 bg-status-amber/5 text-status-amber"
                : "border-white/10 text-slate-300"
            }`}
          >
            {note}
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
            What the document says
          </h2>
          <p className="text-[15px] leading-relaxed text-slate-200">{summary}</p>
          {event.whyItMatters ? <p className="text-sm leading-relaxed text-slate-400">{event.whyItMatters}</p> : null}
        </section>

        {event.impact ? <WhoItNames impact={event.impact} /> : null}

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

        {explainers.length > 0 ? (
          <section aria-labelledby="context-heading" className="space-y-2">
            <h2 id="context-heading" className="text-base font-semibold text-white">
              Explained
            </h2>
            <ul className="space-y-2">
              {explainers.map((x) => (
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
            {stage.kind === "final_ahead" || stage.kind === "final_date_passed" || stage.keyDate?.date !== event.publishedAt.slice(0, 10) ? (
              <>
                <dt className="text-slate-500">{isScheduled(event) ? "Scheduled for" : "Published"}</dt>
                <dd>{formatDate(event.publishedAt)}</dd>
              </>
            ) : null}
            {event.effectiveAt && stage.keyDate?.date !== event.effectiveAt.slice(0, 10) && stage.kind !== "proposed" ? (
              <>
                <dt className="text-slate-500">Effective date</dt>
                <dd>{formatDate(event.effectiveAt)}, as stated in the document</dd>
              </>
            ) : null}
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
          {limitations.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              {limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2">
            Built from the linked government document by published rules, not by a language model. Information
            about a published document, not legal advice about anyone&rsquo;s case.{" "}
            <Link href="/methodology" className="text-accent hover:underline">
              Methodology
            </Link>{" "}
            ·{" "}
            <Link href={path} className="hover:underline">
              Permalink
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
