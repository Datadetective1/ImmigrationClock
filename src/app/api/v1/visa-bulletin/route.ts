// =============================================================================
// GET /api/v1/visa-bulletin — the newest checked Visa Bulletin month as JSON
//
// Read-only and static: built from the hand-checked months in
// src/lib/visa-bulletin/data.ts at deploy time, so it changes only when a new
// month is added there. No key, no cookies, nothing about the caller is kept.
// Open to any origin so the ImmigrationClock browser extension can read it
// without asking users for access to this site.
// =============================================================================

import { buildFeed } from "@/lib/visa-bulletin/feed";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return Response.json(buildFeed(), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
