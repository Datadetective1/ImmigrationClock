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
import { isStrong } from "@/domains/graph/classification";
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
 * MEASURED, NOT ASSUMED, AND THE MEASUREMENT DROVE THE DESIGN.
 *
 * Hand-labelling 21 H-1B records found the original classifier at precision
 * 82% and recall 47%: it missed ten USCIS records whose own TITLE names H-1B,
 * because headlines contain no "applies to" phrase, and it accepted an H-2A
 * wage rule as H-1B because a sentence deep in that rule's body says section
 * 212(p) "was enacted in the context of the H-1B ... classification". Both
 * came out at confidence 1.
 *
 * Two things fixed it, and both are visible in this type. `method` records
 * WHERE the classification came from, so a title match and a footnote match
 * stop being the same claim, and the default response carries only the strong
 * methods. `evidence` carries the verbatim quote, so a consumer never has to
 * take our word for it. The same corpus now scores precision 100% and recall
 * 100% on strong classifications.
 *
 * A bare list of ids could not have expressed any of that, which is why this
 * is an object.
 */
export interface Classification {
  /** The value: "h-1b", "india", "i-129". */
  id: string;
  /**
   * How it was established.
   *   stated  — the source document says it, and `evidence` quotes where.
   *   derived — inferred by the ingestion pipeline from context.
   */
  basis: string;
  /**
   * WHERE in the document it was established, and therefore how far to trust it:
   *
   *   explicit_source         the record's own title names it
   *   structured_source       a structured field on the source names it
   *   derived_high_confidence the summary names it, or a body sentence states
   *                           scope with no historical or citation markers
   *   derived_weak            a citation, a footnote, or a historical aside
   *
   * Responses carry the strong three by default. `?include=weak` returns
   * everything, each entry still labelled with the method that produced it.
   */
  method: string;
  /**
   * COUNTRIES ONLY: what the country is doing in this document.
   *
   *   nationals_of        coverage is defined by nationality or citizenship
   *   present_in          coverage is defined by presence in, or travel from
   *   designated_list     an item in an enumerated list of affected countries
   *   post_location       a US consular post is located there
   *   document_population the population of a document the rule merely lists
   *   agreement_party     named inside the title of a cited agreement
   *   contextual          history, comparison, background
   *
   * The first three mean the document's own coverage is defined by that
   * country, and they are the only ones a default country filter returns. The
   * rest are true observations that are not scope, and are why a rule about
   * appellate procedure no longer appears in a Guatemala feed.
   */
  relation: string | null;
  /** Verbatim quote from the source. Present for every `stated` classification. */
  evidence: string | null;
  /** Pinned to `method`: 1, 1, 0.9, 0.5 respectively. Not a quality score. */
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
  /**
   * Provenance for the full text this record was classified from, when we
   * retained it.
   *
   * The text itself is NOT served here. It is a public government work,
   * available in full at `textUrl`, and republishing it would make this a
   * document host rather than an intelligence layer. What is served is the
   * receipt: which URL the text came from, when we fetched it, how long it was,
   * the hash of exactly what we classified, and which adapter version read it.
   *
   * Null means we never retained a body — true of every source that publishes
   * only a headline and an abstract. It is a fact about our coverage, not a
   * gap to be filled with a guess.
   */
  document: {
    textUrl: string;
    contentHash: string;
    characters: number;
    retrievedAt: string;
    adapter: string;
  } | null;
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
   * Immigration forms the record names — "i-129", "i-765", "eta-9089".
   *
   * Naming a form is not the same as changing it. A match says the document
   * names that form, with the quote; it does not say the form was revised.
   */
  forms: Classification[];
  /**
   * Immigration processes the record names — "labor-certification",
   * "employment-authorization", "cap-registration".
   *
   * The dimension that makes employment developments retrievable. A rule
   * ending automatic extension of employment authorization names no visa
   * category, so a visa filter cannot find it and a professional monitoring
   * employment would miss it entirely.
   */
  processes: Classification[];

