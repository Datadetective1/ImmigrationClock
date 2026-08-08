// =============================================================================
// FEDERAL REGISTER ADAPTER — the first implementation of the source contract
//
// The Federal Register is where U.S. immigration policy actually changes: rules,
// proposed rules, agency notices, and Presidential documents all appear here on
// the day they publish, in a free JSON API with no key.
//
// This is ONE adapter. It deliberately contains nothing that other adapters will
// need — classification rules, severity rules, and entity resolution all live in
// shared modules so that the courts, Congress, USCIS newsroom, and Visa Bulletin
// adapters reuse them rather than reinventing them.
//
// WHAT THIS ADAPTER WILL NOT DO
// -----------------------------
// It does not summarize with a language model. Every field it emits is either
// copied verbatim from the government document or derived by an explicit rule in
// this file. Directive Part 1: "AI may never invent facts." A generated summary
// may be added later, but only as a `draft` requiring human approval, and only
// after this structured extraction has already happened.
// =============================================================================

import { capEvents, type AdapterContext, type AdapterResult, type SourceAdapter } from "../adapters";
import type {
  EventClassification,
  EventSeverity,
  EventEntityLink,
  ImmigrationEvent,
} from "../events";
import { entityId } from "../entities";
import { resolveEntityMentions } from "../resolve";
import { extractImpact } from "../extract-impact";
import {
  BODY_FETCH_CONCURRENCY,
  FR_UA as UA,
  fetchAllDocuments,
  mapWithConcurrency,
} from "./federal-register-api";
import {
  isImmigrationRelevant as sharedIsImmigrationRelevant,
  isNonSubstantive,
  materiality,
  withoutAgencyNames,
} from "../immigration-filter";

/**
 * Agencies we track, mapped from the Federal Register's own slugs to our entity
 * ids. Using the API's structured `agencies` array rather than parsing text
 * means every `issued_by` edge is an EXPLICIT link, not an inference.
 */
const AGENCY_SLUGS: Record<string, string> = {
  "u-s-citizenship-and-immigration-services": "agency:uscis",
  "homeland-security-department": "agency:dhs",
  "u-s-customs-and-border-protection": "agency:cbp",
  "u-s-immigration-and-customs-enforcement": "agency:ice",
  "state-department": "agency:dos",
  "labor-department": "agency:dol",
  "employment-and-training-administration": "agency:dol",
  "executive-office-for-immigration-review": "agency:eoir",
  "justice-department": "agency:doj",
};

/** Query only the agencies that actually make immigration policy. */
const TRACKED_AGENCY_SLUGS = Object.keys(AGENCY_SLUGS);

interface FrAgency {
  slug?: string;
  name?: string;
  raw_name?: string;
}

interface FrDocument {
  document_number: string;
  title: string;
  type: string; // "Rule" | "Proposed Rule" | "Notice" | "Presidential Document"
  publication_date: string;
  effective_on: string | null;
  html_url: string;
  json_url?: string;
  abstract: string | null;
  agencies?: FrAgency[];
  presidential_document_type?: string | null;
  action?: string | null;
  raw_text_url?: string | null;
}

/**
 * Map the Federal Register's document type to our classification.
 *
 * The distinction between a proposed rule and a final rule is the single most
 * consequential thing this adapter gets right: one is a plan open for comment,
 * the other changes what people must do. Conflating them would misinform readers
 * about their actual obligations.
 */
function classify(doc: FrDocument): EventClassification {
  const type = doc.type?.toLowerCase() ?? "";
  if (type.includes("presidential")) return "executive_action";
  if (type.includes("proposed")) return "proposed_rule";
  if (type === "rule") return "final_rule";
  const action = (doc.action ?? "").toLowerCase();
  if (action.includes("correction")) return "correction";
  return "announcement";
}

/**
 * Severity by explicit rule, never by editorial judgement or engagement.
 *
 * TYPE AND IMPACT, not type alone. Until 2026-08-08 this read the document type
 * and nothing else: every final rule was `major`. That is defensible in the
 * abstract and produced nonsense in practice — a Coast Guard safety zone for a
 * fireworks display and the termination of Temporary Protected Status for Yemen
 * are both final rules, and both were badged Major. A six-story issue in which
 * every story is Major has a badge that distinguishes nothing.
 *
 * So a document must be BOTH the kind of thing that changes obligations AND
 * carry a signal that it actually changes some:
 *
 *   major   — in force or executive, AND materially changes what people can or
 *             must do (eligibility, fees, status, enforcement, a ban, a
 *             termination, a designation).
 *   notable — proposed, or in force but incremental.
 *   routine — non-substantive by its own description: information collections,
 *             technical amendments, delegations, meeting notices. Real
 *             documents, archived, but they must never lead a feed.
 */
function severity(doc: FrDocument, classification: EventClassification): EventSeverity {
  if (isNonSubstantive(doc.title)) return "routine";

  const impact = materiality(doc.title, doc.abstract ?? "");
  const inForce = classification === "final_rule" || classification === "executive_action";

  if (inForce) return impact === "high" ? "major" : "notable";
  if (classification === "proposed_rule") return impact === "high" ? "notable" : "routine";
  return "routine";
}

