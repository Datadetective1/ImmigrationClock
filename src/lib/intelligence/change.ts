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
  visaCategories: string[];
  countries: string[];

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

function idsOf(list: readonly { entityId: string }[] | undefined, prefix: string): string[] {
  return (list ?? [])
    .map((x) => x.entityId)
    .filter((id) => id.startsWith(`${prefix}:`))
    .map((id) => id.slice(prefix.length + 1));
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
    visaCategories: idsOf(input.impact?.visaCategories, "visa"),
    countries: idsOf(input.impact?.countries, "country"),

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
  schemaVersion: CHANGE_SCHEMA_VERSION,
} as const;
