// =============================================================================
// FEDERAL COURTS ADAPTER (CourtListener)
//
// Courts change immigration law constantly, and a vacated rule matters more to a
// reader than the rule that was vacated. But most federal immigration litigation
// is one person contesting their own case, and this platform does not report on
// people.
//
// -----------------------------------------------------------------------------
// THE EDITORIAL RULE (founder decision, 2026-08-02)
// -----------------------------------------------------------------------------
//   Include: decisions that establish or change immigration law, or grant relief
//            reaching beyond the parties.
//   Exclude: routine individual petitions, asylum appeals, visa denials, and
//            detainee habeas cases that identify private individuals.
//
// "Report the legal rule, not a profile of the named individual."
//
// This is the same principle the USCIS newsroom adapter applies to criminal
// press releases, reached independently: /methodology promises "no individual
// immigrant profiles, tracking, or identifying personal data", and a feed of
// "Liu v. Noem", "Hernandez v. Noem", "Prado-Majano v. Blanche" is exactly that.
//
// -----------------------------------------------------------------------------
// WHY THE FILTER PARSES THE CAPTION INSTEAD OF SEARCHING TEXT
// -----------------------------------------------------------------------------
// Both obvious approaches were measured against the live API and both failed:
//
//   • Full-text relevance is meaningless here. `court_id:scotus AND immigration`
//     returns 18,632 results led by a Federal Election Commission case, because
//     "alien" and "immigration" appear in citations throughout unrelated
//     opinions.
//
//   • Keyword-matching the whole caption catches the GOVERNMENT side. Searching
//     for "Association OR Council OR Center" alongside "Homeland Security"
//     returned "Challa v. DHS", "Walsh v. DHS", "Mahmoud v. DHS" — every one an
//     individual, matched on the defendant.
//
// So the caption is split into parties and each is classified. The question that
// decides inclusion is not "does this mention an organization" but "is the party
// CHALLENGING the government an organization rather than a person".
//
// -----------------------------------------------------------------------------
// THE ASYMMETRY, AND A KNOWN GAP
// -----------------------------------------------------------------------------
// An unrecognised organization is dropped; an unrecognised individual would be
// published. So anything the classifier cannot affirmatively identify as an
// organization or a government body is treated as a person and excluded.
//
// That is deliberately conservative, and it has a documented cost: a Supreme
// Court decision captioned with an individual's name can change asylum law
// nationwide and will NOT appear here. Surfacing those needs an editorial review
// step rather than an automatic rule, because the filter cannot distinguish a
// landmark from a routine petition by caption alone. Recorded in the adapter's
// coverage string so the gap is visible rather than implied.
// =============================================================================

import { capEvents } from "../adapters";
import type { AdapterContext, AdapterResult, SourceAdapter } from "../adapters";
import type { EventEntityLink, EventSeverity, ImmigrationEvent } from "../events";
import { entityId } from "../entities";
import { resolveEntityMentions } from "../resolve";
import { extractImpact } from "../extract-impact";
import { plainText, containsAnyTerm } from "../text";

const API = "https://www.courtlistener.com/api/rest/v4/search/";
const UA = "ImmigrationClock/1.0 (+https://immigrationclock.com)";
const SOURCE_KEY = "federal_courts";

export interface CourtOpinion {
  caseName: string;
  court: string;
  court_id: string;
  dateFiled: string | null;
  docketNumber: string | null;
  status: string | null;
  suitNature: string | null;
  absolute_url: string | null;
  cluster_id: number | null;
  citeCount?: number | null;
}

// -----------------------------------------------------------------------------
// Party classification
// -----------------------------------------------------------------------------

/**
 * Government parties. An immigration case almost always has one, and it is
 * never the party whose privacy is at stake — a cabinet secretary sued in their
 * official capacity is a public official acting officially, which the entity
 * rules explicitly permit.
 */
const GOVERNMENT_MARKERS = [
  "united states", "u.s.", "usa", "department of", "secretary", "attorney general",
  "commissioner", "administrator", "director of", "bureau of", "office of",
  "homeland security", "citizenship and immigration", "immigration and customs",
  "customs and border", "state department", "department of labor", "department of justice",
  "executive office for immigration review", "board of immigration appeals",
  "uscis", "dhs", "ice", "cbp", "eoir", "government", "united states of america",
  // Officials who appear as named defendants in their official capacity. These
  // are surnames, but of public officials being sued as the office they hold.
  "noem", "bondi", "mayorkas", "garland", "barr", "sessions", "wolf", "nielsen",
  "johnson", "napolitano", "trump", "biden", "obama", "blanche", "mcaleenan",
];

