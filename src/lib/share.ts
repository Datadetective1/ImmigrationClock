// =============================================================================
// SHARE URLS — one stable, unique, shareable address per editorial record
//
// THE PROBLEM THIS SOLVES
// -----------------------
// Every social post used to send readers to a hub page: /what-changed?q=…,
// /immigration/enforcement-trends, /h1b/top-sponsors. Two consequences, both
// measured on the live X account:
//
//   1. X fetches ONE Open Graph card per page, so every post about a different
//      development showed the same generic brand image. The query string in
//      /what-changed?q=… does not help — it is the same page, and the same card.
//   2. The publisher's URL cooldown (seven days per destination) treated two
//      different rules that happened to resolve to /h1b/top-sponsors as one
//      story, and blocked the second one.
//
// So every record that can be shared gets its own address, and this module is
// the only place those addresses are built. The app's pages, the sitemap, the
// Open Graph route and the social publisher all import it, so they cannot
// disagree about where a story lives.
//
// PURE ON PURPOSE
// ---------------
// No Node imports. Client components (the share button, the arrival tracker)
// need the parsing half of this, so the whole file has to run in a browser.
// The hash is FNV-1a rather than a crypto digest for the same reason.
// =============================================================================

/**
 * FNV-1a, 32-bit, as six base-36 characters.
 *
 * Not for security — for STABILITY. The suffix makes a slug unique among 500+
 * events whose titles repeat ("Policy alert: …", "Agency Information Collection
 * Activities…"), and it is derived from the event id rather than the title, so
 * a title correction upstream changes the readable part of the URL but never the
 * part the page is resolved by. See matchesChangeSlug().
 */
import { isContentType } from "@/lib/social/content-types";

export function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(6, "0").slice(-6);
}

/** Lowercase, ASCII, hyphenated, cut at a word boundary. */
export function slugifyTitle(title: string, max = 72): string {
  const slug = title
    .toLowerCase()
    .replace(/&nbsp;|&amp;/g, " ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const boundary = cut.lastIndexOf("-");
  return (boundary > max / 2 ? cut.slice(0, boundary) : cut).replace(/-+$/, "");
}

// -----------------------------------------------------------------------------
// CHANGES — /what-changed/<slug>
// -----------------------------------------------------------------------------

export interface SluggableEvent {
  id: string;
  title: string;
}

/** The canonical slug for one recorded change. */
export function changeSlug(event: SluggableEvent): string {
  const readable = slugifyTitle(event.title) || "change";
  return `${readable}-${shortHash(event.id)}`;
}

export function changePath(event: SluggableEvent): string {
  return `/what-changed/${changeSlug(event)}`;
}

/** The six-character hash at the end of a change slug, or null. */
export function slugHash(slug: string): string | null {
  const m = /-([a-z0-9]{6})$/.exec(slug);
  return m ? m[1] : null;
}

/**
 * Does this slug address this event?
 *
 * Matched on the hash suffix alone, so an old link survives a title correction:
 * the readable part is for humans and search engines, the hash is the key. The
 * page still emits the canonical slug in its metadata, so crawlers converge on
 * one address.
 */
export function matchesChangeSlug(event: SluggableEvent, slug: string): boolean {
  return slugHash(slug) === shortHash(event.id);
}

// -----------------------------------------------------------------------------
// EXPLAINERS AND DATA SIGNALS — their own records, their own addresses
// -----------------------------------------------------------------------------

export function explainerPath(slug: string): string {
  return `/explained/${slug}`;
}

export function signalPath(slug: string): string {
  return `/insights/${slug}`;
}

// -----------------------------------------------------------------------------
// OPEN GRAPH CARDS — one route, one image per record
//
// Explicit URLs rather than Next's file-based `opengraph-image` convention,
// deliberately: the file convention is silently ignored whenever a page's own
// metadata declares `openGraph.images` (Next checks `hasOwnProperty("images")`),
// and every page here goes through one buildMetadata() helper. An explicit
// address is a thing a test can fetch and a crawler can be handed.
// -----------------------------------------------------------------------------

export type OgKind = "change" | "explainer" | "signal" | "page";

export function ogImagePath(kind: OgKind, key: string): string {
  return `/og/${kind}/${key}.png`;
}

// -----------------------------------------------------------------------------
// TRACKING — how a click from a social post is attributed
//
// Standard UTM parameters, so Plausible attributes the visit without any custom
// code, plus the same values read back by the arrival tracker to fire the
// `social_post_click` event with its properties. Nothing here identifies a
// person: the content type is one of a handful of fixed strings and the story
// key is a public record's own identifier.
// -----------------------------------------------------------------------------

export interface ShareTracking {
  /** Which network the link was posted to. */
  platform: "x" | "linkedin";
  /** The editorial content type — breaking_change, explainer, data_signal… */
  contentType: string;
  /** A short public identifier for the record: "change:abc123", "explainer:foo". */
  story: string;
}

export function trackedUrl(absoluteUrl: string, t: ShareTracking): string {
  const url = new URL(absoluteUrl);
  url.searchParams.set("utm_source", t.platform);
  url.searchParams.set("utm_medium", "social");
  url.searchParams.set("utm_campaign", t.contentType);
  url.searchParams.set("utm_content", t.story);
  return url.toString();
}

/** change:<6-char hash>, or <kind>:<slug> for the editorial kinds. */
const STORY_KEY = /^(?:change:[a-z0-9]{6}|(?:explainer|signal|discovery|keydate|page|asset):[a-z0-9][a-z0-9-]{0,78})$/;

/** Read the attribution back off a landing URL's query string. */
export function parseTracking(search: string): ShareTracking | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const platform = params.get("utm_source");
  if ((platform !== "x" && platform !== "linkedin") || params.get("utm_medium") !== "social") {
    return null;
  }
  // A closed vocabulary, checked, not merely bounded: anyone can mint a link
  // with these parameters, and whatever they carry lands in the analytics
  // dataset as event properties. Only the content types the engine emits
  // and the story-key shapes it mints are read back; anything else is not
  // a social arrival of ours.
  const contentType = params.get("utm_campaign") ?? "";
  const story = params.get("utm_content") ?? "";
  if (!isContentType(contentType)) return null;
  if (story && !STORY_KEY.test(story)) return null;
  return { platform, contentType, story };
}
