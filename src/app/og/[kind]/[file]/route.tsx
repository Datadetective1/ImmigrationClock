// =============================================================================
// /og/<kind>/<key>.png — every Open Graph card, as a static file
//
// One route handler, four kinds of record: a recorded change, an explainer, a
// data signal, a hub page. It is `force-static` and enumerates every record in
// generateStaticParams(), so the build renders each card once and the output
// is a plain PNG — HTTP 200, image/png, 1200×630, no auth, no runtime, nothing
// that can be cold or down when X or LinkedIn comes to fetch it.
//
// WHY A ROUTE AND NOT THE `opengraph-image` FILE CONVENTION
// ---------------------------------------------------------
// Next silently ignores a file-based opengraph-image whenever a page's own
// metadata declares `openGraph.images` (it checks hasOwnProperty("images")),
// and every page here goes through buildMetadata(), which always declares one.
// An explicit address is also a thing a test can fetch, a sitemap can carry and
// the social publisher can be handed. See src/lib/share.ts for the URL shape.
//
// WHAT RESOLVES A CHANGE
// ----------------------
// The six-character hash at the end of the slug, never the readable part — the
// same rule the story page follows — so a title correction upstream changes the
// filename Next generates but an old card URL keeps resolving on request.
//
// WHAT HAPPENS WHEN A RENDER FAILS
// --------------------------------
// The brand card is served, with a 200 and image/png, and the key is logged.
// See src/lib/og/serve.ts. An unknown record is still a 404: that is a wrong
// address, not a failed card.
// =============================================================================

import { EVENTS } from "@/lib/event-store";
import { changeSlug, shortHash, slugHash, type OgKind } from "@/lib/share";
import { EXPLAINERS, EXPLAINER_BY_SLUG } from "@/lib/editorial/explainers";
import { SIGNAL_SLUGS, buildSignal } from "@/lib/editorial/signals";
import type { OgCardSpec } from "@/lib/og/card";
import { serveCard } from "@/lib/og/serve";
import {
  OG_PAGE_KEYS,
  ogSpecForChange,
  ogSpecForExplainer,
  ogSpecForPage,
  ogSpecForSignal,
} from "@/lib/og/specs";

export const dynamic = "force-static";
export const dynamicParams = false;

/**
 * The day the build ran, fixed once per process. Signals that depend on it
 * ("changes in the last 30 days") are computed against this date everywhere —
 * here, on their pages and in the sitemap — so the card and the page agree.
 */
const BUILD_DATE = new Date().toISOString().slice(0, 10);

const PNG = /\.png$/;

/** Change records keyed by the hash their slugs end in. */
const CHANGE_BY_HASH = new Map(EVENTS.map((e) => [shortHash(e.id), e] as const));

export function generateStaticParams(): { kind: OgKind; file: string }[] {
  const params: { kind: OgKind; file: string }[] = [];
  for (const e of EVENTS) params.push({ kind: "change", file: `${changeSlug(e)}.png` });
  for (const x of EXPLAINERS) params.push({ kind: "explainer", file: `${x.slug}.png` });
  for (const slug of SIGNAL_SLUGS) {
    if (buildSignal(slug, BUILD_DATE)) params.push({ kind: "signal", file: `${slug}.png` });
  }
  for (const key of OG_PAGE_KEYS) params.push({ kind: "page", file: `${key}.png` });
  return params;
}

function specFor(kind: string, key: string): OgCardSpec | null {
  switch (kind) {
    case "change": {
      const hash = slugHash(key);
      const event = hash ? CHANGE_BY_HASH.get(hash) : undefined;
      return event ? ogSpecForChange(event, BUILD_DATE) : null;
    }
    case "explainer": {
      const explainer = EXPLAINER_BY_SLUG.get(key);
      return explainer ? ogSpecForExplainer(explainer) : null;
    }
    case "signal": {
      const signal = buildSignal(key, BUILD_DATE);
      return signal ? ogSpecForSignal(signal) : null;
    }
    case "page":
      return ogSpecForPage(key);
    default:
      return null;
  }
}

export async function GET(_request: Request, { params }: { params: { kind: string; file: string } }) {
  if (!PNG.test(params.file)) return new Response("Not found", { status: 404 });
  const key = params.file.replace(PNG, "");
  const spec = specFor(params.kind, key);
  if (!spec) return new Response("Not found", { status: 404 });
  return serveCard(`${params.kind}/${key}`, spec);
}
