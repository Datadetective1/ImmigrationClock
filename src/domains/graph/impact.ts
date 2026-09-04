// =============================================================================
// "WHO IS AFFECTED?" — the signature feature
//
// Founder direction: every event must automatically answer three questions.
//   1. What changed?          → ImmigrationEvent.title / summary
//   2. Who is affected?       → this module
//   3. What should they do?   → EventImpact.actionRequired
//
// This is the highest-stakes claim the platform makes. A reader will use an
// affected-countries list to decide whether a rule applies to THEM. Getting it
// wrong does not produce a slightly inaccurate chart — it tells a real person
// that a rule affecting their travel does not concern them, or frightens someone
// it never touched. Both are worse than saying nothing.
//
// THREE RULES THAT FOLLOW FROM THAT
// ---------------------------------
// 1. STATED BEATS INFERRED, AND THEY ARE NEVER MERGED.
//    `stated` means the government document itself named this country, visa, or
//    group. It requires a verbatim quote as evidence, enforced in validation.
//    `inferred` means we deduced it. It is shown separately, labelled, and can
//    be suppressed entirely. We never let an inference wear a fact's clothes.
//
// 2. COMPLETENESS IS PART OF THE ANSWER.
//    "These 12 countries" and "at least these 12 countries, the document may
//    name more" are different claims. `completeness` carries that distinction so
//    the UI can never imply an exhaustive list we did not verify.
//
// 3. "WHAT SHOULD THEY DO" IS QUOTED, NOT AUTHORED.
//    ImmigrationClock does not give legal advice — the Directive forbids
//    unsupported legal conclusions and the site disclaims advice everywhere.
//    `actionRequired` therefore paraphrases what THE DOCUMENT says may be
//    required, always carries its evidence quote, and is always phrased
//    conditionally. It is never our recommendation about anyone's case.
// =============================================================================

import type { EntityId } from "./entities";
import { confidenceFor, type ClassificationMethod } from "./classification";

/** How we know a group is affected. Never collapse these. */
export type ImpactBasis =
  /** The source document explicitly names this entity. Requires `evidence`. */
  | "stated"
  /** Follows necessarily from a stated fact (e.g. a rule naming a visa class
   *  affects the agency that administers it). Deterministic, not a guess. */
  | "derived"
  /** Our inference from context. Weakest claim; suppressible; always labelled. */
  | "inferred";

export interface ImpactedEntity {
  entityId: EntityId;
  basis: ImpactBasis;
  /**
   * How the classification was established, and therefore how far to trust it.
   * See classification.ts — a title match and a footnote match are both
   * "stated" under `basis`, and they are not the same thing.
   *
   * Optional so records written before the grader existed still parse; the
   * reclassify pass fills it in.
   */
  method?: ClassificationMethod;
  /**
   * For a country: what the country is DOING in the document — defining its
   * coverage, hosting a consular post, sitting inside a cited agreement's
   * title. See country-relations.ts.
   *
   * Only the scope-bearing relations mean the document is about that country,
   * and only those are returned by a default country filter. Absent on the
   * dimensions where the question does not arise.
   */
  relation?: string;
  /**
   * Verbatim quote from the source establishing this. REQUIRED when
   * basis is "stated" — a stated fact with no quote is just an assertion.
   */
  evidence?: string;
  /**
   * How far to trust this entry, pinned to `method` where one is present and
   * enforced in validateImpact(). It is not a free-text score: 1 means the
   * title or a structured field named it, 0.9 a summary or a clean scope
   * sentence, 0.5 a citation or an aside.
   */
  confidence: number;
}

/**
 * How much of the picture we have.
 *
 * `exhaustive` is deliberately hard to earn: it means the document published a
 * closed list and we captured all of it. Most real documents are `partial`.
 */
export type ImpactCompleteness =
  /** The document published a closed list and we captured it in full. */
  | "exhaustive"
  /** We captured some; the document may name more. Say so. */
  | "partial"
  /** The document does not identify who is affected in structured terms. */
  | "unspecified";

