// =============================================================================
// GET /api/v1/changes/{id} — one change, by its stable public id
//
// The id is the same six characters that end every /what-changed/ URL, so a
// link a person shares and a record a system fetches name the same thing. The
// internal record id works too, because a consumer that stored one should not
// have to migrate.
//
// Prerendered: there are 544 of these and they change only when a build ships,
// so every one is a static file rather than a function invocation.
// =============================================================================

import { EVENTS } from "@/lib/event-store";
import { shortHash } from "@/lib/share";
import {
  ATTRIBUTION,
  amendmentIndex,
  toPublicChange,
  weakClassifications,
  type ChangeInput,
} from "@/lib/intelligence/change";

export const dynamic = "force-static";
export const dynamicParams = true;

const ALL = EVENTS as unknown as ChangeInput[];
const AMENDED_BY = amendmentIndex(ALL);
const BY_HASH = new Map(ALL.map((e) => [shortHash(e.id), e] as const));
const BY_RECORD_ID = new Map(ALL.map((e) => [e.id, e] as const));

export function generateStaticParams(): { id: string }[] {
  return ALL.map((e) => ({ id: shortHash(e.id) }));
}

export async function GET(_request: Request, { params }: { params: { id: string } }): Promise<Response> {
  const event = BY_HASH.get(params.id) ?? BY_RECORD_ID.get(decodeURIComponent(params.id));

  if (!event) {
    return Response.json(
      {
        error: "not_found",
        message: "No change has that id. Ids are the six characters that end a /what-changed/ URL.",
      },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  // This route is prerendered, so it cannot honour ?include=weak the way the
  // list endpoint does. Rather than quietly answering differently from the
  // list, it returns the same strong classifications and reports the weak ones
  // separately — visible, labelled, and not mixed in.
  const weak = weakClassifications(event);
  const weakCount =
    weak.visaCategories.length + weak.countries.length + weak.forms.length + weak.processes.length;

  return Response.json(
    {
      data: toPublicChange(event, today, AMENDED_BY.get(event.id) ?? []),
      ...(weakCount > 0
        ? {
            alsoMatched: {
              note:
                "Matched only in a citation, a footnote, or a historical aside, and therefore NOT " +
                "included in the fields above or in a filtered list result. Read the evidence quote " +
                "before treating any of these as this record's subject.",
              ...weak,
            },
          }
        : {}),
      attribution: ATTRIBUTION,
    },
    {
      status: 200,
      headers: { "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400" },
    }
  );
}
