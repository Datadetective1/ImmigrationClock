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
            form: "immigration form, e.g. i-129",
            process:
              "immigration process, e.g. labor-certification, employment-authorization, " +
              "cap-registration, prevailing-wage, employment-eligibility-verification, " +
              "premium-processing",
            agency: "issuing agency, e.g. uscis",
            classification: "final_rule | proposed_rule | court_decision | data_release | …",
            status: "proposed | scheduled | in_force | decided | superseded | informational",
            include:
              "weak — also return classifications drawn from citations, footnotes and historical " +
              "asides. Omitted by default; each returned match carries the method that produced it.",
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

      // WHAT THE CLASSIFICATION FIELDS MEAN, stated by the API rather than only
      // in prose. A consumer filtering on visa or form is making a monitoring
      // promise to someone; they need this before they make it, not after.
      classification: {
        methods: {
          explicit_source: "The record's own title names the value.",
          structured_source: "A structured field from the publisher names it.",
          derived_high_confidence:
            "The summary names it, or a body sentence states scope with no historical or citation markers.",
          derived_weak:
            "A citation, a footnote, or a historical aside. Excluded by default; request with ?include=weak.",
        },
        defaultEvidence: "strong only (explicit_source, structured_source, derived_high_confidence)",
        state: {
          known: "The dimension has entries, established from the document.",
          not_applicable: "The document was examined on this dimension and names none.",
          not_classified:
            "Nobody has established a value. An empty list here is an absence of work, not an absence of relevance.",
        },
        measured: {
          "visa:h-1b": {
            groundTruth:
              "33 hand-labelled records — every record in the archive whose text names H-1B anywhere — " +
              "committed at fixtures/h1b-expanded-ground-truth.json. The original 21-record set is kept " +
              "and still scored separately at fixtures/h1b-ground-truth.json, where it remains 100%/100%.",
            precision: "100%",
            recall: "83%",
            f1: "0.90",
            holdout: "precision 100%, recall 92% on the 15 records that informed nothing",
            note:
              "Recall is below 100% because four documents change several programmes at once and name " +
              "H-1B only in the body. They are returned under ?include=weak. No false positives at all.",
          },
          countries: {
            groundTruth:
              "249 hand-labelled record-and-country pairs across 110 records, committed at " +
              "fixtures/country-expanded-ground-truth.json",
            precision: "98%",
            recall: "61%",
            f1: "0.75",
            holdout: "precision 93%, recall 39%",
            note:
              "Each pair carries a RELATION saying what the country is doing in the document. Only " +
              "nationals_of, present_in, designated_list and title_subject mean the document's own " +
              "coverage is defined by that country, and only those are returned here. Recall is limited " +
              "on purpose: a designation found only deep in a body is returned as weak, because a rule " +
              "reciting another programme's country scope is not about that country.",
          },
          forms: {
            groundTruth:
              "185 hand-labelled record-and-form pairs, committed at fixtures/form-ground-truth.json",
            precision: "90%",
            recall: "30%",
            f1: "0.45",
            holdout: "precision 95%, recall 47%",
            note:
              "SINGLE-ANNOTATOR LABELS — these were not independently reviewed. Recall is low for a " +
              "structural reason worth knowing: of the documents genuinely about a form, 82 of 121 name " +
              "it only in the body, and most of those are Paperwork Reduction Act notices whose titles " +
              "say nothing but 'Agency Information Collection Activities'.",
          },
          "employment/process": {
            groundTruth:
              "72 hand-labelled records, committed at fixtures/employment-ground-truth.json",
            precision: "100%",
            recall: "60%",
            f1: "0.75",
            holdout: "precision 100%, recall 67%",
            note: "SINGLE-ANNOTATOR LABELS — these were not independently reviewed.",
          },
        },
        notBenchmarked: ["employer signals — a name-based join, described per row rather than scored"],
        readiness:
          "NOT READY FOR PUSH on any dimension. Every one clears the precision bar and none clears " +
          "the recall bar, so a filter here is reliable about what it returns and not about what it " +
          "omits. Reproduce with: npm run intelligence:benchmarks",
        reproduce: "npm run intelligence:quality",
      },

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
