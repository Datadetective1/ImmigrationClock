// =============================================================================
// VERIFIED CONNECTIONS — what a change record links onward to
//
// A record page links to a data page, a follow button or a recurring date ONLY
// through the document's own stated scope: the countries and visa categories
// the extracted impact records with a basis other than "inferred". A keyword in
// the title never creates a connection, and nothing here claims that a change
// applies to anyone.
//
// The recurring dates are an editorial mapping (visa → the dates that recur for
// it every year), shown as context and labelled as not set by the document.
// =============================================================================

import type { EventImpact, ImpactedEntity } from "@/domains/graph/impact";
import { ENTITY_BY_ID } from "@/domains/graph/entities";
import { labelForEntity } from "./entity-labels";
import { countries } from "./dataset";
import { KEY_DATES } from "./key-dates";
import { isFollowableId } from "./follows";

/** Key dates that recur for a visa category every year. Editorial; by key-date id. */
export const RECURRING_DATES_FOR_VISA: Record<string, string[]> = {
  "visa:h-1b": ["h1b-registration", "fiscal-year-start"],
  "visa:f-1": ["opt-window"],
  "visa:eb-1": ["visa-bulletin"],
  "visa:eb-2": ["visa-bulletin"],
  "visa:eb-3": ["visa-bulletin"],
  "visa:eb-5": ["visa-bulletin"],
};

export interface Connections {
  /** Data pages for the named countries and visas. */
  data: { href: string; label: string }[];
  /** Followable ids, labelled. */
  follows: { id: string; label: string }[];
  /** Recurring dates for the named visas, with the visa that brought them. */
  dates: { id: string; title: string; forLabel: string }[];
}

const COUNTRY_SLUGS = new Set(countries.map((c) => c.slug));

function dataHref(id: string): string | null {
  if (id.startsWith("country:")) {
    const slug = id.slice("country:".length);
    return COUNTRY_SLUGS.has(slug) ? `/country/${slug}` : null;
  }
  return ENTITY_BY_ID.get(id)?.href ?? null;
}

/** Short visa label for a heading: "H-1B", not "H-1B specialty occupation". */
function shortLabel(id: string): string {
  const name = labelForEntity(id);
  return id.startsWith("visa:") && /^[A-Z0-9]+-[A-Z0-9]+\b/.test(name) ? name.split(" ")[0] : name;
}

/**
 * Connections for one record. `followable` is the set of ids the Following
 * picker offers (ids present in the archive index); a follow button for an id
 * outside it would be dropped the next time the list is read.
 */
export function connectionsFor(impact: EventImpact | undefined, followable: ReadonlySet<string>): Connections {
  if (!impact) return { data: [], follows: [], dates: [] };
  const stated = (xs: ImpactedEntity[]) => xs.filter((x) => x.basis !== "inferred").map((x) => x.entityId);
  const ids = [...new Set([...stated(impact.visaCategories), ...stated(impact.countries)])];

  const data: Connections["data"] = [];
  const seenHref = new Set<string>();
  for (const id of ids) {
    const href = dataHref(id);
    if (!href || seenHref.has(href)) continue;
    seenHref.add(href);
    data.push({ href, label: labelForEntity(id) });
  }

  const follows = ids
    .filter((id) => isFollowableId(id) && followable.has(id))
    .map((id) => ({ id, label: labelForEntity(id) }));

  const dates: Connections["dates"] = [];
  const seenDate = new Set<string>();
  for (const id of ids) {
    for (const dateId of RECURRING_DATES_FOR_VISA[id] ?? []) {
      const d = KEY_DATES.find((k) => k.id === dateId);
      if (!d || seenDate.has(dateId)) continue;
      seenDate.add(dateId);
      dates.push({ id: d.id, title: d.title, forLabel: shortLabel(id) });
    }
  }

  return { data: data.slice(0, 6), follows: follows.slice(0, 6), dates };
}
