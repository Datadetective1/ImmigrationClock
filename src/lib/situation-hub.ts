// =============================================================================
// SITUATION HUB DATA — what /for-you shows for each situation, built at render
//
// Server-only: it reads the full event store, which never ships to a browser.
// Every list here comes from a relationship already recorded somewhere else
// (see situations.ts); this file only gathers them.
// =============================================================================

import { EVENTS, eventsAffecting } from "./event-store";
import { CLASSIFICATION_LABEL, isNotInForce } from "./event-labels";
import { SOURCE_BY_KEY } from "./sources";
import { changePath } from "./share";
import { keyDatesForPersona } from "./key-dates";
import { EXPLAINER_BY_SLUG } from "./editorial/explainers";
import { labelForEntity } from "./entity-labels";
import { personaSummaries, type RelevancePoint } from "./relevance";
import { CATEGORY_META } from "./partners";
import { SITUATIONS, type Situation } from "./situations";
import type { EntityId } from "@/domains/graph/entities";

/** Changes listed per situation; the rest are on /what-changed. */
const CHANGES_SHOWN = 4;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface HubChange {
  id: string;
  title: string;
  href: string;
  publishedAt: string;
  status: string;
  notInForce: boolean;
  sourceName: string;
  sourceUrl: string;
}

export interface HubSituation {
  key: Situation["key"];
  label: string;
  blurb: string;
  points: RelevancePoint[];
  changes: HubChange[];
  changeTotal: number;
  /** /what-changed filtered to the first change id — the full list. */
  archiveHref: string;
  archiveLabel: string;
  /** The visas the changes are about, as a heading says them: "H-1B, H-2A or H-2B". */
  changeLabels: string;
  follows: { id: string; label: string }[];
  dates: { id: string; title: string; when: string; sourceName: string }[];
  explainers: { slug: string; title: string }[];
  dataLinks: { href: string; label: string }[];
  resource: { href: string; label: string; category: string };
}

/** Changes whose document names any of `ids` among those affected, newest first. */
export function situationChanges(ids: readonly string[]) {
  const wanted = new Set<string>();
  for (const id of ids) for (const e of eventsAffecting(id as EntityId)) wanted.add(e.id);
  return EVENTS.filter((e) => wanted.has(e.id));
}

function when(d: { month?: number; day?: number; approx?: boolean; cadence?: string }): string {
  if (d.month && d.day) return `${d.approx ? "Around " : ""}${MONTHS[d.month - 1]} ${d.day} each year`;
  return d.cadence ?? "";
}

export function buildSituationHub(): HubSituation[] {
  const persona = new Map(personaSummaries().map((p) => [p.key, p]));
  return SITUATIONS.map((s) => {
    const changes = situationChanges(s.changeIds);
    return {
      key: s.key,
      label: s.label,
      blurb: s.blurb,
      points: persona.get(s.key)?.points.slice(0, 3) ?? [],
      changes: changes.slice(0, CHANGES_SHOWN).map((e) => ({
        id: e.id,
        title: e.title,
        href: changePath(e),
        publishedAt: e.publishedAt,
        status: CLASSIFICATION_LABEL[e.classification],
        notInForce: isNotInForce(e.classification),
        sourceName: SOURCE_BY_KEY[e.sourceKey]?.name ?? "Official source",
        sourceUrl: e.sourceUrl,
      })),
      changeTotal: changes.length,
      archiveHref: `/what-changed?entity=${encodeURIComponent(s.changeIds[0])}`,
      archiveLabel: labelForEntity(s.changeIds[0]),
      changeLabels: s.changeLabel,
      follows: s.followIds.map((id) => ({ id, label: labelForEntity(id) })),
      dates: s.datesPersona
        ? keyDatesForPersona(s.datesPersona).map((d) => ({
            id: d.id,
            title: d.title,
            when: when(d),
            sourceName: d.sourceName,
          }))
        : [],
      explainers: s.explainerSlugs
        .map((slug) => EXPLAINER_BY_SLUG.get(slug))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
        .map((e) => ({ slug: e.slug, title: e.title })),
      dataLinks: s.dataLinks,
      resource: {
        href: `/resources?need=${s.resourceNeed}`,
        label: s.resourceLabel,
        category: CATEGORY_META[s.resourceNeed].label,
      },
    };
  });
}
