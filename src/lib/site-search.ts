// =============================================================================
// GUIDE SEARCH — deadlines and explainers, beside the entity search
//
// search() in lib/data answers "who and where": employers, states, countries,
// visas, job titles. A reader also types "OPT", "tax deadline" or "visa
// bulletin" — a deadline or a concept, which lived only on /key-dates and
// /explained. This puts both behind the same box.
//
// Both catalogs are a few kilobytes and hand-written, so they are safe in the
// search box's client bundle on every page. Recorded CHANGES are not searched
// here: the archive index is hundreds of kilobytes, so the box hands the query
// to /what-changed and /search, which already ship it.
// =============================================================================

import { EXPLAINERS } from "./editorial/explainers";
import { KEY_DATES } from "./key-dates";

export interface GuideResult {
  type: "date" | "explainer";
  label: string;
  sublabel: string;
  href: string;
}

/** Every term must appear (substring, punctuation-blind), as in the archive search. */
function matches(hay: string, query: string): boolean {
  const text = hay.toLowerCase();
  const squashed = text.replace(/[^a-z0-9]+/g, "");
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return false;
  return terms.every((term) => {
    if (text.includes(term)) return true;
    const sq = term.replace(/[^a-z0-9]+/g, "");
    return sq.length > 1 && squashed.includes(sq);
  });
}

/** Key dates and explainers matching a query, dates first. */
export function searchGuides(query: string, limit = 6): GuideResult[] {
  if (query.trim().length < 2) return [];
  const dates: GuideResult[] = KEY_DATES.filter((d) =>
    matches(`${d.title} ${d.detail} ${d.category}`, query)
  ).map((d) => ({
    type: "date",
    label: d.title,
    sublabel: d.cadence ?? d.sourceName,
    href: `/key-dates#${d.id}`,
  }));
  const explainers: GuideResult[] = EXPLAINERS.filter((e) =>
    matches(`${e.title} ${e.kicker} ${e.keywords.join(" ").replace(/\*/g, "")}`, query)
  ).map((e) => ({
    type: "explainer",
    label: e.title,
    sublabel: e.kicker,
    href: `/explained/${e.slug}`,
  }));
  return [...dates, ...explainers].slice(0, limit);
}
