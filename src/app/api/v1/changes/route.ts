// =============================================================================
// GET /api/v1/changes — the change archive, as data
//
// The site has published this archive as HTML for months and as JSON never.
// This is the smallest endpoint that makes ImmigrationClock consumable by
// another system rather than only readable by a person, and it is deliberately
// unremarkable: read-only, no key, no quota, no account, over data already
// committed to the repository.
//
// FREE, AND THAT IS A DECISION RATHER THAN AN OVERSIGHT. The founder directive
// says revenue is earned by adding value, not by restricting public
// information, and the existing WARN API is already free. Charging for the
// archive would put a paywall on the public record; what a professional will
// pay for is monitoring, not retrieval.
//
// VERSIONED FROM THE FIRST DAY. `/api/v1/` and a schema version inside every
// response, so a consumer can pin and a later shape does not silently break
// them. That costs nothing now and is impossible to add later.
//
// WHAT IT WILL NOT DO
//   • No individual determination. There is no "does this affect me" parameter
//     and there is no field that answers one.
//   • No internal detail: no adapter names, no file paths, no review queues.
//   • No unbounded response: `limit` is capped, and the cap is stated.
// =============================================================================

import { EVENTS } from "@/lib/event-store";
import {
  ATTRIBUTION,
  amendmentIndex,
  toPublicChange,
  type ChangeInput,
} from "@/lib/intelligence/change";

export const runtime = "nodejs";
// Reads only committed data — no network, no secret — but the query decides the
// body, so it cannot be prerendered.
export const dynamic = "force-dynamic";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 25;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ALL = EVENTS as unknown as ChangeInput[];
const AMENDED_BY = amendmentIndex(ALL);

function bad(message: string, parameter: string): Response {
  return Response.json(
    { error: "invalid_parameter", parameter, message },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);

  // ---- filters, each validated rather than trusted ------------------------
  const since = params.get("since");
  if (since && !ISO_DATE.test(since)) return bad("since must be YYYY-MM-DD.", "since");

  const until = params.get("until");
  if (until && !ISO_DATE.test(until)) return bad("until must be YYYY-MM-DD.", "until");

  const limitRaw = params.get("limit");
  const limit = limitRaw ? Number(limitRaw) : DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return bad(`limit must be a whole number between 1 and ${MAX_LIMIT}.`, "limit");
  }

  const offsetRaw = params.get("offset");
  const offset = offsetRaw ? Number(offsetRaw) : 0;
  if (!Number.isInteger(offset) || offset < 0) return bad("offset must be zero or more.", "offset");

  // Evidence strength is a query parameter rather than a fixed policy, because
  // the right answer differs by consumer: a monitoring product wants only what
  // it can defend, a researcher wants everything and will read the quotes.
  const includeRaw = params.get("include");
  if (includeRaw !== null && includeRaw !== "weak") {
    return bad('include accepts only "weak".', "include");
  }
  const includeWeak = includeRaw === "weak";

  const visa = params.get("visa")?.toLowerCase() ?? null;
  const form = params.get("form")?.toLowerCase() ?? null;
  const process = params.get("process")?.toLowerCase() ?? null;
  const country = params.get("country")?.toLowerCase() ?? null;
  const agency = params.get("agency")?.toLowerCase() ?? null;
  const classification = params.get("classification")?.toLowerCase() ?? null;
  const status = params.get("status")?.toLowerCase() ?? null;

  // ---- select -------------------------------------------------------------
  // Serialize first, then filter on the PUBLIC shape: a consumer filters on the
  // fields they can see, and doing it any other way is how a documented filter
  // quietly disagrees with the documented output.
  let changes = ALL.map((e) => toPublicChange(e, today, AMENDED_BY.get(e.id) ?? [], includeWeak));

  if (since) changes = changes.filter((c) => c.publishedDate >= since);
  if (until) changes = changes.filter((c) => c.publishedDate <= until);
  if (visa) changes = changes.filter((c) => c.visaCategories.some((v) => v.id.toLowerCase() === visa));
  if (country) changes = changes.filter((c) => c.countries.some((v) => v.id.toLowerCase() === country));
  if (form) changes = changes.filter((c) => c.forms.some((f) => f.id.toLowerCase() === form));
  if (process) changes = changes.filter((c) => c.processes.some((p) => p.id.toLowerCase() === process));
  if (agency) changes = changes.filter((c) => (c.agency ?? "").toLowerCase() === agency);
  if (classification) changes = changes.filter((c) => c.classification.toLowerCase() === classification);
  if (status) changes = changes.filter((c) => c.status.toLowerCase() === status);

  // Newest first, and stable: two records published on the same day must not
  // reorder between pages.
  changes.sort((a, b) => b.publishedDate.localeCompare(a.publishedDate) || a.recordId.localeCompare(b.recordId));

  const total = changes.length;
  const page = changes.slice(offset, offset + limit);

  return Response.json(
    {
      data: page,
      pagination: {
        total,
        limit,
        offset,
        returned: page.length,
        hasMore: offset + page.length < total,
      },
      // Stated on the response that used the filter, not only in the docs: a
      // consumer who never reads /developers still learns that an empty result
      // is not the same as "nothing happened".
      ...(visa || country || form || process
        ? {
            filterQuality: {
              evidence: includeWeak ? "strong and weak" : "strong only",
              note: includeWeak
                ? "Includes matches drawn from citations, footnotes and historical asides. Each carries " +
                  "its method and its verbatim quote — read the evidence before acting on a " +
                  "derived_weak match."
                : "Matches established from the record's own title or summary, or from a body sentence " +
                  "stating scope with no historical or citation markers. Matches drawn from citations " +
                  "are excluded; pass ?include=weak to see them, labelled.",
              coverage:
                "A record is classified only where its own text names the value, so a filtered result " +
                "is a floor rather than a complete set, and an empty classification list means the " +
                "document did not name one. Read classificationState to tell that apart from a record " +
                "nobody has examined.",
              measured:
                "Per dimension, against hand-labelled records drawn from the documents rather than " +
                "from this classifier's output. visa:h-1b: precision 100%, recall 83% (n=33). " +
                "Countries: precision 98%, recall 61% (n=249). Forms: precision 90%, recall 30% " +
                "(n=185). Employment processes: precision 100%, recall 60% (n=72). Every dimension " +
                "clears the precision bar and none clears the recall bar, so a filtered result is " +
                "reliable about what it contains and not about what it leaves out. See /api/v1.",
            },
          }
        : {}),
      attribution: ATTRIBUTION,
      generatedAt: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        // Public and cacheable: the archive changes when a build ships, not
        // per request. A CDN can serve this without touching a function.
        "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
      },
    }
  );
}
