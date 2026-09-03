// =============================================================================
// EVENT CARD — the first reader-facing rendering of the knowledge graph
//
// Every guarantee the event model enforces at build time has to survive the trip
// to the screen, because a reader never sees `validateEvent()`. The invariants
// this component is responsible for:
//
//   1. A PROPOSED RULE MUST NOT LOOK LIKE A RULE. The single most damaging thing
//      this page could do is let someone believe an obligation exists when a
//      proposal is merely open for comment. It gets an explicit banner, not a
//      subtle badge.
//
//   2. SCHEDULED IS NOT PUBLISHED. Federal Register documents on public
//      inspection carry a future publication date. The event model marks them
//      `scheduled`; here that must read "scheduled for publication on X", never
//      "published X".
//
//   3. STATED AND INFERRED NEVER SHARE A ROW. What the document says is
//      presented as fact; what we deduced is labelled as ours and visually
//      subordinate. Collapsing them would let an inference wear a fact's
//      clothes — the exact failure the impact model exists to prevent.
//
//   4. LIMITATIONS ARE NOT OPTIONAL. They render with the event, always. They
//      are the caveats that keep a summary honest, not footnotes.
//
//   5. SEVERITY IS NOT ALARM. It is rendered as a neutral typographic weight,
//      never as red/green. The platform reports; it does not editorialize about
//      whether a change is good or bad. Same rule the change feed already
//      follows.
// =============================================================================

import Link from "next/link";
import { formatDate } from "@/lib/format";
import { ENTITY_BY_ID } from "@/domains/graph/entities";
import { impactDisclaimer, type EventImpact, type ImpactedEntity } from "@/domains/graph/impact";
import { isScheduled, type EventClassification, type EventSeverity, type ImmigrationEvent } from "@/domains/graph/events";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { CLASSIFICATION_LABEL, SEVERITY_LABEL, isNotInForce } from "@/lib/event-labels";
import { explainEvent } from "@/domains/graph/explain";
import { labelForEntity } from "@/lib/entity-labels";
import { changePath } from "@/lib/share";

