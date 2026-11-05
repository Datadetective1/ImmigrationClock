// =============================================================================
// WHITE HOUSE PRESIDENTIAL ACTIONS ADAPTER — the same-day signal
//
// The executive-actions adapter reads presidential documents from the Federal
// Register. That copy is the official record, but it lags: an order signed on a
// Friday is typically published three to seven days later. A proclamation that
// restricts entry takes effect on signing, so a reader who relies on the Federal
// Register copy alone learns about it after it has already applied to them.
//
// whitehouse.gov posts the text the day it is signed, with an RSS feed. This
// adapter reads that feed so the action reaches the archive the same day.
//
// -----------------------------------------------------------------------------
// ONE ACTION, ONE EVENT
// -----------------------------------------------------------------------------
// When the Federal Register copy arrives, the two would describe the same act.
// The Federal Register copy wins: it carries the signing date, the document
// number and the official text. collapseWhiteHouseDuplicates() drops the White
// House entry once a Federal Register executive action with the same title is in
// the store. Titles are compared after normalization because the White House
// sometimes posts in capitals and the Federal Register never does.
//
// -----------------------------------------------------------------------------
// WHAT IS LEFT OUT
// -----------------------------------------------------------------------------
//   • Nominations and withdrawals sent to the Senate. Personnel, not policy.
//   • Commemorative proclamations ("Columbus Day, 2026"). They are presidential
//     actions in form only, and "Citizenship Day" would otherwise match the
//     immigration filter on its title alone.
//   • Anything the shared immigration filter rejects. The terms are the
//     executive-actions adapter's, so both copies of one action agree on whether
//     it is about immigration.
// =============================================================================

import { capEvents, type AdapterContext, type AdapterResult, type SourceAdapter } from "../adapters";
import type { EventEntityLink, EventSeverity, ImmigrationEvent } from "../events";
import { entityId } from "../entities";
import { resolveEntityMentions } from "../resolve";
import { extractImpact } from "../extract-impact";
import { plainText, richText, unwrapCdata } from "../text";
import { fetchWithRetry } from "./http";
import { RELEVANCE_TERMS } from "./executive-actions";

const KEY = "white-house-actions";
const SOURCE_KEY = "white_house_actions";
export const FEED_URL = "https://www.whitehouse.gov/presidential-actions/feed/";
const UA = { "User-Agent": "ImmigrationClock/1.0 (+https://immigrationclock.com)" };

export interface WhiteHouseItem {
  title: string;
  link: string;
  /** ISO yyyy-mm-dd in Washington time, the day the White House posted it. */
  publishedAt: string | null;
  categories: string[];
  /** The feed's opening excerpt, plain text. */
  excerpt: string | null;
  /** The document text, plain, when the feed carries it. */
  body: string | null;
}

function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i").exec(block);
  return m ? m[1] : null;
}

/**
 * The calendar day in Washington.
 *
 * The feed stamps posts in UTC. An order posted at 9 PM Eastern is stamped the
 * next day in UTC, which would date it a day after it was signed.
 */
export function washingtonDate(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  const year = Number(iso.slice(0, 4));
  if (year < 1990 || year > new Date().getUTCFullYear() + 2) return null;
  return iso;
}

/**
 * The document text from the feed's content block.
 *
 * The block also carries the site's navigation and search form, so only the
 * paragraph blocks are kept. Those are the document.
 */
export function documentBody(content: string | null): string | null {
  if (!content) return null;
  const html = unwrapCdata(content);
  const paras = [...html.matchAll(/<p\b[^>]*class="[^"]*wp-block-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi)].map(
    ([, p]) => richText(p)
  );
  const text = paras.filter(Boolean).join("\n\n").trim();
  return text || null;
}

export function parseWhiteHouseFeed(xml: string): WhiteHouseItem[] {
  const out: WhiteHouseItem[] = [];
  for (const [, block] of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const title = plainText(tag(block, "title") ?? "");
    const link = plainText(tag(block, "link") ?? "");
    if (!title || !/^https:\/\/www\.whitehouse\.gov\//.test(link)) continue;

    const rawExcerpt = tag(block, "description");
    // WordPress appends "The post X appeared first on The White House." to every
    // excerpt. It is site furniture, not document text.
    const excerpt = rawExcerpt
      ? richText(rawExcerpt)
          .replace(/\s*The post .* appeared first on The White House\s*\.?\s*$/s, "")
          .replace(/\s*\[…\]\s*$/, "…")
          .trim() || null
      : null;

    out.push({
      title,
      link,
      publishedAt: washingtonDate(tag(block, "pubDate")),
      categories: [...block.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)]
        .map(([, c]) => plainText(c))
        .filter(Boolean),
      excerpt,
      body: documentBody(tag(block, "content:encoded")),
    });
  }
  return out;
}

