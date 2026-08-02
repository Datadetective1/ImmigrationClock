// =============================================================================
// KNOWLEDGE GRAPH — ENTITIES (the nodes)
//
// Founder Directive Part 6: "The true product is not pages. The true product is
// the network of relationships between immigration entities." Part 3 names the
// core entities; this module is the canonical list.
//
// DESIGN RULE THAT MATTERS MOST HERE
// ----------------------------------
// An entity is identified by a STABLE, SOURCE-INDEPENDENT id. `country:india`
// means the same node whether it was mentioned by a Federal Register rule, a
// State Department visa table, or a court decision. Without that, the graph
// silently forks into one disconnected island per source, and the platform
// becomes a set of dashboards again — the exact outcome the Directive rejects.
//
// Entity ids are therefore:
//   • lowercase `type:slug`
//   • derived from the real-world thing, never from a source's internal key
//   • stable across ingestions; a re-scrape must produce the same id
// =============================================================================

/**
 * Every kind of thing the platform can know about.
 *
 * This union is deliberately broader than what is ingested today. Declaring the
 * full shape now is what lets an adapter for courts, Congress, or PERM plug in
 * later without a migration — the Directive's instruction that "every
 * architecture decision should make these future stages easier, not harder".
 * Coverage per type is tracked in ENTITY_COVERAGE below, honestly.
 */
export type EntityType =
  | "agency" // USCIS, CBP, ICE, DOS, DOL, EOIR…
  | "visa" // H-1B, F-1, EB-2, J-1…
  | "country" // India, Mexico, Nigeria…
  | "state" // California, Texas…
  | "employer" // Amazon, Infosys…
  | "industry" // NAICS-level sector
  | "university" // SEVP-certified schools (future)
  | "law" // INA, IIRIRA…
  | "regulation" // 8 CFR parts
  | "executive_action" // Executive Orders, Presidential Proclamations
  | "court_case" // Federal court decisions
  | "legislation" // Bills and public laws
  | "policy" // Named policy or program (DACA, TPS designations…)
  | "dataset" // A published dataset we track
  | "topic" // Editorial grouping: "H-1B", "border", "students"
  | "person"; // Officials in their official capacity ONLY — see below

/**
 * `person` exists because the Directive names it, but it is tightly constrained:
 * ONLY public officials acting in an official capacity (an agency director named
 * in a rule, a judge who authored a decision). ImmigrationClock never creates a
 * node for a private individual, an immigrant, a petitioner, or a beneficiary.
 * Directive Part 4 and the platform's own methodology both forbid it.
 */
export const PERSON_ENTITY_RULE =
  "Public officials in their official capacity only. Never a private individual, immigrant, petitioner, or beneficiary.";

export interface EntityRef {
  type: EntityType;
  /** Stable slug within the type, e.g. "h-1b", "india", "uscis". */
  slug: string;
}

/** Canonical node id: `type:slug`. The graph's primary key. */
export type EntityId = string;

export function entityId(type: EntityType, slug: string): EntityId {
  return `${type}:${normalizeSlug(slug)}`;
}

export function parseEntityId(id: EntityId): EntityRef | null {
  const idx = id.indexOf(":");
  if (idx <= 0) return null;
  const type = id.slice(0, idx) as EntityType;
  const slug = id.slice(idx + 1);
  if (!ENTITY_TYPES.includes(type) || !slug) return null;
  return { type, slug };
}

export const ENTITY_TYPES: EntityType[] = [
  "agency",
  "visa",
  "country",
  "state",
  "employer",
  "industry",
  "university",
  "law",
  "regulation",
  "executive_action",
  "court_case",
  "legislation",
  "policy",
  "dataset",
  "topic",
  "person",
];

/**
 * Slug normalization. Must be deterministic and idempotent: running it twice, or
 * running it on output from a different adapter, has to produce the same string,
 * or the same real-world entity ends up as two nodes.
 */
