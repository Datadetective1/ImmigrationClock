// =============================================================================
// GET /api/v1/monitor — the intelligence inbox, as data
//
// WHAT IT IS FOR
// --------------
// /api/v1/changes answers "what is in the archive". This answers the question a
// professional actually has: "of everything that changed, which items touch the
// work I am responsible for, and how soon do I have to care?"
//
// It is the pull half of the integration story. A vendor calls it on a
// schedule with the dimensions their customer follows and gets back a small,
// bucketed, evidence-carrying set they can render inside their own workflow.
// There is no push half yet, and the readiness field says so rather than
// leaving a reader to assume.
//
// WHY THE WATCHLIST IS IN THE QUERY STRING
// ----------------------------------------
// No account, no key, no stored profile — the caller states what they follow on
// each request. That keeps this free, keeps it cacheable, and keeps us from
// holding a list of what any firm is watching, which is exactly the kind of
// data an immigration platform should be reluctant to hold.
//
// WHAT IT WILL NOT DO
//   • No determination about any person, case or eligibility.
//   • No push. A webhook implies "we will tell you everything", and no
//     dimension's recall supports that claim yet.
//   • No unbounded response.
// =============================================================================

import { EVENTS } from "@/lib/event-store";
import {
  ATTRIBUTION,
  amendmentIndex,
  toPublicChange,
  type ChangeInput,
} from "@/lib/intelligence/change";
import { buildInbox, INBOX_BUCKETS, type InboxBucket } from "@/lib/intelligence/inbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL = EVENTS as unknown as ChangeInput[];
const AMENDED_BY = amendmentIndex(ALL);

const MAX_FOLLOWS = 60;
const MAX_ITEMS = 100;

const FOLLOW_PREFIXES = ["visa", "country", "form", "process", "topic", "agency"];

function bad(message: string, parameter: string): Response {
  return Response.json(
    { error: "invalid_parameter", parameter, message },
    { status: 400, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const today = new Date().toISOString().slice(0, 10);

  // The watchlist. Repeatable `follow=` params, or one comma-separated list.
  const raw = [
    ...params.getAll("follow"),
    ...(params.get("follows")?.split(",") ?? []),
  ]
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);

  const follows = [...new Set(raw)];
  if (follows.length > MAX_FOLLOWS) {
    return bad(`At most ${MAX_FOLLOWS} follows per request.`, "follow");
  }
  for (const f of follows) {
    const prefix = f.split(":")[0];
    if (!FOLLOW_PREFIXES.includes(prefix) || f.split(":").length < 2) {
      return bad(
        `"${f}" is not a followable id. Use one of ${FOLLOW_PREFIXES.join(", ")} followed by a colon and a value, e.g. visa:h-1b.`,
        "follow"
      );
    }
  }

  const horizonRaw = params.get("horizonDays");
  const horizonDays = horizonRaw ? Number(horizonRaw) : 30;
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 365) {
    return bad("horizonDays must be a whole number of days between 1 and 365.", "horizonDays");
  }

  const recentRaw = params.get("recentDays");
  const recentDays = recentRaw ? Number(recentRaw) : 14;
  if (!Number.isInteger(recentDays) || recentDays < 1 || recentDays > 365) {
    return bad("recentDays must be a whole number of days between 1 and 365.", "recentDays");
  }

  const bucketFilter = params.get("bucket");
  if (bucketFilter && !INBOX_BUCKETS.includes(bucketFilter as InboxBucket)) {
    return bad(`bucket must be one of ${INBOX_BUCKETS.join(", ")}.`, "bucket");
  }

  const limitRaw = params.get("limit");
  const limit = limitRaw ? Number(limitRaw) : MAX_ITEMS;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ITEMS) {
    return bad(`limit must be a whole number between 1 and ${MAX_ITEMS}.`, "limit");
  }

  const inputs = ALL.map((e) => {
    const amendedBy = AMENDED_BY.get(e.id) ?? [];
    return {
      strong: toPublicChange(e, today, amendedBy),
      weak: toPublicChange(e, today, amendedBy, true),
    };
  });

  const inbox = buildInbox(inputs, { follows, today, horizonDays, recentDays });

  const buckets = bucketFilter
    ? inbox.buckets.filter((b) => b.bucket === bucketFilter)
    : inbox.buckets;

  // Items carry the brief but not the whole change twice: the brief already
  // holds what a renderer needs, and the change is there for anything else.
  const items = buckets
    .flatMap((b) => b.items)
    .slice(0, limit)
    .map((i) => ({
      bucket: i.bucket,
      because: i.because,
      matched: i.matched,
      daysUntilEffective: i.daysUntilEffective,
      brief: i.brief,
      change: i.change,
    }));

  return Response.json(
    {
      data: {
        follows: inbox.follows,
        horizonDays,
        recentDays,
        counts: inbox.counts,
        buckets: buckets.map((b) => ({
          bucket: b.bucket,
          label: b.label,
          meaning: b.meaning,
          count: b.items.length,
        })),
        items,
      },
      returned: items.length,
      limitations: inbox.limitations,
      readiness: {
        mode: "pull",
        push:
          "Not offered. A webhook implies completeness, and no dimension's measured recall supports " +
          "that claim yet. Poll this endpoint on whatever schedule suits you; the archive changes " +
          "when a build ships.",
        measured: "See /api/v1 for per-dimension precision and recall, and how to reproduce them.",
      },
      attribution: ATTRIBUTION,
      generatedAt: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        // Cacheable per distinct watchlist. The archive changes on a build, not
        // per request.
        "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
      },
    }
  );
}