/** "Columbus Day, 2026", "National Seafood Month, 2026", "Anti-Communism Week, 2026". */
const COMMEMORATIVE = /\b(day|days|week|month|anniversary|year)\b[^:]*,\s*\d{4}\s*$/i;

export function isPersonnel(item: WhiteHouseItem): boolean {
  return item.categories.some((c) => /nominations|appointments/i.test(c));
}

export function isCommemorative(item: WhiteHouseItem): boolean {
  return COMMEMORATIVE.test(item.title);
}

/**
 * Same terms as the Federal Register copy, read against the title and the
 * opening excerpt only. The full text of almost any order mentions "border" or
 * "alien" somewhere in its boilerplate, so matching the whole body would admit
 * tariff and tax orders.
 */
export function isImmigrationRelevant(item: WhiteHouseItem): boolean {
  const haystack = `${item.title} ${item.excerpt ?? ""}`.toLowerCase();
  return RELEVANCE_TERMS.some((t) => haystack.includes(t));
}

export function subtype(item: WhiteHouseItem): string {
  if (item.categories.some((c) => /executive orders?/i.test(c))) return "Executive Order";
  if (item.categories.some((c) => /proclamations?/i.test(c))) return "Proclamation";
  if (item.categories.some((c) => /memorand/i.test(c))) return "Presidential Memorandum";
  return "Presidential action";
}

/** Same rule as the Federal Register copy: orders and proclamations are major. */
export function severity(item: WhiteHouseItem): EventSeverity {
  const s = subtype(item);
  return s === "Executive Order" || s === "Proclamation" ? "major" : "notable";
}

/** The post's own slug, which the White House never reuses. */
export function stableId(item: WhiteHouseItem): string {
  const slug = item.link.replace(/\/+$/, "").split("/").pop() ?? item.link;
  return `${SOURCE_KEY}:${slug}`;
}

/** Title case as the White House sometimes posts in capitals. */
function readableTitle(t: string): string {
  if (t !== t.toUpperCase()) return t.trim();
  const small = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "into", "of", "on", "or", "the", "to", "with"]);
  return t
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ")
    .trim();
}

export function toEvent(item: WhiteHouseItem, verifiedAt: string): ImmigrationEvent {
  const publishedAt = item.publishedAt!;
  const kind = subtype(item);
  const title = readableTitle(item.title);

  const links: EventEntityLink[] = [
    { entityId: entityId("topic", "policy-changes"), relation: "categorized_as", basis: "matched", confidence: 0.8 },
  ];
  for (const m of resolveEntityMentions(`${item.title} ${item.excerpt ?? ""}`)) {
    if (links.some((l) => l.entityId === m.entityId)) continue;
    links.push({ entityId: m.entityId, relation: "mentions", basis: "matched", confidence: m.confidence });
  }

  const impact = extractImpact({
    title: item.title,
    abstract: item.excerpt,
    body: item.body,
    agencyIds: [],
    effectiveAt: null,
  });

  return {
    id: stableId(item),
    sourceKey: SOURCE_KEY,
    classification: "executive_action",
    severity: severity(item),
    title: `${kind}: ${title}`,
    summary: item.excerpt || "The White House posted this action without an excerpt; read the original.",
    publishedAt,
    effectiveAt: null,
    lastVerifiedAt: verifiedAt,
    sourceUrl: item.link,
    sourceDataUrl: FEED_URL,
    entities: links,
    impact,
    provenance: "reported",
    reviewStatus: "auto",
    limitations: [
      "Taken from the White House's own posting on the day it was released. The Federal Register copy is the official record and usually follows within a week; once it appears, it replaces this entry.",
      "Dated by the day the White House posted it, in Washington time. An action can take effect on signing, before any agency guidance explains how it applies.",
    ],
  };
}

