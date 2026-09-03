// =============================================================================
// THE PUBLIC SHAPE OF A CHANGE — one serialization, three consumers
//
// WHY THIS EXISTS, FROM WHAT THE AUDIT FOUND
// ------------------------------------------
// The committed change store already carries an intelligence-grade record:
//
//   id · sourceKey · issuingAgencyId · classification · severity · title ·
//   summary · publishedAt · dataThrough · effectiveAt · lastVerifiedAt ·
//   sourceUrl · sourceDataUrl · entities[{entityId, relation, basis,
//   confidence}] · impact{countries, visaCategories, agencies, employers,
//   universities, states, completeness, undetermined} · provenance ·
//   reviewStatus · limitations[]
//
// Five relation types are in use (issued_by, categorized_as, mentions, amends,
// affects) and 92 `amends` relations already exist, which is supersession
// modelled rather than planned.
//
// The site then throws most of that away twice over: events-index.json keeps
// eleven fields for selection, and the page templates render prose. There is no
// representation of a change that another system could consume — which is the
// gap between "a website about immigration changes" and "the intelligence layer
// underneath immigration systems".
//
// So this file is one function, `toPublicChange()`, and the type it produces.
// The web can use it, an API can serve it, and a future webhook can sign it,
// without three drifting definitions of what a change is.
//
// THE RULES IT ENFORCES
// ---------------------
//   1. EVERY RECORD CARRIES ITS EVIDENCE. Source, source URL, the underlying
//      data file when there is one, published date, effective date when known,
//      when we last verified it, and what the record does not cover. A consumer
//      must always be able to answer "why are you telling me this?" without
//      calling anyone.
//   2. NOTHING IS INVENTED. Every field is copied or derived by a stated rule
//      from the record. Absent stays absent: `effectiveDate: null` means the
//      document does not state one, never "we guessed".
//   3. NO INDIVIDUAL DETERMINATION. There is no field for who is affected, no
//      eligibility, no outcome. `topics`, `visaCategories` and `countries` say
//      what the record is ABOUT. What that means for a person is a question
//      this data cannot answer and must not appear to.
//   4. NO INTERNAL DETAIL. Adapter names, file paths, review queues and
//      confidence heuristics stay inside.
// =============================================================================

import type { ImmigrationEvent } from "@/domains/graph/events";
import { isNotInForce } from "@/lib/event-labels";
import { changeSlug, shortHash } from "@/lib/share";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { SITE } from "@/lib/site";

/** The schema version of the object below. Bumped only for a breaking change. */
export const CHANGE_SCHEMA_VERSION = "2026-09-03";

/**
 * Where a change stands right now, as a machine value.
 *
 * Derived, and the derivation is stated so a consumer can reproduce it:
 *   proposed   — a proposal. Not in force and may never be.
 *   scheduled  — final, with an effective date still in the future.
 *   in_force   — final, and its effective date has passed (or it states none).
 *   decided    — a court decision. Binds as the order says; not a rule change.
 *   superseded — a later record amends this one.
 *   informational — a data release or notice that changes no obligation.
 */
export type ChangeStatus =
  | "proposed"
  | "scheduled"
  | "in_force"
  | "decided"
  | "superseded"
  | "informational";

/**
 * One classification, with the evidence for it.
 *
 * MEASURED, NOT ASSUMED. Filtering `?visa=h-1b` against the committed archive
 * returns 11 records; 16 records name H-1B in their own title or summary; only
 * 6 are in both. Recall is 38%. Worse, reading the disagreements by hand found
 * an H-2A wage rule classified `visa:h-1b` because the rule's body cites
 * section 212(p) in a historical aside — at confidence 1.
 *
 * The classifier matches anywhere in the source document, including footnotes
 * and citations, and every classification already stores the verbatim quote
 * that produced it. Flattening that to `["h-1b"]` threw away the only thing
 * that lets a consumer tell a real H-1B rule from a footnote.
 *
 * So a classification carries its evidence. A monitoring product built on this
 * can show the quote, or refuse a match whose quote does not mention the
 * subject in its own words. That is a filter someone can trust; a bare list of
 * ids at 38% recall and imperfect precision is not.
 */