function entityName(entityId: string): string {
  const known = ENTITY_BY_ID.get(entityId as never);
  if (known) return known.name;
  // Unseeded nodes (Policy Manual parts, executive actions) still have to read
  // as English rather than as an internal id.
  const slug = entityId.split(":").slice(1).join(":");
  return slug
    .replace(/-/g, " ")
    .replace(/\buscis pm\b/i, "USCIS Policy Manual")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ImpactGroup({ label, items }: { label: string; items: ImpactedEntity[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="text-xs text-slate-500">{label}</span>
      {items.map((i) => (
        <span
          key={i.entityId}
          className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-xs text-slate-200"
          // The evidence quote is the whole basis for the claim, so it travels
          // with it rather than living in a database somewhere.
          title={i.evidence ? `Source says: “${i.evidence}”` : undefined}
        >
          {entityName(i.entityId)}
        </span>
      ))}
    </div>
  );
}

/**
 * "Who is affected?" — the platform's signature answer.
 *
 * Renders `stated` groups first and separately, then inferred entries under
 * their own heading, then the completeness disclaimer. A blank section is never
 * rendered as silence: `undetermined` explains WHY we cannot say, because an
 * empty list reads as "nobody" and that is a claim we have not earned.
 */
function WhoIsAffected({ impact }: { impact: EventImpact }) {
  const stated = (xs: ImpactedEntity[]) => xs.filter((x) => x.basis !== "inferred");
  const inferred = [
    ...impact.countries,
    ...impact.visaCategories,
    ...impact.states,
    ...impact.employers,
    ...impact.universities,
  ].filter((x) => x.basis === "inferred");

  const hasStated =
    stated(impact.countries).length +
      stated(impact.visaCategories).length +
      stated(impact.states).length +
      stated(impact.employers).length +
      stated(impact.universities).length >
    0;

  return (
    <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Who is affected</h4>

      <div className="mt-2 space-y-2">
        {hasStated ? (
          <>
            <ImpactGroup label="Countries" items={stated(impact.countries)} />
            <ImpactGroup label="Visa categories" items={stated(impact.visaCategories)} />
            <ImpactGroup label="States" items={stated(impact.states)} />
            <ImpactGroup label="Employers" items={stated(impact.employers)} />
            <ImpactGroup label="Schools" items={stated(impact.universities)} />
          </>
        ) : null}

        {impact.undetermined && !hasStated ? (
          <p className="text-sm text-slate-400">{impact.undetermined}</p>
        ) : null}

        {/* Scope delegated elsewhere is a TRUE FACT about the document, not a
            failure to extract. Saying where the list actually lives is the
            useful answer, and it is the clearest case for the knowledge graph. */}
        {impact.scopeDefinedElsewhere ? (
          <p className="text-sm text-slate-300">
            {impact.scopeDefinedElsewhere.note}{" "}
            <span className="text-slate-500">“{impact.scopeDefinedElsewhere.evidence}”</span>
          </p>
        ) : null}

        {inferred.length > 0 ? (
          <div className="border-t border-white/5 pt-2">
            <ImpactGroup label="Referenced elsewhere in the document (our reading, not a stated scope)" items={inferred} />
          </div>
        ) : null}
      </div>

      {/* What the document says may be required — never our recommendation. */}
      {impact.actionRequired ? (
        <div className="mt-3 border-t border-white/5 pt-3">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            What the document says may be required
          </h5>
          <p className="mt-1 text-sm text-slate-200">{impact.actionRequired.summary}</p>
          <p className="mt-1 text-xs italic text-slate-500">“{impact.actionRequired.evidence}”</p>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-slate-500">{impactDisclaimer(impact.completeness)}</p>
    </div>
  );
}

/**
 * "What this means" — derived, never generated.
 *
 * Every sentence restates one verified field, and the field is named beside it,
 * so a reader can audit an explanation the same way they can audit an evidence
 * quote. Nothing here is a model's opinion about a document.
 *
 * Renders nothing when the event carries too little to say anything true. A
 * short explanation is the honest outcome; padding it would be inventing.
 */
function WhatThisMeans({ event }: { event: ImmigrationEvent }) {
  const clauses = explainEvent(event, undefined, labelForEntity);
  if (clauses.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.015] p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">What this means</h4>
      <ul className="mt-1.5 space-y-1.5">
        {clauses.map((c) => (
          <li key={c.basis} className="text-sm leading-relaxed text-slate-300">
            {c.text}{" "}
            <span className="whitespace-nowrap text-[11px] text-slate-600" title="The event field this restates">
              ({c.basis})
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        Derived from this event&rsquo;s own recorded fields — not written by a model, and not an
        interpretation of anyone&rsquo;s case.
      </p>
    </div>
  );
}

export function EventCard({ event }: { event: ImmigrationEvent }) {
  const source = SOURCE_BY_KEY[event.sourceKey];
  const isProposal = isNotInForce(event.classification);

  return (
    <article className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span
          className={
            event.severity === "routine"
              ? "text-slate-500"
              : "font-semibold text-slate-200"
          }
        >
          {SEVERITY_LABEL[event.severity]}
        </span>
        <span className="text-slate-600" aria-hidden>
          ·
        </span>
        <span className={isProposal ? "font-semibold text-status-amber" : "text-slate-400"}>
          {CLASSIFICATION_LABEL[event.classification]}
        </span>
        {source ? (
          <>
            <span className="text-slate-600" aria-hidden>
              ·
            </span>
            <span className="text-slate-400">{source.name}</span>
          </>
        ) : null}
      </div>

      {/* Every change has its own address now (see src/lib/share.ts), so the
          title is the link to it. Same weight and colour as before; the hover
          is the only hint, which is how every other card title on the site
          behaves. */}
      <h3 className="mt-2 text-base font-semibold leading-snug text-white sm:text-lg">
        <Link href={changePath(event)} className="transition-colors hover:text-accent-soft">
          {event.title}
        </Link>
      </h3>

      {/* INVARIANT 1. A proposal is not a rule, and the difference is the whole
          question for a reader wondering whether they have to do something. */}
      {isProposal ? (
        <p className="mt-2 rounded-lg border border-status-amber/30 bg-status-amber/5 px-3 py-2 text-xs text-status-amber">
          This is a proposal open for comment, not a rule in force. It may never be finalised, and it
          creates no obligation today.
        </p>
      ) : null}

      <p className="mt-2 text-sm leading-relaxed text-slate-300">{event.summary}</p>

      {/* A reviewed, human- or model-drafted explanation, when one exists. The
          field is currently unpopulated and gated by reviewStatus; the derived
          explanation below covers every event in the meantime. */}
      {event.whyItMatters ? (
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{event.whyItMatters}</p>
      ) : null}

      <WhatThisMeans event={event} />

      {event.impact ? <WhoIsAffected impact={event.impact} /> : null}

      {/* INVARIANT 4. Limitations always render. */}
      {event.limitations && event.limitations.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {event.limitations.map((l, i) => (
            <li key={i} className="text-xs leading-relaxed text-slate-500">
              {l}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/5 pt-3 text-xs text-slate-500">
        {/* INVARIANT 2. Scheduled is not published. Derived from the date rather
            than the stored flag, so a document does not go on announcing itself
            as forthcoming after the day it was published. */}
        <span>
          {isScheduled(event)
            ? `Scheduled for publication on ${formatDate(event.publishedAt)}`
            : `Published ${formatDate(event.publishedAt)}`}
        </span>
        {event.effectiveAt ? <span>Effective {formatDate(event.effectiveAt)}</span> : null}
        {event.dataThrough ? <span>Data through {formatDate(event.dataThrough)}</span> : null}
        <span>Source checked {formatDate(event.lastVerifiedAt)}</span>
        <a
          href={event.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block py-1.5 font-medium text-accent underline-offset-2 hover:underline"
        >
          Read the original
        </a>
        <Link href="/methodology" className="text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline">
          Methodology
        </Link>
        <Link
          href={changePath(event)}
          className="text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline"
        >
          Permalink
        </Link>
      </div>
    </article>
  );
}
