// =============================================================================
// /api/pro/brief — download an intelligence brief
//
//   ?scope=saved (default)  every saved change
//   ?scope=feed             the current Briefing feed
//   ?format=md | html       Markdown, or a printable page ("Save as PDF")
//
// Built from the archive at request time, so a brief always reflects the
// records as they stand today, including any later amendment.
// =============================================================================

import { billingOrigin } from "@/lib/billing/config";
import { json } from "@/lib/billing/http";
import { buildBriefing, savedBriefs } from "@/lib/pro/feed";
import { proRoute } from "@/lib/pro/caller";
import { renderBriefHtml, renderBriefMarkdown, type BriefEntry } from "@/lib/pro/export";
import { parseSaved } from "@/lib/pro/saved";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const caller = await proRoute(req, 20);
  if (caller.error) return caller.error;

  const params = new URL(req.url).searchParams;
  const scope = params.get("scope") ?? "saved";
  const format = params.get("format") ?? "md";
  if (scope !== "saved" && scope !== "feed") return json({ error: "bad_scope", message: "scope must be saved or feed." }, 400);
  if (format !== "md" && format !== "html") return json({ error: "bad_format", message: "format must be md or html." }, 400);

  const today = new Date(caller.now * 1000).toISOString().slice(0, 10);
  const savedIds = parseSaved(await caller.store.getProDoc("saved", caller.key)).map((s) => s.id);

  let entries: BriefEntry[];
  if (scope === "saved") {
    entries = savedBriefs(savedIds, today);
  } else {
    const follows = (await caller.store.getWatchlist(caller.key))?.entityIds ?? [];
    entries = buildBriefing({ follows, savedIds, today }).feed.map((i) => ({
      change: i.change,
      brief: i.brief,
      path: i.path,
      why: i.assessment.matches.length > 0 ? i.assessment.matches.map((m) => m.reason) : ["You saved this record."],
      statusText: i.assessment.status,
    }));
  }

  const doc = {
    title: scope === "saved" ? "ImmigrationClock brief — saved changes" : "ImmigrationClock brief — your feed",
    generatedAt: today,
    origin: billingOrigin(),
    entries,
  };
  const name = `immigrationclock-${scope}-${today}`;
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (format === "html") {
    return new Response(renderBriefHtml(doc), {
      status: 200,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return new Response(renderBriefMarkdown(doc), {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.md"`,
    },
  });
}