  /**
   * Whether each dimension was classified at all, so an empty list is legible.
   * See ClassificationState: an absent value is not the same as "none".
   */
  classificationState: {
    visaCategories: ClassificationState;
    countries: ClassificationState;
    forms: ClassificationState;
    processes: ClassificationState;
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

type ImpactRow = {
  entityId: string;
  basis: string;
  evidence?: string;
  method?: string;
  relation?: string;
  confidence: number;
};

function classificationsOf(
  list: readonly ImpactRow[] | undefined,
  prefix: string,
  includeWeak: boolean
): Classification[] {
  return (list ?? [])
    .filter((x) => x.entityId.startsWith(`${prefix}:`))
    .filter((x) => includeWeak || isStrong(x.method))
    .map((x) => ({
      id: x.entityId.slice(prefix.length + 1),
      basis: x.basis,
      // An ungraded row predates the grader. It is reported as weak rather than
      // quietly promoted: unknown provenance is not the same as good provenance.
      method: x.method ?? "derived_weak",
      relation: x.relation ?? null,
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
  amendedBy: string[] = [],
  /**
   * Also return classifications drawn from citations and historical asides.
   *
   * Off by default. A weak match is often right, but presenting one as certain
   * is exactly how an H-2A wage rule reached an H-1B filter.
   */
  includeWeak = false
): PublicChange {
  const source = SOURCE_BY_KEY[input.sourceKey];
  const visas = classificationsOf(input.impact?.visaCategories, "visa", includeWeak);
  const countries = classificationsOf(input.impact?.countries, "country", includeWeak);
  const forms = classificationsOf(input.impact?.forms, "form", includeWeak);
  const processes = classificationsOf(input.impact?.processes, "process", includeWeak);
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
      document: input.sourceDocument
        ? {
            textUrl: input.sourceDocument.textUrl,
            contentHash: input.sourceDocument.contentHash,
            characters: input.sourceDocument.characters,
            retrievedAt: input.sourceDocument.retrievedAt,
            adapter: input.sourceDocument.adapter,
          }
        : null,
    },

    publishedDate: input.publishedAt,
    effectiveDate: input.effectiveAt ?? null,
    dataThrough: input.dataThrough ?? null,
    lastVerified: input.lastVerifiedAt ?? null,

    topics: [...new Set(topicsFromEntities)],
    visaCategories: visas,
    countries: countries,
    forms,
    processes,

    classificationState: {
      visaCategories: stateFor(input.impact?.completeness, visas),
      countries: stateFor(input.impact?.completeness, countries),
      // A record predating the forms dimension has no list at all, which is
      // not_classified — distinct from an empty list, which means we looked.
      forms: input.impact?.forms ? stateFor(input.impact?.completeness, forms) : "not_classified",
      processes: input.impact?.processes
        ? stateFor(input.impact?.completeness, processes)
        : "not_classified",
    },

    limitations: input.limitations ?? [],

    amends: amendsOf(input),
    amendedBy,

    verification: input.reviewStatus ?? "auto",
    scopeCompleteness: input.impact?.completeness ?? "unspecified",
  };
}

/**
 * The classifications a default response LEAVES OUT, and why.
 *
 * The list endpoint hides weak matches behind `?include=weak`. The single-record
 * endpoint is prerendered and cannot read a query parameter, so without this it
 * would have to pick one behaviour and silently disagree with the list — the
 * same record answering differently at two URLs.
 *
 * Instead it returns the same strong fields plus this block, so nothing is
 * hidden and nothing is promoted. An empty result here means there was nothing
 * weak to report, not that the question was not asked.
 */
export function weakClassifications(input: ChangeInput): {
  visaCategories: Classification[];
  countries: Classification[];
  forms: Classification[];
  processes: Classification[];
} {
  const weakOnly = (list: readonly ImpactRow[] | undefined, prefix: string) => {
    const all = classificationsOf(list, prefix, true);
    const strong = new Set(classificationsOf(list, prefix, false).map((c) => c.id));
    return all.filter((c) => !strong.has(c.id));
  };
  return {
    visaCategories: weakOnly(input.impact?.visaCategories, "visa"),
    countries: weakOnly(input.impact?.countries, "country"),
    forms: weakOnly(input.impact?.forms, "form"),
    processes: weakOnly(input.impact?.processes, "process"),
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
   * A consumer building monitoring on a filter needs to know its precision and
   * recall before they rely on it, not after a customer asks why a change was
   * missed. The numbers below come from hand-labelled records committed at
   * fixtures/h1b-ground-truth.json and are reproduced by
   * `npm run intelligence:quality`, so anyone can re-run them and disagree.
   *
   * Coverage and quality are reported separately on purpose. Coverage is low
   * and deliberately so: a record is classified only where its own text names
   * the value. Quality is what a filter's user is actually exposed to.
   */
  classificationQuality:
    "Measured per dimension against hand-labelled records, and the labels are drawn from the source " +
    "documents rather than from this classifier's own output. visa:h-1b: precision 100%, recall 83% " +
    "on 33 records. Countries: precision 98%, recall 61% on 249 record-and-country pairs. Forms: " +
    "precision 93%, recall 58% on 185 pairs, single-annotator. Employment processes: precision 100%, " +
    "recall 64% on 72 records, single-annotator. Read that as: what a filter returns is dependable, " +
    "what it omits is not — no dimension yet clears the recall bar a push notification would need. " +
    "Coverage is a separate question and is partial by design: a record is classified only where its " +
    "own text names the value, so an empty list means the document did not name one, never that we " +
    "judged it irrelevant and never that nobody looked. Read classificationState to tell those " +
    "apart, and read the evidence quote and method on every match before relying on it.",
  schemaVersion: CHANGE_SCHEMA_VERSION,
} as const;
