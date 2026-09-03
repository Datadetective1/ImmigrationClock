// =============================================================================
// GET /api/v1 — what this API is, and what it will not do
//
// The index. It exists so a developer who finds the API before the docs can
// orient in one request, and so the boundary is stated by the API itself
// rather than only in prose someone may not read.
// =============================================================================

import { ATTRIBUTION } from "@/lib/intelligence/change";
import { EVENTS } from "@/lib/event-store";
import { EMPLOYERS, EMPLOYERS_META } from "@/lib/employers";
import { WARN_META } from "@/lib/warn";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  return Response.json(
    {
      name: `${SITE.name} Intelligence API`,
      version: "v1",
      schemaVersion: ATTRIBUTION.schemaVersion,
      description:
        "Read-only access to the immigration change archive and employer signals, derived from " +
        "public U.S. government sources. Free, no key, no quota.",

      endpoints: [
        {
          path: "/api/v1/changes",
          method: "GET",
          description: "Recorded immigration changes, newest first.",
          parameters: {
            since: "YYYY-MM-DD — published on or after this date",
            until: "YYYY-MM-DD — published on or before this date",
            visa: "visa category, e.g. h-1b",
            country: "country, e.g. india",
            agency: "issuing agency, e.g. uscis",
            classification: "final_rule | proposed_rule | court_decision | data_release | …",
            status: "proposed | scheduled | in_force | decided | superseded | informational",
            limit: "1–100, default 25",
            offset: "0 or more",
          },
        },
        {
          path: "/api/v1/changes/{id}",
          method: "GET",
          description:
            "One change. The id is the six characters that end a /what-changed/ URL; the internal record id also works.",
        },
        {
          path: "/api/v1/employers/{slug}/signals",
          method: "GET",
          description:
            "Signals for one employer: H-1B sponsorship, WARN layoff filings, and the overlap between them. " +
            "The slug matches the /employer/ URLs.",
        },
      ],

      coverage: {
        changes: EVENTS.length,
        changeSources: [...new Set(EVENTS.map((e) => e.sourceKey))].sort(),
        h1bEmployers: EMPLOYERS.length,
        h1bFiscalYear: EMPLOYERS_META.fiscalYear,
        warnNotices: WARN_META.noticeCount,
        warnStates: WARN_META.stateCount,
        warnCoverageNote: WARN_META.coverageNote,
      },

      // The boundary, in the API itself. A consumer building a product on this
      // should hit it here rather than in a support conversation.
      boundaries: [
        "This API describes published government material. It is not legal advice.",
        "It makes no determination about any individual, case, petition or person.",
        "It returns no personal data, because it holds none.",
        "Records are normalized and linked by ImmigrationClock; the originating authority is the agency named in each record's source.",
        "An absent field means the source did not state it. Nothing is inferred to fill a gap.",
      ],

      attribution: ATTRIBUTION,
      documentation: `${SITE.url}/developers`,
    },
    { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600" } }
  );
}