/**
 * Organizational parties. Only a party matching one of these can carry a case
 * into the feed, so the list is the whole filter — everything else is presumed
 * to be a person.
 */
const ORGANIZATION_MARKERS = [
  "inc", "inc.", "llc", "l.l.c.", "llp", "corp", "corp.", "corporation", "company", "co.",
  "ltd", "limited", "association", "ass'n", "assn", "coalition", "council", "center",
  "centre", "project", "union", "league", "society", "foundation", "institute",
  "committee", "alliance", "network", "chamber", "conference", "federation",
  "partnership", "partners", "group", "services", "systems", "holdings",
  "university", "college", "school", "hospital", "church", "diocese", "synod",
  "ministries", "charities", "clinic", "fund", "trust", "board of", "chapter",
  "organization", "organisation", "collective", "cooperative", "institution",
  "immigration lawyers", "civil liberties", "legal aid", "legal defense",
  "human rights", "refugee", "casa", "aclu", "naacp", "chamber of commerce",
  "county of", "city of", "state of", "commonwealth of", "town of", "village of",
  "district of columbia", "puerto rico",
];

/** U.S. states appearing as bare captions, e.g. "Texas v. United States". */
const STATE_NAMES = [
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
  "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
  "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
  "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
  "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
  "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island",
  "south carolina", "south dakota", "tennessee", "texas", "utah", "vermont",
  "virginia", "washington", "west virginia", "wisconsin", "wyoming",
];

export type PartyKind = "government" | "organization" | "individual";

export function classifyParty(raw: string): PartyKind {
  const lower = plainText(raw).toLowerCase().trim();
  if (!lower) return "individual";
  if (containsAnyTerm(lower, GOVERNMENT_MARKERS)) return "government";
  if (containsAnyTerm(lower, ORGANIZATION_MARKERS)) return "organization";
  if (STATE_NAMES.includes(lower)) return "organization";
  // Presumed a person. This is the safe default: a misfiled organization costs
  // one case, a misfiled person publishes someone's immigration matter.
  return "individual";
}