/**
 * What the document says may be required. NOT advice.
 *
 * Every field here exists to keep this from becoming guidance: the summary is
 * conditional, the evidence is verbatim, and the disclaimer renders with it.
 */
export interface ActionRequired {
  /**
   * Conditional paraphrase of the document's own requirement, e.g. "Travellers
   * from the listed countries may be required to post a bond before a visa is
   * issued." Must never read as "you should…".
   */
  summary: string;
  /** Verbatim quote from the source that this paraphrases. Required. */
  evidence: string;
  /** When the requirement starts, if the document states one. */
  effectiveFrom?: string | null;
}

export interface EventImpact {
  /** Countries whose nationals or residents the document identifies. */
  countries: ImpactedEntity[];
  /** Visa categories the document identifies. */
  visaCategories: ImpactedEntity[];
  /** Agencies that administer or must implement the change. */
  agencies: ImpactedEntity[];
  /** Employers named or covered. Rare outside enforcement actions. */
  employers: ImpactedEntity[];
  /** Universities or SEVP-certified schools named or covered. */
  universities: ImpactedEntity[];
  /** U.S. states, for state-level or geographically scoped actions. */
  states: ImpactedEntity[];
  /**
   * Immigration forms the document names — I-129, I-765, ETA-9089.
   *
   * Optional because it was added after the archive was built, and a record
   * written before it existed has no forms list rather than an empty one. The
   * difference matters: see ClassificationState.
   */
  forms?: ImpactedEntity[];
  /**
   * Immigration processes the document names — labor certification, employment
   * authorization, cap registration.
   *
   * The dimension a professional actually administers. A visa filter misses a
   * rule that changes how employment authorization is granted, because such a
   * rule names no visa; see domains/graph/processes.ts for the measurement
   * that produced this list.
   */
  processes?: ImpactedEntity[];

  completeness: ImpactCompleteness;

  /** What the document says may be required of affected people. */
  actionRequired?: ActionRequired;

  /**
   * Set when we could not determine impact. Rendered instead of an empty list,
   * because a blank "Who is affected" section reads as "nobody" — which is a
   * claim we have not earned.
   */
  undetermined?: string;

  /**
   * Set when the document defines its own scope BY REFERENCE to a list held
   * elsewhere, rather than naming anyone inline.
   *
   * This is common and consequential. The Visa Bond Program rule, for example,
   * applies to "nationals of countries with high overstay rates" and leaves the
   * actual country list to the State Department. An empty country list there is
   * not a failure of extraction — it is a true fact about the document, and the
   * useful answer is to say where the list actually lives.
   *
   * This is also the clearest argument for the knowledge graph: answering "who
   * is affected" fully requires linking the rule to the separate designation
   * that names the countries. One feed cannot do it; connected events can.
   */
  scopeDefinedElsewhere?: {
    /** Verbatim phrase showing scope is delegated. */
    evidence: string;
    /** Plain-English pointer for the reader. */
    note: string;
  };
}

export const EMPTY_IMPACT: EventImpact = {
  countries: [],
  visaCategories: [],
  agencies: [],
  employers: [],
  universities: [],
  states: [],
  forms: [],
  processes: [],
  completeness: "unspecified",
  undetermined:
    "This document does not identify in structured terms who is affected. Read the original for scope.",
};

/** Every impacted-entity list on an impact record. */
export function allImpacted(impact: EventImpact): ImpactedEntity[] {
  return [
    ...impact.countries,
    ...impact.visaCategories,
    ...impact.agencies,
    ...impact.employers,
    ...impact.universities,
    ...impact.states,
    ...(impact.forms ?? []),
    ...(impact.processes ?? []),
  ];
}

/** True when we know anything at all about who is affected. */
export function hasImpact(impact: EventImpact | undefined): boolean {
  return !!impact && allImpacted(impact).length > 0;
}

/**
 * The subset safe to present as fact. Callers rendering a "who is affected"
 * block should use this for the primary list and surface `inferred` entries
 * separately, if at all.
 */
export function statedImpact(impact: EventImpact): ImpactedEntity[] {
  return allImpacted(impact).filter((i) => i.basis === "stated");
}

