// =============================================================================
// EXECUTIVE ACTIONS ADAPTER — Executive Orders, Proclamations, Memoranda
//
// Presidential documents are published in the Federal Register and share its
// API, so this adapter reuses that transport. It is a SEPARATE adapter anyway,
// for two reasons that matter to a reader:
//
//   1. Different severity. An Executive Order changes what an agency must do,
//      immediately and without notice-and-comment. Ranking one alongside a
//      Paperwork Reduction Act notice would bury it.
//
//   2. Different dates. Presidential documents have a SIGNING date that usually
//      precedes publication, and readers care about when it was signed. The
//      Federal Register's `publication_date` alone would misdate the event by
//      days — the Directive is explicit that publication date and effective date
//      are different questions.
//
// Presidential proclamations are also the vehicle for travel restrictions, which
// is precisely where "who is affected → countries" carries the most weight for a
// reader. Those documents DO name countries inline, so the shared extractor has
// real designation language to work with here.
// =============================================================================

import { capEvents, type AdapterContext, type AdapterResult, type SourceAdapter } from "../adapters";
import type { EventClassification, EventEntityLink, EventSeverity, ImmigrationEvent } from "../events";
import { entityId } from "../entities";
import { resolveEntityMentions } from "../resolve";
import { extractImpact } from "../extract-impact";
import {
  BODY_FETCH_CONCURRENCY,
  FR_UA as UA,
  fetchAllDocuments,
  mapWithConcurrency,
} from "./federal-register-api";

interface PresDocument {
  document_number: string;
  title: string;
  /** "Executive Order" | "Proclamation" | "Memorandum" | "Notice" | "Determination" */
  subtype: string | null;
  executive_order_number?: number | null;
  publication_date: string;
  /** When the President signed it. Usually earlier than publication. */
  signing_date?: string | null;
  abstract: string | null;
  html_url: string;
  json_url?: string;
  raw_text_url?: string | null;
}

/**
 * Immigration relevance.
 *
 * Presidential documents cover everything from trade sanctions to national
 * emergencies. Only a fraction concern immigration, and a reader arriving here
 * from an immigration headline should not find tariff proclamations. The terms
 * below are narrower than the general Federal Register filter for exactly that
 * reason — a "national emergency with respect to Lebanon" is a sanctions
 * document, not an immigration one, unless it also speaks to entry or visas.
 */
const RELEVANCE_TERMS = [
  "immigra", "visa", "nonimmigrant", "alien", "naturaliz", "citizenship",
  "asylum", "refugee", "removal", "deportat",
  // NOT bare "detention": presidential documents on hostage-taking and the
  // wrongful detention of Americans abroad matched it, and those are foreign
  // policy, not immigration. Qualify it instead.
  "immigration detention", "detention of aliens",
  "entry into the united states", "suspension of entry", "restricting entry",
  "border", "migrant", "migration", "port of entry", "admission of",
  "travel ban", "temporary protected status", "parole", "daca", "refugee admissions",
];

function isImmigrationRelevant(doc: PresDocument): boolean {
  const haystack = `${doc.title} ${doc.abstract ?? ""}`.toLowerCase();
  return RELEVANCE_TERMS.some((t) => haystack.includes(t));
}

function classify(): EventClassification {
  // Every document from this adapter is a presidential action. The subtype
  // (Order / Proclamation / Memorandum) is carried in the title and entity link
  // rather than collapsed into the classification.
  return "executive_action";
}

/**
 * Severity.
 *
 * Orders and proclamations are `major`: they direct agencies and can restrict
 * entry immediately. Memoranda and determinations are `notable` — real, but
 * usually procedural or delegating. Nothing here is `routine`; a presidential
 * document that reached the immigration relevance filter is never noise.
 */
function severity(doc: PresDocument): EventSeverity {
  const sub = (doc.subtype ?? "").toLowerCase();
  if (sub.includes("executive order") || sub.includes("proclamation")) return "major";
  return "notable";
}

/** A stable, readable slug for the executive_action entity node. */
function actionSlug(doc: PresDocument): string {
  if (doc.executive_order_number) return `executive-order-${doc.executive_order_number}`;
  return `presidential-document-${doc.document_number}`;
}

