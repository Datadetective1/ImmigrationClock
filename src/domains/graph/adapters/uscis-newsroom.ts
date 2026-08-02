// =============================================================================
// USCIS NEWSROOM ADAPTER
//
// USCIS publishes an "All News" RSS feed carrying cap announcements, policy
// changes, TPS designations, litigation notices, and office openings. It is the
// fastest official signal that something has changed at the agency most readers
// deal with directly — usually days ahead of the Federal Register.
//
// -----------------------------------------------------------------------------
// AN EDITORIAL DECISION THAT NEEDED MAKING
// -----------------------------------------------------------------------------
// The same feed also carries law-enforcement press releases about INDIVIDUAL
// criminal prosecutions — named people, sentenced for fraud or smuggling, often
// described in charged language ("Illegal Alien Child Rapist Sentenced…").
//
// This adapter excludes those, deliberately, for four reasons:
//
//   1. They name private individuals. The platform's own entity rule forbids
//      nodes for private people, and /methodology already promises "no
//      individual immigrant profiles, tracking, or identifying personal data".
//      Ingesting these would break both.
//
//   2. Their framing is not neutral. /methodology promises "no dehumanizing
//      language, slurs, or inflammatory framing". Republishing agency headlines
//      verbatim would import exactly that framing into a platform whose value is
//      being the calm, sourced place to check facts.
//
//   3. They are not policy change. A single sentencing answers none of the three
//      questions every event must answer — what changed, who is affected, what
//      to do next. It is crime news, and the platform is not a crime-news site.
//
//   4. The audience. Directive Part 2 lists "individuals navigating immigration"
//      and "families supporting loved ones" first. A feed that interleaves "the
//      H-1B cap was reached" with individual prosecutions is not a neutral
//      information platform to those readers.
//
// This is NOT the platform hiding enforcement. Aggregate enforcement data — ICE
// arrests, removals, detention — is tracked and published as statistics, with
// sources. What is excluded is the republication of individual criminal cases.
// The distinction is between reporting the system and reporting on people.
//
// The filter is explicit, tested, and documented here so it can be audited and
// argued with, rather than buried.
// =============================================================================

import type { AdapterContext, AdapterResult, SourceAdapter } from "../adapters";
import type { EventClassification, EventEntityLink, EventSeverity, ImmigrationEvent } from "../events";
import { entityId } from "../entities";
import { resolveEntityMentions } from "../resolve";
import { extractImpact } from "../extract-impact";
import { fetchFeed, type RssItem } from "../rss";

const FEED = "https://www.uscis.gov/news/rss-feed/59144";
const UA = "ImmigrationClock/1.0 (+https://immigrationclock.com)";

/**
 * Markers of an individual criminal-case press release.
 *
 * Matched against the title, which is where these are unambiguous. The list is
 * intentionally broad: a false exclusion loses one press release, while a false
 * inclusion publishes a named private individual on a platform that promised not
 * to. The asymmetry decides the tuning.
 */
// COVER BOTH VOICES. Agency headlines alternate freely between passive ("Man
// Indicted for Fraud") and active ("Grand Jury Indicts Three"). A list carrying
// only one conjugation looks complete and leaks the other — "indicts" was
// missing until a test caught it, and would have published a headline naming
// three private individuals. When adding a marker, add its conjugations too.
const INDIVIDUAL_CASE_MARKERS = [
  "sentenced",
  "sentences",
  "sentencing",
  "guilty",
  "pleads guilty",
  "pleaded guilty",
  "guilty plea",
  "found guilty",
  "guilty of",
  "convicted",
  "convicts",
  "conviction",
  "jury",
  "indicted",
  "indicts",
  "indictment",
  "extradited",
  "extradition",
  "arrested",
  "arrest of",
  "arrests in",
  "charged with",
  "investigation resulting in",
  "criminal investigation",
  "plays critical role",
  "assists federal partners",
  "efforts lead to",
  "denaturalize",
  "denaturalization",
  "revoke u.s. citizenship",
  "strip u.s. citizenship",
  "sex offender",
  "child molester",
  "gang member",
  "smuggling conspiracy",
  "fraud conspiracy",
  "prison",
  "home detention",
];

export function isIndividualCriminalCase(item: RssItem): boolean {
  const t = item.title.toLowerCase();
  return INDIVIDUAL_CASE_MARKERS.some((m) => t.includes(m));
}

/**
 * Policy relevance. USCIS also posts operational notes and local announcements;
 * we keep the ones that change something a reader might act on.
 */
const POLICY_MARKERS = [
  "policy", "rule", "regulation", "guidance", "announce", "extend", "extends",
  "designat", "cap", "lottery", "registration", "fee", "form", "processing",
  "eligibility", "temporary protected status", "tps", "parole", "asylum",
  "citizenship", "naturalization", "green card", "adjustment of status",
  "employment authorization", "court", "injunction", "stay", "litigation",
  "opens", "office", "backlog", "requirement", "deadline", "waiver",
];

export function isPolicyRelevant(item: RssItem): boolean {
  const hay = `${item.title} ${item.description ?? ""}`.toLowerCase();
  return POLICY_MARKERS.some((m) => hay.includes(m));
}

/**
 * Classification from the announcement's own language.
 *
 * USCIS press releases do not carry structured types, so this reads the title.
 * Where it cannot tell, it returns `announcement` — the honest default — rather
 * than guessing at something stronger like `final_rule`.
 */
