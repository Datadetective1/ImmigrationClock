// =============================================================================
// AG / BIA PRECEDENT DECISIONS ADAPTER
//
// Precedent decisions of the Board of Immigration Appeals and the Attorney
// General bind every immigration judge in the country, and DHS. One of them can
// change the outcome of thousands of pending cases overnight: whether a
// continuance is granted, whether a bond is set, what counts as a crime
// involving moral turpitude. The federal-courts adapter does not see them,
// because they are administrative decisions published by the Justice
// Department, not by a court.
//
// EOIR publishes them on justice.gov as one page per volume of Administrative
// Decisions (I&N Dec.). Each entry has a citation, a link to the decision PDF
// and the headnote: the Board's own statement of the rule, written for exactly
// the reader this platform serves.
//
// -----------------------------------------------------------------------------
// THE DATE
// -----------------------------------------------------------------------------
// The volume page gives only the year. The decision PDF states the date it was
// decided, and the server's Last-Modified header on that PDF records when EOIR
// posted it. Checked against live data on 2026-11-05, the two matched to the day
// for every recent decision sampled. The posting date is what a reader could
// first have known, so it is the event date, read with a HEAD request rather
// than by downloading and parsing the PDF. A decision with no Last-Modified is
// skipped, not dated by guess.
//
// -----------------------------------------------------------------------------
// NAMES ARE LEFT OUT OF THE TITLE
// -----------------------------------------------------------------------------
// A precedent is cited by the respondent's name ("Matter of X"). This platform
// reports the legal rule, not the people in a case (the same policy as the
// federal-courts adapter), so the title carries the citation and the headnote
// carries the rule. The name stays one click away, on EOIR's own page.
// =============================================================================

import { capEvents, type AdapterContext, type AdapterResult, type SourceAdapter } from "../adapters";
import type { EventEntityLink, ImmigrationEvent } from "../events";
import { entityId } from "../entities";
import { resolveEntityMentions } from "../resolve";
import { extractImpact } from "../extract-impact";
import { plainText, richText } from "../text";
import { fetchWithRetry } from "./http";
import { mapWithConcurrency } from "./federal-register-api";

const KEY = "eoir-precedents";
const SOURCE_KEY = "eoir_precedents";
const HOST = "https://www.justice.gov";
export const INDEX_URL = `${HOST}/eoir/ag-bia-decisions`;
const UA = { "User-Agent": "ImmigrationClock/1.0 (+https://immigrationclock.com)" };
/** Below this many decisions, the newest volume has only just opened; read the one before too. */
const MIN_DECISIONS_IN_NEWEST_VOLUME = 10;

export type DecidingBody = "BIA" | "AG" | "AAO";

export interface Precedent {
  volume: number;
  page: number;
  /** EOIR's sequential Interim Decision number, when the entry shows one. */
  interimDecision: number | null;
  body: DecidingBody;
  year: number;
  /** As EOIR's page prints it, e.g. "30 I&N Dec. 222 (BIA 2026)". */
  citation: string;
  pdfUrl: string;
  headnotes: string[];
}

const BODY_NAME: Record<DecidingBody, string> = {
  BIA: "Board of Immigration Appeals",
  AG: "Attorney General",
  AAO: "USCIS Administrative Appeals Office",
};

function bodyFrom(label: string): DecidingBody | null {
  const l = label.replace(/[\s.]/g, "").toUpperCase();
  if (l.startsWith("BIA")) return "BIA";
  if (l.startsWith("AG")) return "AG";
  if (l.startsWith("AAO")) return "AAO";
  return null;
}

/** Volume numbers linked from the index page, newest first. */
export function volumesFromIndex(html: string): number[] {
  const nums = [...html.matchAll(/href="(?:https:\/\/www\.justice\.gov)?\/eoir\/volume-(\d+)"/g)].map((m) => Number(m[1]));
  return [...new Set(nums)].filter(Number.isFinite).sort((a, b) => b - a);
}

/**
 * Parse one volume page.
 *
 * Entries are separated by <hr>. Each opens with a table holding the citation
 * and the PDF link, followed by one paragraph per headnote. An entry whose
 * citation or PDF link cannot be read is dropped, because an uncitable decision
 * must not become an event.
 */
