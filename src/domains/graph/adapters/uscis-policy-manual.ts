// =============================================================================
// USCIS POLICY MANUAL ADAPTER
//
// The Policy Manual is the agency's controlling adjudication guidance — what
// officers actually apply when deciding a case. A newsroom post announces that
// something changed; the Policy Manual IS the change. For a reader trying to
// understand why an adjudication went the way it did, this is the closer source.
//
// -----------------------------------------------------------------------------
// WHY THIS SCRAPES HTML WHEN THE VISA BULLETIN IS MARKED `blocked`
// -----------------------------------------------------------------------------
// Both are HTML-only, so the difference needs stating rather than assuming.
//
//   • The Visa Bulletin publishes a TABLE OF DATES. A mis-parsed cell yields a
//     priority date that is confidently wrong, and a reader will act on it —
//     book travel, quit a job, file or not file. The damage is silent.
//
//   • The Policy Manual updates page publishes a LIST OF DOCUMENTS: a title, a
//     machine-readable <time datetime> attribute, a prose body, a PDF link, and
//     a set of formal citations. There is no figure to get subtly wrong. A parse
//     failure produces a missing or malformed event, which validateEvent rejects
//     and the build reports — it does not produce a plausible false fact.
//
// The failure MODE is what separates them, not the format. Structural drift is
// still a real risk for any scraper, so this adapter fails loudly: if the page
// yields no rows, or rows without dates, it reports `failed` rather than
// returning an empty success that would look like a quiet week at the agency.
//
// -----------------------------------------------------------------------------
// SEVERITY COMES FROM USCIS'S OWN TAXONOMY
// -----------------------------------------------------------------------------
// USCIS labels every entry itself, and the labels are load-bearing:
//
//   POLICY ALERT     — substantive guidance, issued with a signed PDF.
//   Technical Update — explicitly non-substantive: a corrected citation, a
//                      renumbered footnote, a refreshed external reference.
//
// So severity is read from the publisher's label rather than assigned by us
// reading the prose. That is the strongest form of the platform's rule that
// severity comes from explicit, auditable criteria and never from a model.
//
// -----------------------------------------------------------------------------
// WHY NO EFFECTIVE DATE
// -----------------------------------------------------------------------------
// The updates page does not publish one. The prose frequently contains dates
// that are NOT the guidance's effective date — one technical update reads "This
// list was last revised on December 9, 2024, and became effective as of that
// date", describing a State Department list, not the USCIS guidance. A regex
// looking for "effective" would attach that date to the wrong thing and tell a
// reader their obligations began on a day they did not.
//
// So `effectiveAt` is null on every event from this source, and the limitation
// says where the real date lives. Refusing to answer is correct here; guessing
// is not.
// =============================================================================

import { capEvents } from "../adapters";
import type { AdapterContext, AdapterResult, SourceAdapter } from "../adapters";
import type {
  EventClassification,
  EventEntityLink,
  EventSeverity,
  ImmigrationEvent,
} from "../events";
import { entityId } from "../entities";
import { resolveEntityMentions } from "../resolve";
import { extractImpact } from "../extract-impact";
import { plainText, richText } from "../text";

const UPDATES_URL = "https://www.uscis.gov/policy-manual/updates";
const UA = "ImmigrationClock/1.0 (+https://immigrationclock.com)";
const SOURCE_KEY = "uscis_policy_manual";

/** What USCIS calls this entry. Read from the page, never inferred. */
export type UpdateKind = "policy_alert" | "technical_update";

export interface AffectedSection {
  /** Formal citation, e.g. "1 USCIS-PM D.1". */
  citation: string;
  /** Chapter title, e.g. "Chapter 1 - Purpose and Background". */
  title: string;
  /** Absolute URL to the affected chapter. */
  url: string;
  /** Volume number parsed from the citation, when it is well-formed. */
  volume: number | null;
}

export interface PolicyManualUpdate {
  kind: UpdateKind;
  /** Title with the "POLICY ALERT - " / "Technical Update - " prefix removed. */
  title: string;
  publishedAt: string | null;
  body: string | null;
  /** The signed PDF. Policy alerts have one; technical updates do not. */
  pdfUrl: string | null;
  affectedSections: AffectedSection[];
}