/**
 * Immigration relevance filter.
 *
 * Tracked agencies publish plenty that has nothing to do with immigration (CBP
 * issues customs rulings; Labor covers all of labour policy; the Coast Guard is
 * a DHS component and regulates boat races). The rules now live in
 * ../immigration-filter.ts, which replaced substring matching over bare words
 * with word-anchored subject patterns plus a veto on document families that are
 * never immigration policy.
 *
 * Takes only the two fields it reads, so build-events.ts can re-apply it to a
 * STORED event and retract what an older, looser filter admitted.
 */
function isImmigrationRelevant(doc: Pick<FrDocument, "title" | "abstract">): boolean {
  return sharedIsImmigrationRelevant(doc.title, doc.abstract ?? "");
}

/** Explicit `issued_by` edges from the API's structured agency array. */
function agencyLinks(doc: FrDocument): EventEntityLink[] {
  const out: EventEntityLink[] = [];
  const seen = new Set<string>();
  for (const a of doc.agencies ?? []) {
    const id = a.slug ? AGENCY_SLUGS[a.slug] : undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ entityId: id, relation: "issued_by", basis: "explicit", confidence: 1 });
  }
  return out;
}

/** Choose the topic this document belongs under, by explicit keyword rule. */
function topicLink(doc: FrDocument): EventEntityLink | null {
  // Same agency-name strip as the relevance filter, and for the same reason:
  // "Customs and Border Protection" was filing every customs rule under the
  // border topic, which is how topic:border came to hold 232 events.
  const h = withoutAgencyNames(`${doc.title} ${doc.abstract ?? ""}`.toLowerCase());
  const RULES: [string, string[]][] = [
    ["h1b", ["h-1b", "specialty occupation", "cap-subject"]],
    ["international-students", ["f-1", "sevis", "student and exchange", "optional practical training"]],
    ["workforce-reductions", ["layoff", "warn act"]],
    ["border", ["border", "port of entry", "expedited removal"]],
    ["enforcement", ["detention", "removal", "deportat", "enforcement"]],
    // NOTE: "petition" alone is deliberately absent. It matched documents like
    // "Procedures for Submission of Petitions for Rulemaking", which have nothing
    // to do with employer sponsorship. A wrong edge is worse than a missing one.
    ["employers", ["labor certification", "perm ", "employer", "immigrant petition", "nonimmigrant petition"]],
    ["visa-bulletin", ["visa bulletin", "priority date", "preference category"]],
  ];
  for (const [slug, terms] of RULES) {
    if (terms.some((t) => h.includes(t))) {
      return {
        entityId: entityId("topic", slug),
        relation: "categorized_as",
        basis: "matched",
        confidence: 0.8,
      };
    }
  }
  return { entityId: entityId("topic", "policy-changes"), relation: "categorized_as", basis: "matched", confidence: 0.6 };
}

/**
 * Turn one Federal Register document into an event.
 *
 * `summary` is the government's own abstract, verbatim and untouched. When there
 * is no abstract we say so rather than writing one — an empty abstract is a fact
 * about the document, and inventing prose to fill the gap is exactly the failure
 * this platform corrected in its layoff data.
 */
/**
 * Fetch a document's full text.
 *
 * Only called for non-routine events. The abstract alone is often silent about
 * scope — the Visa Bond Program rule names its covered countries in the rule
 * body, not the abstract — and "who is affected" is only useful if it can see
 * where that list actually lives. Restricting this to major and notable events
 * keeps request volume proportionate: routine paperwork notices have no scope
 * list worth fetching.
 *
 * Returns null on any failure. A missing body degrades impact extraction to
 * abstract-only, which is honest, rather than failing the event.
 */
