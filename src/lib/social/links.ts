// =============================================================================
// DEEP LINKS — every post lands somewhere specific
//
// A social post that links to the homepage wastes the click. Someone who taps a
// post about an H-1B fee rule wants the H-1B page, not a dashboard they then
// have to navigate. So the homepage is not a permitted destination for any post,
// and resolveDeepLink() returns null rather than falling back to "/" when it
// cannot find a better answer — a candidate with no destination is not
// publishable, which is the correct outcome, not a reason to relax the rule.
//
// Routes here are checked against the real app router by tests/social-links,
// so a page rename breaks the test rather than shipping a 404 to a reader.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import { ENTITY_BY_ID } from "@/domains/graph/entities";
import { COUNTRY_BY_SLUG } from "@/domains/graph/countries";

export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://immigrationclock.com";

/** Absolute URL for a site-relative path. */
export function absolute(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The homepage is never a valid post destination. */
const FORBIDDEN_DESTINATIONS = new Set(["/", ""]);

/**
 * Where should a post about this event send someone?
 *
 * Preference order, most specific first. Entity pages beat topic hubs, topic
 * hubs beat the change feed, and the change feed beats nothing — but "nothing"
 * is still a real answer when the event links to no entity we have a page for.
 */
export function resolveDeepLink(event: IndexedEvent): string | null {
  const ids = event.entityIds ?? [];

  // 1. A country the archive linked explicitly and we have a page for.
  for (const id of ids) {
    if (!id.startsWith("country:")) continue;
    const slug = id.slice("country:".length);
    if (COUNTRY_BY_SLUG.has(slug)) return `/country/${slug}`;
  }

  // 2. A visa or topic entity that carries its own href.
  for (const prefix of ["visa:", "topic:"]) {
    for (const id of ids) {
      if (!id.startsWith(prefix)) continue;
      const href = ENTITY_BY_ID.get(id)?.href;
      if (href && !FORBIDDEN_DESTINATIONS.has(href)) return href;
    }
  }

  // 3. Agency-shaped fallbacks — pages that are genuinely about that agency's
  //    activity rather than a generic list.
  const agencyPages: Record<string, string> = {
    "agency:cbp": "/border/encounters",
    "agency:ice": "/immigration/enforcement-trends",
    "agency:eoir": "/immigration/enforcement-trends",
    "agency:dol": "/h1b/employers",
  };
  for (const id of ids) {
    const page = agencyPages[id];
    if (page) return page;
  }

  // 4. The change feed, filtered to this event by a text query.
  //
  // `?q=` and `?entity=` are the ONLY parameters EventExplorer reads (see its
  // deep-link effect). An earlier version of this function emitted
  // `?event=<id>`, which looks purposeful and does nothing: the reader lands on
  // an unfiltered archive and has to find the item themselves. That is the exact
  // failure the explorer's own comment calls "a link that pretends to work".
  //
  // `?entity=` is not used here because it is too coarse for this job — linking
  // an H-1B fee rule to `agency:uscis` returns every USCIS event we hold. The
  // specific entity cases are already handled in steps 1–3 above; what is left
  // needs to point at one document.
  return `/what-changed?q=${encodeURIComponent(queryFor(event.title))}`;
}

/**
 * A search string that finds this event and few others.
 *
 * EventExplorer requires EVERY whitespace-separated term to appear in the
 * title, summary or source key, so terms drawn from the title always match the
 * event they came from. Four distinctive words is enough to be near-unique
 * without being so specific that a later title correction breaks the link.
 */
export function queryFor(title: string): string {
  const STOP = new Set([
    "the", "and", "for", "with", "from", "that", "this", "into", "under", "upon",
    "policy", "alert", "notice", "rule", "final", "proposed", "certain", "other",
    "their", "when", "issuing", "activities", "revision", "information",
  ]);
  // Deduplicated: a title like "Evidence, Requests for Evidence, and Notices of
  // Intent to Deny" would otherwise yield "evidence evidence requests notices",
  // which wastes a term and looks like a bug to anyone reading the URL.
  const words = [
    ...new Set(
      title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP.has(w))
    ),
  ];

  // Longest-first is a cheap proxy for distinctiveness, then restored to the
  // title's own order so the query reads like a phrase rather than a word bag.
  const picked = [...words]
    .sort((a, b) => b.length - a.length)
    .slice(0, 4)
    .sort((a, b) => words.indexOf(a) - words.indexOf(b));

  return (picked.length ? picked : words.slice(0, 4)).join(" ").slice(0, 100);
}

/**
 * Standing assets — the durable pages the evening slot draws on.
 *
 * These are not events. They are the things ImmigrationClock knows that stay
 * true: datasets, deadline references, hubs. Each carries the description the
 * copy engine is allowed to work from, so a post about the H-1B data cannot
 * invent what the H-1B data says.
 */
export interface StandingAsset {
  id: string;
  label: string;
  path: string;
  /** What this page actually contains. The engine's entire knowledge of it. */
  description: string;
  /** Topical tags used to keep the evening rotation varied. */
  tags: string[];
}