/**
 * The Policy Manual's own volume structure.
 *
 * Hardcoded deliberately: this is a stable, published taxonomy that USCIS
 * organizes its own guidance by, not our editorial invention. A volume number
 * parsed out of a citation the agency printed is therefore a fact about the
 * document, and naming the volume makes the citation legible to a reader who
 * does not know what "6 USCIS-PM B.2" refers to.
 *
 * These names are NOT mapped onto per-subject topic nodes. The current topic
 * registry has no counterpart for humanitarian protection, adoptions, or
 * naturalization, and minting entity nodes with no page behind them would put
 * dead ends in the graph. Every update is filed under `policy-changes`, which
 * is accurate for all of them, and the visa and country links still come from
 * the shared resolver reading the title and body.
 */
export const VOLUME_SUBJECTS: Record<number, { name: string }> = {
  1: { name: "General Policies and Procedures" },
  2: { name: "Nonimmigrants" },
  3: { name: "Humanitarian Protection and Parole" },
  4: { name: "Refugees and Asylees" },
  5: { name: "Adoptions" },
  6: { name: "Immigrants" },
  7: { name: "Adjustment of Status" },
  8: { name: "Admissibility" },
  9: { name: "Waivers and Other Forms of Relief" },
  10: { name: "Employment Authorization" },
  11: { name: "Travel and Identity Documents" },
  12: { name: "Citizenship and Naturalization" },
};

// -----------------------------------------------------------------------------
// Parsing
// -----------------------------------------------------------------------------

/** Pull one attribute out of a tag matched by `re`. */
function firstMatch(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m ? m[1] : null;
}

/**
 * Split the page into per-update blocks.
 *
 * The updates list is a Drupal view whose rows are marked `views-row`. Splitting
 * on that marker is more robust than trying to balance nested <div>s with a
 * regex, which is not something regular expressions can do correctly.
 */
export function splitRows(html: string): string[] {
  return html.split(/<div class="views-row/).slice(1);
}

export function parseAffectedSections(row: string): AffectedSection[] {
  const out: AffectedSection[] = [];
  const re =
    /<p class="affected-sections"><a href="([^"]+)"><span class="citation">([^<]*)<\/span>\s*-\s*<span>([^<]*)<\/span>/g;
  for (const [, href, citation, title] of row.matchAll(re)) {
    const cite = plainText(citation);
    out.push({
      citation: cite,
      title: plainText(title),
      url: href.startsWith("http") ? href : `https://www.uscis.gov${href}`,
      volume: parseVolume(cite),
    });
  }
  return out;
}

/** "1 USCIS-PM D.1" → 1. Returns null when the citation is not well-formed. */
export function parseVolume(citation: string): number | null {
  const m = /^(\d+)\s+USCIS-PM\b/i.exec(citation.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return VOLUME_SUBJECTS[n] ? n : null;
}

/** ISO date from the row's <time datetime="..."> attribute. */
export function parseRowDate(row: string): string | null {
  const raw = firstMatch(row, /<time datetime="([^"]+)"/);
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  const year = Number(iso.slice(0, 4));
  // The Policy Manual began in 2013. Anything outside a plausible band is a
  // parse failure, not a fact.
  if (year < 2010 || year > new Date().getUTCFullYear() + 1) return null;
  return iso;
}

export function parseRow(row: string): PolicyManualUpdate | null {
  const rawHeader = firstMatch(row, /pm-resource__update_header">([^<]*)</);
  if (!rawHeader) return null;
  const header = plainText(rawHeader);

  // USCIS's own label, and the only thing severity is read from.
  const kindMatch = /^\s*(policy alert|technical update)\s*-\s*/i.exec(header);
  if (!kindMatch) return null;
  const kind: UpdateKind =
    kindMatch[1].toLowerCase() === "policy alert" ? "policy_alert" : "technical_update";

  const title = header.slice(kindMatch[0].length).trim();
  if (!title) return null;

  const rawBody = firstMatch(row, /field--name-body field__item">([\s\S]*?)<\/div>/);

  return {
    kind,
    title,
    publishedAt: parseRowDate(row),
    body: rawBody ? richText(rawBody) || null : null,
    pdfUrl: firstMatch(
      row,
      /href="(https:\/\/www\.uscis\.gov\/sites\/default\/files\/document\/policy-manual-updates\/[^"]+)"/
    ),
    affectedSections: parseAffectedSections(row),
  };
}