export function parseVolume(html: string): Precedent[] {
  const out: Precedent[] = [];
  for (const segment of html.split(/<hr\s*\/?>/i)) {
    const tableEnd = segment.search(/<\/table>/i);
    if (tableEnd < 0) continue;
    const head = segment.slice(0, tableEnd);
    const rest = segment.slice(tableEnd);

    const headText = plainText(head.replace(/<[^>]+>/g, " "));
    const cite = /(\d+)\s*I\.?\s*&\s*N\.?\s*Dec\.\s*(\d+)\s*\(\s*([A-Za-z.\s]+?)\s*(\d{4})\s*\)/.exec(headText);
    const pdf = /href="((?:https:\/\/www\.justice\.gov)?\/eoir\/media\/\d+\/dl[^"]*)"/i.exec(head);
    if (!cite || !pdf) continue;
    const body = bodyFrom(cite[3]);
    if (!body) continue;

    const id = /\bID\s*(\d{3,5})\b/.exec(headText);
    // Headnotes stop at the end of the page body; the footer has no <p> of its own
    // inside an entry, but trimming at the first closing </div> keeps it out.
    const notesHtml = rest.split(/<\/div>/i)[0];
    const headnotes = [...notesHtml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(([, p]) => richText(p).replace(/^\(\d+\)\s*/, "").trim())
      .filter(Boolean);

    const href = pdf[1].replace(/&amp;/g, "&");
    out.push({
      volume: Number(cite[1]),
      page: Number(cite[2]),
      interimDecision: id ? Number(id[1]) : null,
      body,
      year: Number(cite[4]),
      citation: `${cite[1]} I&N Dec. ${cite[2]} (${cite[3].trim()} ${cite[4]})`,
      pdfUrl: href.startsWith("http") ? href : `${HOST}${href}`,
      headnotes,
    });
  }
  return out;
}

export function stableId(p: Precedent): string {
  return `${SOURCE_KEY}:${p.volume}-in-dec-${p.page}`;
}

