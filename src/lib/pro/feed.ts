// =============================================================================
// THE BRIEFING FEED — the Monitor, for one subscriber, from their own list
//
// Nothing new is decided here. buildInbox() already sorts recorded changes
// into urgency buckets with a reason a reader can check, and buildBrief()
// already writes the evidence-carrying summary. This applies them to the
// subscriber's synced watchlist and saved changes, and keeps only what is
// theirs: an item that matched nothing they follow and was not saved is the
// archive, not their briefing.
//
// Two views come out of one pass:
//   • the feed — followed or saved changes, most urgent first;
//   • the timeline — every followed or saved change with a STATED effective
//     date still ahead, in date order. That is the calendar, too.
// =============================================================================

import { EVENTS } from "@/lib/event-store";
import { amendmentIndex, toPublicChange, type ChangeInput, type PublicChange } from "@/lib/intelligence/change";
import { buildInbox, matchFollows, type InboxItem } from "@/lib/intelligence/inbox";
import { buildBrief, type ImpactBrief } from "@/lib/intelligence/brief";
import { changePath } from "@/lib/share";

export interface FeedItem extends InboxItem {
  /** Site-relative path of the change's own page. */
  path: string;
  saved: boolean;
}

export interface TimelineItem {
  recordId: string;
  path: string;
  title: string;
  effectiveDate: string;
  daysUntil: number;
  publishedDate: string;
  status: PublicChange["status"];
  sourceName: string;
  sourceUrl: string;
  matched: string[];
  saved: boolean;
}

export interface Briefing {
  feed: FeedItem[];
  timeline: TimelineItem[];
  limitations: string[];
}

const DAY = 86_400_000;

type Inputs = { input: ChangeInput; strong: PublicChange; weak: PublicChange }[];

let cache: { today: string; inputs: Inputs } | null = null;

/** Public views of every record, built once per day per instance. */
function inputsFor(today: string, events: readonly ChangeInput[] = EVENTS as unknown as ChangeInput[]): Inputs {
  if (events === (EVENTS as unknown) && cache?.today === today) return cache.inputs;
  const amendedBy = amendmentIndex(events);
  const inputs = events.map((input) => ({
    input,
    strong: toPublicChange(input, today, amendedBy.get(input.id) ?? []),
    weak: toPublicChange(input, today, amendedBy.get(input.id) ?? [], true),
  }));
  if (events === (EVENTS as unknown)) cache = { today, inputs };
  return inputs;
}

export function buildBriefing(
  options: {
    follows: readonly string[];
    savedIds: readonly string[];
    today: string;
    horizonDays?: number;
    recentDays?: number;
    limit?: number;
  },
  events?: readonly ChangeInput[]
): Briefing {
  const inputs = inputsFor(options.today, events);
  const byRecord = new Map(inputs.map((i) => [i.strong.recordId, i] as const));
  const saved = new Set(options.savedIds);

  const inbox = buildInbox(
    inputs.map((i) => ({ strong: i.strong, weak: i.weak })),
    {
      follows: options.follows,
      today: options.today,
      horizonDays: options.horizonDays ?? 30,
      recentDays: options.recentDays ?? 30,
    }
  );

  const feed: FeedItem[] = inbox.items
    .filter((i) => i.matched.length > 0 || saved.has(i.change.recordId))
    .slice(0, options.limit ?? 60)
    .map((i) => ({
      ...i,
      path: changePath(byRecord.get(i.change.recordId)!.input),
      saved: saved.has(i.change.recordId),
    }));

  const timeline: TimelineItem[] = [];
  for (const { input, strong } of inputs) {
    if (!strong.effectiveDate) continue;
    const daysUntil = Math.round((Date.parse(strong.effectiveDate) - Date.parse(options.today)) / DAY);
    if (daysUntil < 0) continue;
    // Strong evidence only: a date on someone's calendar should not rest on a
    // footnote match.
    const strongMatched = matchFollows(strong, options.follows);
    const isSaved = saved.has(strong.recordId);
    if (strongMatched.length === 0 && !isSaved) continue;
    timeline.push({
      recordId: strong.recordId,
      path: changePath(input),
      title: strong.title,
      effectiveDate: strong.effectiveDate,
      daysUntil,
      publishedDate: strong.publishedDate,
      status: strong.status,
      sourceName: strong.source.name,
      sourceUrl: strong.source.url,
      matched: strongMatched,
      saved: isSaved,
    });
  }
  timeline.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  return { feed, timeline, limitations: inbox.limitations };
}

/** Briefs for saved changes, newest save first, for the export. Unknown ids are skipped. */
export function savedBriefs(
  savedIds: readonly string[],
  today: string,
  events?: readonly ChangeInput[]
): { change: PublicChange; brief: ImpactBrief; path: string }[] {
  const byRecord = new Map(inputsFor(today, events).map((i) => [i.strong.recordId, i] as const));
  const out: { change: PublicChange; brief: ImpactBrief; path: string }[] = [];
  for (const id of savedIds) {
    const hit = byRecord.get(id);
    if (!hit) continue;
    out.push({ change: hit.strong, brief: buildBrief(hit.strong), path: changePath(hit.input) });
  }
  return out;
}

/** Is this a record in the archive? Saves are limited to real changes. */
export function isKnownChange(id: string): boolean {
  return (EVENTS as unknown as ChangeInput[]).some((e) => e.id === id);
}
