// =============================================================================
// STORY HELPERS — what the story pages, the sitemap and the cards share
//
// A recorded change, an explainer and a data signal each have a page of their
// own now, and those pages, the Open Graph specs and the sitemap all need the
// same handful of answers: what is this record's short title, what is its
// public key, which other records is it related to. Those answers live here
// once, as pure functions over the records, so the card and the page cannot
// describe the same change two different ways.
//
// Pure on purpose: no data imports. The modules that hold the archive import
// this one, not the other way round, which keeps the client-safe pieces small.
// =============================================================================

import { sortEvents, type ImmigrationEvent } from "@/domains/graph/events";
import { shortHash } from "@/lib/share";
import type { ExplainerGroup } from "@/lib/editorial/explainers";
import type { SignalGroup } from "@/lib/editorial/signals";
import { NAV, FOOTER_SECTIONS } from "@/lib/site";

/** "Policy alert: X" is how USCIS titles an alert; the page already says USCIS. */
export function stripAlertPrefix(title: string): string {
  return title.replace(/^Policy alert:\s*/i, "").trim();
}

/** The title a story page and its card lead with. Never empty. */
export function storyTitle(e: Pick<ImmigrationEvent, "title">): string {
  return stripAlertPrefix(e.title) || e.title;
}

/**
 * The public key for a change, as the social publisher and the analytics
 * events refer to it: "change:<six-char hash>". Derived from the id, like the
 * slug, so it survives a title correction.
 */
export function storyKey(e: Pick<ImmigrationEvent, "id">): string {
  return `change:${shortHash(e.id)}`;
}

/** A meta description: the summary, cut at a word boundary. */
export function storyDescription(e: Pick<ImmigrationEvent, "summary">, max = 200): string {
  const s = e.summary.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > max * 0.5 ? cut.slice(0, boundary) : cut).replace(/[\s,;:]+$/, "")}…`;
}

/**
 * The first six words of a title, normalised. Two documents that share one are
 * almost always the same rule at two stages — a proposal and its final rule,
 * an alert and its correction — which is the relation a reader wants.
 */
export function titleStem(title: string): string {
  return stripAlertPrefix(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(" ");
}

/**
 * Entity ids specific enough to relate two changes. Agencies and topics are
 * excluded: every USCIS document is linked to USCIS, and that is not a
 * relationship worth five links.
 */
const DISTINCTIVE_ENTITY = /^(visa|country|policy):/;

export function distinctiveEntityIds(e: Pick<ImmigrationEvent, "entities">): string[] {
  return e.entities.map((l) => l.entityId as string).filter((id) => DISTINCTIVE_ENTITY.test(id));
}

/**
 * Up to `limit` other non-routine changes related to this one: same title stem
 * first, then a shared distinctive entity, each group newest first.
 */
export function relatedChanges(
  event: ImmigrationEvent,
  all: ImmigrationEvent[],
  limit = 5
): ImmigrationEvent[] {
  const stem = titleStem(event.title);
  const ids = new Set(distinctiveEntityIds(event));
  const others = all.filter((o) => o.id !== event.id && o.severity !== "routine");
  const byStem = others.filter((o) => stem && titleStem(o.title) === stem);
  const byEntity = others.filter(
    (o) => !byStem.includes(o) && o.entities.some((l) => ids.has(l.entityId as string))
  );
  return [...sortEvents(byStem), ...sortEvents(byEntity)].slice(0, limit);
}

/** Why a related change was offered — the analytics `relation` for the link. */
export function relationTo(
  event: Pick<ImmigrationEvent, "title">,
  other: Pick<ImmigrationEvent, "title">
): "title" | "entity" {
  return titleStem(event.title) === titleStem(other.title) ? "title" : "entity";
}

/**
 * Non-routine changes whose title or summary carries one of an explainer's
 * keywords, newest first. The same match explainersFor() makes, in reverse.
 */
export function changesForKeywords(
  keywords: string[],
  all: ImmigrationEvent[],
  limit = 5
): ImmigrationEvent[] {
  const terms = keywords.map((k) => k.toLowerCase()).filter(Boolean);
  if (terms.length === 0) return [];
  const hits = all.filter((e) => {
    if (e.severity === "routine") return false;
    const hay = `${e.title} ${e.summary}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
  return sortEvents(hits).slice(0, limit);
}

// -----------------------------------------------------------------------------
// LABELS
// -----------------------------------------------------------------------------

export const EXPLAINER_GROUP_LABEL: Record<ExplainerGroup, string> = {
  rulemaking: "Rulemaking",
  "agency-process": "Agency process",
  courts: "Courts",
  "work-visas": "Work visas",
  students: "Students",
  "green-cards": "Green cards",
  citizenship: "Citizenship",
  "enforcement-data": "Enforcement data",
  "workforce-data": "Workforce data",
  "how-we-work": "How we work",
};

export const SIGNAL_GROUP_LABEL: Record<SignalGroup, string> = {
  "work-visas": "Work visas",
  workforce: "Workforce",
  border: "Border",
  rulemaking: "Rulemaking",
  deadlines: "Deadlines",
};

/**
 * A reader-facing name for a site path, from the navigation the site already
 * publishes, so a "related on ImmigrationClock" link reads "Key dates &
 * deadlines" rather than "/key-dates".
 */
const PATH_LABELS: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const section of FOOTER_SECTIONS) {
    for (const l of section.links) m.set(l.href.replace(/#.*$/, ""), l.label);
  }
  for (const item of NAV) {
    if (item.href) m.set(item.href, item.label);
    for (const c of item.children ?? []) m.set(c.href, c.label);
  }
  // Names that read better on a related-links list than the nav's own.
  m.set("/what-changed", "What changed");
  m.set("/methodology", "Methodology");
  m.set("/data", "Data & freshness");
  m.set("/developers", "Free WARN API");
  m.set("/state/CA", "State pages");
  m.set("/country/india", "Country pages");
  return m;
})();

export function pathLabel(path: string): string {
  const known = PATH_LABELS.get(path);
  if (known) return known;
  const last = path.split("/").filter(Boolean).pop() ?? path;
  return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