async function fetchBody(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { headers: UA, signal: controller.signal });
    if (!res.ok) return null;
    const text = await res.text();
    // Scope and requirement language lives in the preamble. Cap the read so one
    // very long rule cannot dominate extraction time or memory.
    return text.slice(0, 200_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toEvent(doc: FrDocument, verifiedAt: string, body?: string | null): ImmigrationEvent {
  const classification = classify(doc);
  // The Federal Register places documents on public inspection several days
  // before their official publication date, so a future date here is real and
  // citable — not a data error. It must never render as "published", though.
  const scheduled = doc.publication_date > verifiedAt;
  const links: EventEntityLink[] = [...agencyLinks(doc)];

  const topic = topicLink(doc);
  if (topic) links.push(topic);

  // Resolve visa categories and countries named in the title/abstract. These are
  // `matched`, never `explicit` — they are our inference from text and are
  // labelled as such throughout the graph.
  for (const m of resolveEntityMentions(`${doc.title} ${doc.abstract ?? ""}`)) {
    if (links.some((l) => l.entityId === m.entityId)) continue;
    links.push({ entityId: m.entityId, relation: "mentions", basis: "matched", confidence: m.confidence });
  }

  const limitations: string[] = [];
  if (classification === "proposed_rule") {
    limitations.push(
      "This is a PROPOSED rule. It is not in force, may change before finalisation, and may never be finalised."
    );
  }
  if (classification === "final_rule" && !doc.effective_on) {
    limitations.push("The document does not state an effective date in its metadata — check the rule text.");
  }
  if (!doc.abstract) {
    limitations.push("The Federal Register published no abstract for this document; read the original.");
  }
  if (scheduled) {
    limitations.push(
      `Currently on public inspection and scheduled to publish on ${doc.publication_date}. The text can still change before then.`
    );
  }

  // WHO IS AFFECTED. Built only from what the document itself states, using the
  // shared extractor so every source answers this question identically.
  const agencyIds = agencyLinks(doc).map((l) => l.entityId);
  const impact = extractImpact({
    title: doc.title,
    abstract: doc.abstract,
    body,
    agencyIds,
    effectiveAt: classification === "proposed_rule" ? null : doc.effective_on,
  });

  return {
    // Deterministic: the same document always yields the same id, so re-running
    // ingestion never republishes an old event as new.
    id: `federal_register:${doc.document_number}`,
    sourceKey: "federal_register",
    issuingAgencyId: agencyLinks(doc)[0]?.entityId,
    classification,
    severity: severity(doc, classification),
    title: doc.title.trim(),
    summary: doc.abstract?.trim() || "No abstract was published with this document.",
    publishedAt: doc.publication_date,
    scheduled: scheduled || undefined,
    // A proposed rule has no effective date by definition; the event validator
    // enforces this too.
    effectiveAt: classification === "proposed_rule" ? null : doc.effective_on,
    lastVerifiedAt: verifiedAt,
    sourceUrl: doc.html_url,
    sourceDataUrl: doc.json_url,
    entities: links,
    impact,
    // Emitted straight from government metadata with no generated prose, so this
    // needs no human gate. Anything LLM-assisted would be "draft" instead.
    reviewStatus: "auto",
    limitations: limitations.length ? limitations : undefined,
  };
}

async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  const warnings: string[] = [];
  if (ctx.offline) {
    return { adapterKey: "federal-register", events: [], warnings: ["offline: skipped"], failed: false };
  }

  const params = new URLSearchParams({
    order: "newest",
    "conditions[publication_date][gte]": ctx.since,
  });
  for (const slug of TRACKED_AGENCY_SLUGS) params.append("conditions[agencies][]", slug);
  for (const f of [
    "document_number", "title", "type", "publication_date", "effective_on",
    "html_url", "json_url", "abstract", "agencies", "action", "raw_text_url",
  ]) {
    params.append("fields[]", f);
  }

  // Read the WHOLE window, not the first page. See federal-register-api.ts for
  // what page-one-only cost us.
  const { documents: docs, truncation, error } = await fetchAllDocuments<FrDocument>(params);
  if (error) {
    // Never throw: one failing source must not take down an ingestion run.
    return { adapterKey: "federal-register", events: [], warnings: [error], failed: true };
  }
  if (truncation) warnings.push(truncation);

  const verifiedAt = new Date().toISOString().slice(0, 10);

  const relevant = docs.filter(isImmigrationRelevant);
  const skipped = docs.length - relevant.length;
  if (skipped > 0) {
    warnings.push(
      `${skipped} of ${docs.length} document(s) from tracked agencies were not immigration-related`
    );
  }

  // Cap BEFORE reading full texts. One relevant document yields exactly one
  // event, so capping documents is capping events — and it keeps the number of
  // full-text reads proportionate to what we will actually publish instead of
  // to the size of the window.
  const capped = capEvents(relevant, ctx.limit);
  warnings.push(...capped.warnings);

  // Two passes: classify from metadata first, then fetch full text only for the
  // documents whose scope actually matters to a reader.
  const events = await mapWithConcurrency(capped.events, BODY_FETCH_CONCURRENCY, async (d) => {
    const provisional = severity(d, classify(d));
    const body = provisional === "routine" ? null : await fetchBody(d.raw_text_url);
    if (provisional !== "routine" && !body) {
      warnings.push(`could not fetch full text for ${d.document_number}; impact from abstract only`);
    }
    return toEvent(d, verifiedAt, body);
  });

  return { adapterKey: "federal-register", events, warnings, failed: false };
}

export const federalRegisterAdapter: SourceAdapter = {
  key: "federal-register",
  name: "Federal Register",
  sourceKey: "federal_register",
  status: "ready",
  coverage:
    "Rules, proposed rules, notices, and Presidential documents from USCIS, DHS, CBP, ICE, State, Labor, EOIR, and DOJ, filtered to immigration-related content.",
  fetchEvents,
};

// Exported for tests: classification and severity are the rules most likely to
// mislead if they drift, so they are pinned directly rather than only through
// the adapter's network path.
export const __testing = {
  classify,
  severity,
  isImmigrationRelevant,
  toEvent,
  topicLink,
  // Exposed so a test can assert the tracked-agency map still covers agencies
  // that have no adapter of their own. State is the live case: its own channels
  // are unreachable, so this map is the platform's only route to DOS policy.
  __agencySlugs: AGENCY_SLUGS,
};