/** Last-Modified as an ISO date, or null. */
export function postedDate(lastModified: string | null): string | null {
  if (!lastModified) return null;
  const d = new Date(lastModified);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function toEvent(p: Precedent, postedAt: string, verifiedAt: string, volumeUrl: string): ImmigrationEvent {
  const name = BODY_NAME[p.body];
  const rule = p.headnotes.join(" ");
  const links: EventEntityLink[] = [
    { entityId: entityId("agency", "eoir"), relation: "issued_by", basis: "explicit", confidence: 1 },
    { entityId: entityId("topic", "policy-changes"), relation: "categorized_as", basis: "matched", confidence: 0.8 },
  ];
  if (p.body === "AAO") {
    links.push({ entityId: entityId("agency", "uscis"), relation: "issued_by", basis: "explicit", confidence: 1 });
  }
  for (const m of resolveEntityMentions(rule)) {
    if (links.some((l) => l.entityId === m.entityId)) continue;
    links.push({ entityId: m.entityId, relation: "mentions", basis: "matched", confidence: m.confidence });
  }

  const limitations = [
    p.body === "AAO"
      ? "An AAO precedent binds USCIS officers deciding benefit applications. It does not bind immigration judges."
      : "A precedent decision binds immigration judges and DHS nationwide unless a federal court of appeals has ruled otherwise in its own circuit, or it is later modified or overruled.",
    "The summary is the decision's headnote, written by the issuing body. The full reasoning is in the decision itself.",
    "Dated by when EOIR posted the decision file. The decision states the date it was decided, which is usually the same day.",
  ];
  if (p.headnotes.length === 0) limitations.push("EOIR's listing carried no headnote for this decision; read the original.");

  return {
    id: stableId(p),
    sourceKey: SOURCE_KEY,
    issuingAgencyId: entityId("agency", "eoir"),
    classification: "court_decision",
    // Binding nationwide, like a published circuit decision, which the
    // federal-courts adapter also ranks major.
    severity: "major",
    title: `${name} precedent: ${p.citation}`,
    summary: rule || `${name} published a precedent decision, ${p.citation}.`,
    publishedAt: postedAt,
    effectiveAt: null,
    lastVerifiedAt: verifiedAt,
    sourceUrl: p.pdfUrl,
    sourceDataUrl: volumeUrl,
    entities: links,
    impact: extractImpact({
      title: name,
      abstract: rule,
      body: null,
      agencyIds: [entityId("agency", "eoir")],
      effectiveAt: null,
    }),
    provenance: "reported",
    reviewStatus: "auto",
    limitations,
  };
}

async function getText(url: string): Promise<{ text?: string; error?: string }> {
  try {
    const res = await fetchWithRetry(url, { headers: UA });
    if (!res.ok) return { error: `HTTP ${res.status} from ${url}` };
    return { text: await res.text() };
  } catch (err) {
    return { error: `${url}: fetch failed (${(err as Error)?.message ?? String(err)})` };
  }
}

async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  if (ctx.offline) return { adapterKey: KEY, events: [], warnings: ["offline: skipped"], failed: false };

  const index = await getText(INDEX_URL);
  if (!index.text) return { adapterKey: KEY, events: [], warnings: [index.error!], failed: true };

  const volumes = volumesFromIndex(index.text);
  if (volumes.length === 0) {
    return {
      adapterKey: KEY,
      events: [],
      warnings: ["the AG/BIA decisions page links no volume pages; the page structure may have changed"],
      failed: true,
    };
  }

  const warnings: string[] = [];
  const found: { p: Precedent; volumeUrl: string }[] = [];
  for (const vol of volumes.slice(0, 2)) {
    const url = `${HOST}/eoir/volume-${vol}`;
    const page = await getText(url);
    if (!page.text) {
      if (found.length === 0) return { adapterKey: KEY, events: [], warnings: [page.error!], failed: true };
      warnings.push(page.error!);
      break;
    }
    const parsed = parseVolume(page.text);
    if (parsed.length === 0 && found.length === 0 && vol === volumes[0] && volumes.length === 1) {
      return {
        adapterKey: KEY,
        events: [],
        warnings: [`volume ${vol} lists no decisions that could be parsed; the page structure may have changed`],
        failed: true,
      };
    }
    found.push(...parsed.map((p) => ({ p, volumeUrl: url })));
    if (parsed.length >= MIN_DECISIONS_IN_NEWEST_VOLUME) break;
  }
  if (found.length === 0) {
    return {
      adapterKey: KEY,
      events: [],
      warnings: ["no decisions could be parsed from the newest volumes; the page structure may have changed"],
      failed: true,
    };
  }

  // Only decisions not already in the store need their date read. On a warm
  // store that is the one or two posted since the last run.
  const sinceYear = Number(ctx.since.slice(0, 4));
  const fresh = found.filter(({ p }) => p.year >= sinceYear && !ctx.knownIds?.has(stableId(p)));

  const verifiedAt = new Date().toISOString().slice(0, 10);
  let undated = 0;
  let unreachable = 0;
  const dated = await mapWithConcurrency(fresh, 4, async ({ p, volumeUrl }) => {
    try {
      const res = await fetchWithRetry(p.pdfUrl, { headers: UA, method: "HEAD" });
      if (!res.ok) {
        unreachable++;
        return null;
      }
      const posted = postedDate(res.headers.get("last-modified"));
      if (!posted) {
        undated++;
        return null;
      }
      return toEvent(p, posted, verifiedAt, volumeUrl);
    } catch {
      unreachable++;
      return null;
    }
  });

  const events = dated
    .filter((e): e is ImmigrationEvent => e !== null && e.publishedAt >= ctx.since && e.publishedAt <= verifiedAt)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  if (undated) warnings.push(`${undated} decision(s) had no posting date and were skipped rather than dated by guess`);
  if (unreachable) warnings.push(`${unreachable} decision file(s) could not be reached to read their posting date`);

  const capped = capEvents(events, ctx.limit);
  return { adapterKey: KEY, events: capped.events, warnings: [...warnings, ...capped.warnings], failed: false };
}

export const eoirPrecedentsAdapter: SourceAdapter = {
  key: KEY,
  name: "Immigration appeals precedent decisions",
  sourceKey: SOURCE_KEY,
  status: "ready",
  coverage:
    "Precedent decisions of the Board of Immigration Appeals and the Attorney General (and the USCIS Administrative Appeals Office precedents EOIR publishes alongside them), read from EOIR's own volume pages on justice.gov. Each event carries the decision's citation and its headnote; respondents' names are left out of titles.",
  fetchEvents,
};

export const __testing = { volumesFromIndex, parseVolume, stableId, postedDate, toEvent, bodyFrom };