/** Lowercased, punctuation-free title, for matching one action across sources. */
export function normalizeTitle(t: string): string {
  return plainText(t)
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The document's own title inside a Federal Register executive-action event title. */
function federalRegisterDocTitle(eventTitle: string): string {
  // "Executive Order 14321: Title" / "Proclamation: Title" / "Memorandum: Title"
  const i = eventTitle.indexOf(": ");
  return i >= 0 ? eventTitle.slice(i + 2) : eventTitle;
}

/**
 * Drop White House entries that the Federal Register copy has caught up with.
 *
 * Pure, so the merge step can call it on the whole store every run: an entry
 * ingested from the White House on Monday disappears the run after the Federal
 * Register publishes the same action, and no one has to remember to retract it.
 */
export function collapseWhiteHouseDuplicates<
  T extends Pick<ImmigrationEvent, "sourceKey" | "classification" | "title">,
>(events: T[]): { events: T[]; collapsed: number } {
  const official = new Set(
    events
      .filter((e) => e.sourceKey === "federal_register" && e.classification === "executive_action")
      .map((e) => normalizeTitle(federalRegisterDocTitle(e.title)))
  );
  if (official.size === 0) return { events, collapsed: 0 };
  const kept = events.filter(
    (e) => !(e.sourceKey === SOURCE_KEY && official.has(normalizeTitle(federalRegisterDocTitle(e.title))))
  );
  return { events: kept, collapsed: events.length - kept.length };
}

async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  if (ctx.offline) return { adapterKey: KEY, events: [], warnings: ["offline: skipped"], failed: false };

  let xml: string;
  try {
    const res = await fetchWithRetry(FEED_URL, { headers: UA });
    if (!res.ok) {
      return {
        adapterKey: KEY,
        events: [],
        warnings: [`HTTP ${res.status} from the White House presidential actions feed`],
        failed: true,
      };
    }
    xml = await res.text();
  } catch (err) {
    return {
      adapterKey: KEY,
      events: [],
      warnings: [`White House presidential actions feed: fetch failed (${(err as Error)?.message ?? String(err)})`],
      failed: true,
    };
  }

  const items = parseWhiteHouseFeed(xml);
  if (items.length === 0) {
    // A feed that answers 200 with nothing parseable has changed format. Saying
    // so beats reporting a quiet week.
    return {
      adapterKey: KEY,
      events: [],
      warnings: ["the White House feed returned no parseable items; the page structure may have changed"],
      failed: true,
    };
  }

  const verifiedAt = new Date().toISOString().slice(0, 10);
  const warnings: string[] = [];
  let personnel = 0;
  let commemorative = 0;
  let irrelevant = 0;
  let undated = 0;
  const keep: WhiteHouseItem[] = [];

  for (const item of items) {
    if (!item.publishedAt) {
      undated++;
      continue;
    }
    if (item.publishedAt < ctx.since) continue;
    if (isPersonnel(item)) personnel++;
    else if (isCommemorative(item)) commemorative++;
    else if (!isImmigrationRelevant(item)) irrelevant++;
    else keep.push(item);
  }

  if (personnel) warnings.push(`${personnel} nomination or appointment post(s) skipped`);
  if (commemorative) warnings.push(`${commemorative} commemorative proclamation(s) skipped`);
  if (irrelevant) warnings.push(`${irrelevant} presidential action(s) were not immigration-related`);
  if (undated) warnings.push(`${undated} item(s) had no parseable date and were skipped rather than dated by guess`);

  const capped = capEvents(keep, ctx.limit);
  return {
    adapterKey: KEY,
    events: capped.events.map((i) => toEvent(i, verifiedAt)),
    warnings: [...warnings, ...capped.warnings],
    failed: false,
  };
}

export const whiteHouseActionsAdapter: SourceAdapter = {
  key: KEY,
  name: "White House presidential actions",
  sourceKey: SOURCE_KEY,
  status: "ready",
  coverage:
    "Executive orders, proclamations and memoranda posted on whitehouse.gov, read from its RSS feed on the day they are signed, filtered to those concerning immigration, entry or visas. Nominations and commemorative proclamations are skipped. Once the Federal Register publishes the same action, its official copy replaces this one.",
  fetchEvents,
};

export const __testing = {
  washingtonDate,
  documentBody,
  parseWhiteHouseFeed,
  isPersonnel,
  isCommemorative,
  isImmigrationRelevant,
  subtype,
  severity,
  stableId,
  toEvent,
  normalizeTitle,
  collapseWhiteHouseDuplicates,
};