export function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics so "méxico" === "mexico"
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface Entity {
  id: EntityId;
  type: EntityType;
  slug: string;
  /** Display name, e.g. "H-1B specialty occupation". */
  name: string;
  /** Short neutral description. No advocacy, no advice. */
  summary?: string;
  /**
   * Alternate names this entity is known by. Used to resolve mentions in source
   * text without creating duplicate nodes: "DHS", "Homeland Security", and
   * "Department of Homeland Security" must all resolve to `agency:dhs`.
   */
  aliases?: string[];
  /** Canonical page on this site, when one exists. */
  href?: string;
  /** Official government URL for this entity, when one exists. */
  officialUrl?: string;
}

// ---------------------------------------------------------------------------
// Seed entities — agencies, visa categories, and topics.
//
// These are the nodes that source adapters resolve mentions against, so they
// have to exist before any event can be linked. Countries, states, employers,
// and datasets are projected from the existing datasets rather than hand-listed
// (see resolveEntity callers), because there are thousands of them.
// ---------------------------------------------------------------------------

function agency(slug: string, name: string, aliases: string[], officialUrl: string): Entity {
  return { id: entityId("agency", slug), type: "agency", slug, name, aliases, officialUrl };
}

export const AGENCIES: Entity[] = [
  agency("uscis", "U.S. Citizenship and Immigration Services", ["USCIS", "Citizenship and Immigration Services"], "https://www.uscis.gov"),
  agency("dhs", "Department of Homeland Security", ["DHS", "Homeland Security"], "https://www.dhs.gov"),
  agency("cbp", "U.S. Customs and Border Protection", ["CBP", "Customs and Border Protection"], "https://www.cbp.gov"),
  agency("ice", "U.S. Immigration and Customs Enforcement", ["ICE", "Immigration and Customs Enforcement"], "https://www.ice.gov"),
  agency("dos", "U.S. Department of State", ["State Department", "DOS", "Bureau of Consular Affairs"], "https://travel.state.gov"),
  agency("dol", "U.S. Department of Labor", ["DOL", "Labor Department", "Employment and Training Administration", "OFLC"], "https://www.dol.gov"),
  agency("eoir", "Executive Office for Immigration Review", ["EOIR", "immigration courts"], "https://www.justice.gov/eoir"),
  agency("doj", "U.S. Department of Justice", ["DOJ", "Justice Department"], "https://www.justice.gov"),
  agency("ssa", "Social Security Administration", ["SSA"], "https://www.ssa.gov"),
  agency("bls", "Bureau of Labor Statistics", ["BLS"], "https://www.bls.gov"),
];

function visa(slug: string, name: string, aliases: string[], href?: string): Entity {
  return { id: entityId("visa", slug), type: "visa", slug, name, aliases, href };
}

export const VISA_CATEGORIES: Entity[] = [
  visa("h-1b", "H-1B specialty occupation", ["H-1B", "H1B", "H-1B1", "H 1B"], "/h1b/top-sponsors"),
  visa("f-1", "F-1 academic student", ["F-1", "F1", "student visa", "OPT", "CPT"], "/visa/f1-student-visas"),
  visa("j-1", "J-1 exchange visitor", ["J-1", "J1", "exchange visitor", "exchange visitor program"]),
  visa("l-1", "L-1 intracompany transferee", ["L-1", "L1", "L-1A", "L-1B"]),
  visa("o-1", "O-1 extraordinary ability", ["O-1", "O1"]),
  visa("tn", "TN professional (USMCA)", ["TN visa", "NAFTA professional"]),
  visa("h-2a", "H-2A temporary agricultural", ["H-2A", "H2A"]),
  visa("h-2b", "H-2B temporary non-agricultural", ["H-2B", "H2B"]),
  visa("eb-1", "EB-1 first preference", ["EB-1", "EB1"]),
  visa("eb-2", "EB-2 second preference", ["EB-2", "EB2", "NIW", "national interest waiver"]),
  visa("eb-3", "EB-3 third preference", ["EB-3", "EB3"]),
  visa("eb-5", "EB-5 immigrant investor", ["EB-5", "EB5"]),
  visa("b-1-b-2", "B-1/B-2 visitor", ["B-1/B-2", "B-1", "B-2", "visitor visa", "temporary visitor for business or pleasure"]),
  visa("k-1", "K-1 fiancé(e)", ["K-1", "K1", "fiance visa"]),
  visa("asylum", "Asylum", ["asylee", "affirmative asylum", "defensive asylum"]),
  visa("refugee", "Refugee admission", ["refugee status"]),
  visa("tps", "Temporary Protected Status", ["TPS"]),
  visa("daca", "Deferred Action for Childhood Arrivals", ["DACA", "Dreamers"]),
];