export function classify(item: RssItem): EventClassification {
  const t = item.title.toLowerCase();
  if (/\b(court|injunction|stay|judge|ruling|litigation)\b/.test(t)) return "court_decision";
  if (/\b(final rule|rescind|revokes|revoking)\b/.test(t)) return "final_rule";
  if (/\bproposed rule\b/.test(t)) return "proposed_rule";
  if (/\b(cap reached|reaches .*cap|registration period|filing period|deadline)\b/.test(t)) return "deadline";
  if (/\b(correction|corrected)\b/.test(t)) return "correction";
  if (/\b(updates?|revis)/.test(t)) return "updated_information";
  return "announcement";
}

/**
 * Severity by explicit rule.
 *
 * `major` is reserved for things that change what someone can do or must do:
 * rules, court orders, cap exhaustion, TPS designations. Everything else that
 * survives the filters is `notable` — a USCIS announcement that reached this
 * point is never noise, but nor is an office opening a policy change.
 */
export function severity(item: RssItem, classification: EventClassification): EventSeverity {
  const t = item.title.toLowerCase();
  if (classification === "final_rule" || classification === "court_decision") return "major";
  if (/\b(cap reached|reaches .*cap|temporary protected status|tps|parole|rescind)\b/.test(t)) return "major";
  if (classification === "deadline") return "major";
  if (/\b(opens|office|reminder|outreach|webinar)\b/.test(t)) return "routine";
  return "notable";
}

/** Stable id from the feed's own guid, falling back to the URL path. */
export function stableId(item: RssItem): string {
  const raw = item.guid?.trim() || item.link.replace(/^https?:\/\/[^/]+/, "");
  return `uscis_newsroom:${raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120)}`;
}

export function toEvent(item: RssItem, verifiedAt: string): ImmigrationEvent {
  const classification = classify(item);
  const links: EventEntityLink[] = [
    { entityId: entityId("agency", "uscis"), relation: "issued_by", basis: "explicit", confidence: 1 },
    { entityId: entityId("topic", "policy-changes"), relation: "categorized_as", basis: "matched", confidence: 0.7 },
  ];
  for (const m of resolveEntityMentions(`${item.title} ${item.description ?? ""}`)) {
    if (links.some((l) => l.entityId === m.entityId)) continue;
    links.push({ entityId: m.entityId, relation: "mentions", basis: "matched", confidence: m.confidence });
  }

  const impact = extractImpact({
    title: item.title,
    abstract: item.description,
    agencyIds: [entityId("agency", "uscis")],
    effectiveAt: null,
  });

  return {
    id: stableId(item),
    sourceKey: "uscis_newsroom",
    issuingAgencyId: entityId("agency", "uscis"),
    classification,
    severity: severity(item, classification),
    title: item.title,
    summary: item.description?.trim() || "No summary was published with this announcement.",
    // A press release is dated by publication and nothing else. USCIS does not
    // give these an effective date, so we do not invent one.
    publishedAt: item.publishedAt!,
    effectiveAt: null,
    lastVerifiedAt: verifiedAt,
    sourceUrl: item.link,
    entities: links,
    impact,
    reviewStatus: "auto",
    limitations: [
      "A USCIS announcement describes the agency's own action. Legal effect, and the detail of how it applies, usually arrives separately in the Federal Register or the USCIS Policy Manual.",
      ...(item.description ? [] : ["The feed carried no summary for this item; read the original."]),
    ],
  };
}

async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  if (ctx.offline) {
    return { adapterKey: "uscis-newsroom", events: [], warnings: ["offline: skipped"], failed: false };
  }

  const { items, error } = await fetchFeed(FEED, UA);
  if (error) {
    return { adapterKey: "uscis-newsroom", events: [], warnings: [error], failed: true };
  }

  const warnings: string[] = [];
  const verifiedAt = new Date().toISOString().slice(0, 10);

  let excludedIndividual = 0;
  let excludedIrrelevant = 0;
  let excludedUndated = 0;

  const keep: RssItem[] = [];
  for (const item of items) {
    if (!item.publishedAt) {
      // Without a real date an event cannot be placed on a timeline, and a
      // guessed date is worse than a dropped item.
      excludedUndated++;
      continue;
    }
    if (item.publishedAt < ctx.since) continue;
    if (isIndividualCriminalCase(item)) {
      excludedIndividual++;
      continue;
    }
    if (!isPolicyRelevant(item)) {
      excludedIrrelevant++;
      continue;
    }
    keep.push(item);
  }

  if (excludedIndividual > 0) {
    warnings.push(
      `${excludedIndividual} individual criminal-case press release(s) excluded by editorial policy (see adapter header)`
    );
  }
  if (excludedIrrelevant > 0) warnings.push(`${excludedIrrelevant} item(s) were not policy-relevant`);
  if (excludedUndated > 0) warnings.push(`${excludedUndated} item(s) had no parseable publication date`);

  return {
    adapterKey: "uscis-newsroom",
    events: keep.slice(0, ctx.limit).map((i) => toEvent(i, verifiedAt)),
    warnings,
    failed: false,
  };
}

export const uscisNewsroomAdapter: SourceAdapter = {
  key: "uscis-newsroom",
  name: "USCIS newsroom & policy alerts",
  sourceKey: "uscis_newsroom",
  status: "ready",
  coverage:
    "USCIS announcements: cap and lottery news, policy changes, TPS designations, fee and form changes, and litigation notices. Individual criminal-prosecution press releases are excluded by editorial policy — the platform reports the system, not named private individuals.",
  fetchEvents,
};

export const __testing = { classify, severity, toEvent, stableId, isIndividualCriminalCase, isPolicyRelevant };