export function parseUpdatesPage(html: string): PolicyManualUpdate[] {
  const out: PolicyManualUpdate[] = [];
  for (const row of splitRows(html)) {
    const parsed = parseRow(row);
    if (parsed) out.push(parsed);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Classification, severity, identity
// -----------------------------------------------------------------------------

/**
 * A technical update that says it corrects something is a `correction`;
 * otherwise both kinds update guidance already published, which is
 * `updated_information`. Neither is a rule — the Policy Manual is guidance,
 * and calling it `final_rule` would misdescribe its legal character.
 */
export function classify(u: PolicyManualUpdate): EventClassification {
  const hay = `${u.title} ${u.body ?? ""}`.toLowerCase();
  if (u.kind === "technical_update" && /\bcorrect(s|ed|ion|ing)?\b/.test(hay)) return "correction";
  return "updated_information";
}

/**
 * Severity from USCIS's own label. No prose reading, no model.
 *
 * A policy alert is substantive adjudication guidance and changes how a case is
 * decided, which is the definition of `major` here. A technical update is
 * declared non-substantive by the publisher, so it is `routine` — it belongs in
 * the archive and on entity pages, but it must never lead a "what changed" feed.
 */
export function severity(u: PolicyManualUpdate): EventSeverity {
  return u.kind === "policy_alert" ? "major" : "routine";
}

/**
 * Stable id.
 *
 * Policy alerts get theirs from the PDF filename stem, which USCIS date-stamps
 * ("20260713-AttorneysAndRepresentatives") and does not change. Technical
 * updates have no PDF, so the id is built from the date plus a slug of the
 * title. Both are deterministic: re-ingesting the same row must produce the same
 * id, or every build would re-announce the entire back catalogue.
 */
export function stableId(u: PolicyManualUpdate): string {
  if (u.pdfUrl) {
    const stem = u.pdfUrl.split("/").pop()!.replace(/\.pdf$/i, "");
    return `${SOURCE_KEY}:${slug(stem)}`;
  }
  return `${SOURCE_KEY}:${u.publishedAt ?? "undated"}-${slug(u.title).slice(0, 80)}`;
}

function slug(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

// -----------------------------------------------------------------------------
// Event construction
// -----------------------------------------------------------------------------

export function toEvent(u: PolicyManualUpdate, verifiedAt: string): ImmigrationEvent {
  const links: EventEntityLink[] = [
    { entityId: entityId("agency", "uscis"), relation: "issued_by", basis: "explicit", confidence: 1 },
  ];

  // Affected sections are the agency's OWN statement of what this changes, so
  // the volume-part node is an explicit link, not a matched one.
  const seenPolicy = new Set<string>();
  for (const s of u.affectedSections) {
    if (s.volume === null) continue;
    const part = /^\d+\s+USCIS-PM\s+([A-Z]+)\./i.exec(s.citation)?.[1];
    const id = entityId("policy", `uscis-pm-volume-${s.volume}${part ? `-part-${part}` : ""}`);
    if (seenPolicy.has(id)) continue;
    seenPolicy.add(id);
    links.push({ entityId: id, relation: "amends", basis: "explicit", confidence: 1 });
  }

  // Every Policy Manual update is a change to how the system works, which is
  // precisely what the `policy-changes` topic covers.
  links.push({
    entityId: entityId("topic", "policy-changes"),
    relation: "categorized_as",
    basis: "explicit",
    confidence: 1,
  });

  for (const m of resolveEntityMentions(`${u.title} ${u.body ?? ""}`)) {
    if (links.some((l) => l.entityId === m.entityId)) continue;
    links.push({ entityId: m.entityId, relation: "mentions", basis: "matched", confidence: m.confidence });
  }

  const impact = extractImpact({
    title: u.title,
    abstract: u.body ?? undefined,
    agencyIds: [entityId("agency", "uscis")],
    effectiveAt: null,
  });

  const kindLabel = u.kind === "policy_alert" ? "Policy alert" : "Technical update";
  const citations = u.affectedSections.map((s) => s.citation).filter(Boolean);

  // Name the volumes so "6 USCIS-PM B.2" means something to a reader who has
  // never opened the Policy Manual.
  const volumeNames = [
    ...new Set(
      u.affectedSections
        .map((s) => (s.volume === null ? null : VOLUME_SUBJECTS[s.volume]?.name))
        .filter((n): n is string => Boolean(n))
    ),
  ];

  return {
    id: stableId(u),
    sourceKey: SOURCE_KEY,
    issuingAgencyId: entityId("agency", "uscis"),
    classification: classify(u),
    severity: severity(u),
    title: `${kindLabel}: ${u.title}`,
    summary: u.body?.trim() || "USCIS published no summary with this Policy Manual update.",
    publishedAt: u.publishedAt!,
    // Deliberately null. See the header — the updates page publishes no
    // effective date, and the prose dates usually belong to something else.
    effectiveAt: null,
    lastVerifiedAt: verifiedAt,
    // Policy alerts link to their signed PDF. Technical updates are not
    // individually addressable on the USCIS site, so they cite the updates page.
    sourceUrl: u.pdfUrl ?? UPDATES_URL,
    entities: links,
    impact,
    reviewStatus: "auto",
    limitations: [
      u.kind === "policy_alert"
        ? "A policy alert is USCIS guidance to its own officers, not a regulation. It governs how USCIS adjudicates, and it can be revised or withdrawn without rulemaking."
        : "USCIS classifies this as a technical update — a non-substantive change such as a corrected citation or a refreshed reference. It does not change adjudication policy.",
      "The updates page does not publish an effective date. Where the guidance states one, it is in the linked document — this event does not assert an effective date it cannot cite.",
      ...(citations.length
        ? [
            `Affected Policy Manual sections, as listed by USCIS: ${citations.join("; ")}` +
              (volumeNames.length ? ` (${volumeNames.join("; ")}).` : "."),
          ]
        : []),
      ...(u.pdfUrl ? [] : ["USCIS does not give this update its own page; the link goes to the Policy Manual updates index."]),
      ...(u.body ? [] : ["USCIS published no summary text for this update; read the original."]),
    ],
  };
}

// -----------------------------------------------------------------------------
// Fetch
// -----------------------------------------------------------------------------

/**
 * A scraper must be able to tell "nothing changed" from "the page changed shape".
 * Returning an empty success on a layout change would render as a quiet month at
 * USCIS, which is a lie of omission. So structural failures set `failed`.
 */
async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  const key = "uscis-policy-manual";
  if (ctx.offline) {
    return { adapterKey: key, events: [], warnings: ["offline: skipped"], failed: false };
  }

  let html: string;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const res = await fetch(UPDATES_URL, {
      headers: { "User-Agent": UA },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) {
      return { adapterKey: key, events: [], warnings: [`HTTP ${res.status} from ${UPDATES_URL}`], failed: true };
    }
    html = await res.text();
  } catch (err) {
    return {
      adapterKey: key,
      events: [],
      warnings: [`fetch failed: ${(err as Error)?.message ?? String(err)}`],
      failed: true,
    };
  }

  const rows = splitRows(html);
  if (rows.length === 0) {
    return {
      adapterKey: key,
      events: [],
      warnings: [
        "no update rows found — the USCIS page structure has changed. Reporting failure rather than an empty success, which would look like a quiet month at the agency.",
      ],
      failed: true,
    };
  }

  const warnings: string[] = [];
  const parsed: PolicyManualUpdate[] = [];
  let unparseable = 0;
  let undated = 0;

  for (const row of rows) {
    const u = parseRow(row);
    if (!u) {
      unparseable++;
      continue;
    }
    if (!u.publishedAt) {
      undated++;
      continue;
    }
    parsed.push(u);
  }

  if (unparseable > 0) warnings.push(`${unparseable} row(s) did not match the expected structure`);
  if (undated > 0) warnings.push(`${undated} row(s) had no parseable <time datetime>`);

  // If almost nothing parsed, the layout drifted. Treat that as failure.
  if (parsed.length === 0 || parsed.length < rows.length * 0.5) {
    return {
      adapterKey: key,
      events: [],
      warnings: [
        ...warnings,
        `only ${parsed.length} of ${rows.length} row(s) parsed — treating as structural drift rather than publishing a partial view of the Policy Manual`,
      ],
      failed: true,
    };
  }

  const verifiedAt = new Date().toISOString().slice(0, 10);
  const inWindow = parsed.filter((u) => u.publishedAt! >= ctx.since);

  const capped = capEvents(inWindow, ctx.limit);
  return {
    adapterKey: key,
    events: capped.events.map((u) => toEvent(u, verifiedAt)),
    warnings: [...warnings, ...capped.warnings],
    failed: false,
  };
}

export const uscisPolicyManualAdapter: SourceAdapter = {
  key: "uscis-policy-manual",
  name: "USCIS Policy Manual",
  sourceKey: SOURCE_KEY,
  status: "ready",
  coverage:
    "Policy alerts and technical updates to the USCIS Policy Manual — the controlling adjudication guidance USCIS officers apply. Each update carries the formal citations of the sections it changes, as published by USCIS. Severity follows the agency's own labelling: policy alerts are substantive, technical updates are declared non-substantive.",
  fetchEvents,
};

export const __testing = {
  splitRows,
  parseRow,
  parseRowDate,
  parseAffectedSections,
  parseVolume,
  parseUpdatesPage,
  classify,
  severity,
  stableId,
  toEvent,
  VOLUME_SUBJECTS,
};