export const STANDING_ASSETS: StandingAsset[] = [
  {
    id: "key-dates",
    label: "Key immigration dates",
    path: "/key-dates",
    description:
      "A reference page listing recurring U.S. immigration deadlines with a live countdown to each: the H-1B electronic registration window, the federal tax filing deadline, the Diversity Visa lottery, the October 1 fiscal-year start, the monthly Visa Bulletin, and the F-1 OPT application window. Each entry links to the official government source.",
    tags: ["deadlines", "reference"],
  },
  {
    id: "h1b-top-sponsors",
    label: "H-1B top sponsors",
    path: "/h1b/top-sponsors",
    // Corrected 2026-08-09: this page does NOT read the Department of Labor's
    // disclosure data, and it is not the USCIS directory either. It ranks a
    // curated set of large sponsors anchored to published fiscal-year rankings,
    // and labels its own totals `modeled` — which is exactly what a post about
    // it has to convey. The reported per-employer record lives at
    // /h1b/employers.
    description:
      "A ranked view of a curated set of large H-1B sponsors, ordered by approvals and anchored to published fiscal-year rankings. It shows offered wages and approval rates alongside volume, and labels its totals as modeled rather than as an official agency count.",
    tags: ["h1b", "employers", "data"],
  },
  {
    id: "h1b-employers",
    label: "H-1B employer search",
    path: "/h1b/employers",
    // Corrected 2026-08-09: the directory is built from the USCIS H-1B Employer
    // Data Hub, not from DOL disclosure data. The distinction is the whole
    // reason this page's figures are reported and /h1b/top-sponsors' are not.
    description:
      "A searchable directory of H-1B sponsoring employers built from the USCIS H-1B Employer Data Hub — the agency's own per-employer record of petition approvals and denials, searchable by company name.",
    tags: ["h1b", "employers", "data"],
  },
  {
    id: "layoffs",
    label: "WARN layoff notices",
    path: "/layoffs",
    description:
      "State-filed WARN Act layoff notices, aggregated. WARN requires covered employers to give advance notice of mass layoffs and plant closings, and each notice names the employer, location and number of affected workers.",
    tags: ["layoffs", "warn", "data"],
  },
  {
    id: "layoffs-vs-h1b",
    label: "Layoffs vs H-1B sponsorship",
    path: "/layoffs-vs-h1b",
    description:
      "An overlay of state-filed WARN layoff notices against H-1B sponsorship data, showing where employers filing layoff notices also appear as visa sponsors.",
    tags: ["layoffs", "h1b", "data"],
  },
  {
    id: "border-encounters",
    label: "Border encounters",
    path: "/border/encounters",
    description:
      "U.S. Customs and Border Protection nationwide encounter counts, broken out by sector, month and demographic, from CBP's published data.",
    tags: ["border", "data"],
  },
  {
    id: "enforcement-trends",
    label: "Enforcement trends",
    path: "/immigration/enforcement-trends",
    description:
      "Immigration enforcement activity over time — arrests, detention population and removals — drawn from published federal data.",
    tags: ["enforcement", "data"],
  },
  {
    id: "timeline",
    label: "Policy timeline",
    path: "/timeline",
    description:
      "A chronological record of U.S. immigration policy changes, each entry linking to the government document that made it.",
    tags: ["timeline", "reference"],
  },
  {
    id: "migration-map",
    label: "Migration map",
    path: "/migration-map",
    description:
      "A geographic view of migration and immigration activity, letting a country or a U.S. state be read as a place rather than a row in a table. Built from the same recorded events and datasets as the rest of the site, so each area links back to the changes and figures behind it.",
    tags: ["map", "data"],
  },
  {
    id: "what-changed",
    label: "What changed",
    path: "/what-changed",
    description:
      "A searchable, filterable feed of every immigration change ImmigrationClock has recorded, with source links and severity, filterable by agency, classification, entity and date.",
    tags: ["archive", "reference"],
  },
  {
    id: "sources",
    label: "Sources",
    path: "/sources",
    description:
      "The full list of government sources ImmigrationClock monitors, what each one publishes, and how often it is checked.",
    tags: ["methodology", "reference"],
  },
  {
    id: "methodology",
    label: "Methodology",
    path: "/methodology",
    description:
      "How ImmigrationClock collects, classifies and verifies immigration data, including what it deliberately does not do: no individual immigrant profiles, no tracking, no identifying personal data.",
    tags: ["methodology", "reference"],
  },
  {
    id: "work-visas",
    label: "Work visas",
    path: "/work-visas",
    description:
      "An overview of the U.S. work visa categories and what separates them: which are employer-sponsored, which are capped, which lead toward permanent residence, and which are temporary by design. A reference for people trying to work out which route a job offer actually falls under.",
    tags: ["visas", "reference"],
  },
  {
    id: "f1-student-visas",
    label: "F-1 student visas",
    path: "/visa/f1-student-visas",
    description:
      "F-1 academic student visa data and reference material, covering issuance, OPT and the schools and countries involved.",
    tags: ["students", "visas", "data"],
  },
  {
    id: "following",
    label: "Follow a country or visa",
    path: "/following",
    description:
      "A page where a reader chooses countries, visas, agencies or topics to follow, and ImmigrationClock organizes matching changes for them. Choices are stored in the reader's own browser and never sent to a server.",
    tags: ["product", "privacy"],
  },
];

export const ASSET_BY_ID = new Map(STANDING_ASSETS.map((a) => [a.id, a]));

/** Guard used by the validator: is this a destination we are willing to publish? */
export function isPublishableDestination(path: string): boolean {
  if (FORBIDDEN_DESTINATIONS.has(path)) return false;
  return path.startsWith("/");
}