export interface Classification {
  /** The value: "h-1b", "india". */
  id: string;
  /**
   * How it was established.
   *   stated  — the source document says it, and `evidence` quotes where.
   *   derived — inferred by the ingestion pipeline from context.
   */
  basis: string;
  /** Verbatim quote from the source. Present for every `stated` classification. */
  evidence: string | null;
  /** 1 for stated, below 1 otherwise. Not a quality score — see `evidence`. */
  confidence: number;
}

/**
 * What an EMPTY classification list means. Three different things, and a
 * consumer that cannot tell them apart will read every one as "no".
 *
 *   known          — the list has entries, established from the document.
 *   not_applicable — the document was examined and names none. An enforcement
 *                    statistics release genuinely has no visa category.
 *   not_classified — nobody has looked. 490 of 544 records are here, and an
 *                    empty list on one of them is an absence of work, not an
 *                    absence of relevance.
 *
 * Derived from the store's own `impact.completeness`: "unspecified" means the
 * record was never classified, so every dimension on it is not_classified.
 */
export type ClassificationState = "known" | "not_applicable" | "not_classified";

export interface PublicSource {
  /** Short key, stable across releases: "federal_register", "uscis_newsroom". */
  key: string;
  name: string;
  /** The page a human should read. Always present. */
  url: string;
  /** The underlying data file, when the record came from one. */
  dataUrl: string | null;
}

export interface PublicChange {
  /** Stable, opaque, and safe to store: six characters derived from the record id. */
  id: string;
  /** The internal record id. Stable too, and it names the source's own identifier. */
  recordId: string;
  /** The canonical page for a human. */
  url: string;

  title: string;
  summary: string;

  /** What kind of instrument: final_rule, proposed_rule, court_decision, … */
  classification: string;
  /** How consequential we judged it. Editorial, and labelled as such. */
  severity: string;
  status: ChangeStatus;

  agency: string | null;
  source: PublicSource;

  publishedDate: string;
  /** The date it takes effect, or null when the document states none. Never guessed. */
  effectiveDate: string | null;
  /** For a data release: the period the data covers. */
  dataThrough: string | null;
  /** When we last checked this record against its source. */
  lastVerified: string | null;

  /** What the record is about. Not who it affects. */
  topics: string[];
  visaCategories: Classification[];
  countries: Classification[];

  /**
   * Whether each dimension was classified at all, so an empty list is legible.
   * See ClassificationState: an absent value is not the same as "none".
   */
  classificationState: {
    visaCategories: ClassificationState;
    countries: ClassificationState;
  };

  /** What this record does NOT cover, in the source's or our own words. */
  limitations: string[];

  /** Record ids this one amends, and the ones that amend it. */
  amends: string[];
  amendedBy: string[];

  /** How the record was checked: "auto" today. Stated rather than implied. */
  verification: string;
  /**
   * How complete the "about" fields are, from the record itself:
   * exhaustive | partial | unspecified. A consumer filtering on visaCategories
   * needs to know whether an empty list means "none" or "not yet determined".
   */
  scopeCompleteness: string;
}

/**
 * The input is the store's own record, unchanged.
 *
 * Every field this serializer reads already exists on ImmigrationEvent with a
 * stricter type than a hand-written mirror would have: `basis` is
 * "explicit" | "matched", `reviewStatus` is "auto" | "draft" | "approved",
 * and impact entries are ImpactedEntity. Re-declaring them here would let the
 * two drift, and the drift would show up as a wrong public field.
 */
export type ChangeInput = ImmigrationEvent;

function classificationsOf(
  list: readonly { entityId: string; basis: string; evidence?: string; confidence: number }[] | undefined,
  prefix: string
): Classification[] {
  return (list ?? [])
    .filter((x) => x.entityId.startsWith(`${prefix}:`))
    .map((x) => ({
      id: x.entityId.slice(prefix.length + 1),
      basis: x.basis,
      evidence: x.evidence ?? null,
      confidence: x.confidence,
    }));
}

/**
 * Did anyone classify this record on this dimension?
 *
 * "unspecified" completeness means the ingestion never attempted it. Anything
 * else means the document was examined, so an empty list is a real "none".
 */
function stateFor(completeness: string | undefined, entries: Classification[]): ClassificationState {
  if (entries.length > 0) return "known";
  return !completeness || completeness === "unspecified" ? "not_classified" : "not_applicable";
}

/** Which records this one amends, from the relation the store already carries. */
function amendsOf(input: ChangeInput): string[] {
  return (input.entities ?? [])
    .filter((e) => e.relation === "amends")
    .map((e) => e.entityId)
    .filter((id) => !id.includes(":") || id.split(":").length > 1);
}