async function fetchBody(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { headers: UA, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.text()).slice(0, 200_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toEvent(doc: PresDocument, verifiedAt: string, body: string | null): ImmigrationEvent {
  const classification = classify();
  const scheduled = doc.publication_date > verifiedAt;

  const links: EventEntityLink[] = [
    // The document itself becomes a node, so later documents can amend it and a
    // reader can follow an Executive Order through its amendments.
    {
      entityId: entityId("executive_action", actionSlug(doc)),
      relation: "issued_by",
      basis: "explicit",
      confidence: 1,
    },
    {
      entityId: entityId("topic", "policy-changes"),
      relation: "categorized_as",
      basis: "matched",
      confidence: 0.8,
    },
  ];

  for (const m of resolveEntityMentions(`${doc.title} ${doc.abstract ?? ""}`)) {
    if (links.some((l) => l.entityId === m.entityId)) continue;
    links.push({ entityId: m.entityId, relation: "mentions", basis: "matched", confidence: m.confidence });
  }

  const impact = extractImpact({
    title: doc.title,
    abstract: doc.abstract,
    body,
    // No issuing agency: a presidential document is not an agency action. The
    // agencies it directs come through text resolution, as mentions.
    agencyIds: [],
    effectiveAt: null,
  });

  const limitations: string[] = [
    "A presidential document directs the executive branch. How and when it reaches individual cases depends on the agency guidance that implements it, which is published separately.",
  ];
  if (!doc.abstract) {
    limitations.push("The Federal Register published no abstract for this document; read the original.");
  }
  if (scheduled) {
    limitations.push(
      `Currently on public inspection and scheduled to publish on ${doc.publication_date}.`
    );
  }
  if (doc.signing_date && doc.signing_date !== doc.publication_date) {
    limitations.push(
      `Signed ${doc.signing_date} and published ${doc.publication_date}. It may have taken effect on signing.`
    );
  }

  const subtype = doc.subtype ?? "Presidential document";
  return {
    id: `federal_register:${doc.document_number}`,
    sourceKey: "federal_register",
    classification,
    severity: severity(doc),
    title: doc.executive_order_number
      ? `Executive Order ${doc.executive_order_number}: ${doc.title.trim()}`
      : `${subtype}: ${doc.title.trim()}`,
    summary: doc.abstract?.trim() || "No abstract was published with this document.",
    // Presidential documents are dated by SIGNING where available — that is when
    // the action was taken, and it is the date a reader will see quoted
    // elsewhere. Publication is retained in the limitations above.
    publishedAt: doc.signing_date || doc.publication_date,
    scheduled: (doc.signing_date || doc.publication_date) > verifiedAt || undefined,
    effectiveAt: null,
    lastVerifiedAt: verifiedAt,
    sourceUrl: doc.html_url,
    sourceDataUrl: doc.json_url,
    entities: links,
    impact,
    reviewStatus: "auto",
    limitations,
  };
}

async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  const warnings: string[] = [];
  if (ctx.offline) {
    return { adapterKey: "executive-actions", events: [], warnings: ["offline: skipped"], failed: false };
  }

  const params = new URLSearchParams({
    order: "newest",
    "conditions[publication_date][gte]": ctx.since,
  });
  params.append("conditions[type][]", "PRESDOCU");
  for (const f of [
    "document_number", "title", "subtype", "executive_order_number",
    "publication_date", "signing_date", "abstract", "html_url", "json_url", "raw_text_url",
  ]) {
    params.append("fields[]", f);
  }

  // Read the WHOLE window. Presidential documents run to hundreds per year, so
  // page one was missing executive actions outright — see federal-register-api.ts.
  const { documents: docs, truncation, error } = await fetchAllDocuments<PresDocument>(params);
  if (error) {
    return { adapterKey: "executive-actions", events: [], warnings: [error], failed: true };
  }
  if (truncation) warnings.push(truncation);

  const verifiedAt = new Date().toISOString().slice(0, 10);

  const relevant = docs.filter(isImmigrationRelevant);
  const skipped = docs.length - relevant.length;
  if (skipped > 0) {
    warnings.push(`${skipped} of ${docs.length} presidential document(s) were not immigration-related`);
  }

  const capped = capEvents(relevant, ctx.limit);
  warnings.push(...capped.warnings);

  // Presidential documents are few and consequential — always read the full
  // text. Proclamations restricting entry name their countries inline, which is
  // where "who is affected" matters most.
  const events = await mapWithConcurrency(capped.events, BODY_FETCH_CONCURRENCY, async (d) => {
    const text = await fetchBody(d.raw_text_url);
    if (!text) warnings.push(`could not fetch full text for ${d.document_number}`);
    return toEvent(d, verifiedAt, text);
  });

  return { adapterKey: "executive-actions", events, warnings, failed: false };
}

export const executiveActionsAdapter: SourceAdapter = {
  key: "executive-actions",
  name: "Executive Orders & Presidential Proclamations",
  sourceKey: "federal_register",
  status: "ready",
  coverage:
    "Executive Orders, Presidential Proclamations, memoranda, and determinations published in the Federal Register, filtered to those concerning immigration, entry, or visas.",
  fetchEvents,
};

export const __testing = { classify, severity, isImmigrationRelevant, toEvent, actionSlug };