/**
 * The sentence that must render beneath any impact list.
 *
 * Not decoration. A reader deciding whether a rule applies to them needs to know
 * both that this was assembled from the document rather than from their case,
 * and that it is not advice.
 */
export function impactDisclaimer(completeness: ImpactCompleteness): string {
  const base =
    "Assembled from the source document, not from anyone's individual circumstances. " +
    "Whether a change applies to a specific person depends on facts this platform does not have. " +
    "This is data context, not legal advice.";
  if (completeness === "exhaustive") {
    return `The document publishes a closed list, reproduced here in full. ${base}`;
  }
  if (completeness === "partial") {
    return `This list may be incomplete — the document may identify others. Read the original. ${base}`;
  }
  return base;
}

/**
 * Structural validation. Runs at build time so a malformed impact record fails
 * the build rather than reaching a reader.
 */
export function validateImpact(impact: EventImpact, eventId: string): string[] {
  const errors: string[] = [];

  for (const i of allImpacted(impact)) {
    if (!i.entityId.includes(":")) {
      errors.push(`${eventId}: malformed impacted entity id "${i.entityId}"`);
    }
    if (i.confidence < 0 || i.confidence > 1) {
      errors.push(`${eventId}: impact confidence out of range for ${i.entityId}`);
    }
    // The core rule: a claim that the document SAYS something must be able to
    // point at where it says it.
    if (i.basis === "stated") {
      if (!i.evidence?.trim()) {
        errors.push(`${eventId}: ${i.entityId} is marked stated but carries no evidence quote`);
      }
      // CONFIDENCE MUST MATCH THE METHOD THAT EARNED IT.
      //
      // This rule used to read "stated implies confidence 1", written when
      // there was only one kind of stated. There are now four: a document
      // whose TITLE names H-1B and a document that mentions H-1B once in a
      // footnote both say it, and selling the second at confidence 1 is
      // exactly the failure that put an H-2A wage rule in front of H-1B
      // subscribers. So a graded classification must carry the confidence its
      // grade implies, and an ungraded one must still be a full 1 — the old
      // rule, preserved for records written before grading existed.
      const expected = i.method ? confidenceFor(i.method) : 1;
      if (i.confidence !== expected) {
        errors.push(
          i.method
            ? `${eventId}: ${i.entityId} is ${i.method} so confidence must be ${expected}, not ${i.confidence}`
            : `${eventId}: ${i.entityId} is marked stated but confidence is not 1`
        );
      }
    }
    if (i.basis === "inferred" && i.confidence >= 1) {
      errors.push(`${eventId}: ${i.entityId} is inferred but claims full confidence`);
    }
  }

  // An exhaustive list must actually contain something, and everything in it
  // must be stated — we cannot claim completeness over our own inferences.
  if (impact.completeness === "exhaustive") {
    const all = allImpacted(impact);
    if (all.length === 0) {
      errors.push(`${eventId}: completeness is exhaustive but no entities are listed`);
    }
    if (all.some((i) => i.basis === "inferred")) {
      errors.push(`${eventId}: completeness is exhaustive but includes inferred entries`);
    }
  }

  if (impact.actionRequired) {
    const a = impact.actionRequired;
    if (!a.evidence?.trim()) {
      errors.push(`${eventId}: actionRequired carries no evidence quote`);
    }
    if (!a.summary?.trim()) {
      errors.push(`${eventId}: actionRequired has no summary`);
    }
    // Guard against advice-shaped phrasing slipping into a data platform.
    if (/\byou (should|must|need to|have to)\b/i.test(a.summary)) {
      errors.push(
        `${eventId}: actionRequired reads as advice ("you should/must"). Describe what the document requires, conditionally.`
      );
    }
  }

  // A blank impact record with no explanation renders as "nobody is affected",
  // which is a claim we have not established.
  if (allImpacted(impact).length === 0 && !impact.undetermined) {
    errors.push(`${eventId}: impact is empty but does not say why`);
  }

  return errors;
}
