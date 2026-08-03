// =============================================================================
// ENTITY CHANGES — "What changed that may affect this country / visa / agency?"
//
// Country and visa pages were pure statistics: issuance trends, encounter
// counts, a chart. They showed ZERO of the recorded policy changes, which
// meant the page a reader most naturally lands on when asking "does this affect
// me" was the one page that could not answer.
//
// THE HARD PART IS NOT SHOWING EVENTS. IT IS THE SPARSE CASE.
// -----------------------------------------------------------
// Coverage is wildly uneven, and honestly so: 253 events touch USCIS, and none
// name India. That asymmetry is not a bug to hide — it falls out of a
// deliberate decision in extract-impact.ts, where a country is only extracted
// from a sentence that explicitly DESIGNATES countries, because a rule's
// background prose names countries constantly and a looser filter once
// concluded a visa-bond rule covered Canadians.
//
// So a thin page must say WHY it is thin. "No changes found" reads as "nothing
// has happened to Indian nationals", which is false and is the single most
// damaging thing a page like this could imply. The empty state below explains
// the mechanism and routes to the archive instead.
//
// STATED AND MENTIONED NEVER SHARE A LIST. What a document says about its own
// scope is a fact; what we matched from its text is our inference. Collapsing
// them would let an inference wear a fact's clothes — the exact failure the
// impact model exists to prevent.
// =============================================================================

import Link from "next/link";
import { EVENTS, eventsAffecting, eventsForEntityId } from "@/lib/event-store";
import { RecentChanges } from "./RecentChanges";
import { labelForEntity } from "@/lib/entity-labels";
import type { EntityId } from "@/domains/graph/entities";

/** How many of each group to render before linking out. */
const SHOWN = 5;

/**
 * The busiest agencies and topics in the archive, computed once.
 *
 * These are the routes that actually pay off when a country or visa page is
 * thin — most immigration rules are filed under an agency and a topic even when
 * they name nobody. Counted from the store rather than hardcoded, so the list
 * cannot drift away from what the archive holds.
 */
const RELATED = (() => {
  const counts = new Map<string, number>();
  for (const e of EVENTS) {
    for (const l of e.entities) {
      if (l.entityId.startsWith("agency:") || l.entityId.startsWith("topic:")) {
        counts.set(l.entityId, (counts.get(l.entityId) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([entityId, count]) => ({ entityId, count, label: labelForEntity(entityId) }));
})();

export function EntityChanges({
  entityId,
  label,
  kind,
}: {
  entityId: string;
  label: string;
  /** Used only for wording — "rules naming this country" reads wrong for a visa. */
  kind: "country" | "visa" | "agency" | "topic";
}) {
  const id = entityId as EntityId;
  const stated = eventsAffecting(id);
  const statedIds = new Set(stated.map((e) => e.id));
  const mentioned = eventsForEntityId(id).filter((e) => !statedIds.has(e.id));

  const noun =
    kind === "country" ? "this country" : kind === "visa" ? "this visa category" : `${label}`;

  return (
    <section id="changes" className="space-y-5">
      <div>
        <div className="eyebrow mb-1">Policy changes</div>
        <h2 className="section-title">What changed that may affect {label}</h2>
      </div>

      {stated.length > 0 ? (
        <RecentChanges
          events={stated.slice(0, SHOWN)}
          heading={`Documents that name ${noun} in their scope`}
          intro={`The government document itself names ${noun} when describing who it applies to. This is the strongest signal we have that a change is relevant.`}
          href={`/what-changed?entity=${encodeURIComponent(entityId)}`}
          linkLabel={
            stated.length > SHOWN ? `See all ${stated.length}` : "Search the full archive"
          }
        />
      ) : null}

      {mentioned.length > 0 ? (
        <div>
          <RecentChanges
            events={mentioned.slice(0, SHOWN)}
            heading={`Documents that mention ${label}`}
            intro={`${label} appears in the text of these documents, but they do not name it when defining who they apply to. That is OUR match, not the publisher's statement of scope — read the original before relying on it.`}
            href={`/what-changed?entity=${encodeURIComponent(entityId)}`}
            linkLabel={
              mentioned.length > SHOWN ? `See all ${mentioned.length}` : "Search the full archive"
            }
          />
        </div>
      ) : null}

      {/* The sparse case, explained rather than left blank. */}
      {stated.length + mentioned.length < 3 ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-white">
            Why so few changes are listed here
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            This is a statement about what we can <em>prove</em>, not about what has happened. Most
            U.S. immigration rules do not name a country or visa category when they describe who they
            cover — they apply by status, category, or circumstance. We only attach a change to{" "}
            {noun} when the document itself names it, because the alternative is telling someone a
            rule affects them when it does not.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            Changes that affect {label} without naming it are still in the archive. The{" "}
            <Link href="/what-changed" className="link-accent">
              full archive of {EVENTS.length.toLocaleString()} changes
            </Link>{" "}
            is searchable, and these are usually the faster route:
          </p>

          {/* The promised "faster route", actually present. Each link applies a
              real entity filter on /what-changed — see the deep-link handling in
              EventExplorer. Offering these as bare words would be worse than
              offering nothing. */}
          <div className="mt-3 flex flex-wrap gap-2">
            {RELATED.map((r) => (
              <Link
                key={r.entityId}
                href={`/what-changed?entity=${encodeURIComponent(r.entityId)}`}
                className="rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-accent/50 hover:bg-accent/10 hover:text-white"
              >
                {r.label}
                <span className="ml-1.5 tabular-nums text-slate-500">{r.count}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* Next actions — a page that answers a question should say what to do next. */}
      <div className="flex flex-wrap gap-2.5">
        <Link
          href="/what-changed#follow"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft"
        >
          Follow {label}
        </Link>
        <Link
          href="/what-changed"
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-accent/50 hover:bg-accent/10"
        >
          Search all changes
        </Link>
        <Link
          href="/pulse#subscribe"
          className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-accent/50 hover:bg-accent/10"
        >
          Get the weekly email
        </Link>
      </div>
    </section>
  );
}
