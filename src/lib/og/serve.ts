// =============================================================================
// SERVING A CARD — a crawler must never get a 500 for an image
//
// Satori renders in a stream, so a failure surfaces when the body is read, not
// when ImageResponse is constructed. A route that returned the response as-is
// would hand the crawler a 200 whose body then errors, which X renders as no
// image at all. So the body is buffered here (a card is ~70 KB), and if
// rendering throws for a record — a glyph the fonts lack, a layout Satori
// rejects, a wasm failure — the homepage brand card is served instead, with
// status 200 and image/png, and the record's key goes to stderr so the build
// log says which card fell back. A generic card is a worse card; a missing
// card is a missing post.
//
// The renderer is a parameter so a test can hand in one that throws.
// =============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ogCard, type OgCardSpec } from "./card";

/**
 * The homepage card, read once per process. Generated from production by
 * scripts/build-brand-assets.mjs, so it is the site's own look, not a blank.
 */
const FALLBACK_CARD = readFileSync(join(process.cwd(), "public", "brand", "og-image.png"));

const PNG_HEADERS = {
  "content-type": "image/png",
  "cache-control": "public, immutable, no-transform, max-age=31536000",
};

/** The brand card as a complete 200 response. */
export function fallbackCard(): Response {
  return new Response(FALLBACK_CARD, { status: 200, headers: PNG_HEADERS });
}

export type CardRenderer = (spec: OgCardSpec) => Response;

/**
 * Render a card to a buffered 200 PNG, or fall back to the brand card.
 *
 * `key` names the record for the log line ("change/abc123", "page/layoffs").
 */
export async function serveCard(
  key: string,
  spec: OgCardSpec,
  render: CardRenderer = ogCard
): Promise<Response> {
  try {
    const rendered = render(spec);
    const body = await rendered.arrayBuffer();
    if (body.byteLength === 0) throw new Error("renderer produced an empty image");
    return new Response(body, { status: 200, headers: PNG_HEADERS });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[og] card render failed for ${key}: ${reason} — serving the brand card instead`);
    return fallbackCard();
  }
}