export function statusFor(input: ChangeInput, today: string, supersededBy: string[] = []): ChangeStatus {
  if (supersededBy.length > 0) return "superseded";
  if (input.classification === "proposed_rule") return "proposed";
  if (input.classification === "court_decision") return "decided";
  if (input.classification === "data_release" || input.classification === "correction") return "informational";
  if (isNotInForce(input.classification)) return "proposed";
  if (input.effectiveAt && input.effectiveAt > today) return "scheduled";
  return "in_force";
}

/**
 * One change, as anything outside this codebase should see it.
 *
 * `amendedBy` is passed in rather than computed here: it needs the whole set,
 * and a serializer that quietly scanned 544 records per call would be a
 * performance trap waiting for the first consumer with a page size of 100.
 */
export function toPublicChange(
  input: ChangeInput,
  today: string,
  amendedBy: string[] = []
): PublicChange {
  const source = SOURCE_BY_KEY[input.sourceKey];
  const visas = classificationsOf(input.impact?.visaCategories, "visa");
  const countries = classificationsOf(input.impact?.countries, "country");
  const topicsFromEntities = (input.entities ?? [])
    .filter((e) => e.entityId.startsWith("topic:"))
    .map((e) => e.entityId.slice("topic:".length));

  return {
    id: shortHash(input.id),
    recordId: input.id,
    url: `${SITE.url}/what-changed/${changeSlug(input)}`,

    title: input.title,
    summary: input.summary,

    classification: input.classification,
    severity: input.severity,
    status: statusFor(input, today, amendedBy),

    agency: input.issuingAgencyId ? input.issuingAgencyId.replace(/^agency:/, "") : null,
    source: {
      key: input.sourceKey,
      name: source?.name ?? input.sourceKey,
      url: input.sourceUrl,
      dataUrl: input.sourceDataUrl ?? null,
    },

    publishedDate: input.publishedAt,
    effectiveDate: input.effectiveAt ?? null,
    dataThrough: input.dataThrough ?? null,
    lastVerified: input.lastVerifiedAt ?? null,

    topics: [...new Set(topicsFromEntities)],
    visaCategories: visas,
    countries: countries,

    classificationState: {
      visaCategories: stateFor(input.impact?.completeness, visas),
      countries: stateFor(input.impact?.completeness, countries),
    },

    limitations: input.limitations ?? [],

    amends: amendsOf(input),
    amendedBy,

    verification: input.reviewStatus ?? "auto",
    scopeCompleteness: input.impact?.completeness ?? "unspecified",
  };
}

/**
 * Who amends whom, computed once for a whole set.
 *
 * Returns record id -> the ids of records that amend it.
 */
export function amendmentIndex(inputs: readonly ChangeInput[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const input of inputs) {
    for (const target of amendsOf(input)) {
      index.set(target, [...(index.get(target) ?? []), input.id]);
    }
  }
  return index;
}

/**
 * The attribution that travels with every response.
 *
 * Not decoration. The records are derived from public government sources, and
 * a consumer redistributing them needs to know where they came from and that
 * we are not the origin.
 */
export const ATTRIBUTION = {
  publisher: SITE.name,
  publisherUrl: SITE.url,
  statement:
    "Records are derived from public U.S. government sources. ImmigrationClock normalizes, dates and links them; it is not the originating authority. Every record carries its source URL — check it before relying on it.",
  notLegalAdvice:
    "This is information about published government material, not legal advice, and it makes no determination about any individual case.",
  /**
   * The measured state of classification, stated in every response.
   *
   * A consumer building monitoring on a filter needs to know its recall before
   * they rely on it, not after a customer asks why a change was missed. These
   * numbers came from comparing each filter against the records' own text; the
   * method is in docs/intelligence-api.md so anyone can re-run it.
   */
  classificationQuality:
    "Classification is incomplete and its coverage is measured rather than assumed: 90% of records " +
    "carry no visa or country classification at all (classificationState: not_classified), and a " +
    "filter on visaCategories currently returns about 38% of the records whose own text names that " +
    "visa. Every classification carries the verbatim quote it was derived from — check the evidence " +
    "before relying on a match, and treat an empty list as unclassified rather than as 'not relevant'.",
  schemaVersion: CHANGE_SCHEMA_VERSION,
} as const;