function topic(slug: string, name: string, summary: string, href?: string): Entity {
  return { id: entityId("topic", slug), type: "topic", slug, name, summary, href };
}

export const TOPICS: Entity[] = [
  topic("h1b", "H-1B and employment visas", "Specialty-occupation sponsorship, the cap lottery, approvals, denials, and offered wages.", "/h1b/top-sponsors"),
  topic("international-students", "International students", "F-1 issuance, OPT, and the schools and countries involved.", "/visa/f1-student-visas"),
  topic("visa-bulletin", "Visa Bulletin and green-card movement", "Monthly priority-date movement by category and country of chargeability."),
  topic("border", "Border encounters", "CBP encounters by sector, month, and demographic.", "/border/encounters"),
  topic("enforcement", "Enforcement, detention and removals", "ICE arrests, detention population, and removals.", "/immigration/enforcement-trends"),
  topic("employers", "Employers and sponsorship", "Which employers sponsor, how much, and where.", "/h1b/employers"),
  topic("workforce-reductions", "Workforce reductions and WARN", "State-filed layoff notices and their overlap with sponsorship.", "/layoffs"),
  topic("processing-times", "Processing times and backlogs", "How long cases take and where they queue."),
  topic("key-dates", "Key dates and deadlines", "Filing windows, lottery dates, and publication schedules.", "/key-dates"),
  topic("policy-changes", "Policy and rulemaking", "Rules, notices, and executive actions that change how the system works."),
];

/** Every hand-seeded entity, indexed by id. */
export const SEED_ENTITIES: Entity[] = [...AGENCIES, ...VISA_CATEGORIES, ...TOPICS];

export const ENTITY_BY_ID = new Map<EntityId, Entity>(SEED_ENTITIES.map((e) => [e.id, e]));

/**
 * Alias lookup for resolving mentions in source text.
 *
 * Keys are lowercased alias strings; values are entity ids. Built once. Aliases
 * shorter than three characters are excluded — matching "TN" or "J1" inside
 * arbitrary prose produces far more false positives than real links, and a wrong
 * edge in a trust platform is worse than a missing one.
 */
export const ALIAS_INDEX: Map<string, EntityId> = (() => {
  const idx = new Map<string, EntityId>();
  for (const e of SEED_ENTITIES) {
    const names = [e.name, ...(e.aliases ?? [])];
    for (const n of names) {
      const key = n.toLowerCase().trim();
      if (key.length < 3) continue;
      if (!idx.has(key)) idx.set(key, e.id);
    }
  }
  return idx;
})();

/**
 * Honest coverage map. An entity type declared above but not yet populated is
 * listed here as such, so the platform never implies knowledge it does not have.
 * Displayed on the methodology page.
 */
export const ENTITY_COVERAGE: Record<EntityType, "populated" | "projected" | "planned"> = {
  agency: "populated",
  visa: "populated",
  topic: "populated",
  // Projected from existing datasets at build time rather than hand-listed.
  country: "projected",
  state: "projected",
  employer: "projected",
  dataset: "projected",
  // Declared so adapters can target them; no data ingested yet.
  industry: "planned",
  university: "planned",
  law: "planned",
  regulation: "planned",
  executive_action: "planned",
  court_case: "planned",
  legislation: "planned",
  policy: "planned",
  person: "planned",
};
