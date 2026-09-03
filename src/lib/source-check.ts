// =============================================================================
// SOURCE CHECK — is an authoritative link still there?
//
// The key dates and the explainers each cite an official page. Agencies move
// pages without redirects (USCIS moved the H-1B registration page under
// /temporary-workers/ in 2026 and left a 404 behind), and a dead source is the
// kind of defect nothing else catches: the build succeeds, the tests pass, the
// site and the social posts keep sending readers to a page that is not there.
//
// This module is the pure part: what counts as a source, and what an HTTP
// answer means. scripts/check-sources.ts does the fetching, on a schedule.
//
// WHAT AN ANSWER MEANS
// --------------------
//   ok        2xx, or a redirect that resolved to 2xx — the page is there.
//   blocked   403 or 429 — the host refused an automated client. travel.state.gov
//             does this to everything that is not a browser; the page exists.
//             Reported, never fatal.
//   broken    404, 410, or no answer at all — the address is dead. Fatal.
//   error     5xx or a timeout — the host is having a bad day. Reported, and
//             fatal only if it persists; a single run cannot tell.
// =============================================================================

import { KEY_DATES } from "@/lib/key-dates";
import { EXPLAINERS } from "@/lib/editorial/explainers";
import { SITE } from "@/lib/site";

export interface CheckedSource {
  /** Where the link lives: "key-date:h1b-registration", "explainer:opt-in-plain-terms". */
  owner: string;
  name: string;
  url: string;
}

export type SourceVerdict = "ok" | "blocked" | "broken" | "error";

/** Every authoritative link the editorial registries cite, deduplicated by URL. */
export function authoritativeSources(): CheckedSource[] {
  const out: CheckedSource[] = [];
  const seen = new Set<string>();
  const add = (owner: string, name: string, url: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ owner, name, url });
  };
  for (const kd of KEY_DATES) add(`key-date:${kd.id}`, kd.sourceName, kd.sourceUrl);
  for (const x of EXPLAINERS) {
    for (const s of x.sources ?? []) {
      if (typeof s === "string") add(`explainer:${x.slug}`, s, s);
      else if (s && typeof s === "object" && "url" in s) add(`explainer:${x.slug}`, String((s as { name?: string }).name ?? s.url), String(s.url));
    }
  }
  return out;
}

/** A government host: the whole point of "authoritative". */
export const OFFICIAL_HOST = /(^|\.)(gov|mil)$/i;

/**
 * Only https, and only a government host — or the site's own, for the one
 * explainer whose subject is ImmigrationClock's own methodology and whose
 * source is therefore the methodology page itself.
 */
export function isTrustedSourceUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const own = new URL(SITE.url).hostname;
    return u.protocol === "https:" && (OFFICIAL_HOST.test(u.hostname) || u.hostname === own);
  } catch {
    return false;
  }
}

/** Addresses known to have died. A registry must never point at one again. */
export const RETIRED_SOURCE_PATHS = [
  // Moved under /temporary-workers/ in 2026; the old address is a 404.
  "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations/h-1b-electronic-registration-process",
];

/** What an HTTP status (or the absence of one) means for a source. */
export function verdictFor(status: number | null): SourceVerdict {
  if (status === null) return "broken";
  if (status >= 200 && status < 300) return "ok";
  if (status === 403 || status === 429) return "blocked";
  if (status === 404 || status === 410) return "broken";
  if (status >= 500) return "error";
  // 3xx that did not resolve, 401, 405 and the rest: reachable, not readable
  // by us — the page is there.
  return "blocked";
}