/** Split a caption into its parties. Handles "v.", "vs.", and "v". */
export function parties(caseName: string): string[] {
  return plainText(caseName)
    .split(/\s+v(?:s?\.|s\.|\.)?\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

// -----------------------------------------------------------------------------
// The inclusion decision
// -----------------------------------------------------------------------------

/** Courts whose published decisions bind beyond the parties. */
const APPELLATE_COURTS = /^(scotus|ca\d{1,2}|cadc|cafc)$/i;

export interface InclusionDecision {
  include: boolean;
  /** Auditable explanation. Rendered into the event's limitations when kept. */
  reason: string;
}

/**
 * Decide whether a decision belongs in the feed.
 *
 * Three gates, all of which must pass. Each returns its reason so a rejection
 * can be explained and a inclusion can be justified on the page.
 */
export function assessInclusion(op: CourtOpinion): InclusionDecision {
  const ps = parties(op.caseName);
  if (ps.length < 2) {
    return { include: false, reason: "caption could not be parsed into parties" };
  }

  const kinds = ps.map(classifyParty);

  // GATE 1 — nobody private. Every non-government party must be identifiable as
  // an organization. An unrecognised name is treated as a person, so this
  // rejects by default rather than admitting by default.
  if (kinds.some((k) => k === "individual")) {
    return {
      include: false,
      reason: "a party appears to be a private individual — excluded by editorial policy",
    };
  }

  // GATE 2 — the government must actually be a party. A dispute between two
  // private organizations is not immigration administration.
  if (!kinds.includes("government")) {
    return { include: false, reason: "no government party — not a challenge to immigration administration" };
  }

  // GATE 3 — precedential weight. A published appellate decision binds its
  // circuit; an unpublished one does not. A district-court decision binds
  // nobody by itself, so it enters only when a body with organizational
  // standing brought it, and it is never described as settled law.
  const isAppellate = APPELLATE_COURTS.test(op.court_id ?? "");
  const published = (op.status ?? "").toLowerCase().includes("published") &&
    !(op.status ?? "").toLowerCase().includes("unpublished");

  if (isAppellate && published) {
    return { include: true, reason: "published appellate decision — binding precedent in its circuit" };
  }
  if (isAppellate && !published) {
    return { include: false, reason: "unpublished appellate decision — not precedential" };
  }
  return {
    include: true,
    reason: "district-court decision in institutional litigation — binds the parties, not the country",
  };
}

// -----------------------------------------------------------------------------
// Event construction
// -----------------------------------------------------------------------------

/**
 * Severity.
 *
 * The Supreme Court changes national law. A published circuit decision changes
 * law in its circuit. A district court binds only its parties, however
 * consequential the coverage — so it is `notable`, never `major`, and the
 * limitation says why.
 */
export function severity(op: CourtOpinion): EventSeverity {
  if ((op.court_id ?? "").toLowerCase() === "scotus") return "major";
  if (APPELLATE_COURTS.test(op.court_id ?? "")) return "major";
  return "notable";
}

export function stableId(op: CourtOpinion): string {
  const native = op.cluster_id
    ? String(op.cluster_id)
    : `${op.court_id}-${op.dateFiled}-${(op.docketNumber ?? "").replace(/[^a-zA-Z0-9]+/g, "-")}`;
  return `${SOURCE_KEY}:${native}`;
}

export function sourceUrl(op: CourtOpinion): string {
  return op.absolute_url ? `https://www.courtlistener.com${op.absolute_url}` : "https://www.courtlistener.com";
}

/**
 * A summary assembled ENTIRELY from structured fields.
 *
 * CourtListener publishes no syllabus for these decisions, and the only prose
 * available is the raw first page of the PDF — a caption block carrying the
 * plaintiff's name in capitals. Quoting that would both misrepresent the holding
 * and reproduce the personal detail this adapter exists to avoid.
 *
 * So nothing is written that is not a field: court, date, docket, precedential
 * status. The event then says plainly that no summary was published, exactly as
 * the Federal Register and USCIS adapters do when an abstract is missing.
 */
export function buildSummary(op: CourtOpinion, decision: InclusionDecision): string {
  const bits = [`${op.court} issued a decision in ${op.caseName}`];
  if (op.dateFiled) bits.push(`filed ${op.dateFiled}`);
  if (op.docketNumber) bits.push(`docket ${op.docketNumber}`);
  return (
    `${bits.join(", ")}. ${decision.reason.charAt(0).toUpperCase()}${decision.reason.slice(1)}. ` +
    "The court published no summary with this decision; read the opinion for its holding."
  );
}

export function toEvent(op: CourtOpinion, decision: InclusionDecision, verifiedAt: string): ImmigrationEvent {
  const links: EventEntityLink[] = [
    { entityId: entityId("topic", "policy-changes"), relation: "categorized_as", basis: "explicit", confidence: 1 },
    {
      entityId: entityId("court_case", `${op.court_id}-${op.cluster_id ?? op.docketNumber ?? op.dateFiled}`),
      relation: "affects",
      basis: "explicit",
      confidence: 1,
    },
  ];

  // Agencies named in the caption are parties, which is an explicit fact.
  for (const m of resolveEntityMentions(op.caseName)) {
    if (links.some((l) => l.entityId === m.entityId)) continue;
    links.push({ entityId: m.entityId, relation: "mentions", basis: "matched", confidence: m.confidence });
  }

  const isDistrict = !APPELLATE_COURTS.test(op.court_id ?? "");
  const summary = buildSummary(op, decision);

  return {
    id: stableId(op),
    sourceKey: SOURCE_KEY,
    classification: "court_decision",
    severity: severity(op),
    title: op.caseName,
    summary,
    publishedAt: op.dateFiled!,
    // A decision's legal effect is not a date the API publishes, and an appeal
    // or stay can change it. We do not assert one.
    effectiveAt: null,
    lastVerifiedAt: verifiedAt,
    sourceUrl: sourceUrl(op),
    entities: links,
    impact: extractImpact({
      title: op.caseName,
      abstract: summary,
      agencyIds: [],
      effectiveAt: null,
    }),
    reviewStatus: "auto",
    limitations: [
      isDistrict
        ? "A district-court decision binds the parties before it. It is not nationwide law, and presenting it as such would seriously mislead — it may be stayed, narrowed, or reversed on appeal."
        : "A published appellate decision is binding precedent in its own circuit. Other circuits may hold differently, and the Supreme Court may resolve the split.",
      "A decision's reach can change: appeals, stays, and rehearings all alter what it means in practice. Check the docket before relying on it.",
      "The court published no summary; this event reports the court, date, docket, and precedential status only. Read the opinion for its holding.",
      "ImmigrationClock reports decisions that establish or change immigration law. Routine individual petitions, asylum appeals, visa denials, and detainee cases are deliberately excluded — we report the legal rule, not the people in a case.",
    ],
  };
}

// -----------------------------------------------------------------------------
// Fetch
// -----------------------------------------------------------------------------

/**
 * Query by AGENCY AS A PARTY rather than by topic.
 *
 * Full-text relevance is unusable on this corpus — "immigration" and "alien"
 * appear in citations across unrelated opinions, so `court_id:scotus AND
 * immigration` returns 18,632 results led by an election-law case. Requiring an
 * immigration agency in the caption gives precision the text search cannot.
 */
const CAPTION_QUERY =
  'caseName:("Homeland Security" OR "Citizenship and Immigration" OR ' +
  '"Immigration and Customs" OR "Customs and Border" OR ' +
  '"Immigration Review" OR "Immigration Appeals" OR Noem OR Mayorkas OR Bondi)';

async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  const key = "federal-courts";
  if (ctx.offline) {
    return { adapterKey: key, events: [], warnings: ["offline: skipped"], failed: false };
  }

  const params = new URLSearchParams({
    format: "json",
    type: "o",
    order_by: "dateFiled desc",
    q: CAPTION_QUERY,
    filed_after: ctx.since,
  });

  let payload: { results?: CourtOpinion[]; count?: number };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(`${API}?${params}`, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      return { adapterKey: key, events: [], warnings: [`HTTP ${res.status} from CourtListener`], failed: true };
    }
    payload = await res.json();
  } catch (err) {
    return {
      adapterKey: key,
      events: [],
      warnings: [`fetch failed: ${(err as Error)?.message ?? String(err)}`],
      failed: true,
    };
  }

  const results = payload.results ?? [];
  const warnings: string[] = [];
  const kept: ImmigrationEvent[] = [];
  let excludedIndividual = 0;
  let excludedOther = 0;
  let excludedUndated = 0;

  const verifiedAt = new Date().toISOString().slice(0, 10);

  for (const op of results) {
    if (!op.dateFiled) {
      excludedUndated++;
      continue;
    }
    const decision = assessInclusion(op);
    if (!decision.include) {
      if (decision.reason.includes("private individual")) excludedIndividual++;
      else excludedOther++;
      continue;
    }
    kept.push(toEvent(op, decision, verifiedAt));
  }

  if (excludedIndividual > 0) {
    warnings.push(
      `${excludedIndividual} decision(s) naming private individuals excluded by editorial policy (see adapter header)`
    );
  }
  if (excludedOther > 0) warnings.push(`${excludedOther} decision(s) were not precedential or had no government party`);
  if (excludedUndated > 0) warnings.push(`${excludedUndated} decision(s) had no filing date`);

  const capped = capEvents(kept, ctx.limit);
  return {
    adapterKey: key,
    events: capped.events,
    warnings: [...warnings, ...capped.warnings],
    failed: false,
  };
}

export const federalCourtsAdapter: SourceAdapter = {
  key: "federal-courts",
  name: "Federal court decisions",
  sourceKey: SOURCE_KEY,
  status: "ready",
  coverage:
    "Decisions that establish or change immigration law: published appellate rulings and institutional litigation against immigration agencies. Routine individual petitions, asylum appeals, visa denials, and detainee habeas cases are excluded by editorial policy — the platform reports the legal rule, not the people in a case. KNOWN GAP: because the filter identifies parties by caption, a landmark decision captioned with an individual's name is excluded along with routine ones. Surfacing those needs editorial review rather than an automatic rule.",
  fetchEvents,
};

export const __testing = {
  classifyParty,
  parties,
  assessInclusion,
  severity,
  stableId,
  sourceUrl,
  buildSummary,
  toEvent,
  CAPTION_QUERY,
};
