// =============================================================================
// THE BRIEFING FEED — one subscriber's followed and saved changes, assessed
//
// Each record matched by the synced watchlist (or saved) is assessed by
// src/lib/pro/assess.ts: where the document names what the subscriber follows,
// its documented status, its stated dates, and which of three sections it
// belongs in:
//
//   • upcoming   — a stated effective date ahead (never for a proposal);
//   • current    — published, or took effect, in the last 30 days;
//   • historical — everything older. Kept as research, never as urgent.
//
// The timeline (and so the calendar feed) holds only upcoming records whose
// match is primary — named in the title, summary or structured data, issued by
// a followed agency, filed under a followed topic, or saved. A body-only
// mention never puts a date on someone's calendar.
// =============================================================================

import { EVENTS } from "@/lib/event-store";
import { amendmentIndex, toPublicChange, type ChangeInput, type PublicChange } from "@/lib/intelligence/change";
import { buildBrief, type ImpactBrief } from "@/lib/intelligence/brief";
import { changePath } from "@/lib/share";
import { assessChange, type Assessment, type Section } from "./assess";

export interface FeedItem {
  change: PublicChange;
  brief: ImpactBrief;
  assessment: Assessment;
  /** Followed ids this record matched, strongest first. */
  matched: string[];
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
  /** Every item, upcoming first, then current, then historical. */
  feed: FeedItem[];
  sections: Record<Section, FeedItem[]>;
  timeline: TimelineItem[];
  limitations: string[];
}

export const BRIEFING_LIMITATIONS = [
  "This is a filter over recorded changes from the sources ImmigrationClock ingests, not a complete picture of U.S. immigration. An empty section means nothing matched, never that nothing happened.",
  "Matches are found in each document's own words. Where a match rests only on a sentence in the body, it is marked as possibly incidental and shown with its quote.",
  "Urgency comes only from dates the documents state. Whether a record was major when published is shown separately and does not make it due now.",
  "Records are classified automatically unless marked reviewed. This is information about published government material, not legal advice, and it makes no determination about any person or case.",
];

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

const SECTION_ORDER: Section[] = ["upcoming", "current", "historical"];

export function buildBriefing(
  options: {
    follows: readonly string[];
    savedIds: readonly string[];
    today: string;
    /** Most historical records shown. The archive has the rest. */
    historicalLimit?: number;
  },
  events?: readonly ChangeInput[]
): Briefing {
  const saved = new Set(options.savedIds);
  const sections: Record<Section, FeedItem[]> = { upcoming: [], current: [], historical: [] };

  for (const { input, strong, weak } of inputsFor(options.today, events)) {
    const isSaved = saved.has(strong.recordId);
    const assessment = assessChange(input, strong, weak, options.follows, options.today, isSaved);
    if (assessment.matches.length === 0 && !isSaved) continue;
    sections[assessment.section].push({
      change: strong,
      brief: buildBrief(strong),
      assessment,
      matched: assessment.matches.map((m) => m.follow),
      path: changePath(input),
      saved: isSaved,
    });
  }

  const rank = (i: FeedItem) => (i.assessment.primary ? 0 : 1);
  sections.upcoming.sort(
    (a, b) => rank(a) - rank(b) || (a.assessment.daysUntilEffective ?? 0) - (b.assessment.daysUntilEffective ?? 0)
  );
  sections.current.sort((a, b) => rank(a) - rank(b) || b.change.publishedDate.localeCompare(a.change.publishedDate));
  sections.historical.sort((a, b) => rank(a) - rank(b) || b.change.publishedDate.localeCompare(a.change.publishedDate));
  sections.historical = sections.historical.slice(0, options.historicalLimit ?? 40);

  const timeline: TimelineItem[] = sections.upcoming
    .filter((i) => i.assessment.primary && i.change.effectiveDate && i.change.status !== "proposed")
    .map((i) => ({
      recordId: i.change.recordId,
      path: i.path,
      title: i.change.title,
      effectiveDate: i.change.effectiveDate!,
      daysUntil: i.assessment.daysUntilEffective!,
      publishedDate: i.change.publishedDate,
      status: i.change.status,
      sourceName: i.change.source.name,
      sourceUrl: i.change.source.url,
      matched: i.matched,
      saved: i.saved,
    }))
    .sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));

  return {
    feed: SECTION_ORDER.flatMap((s) => sections[s]),
    sections,
    timeline,
    limitations: BRIEFING_LIMITATIONS,
  };
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
