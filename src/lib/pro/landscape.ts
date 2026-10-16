// =============================================================================
// THE LANDSCAPE — what the record shows for each thing a subscriber follows
//
// The Briefing feed answers "what changed recently". The landscape answers the
// question a subscriber has in a quiet week: "for H-1B, what does the record
// say right now?" — built only from records in the archive, per follow:
//
//   • took effect   final rules and executive actions whose STATED effective
//                   date has passed. Never called "in force": a later rule,
//                   an injunction or a withdrawal can change that, and the
//                   archive does not prove a negative.
//   • coming up     stated effective dates ahead.
//   • proposals     proposed rules with no later record amending them —
//                   "no final rule in our archive", not "still pending".
//   • undated       final rules that state no effective date. Counted, never
//                   given a date.
//   • activity      how many records matched recently, the newest record's
//                   date, and which sources were checked.
//
// Only primary matches count (named in the title, summary or structured data,
// issued by a followed agency, filed under a followed topic). A body-only
// mention is not enough to describe what the record says about something.
// =============================================================================

import { EVENTS, EVENT_STORE_META } from "@/lib/event-store";
import { adaptersByStatus } from "@/domains/graph/adapters";
import { labelForEntity } from "@/lib/entity-labels";
import { amendmentIndex, toPublicChange, type ChangeInput } from "@/lib/intelligence/change";
import { changePath } from "@/lib/share";
import { explainMatches } from "./assess";

export interface LandscapeEntry {
  recordId: string;
  path: string;
  title: string;
  /** The date the entry is about: effective date, or publication date for proposals. */
  date: string;
  /** One line of documented status. */
  status: string;
  sourceName: string;
  sourceUrl: string;
}

export interface FollowLandscape {
  follow: string;
  label: string;
  tookEffect: LandscapeEntry[];
  comingUp: LandscapeEntry[];
  proposals: LandscapeEntry[];
  undatedFinalCount: number;
  /** Records matched in the last RECENT_DAYS days. */
  recentCount: number;
  /** Publication date of the newest matching record, or null. */
  latestRecord: string | null;
  /** Every matching record, for "see all". */
  totalCount: number;
  /** /what-changed filtered to this follow. */
  archivePath: string;
}

export interface Landscape {
  follows: FollowLandscape[];
  coverage: {
    /** Sources that ran in the latest refresh and returned records. */
    checked: string[];
    /** Sources that ran but returned nothing, or failed, in the latest refresh. */
    quietOrFailed: string[];
    /** Sources we know we cannot ingest. */
    notCovered: string[];
    lastRefresh: string;
  };
  limitations: string[];
}

export const RECENT_DAYS = 30;
/** Entries shown per list; the rest are a tap away in the archive. */
export const PER_LIST = 3;

const RULE_CLASSES = new Set(["final_rule", "executive_action"]);
const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / DAY);

export const LANDSCAPE_LIMITATIONS = [
  "Built only from records in ImmigrationClock's archive, matched where the document names what you follow. It is not a complete statement of current law.",
  "“Took effect” means the document's stated effective date has passed. A later rule, a court order or a withdrawal can change whether it still applies — check the source.",
  "“No final rule in our archive” means we hold no later record amending the proposal. It does not prove the proposal is still pending.",
];

function kindLabel(classification: string): string {
  return classification === "executive_action" ? "Executive action" : "Final rule";
}

export function buildLandscape(
  options: { follows: readonly string[]; today: string },
  events: readonly ChangeInput[] = EVENTS as unknown as ChangeInput[]
): Landscape {
  const { follows, today } = options;
  const amendedBy = amendmentIndex(events);

  const byFollow = new Map<string, FollowLandscape>(
    follows.map((f) => [
      f,
      {
        follow: f,
        label: labelForEntity(f),
        tookEffect: [],
        comingUp: [],
        proposals: [],
        undatedFinalCount: 0,
        recentCount: 0,
        latestRecord: null,
        totalCount: 0,
        archivePath: `/what-changed?entity=${encodeURIComponent(f)}`,
      },
    ])
  );

  for (const input of events) {
    const later = amendedBy.get(input.id) ?? [];
    const strong = toPublicChange(input, today, later);
    const weak = toPublicChange(input, today, later, true);
    const primary = explainMatches(input, strong, weak, follows).filter(
      (m) => m.strength === "named" || m.strength === "categorized"
    );
    if (primary.length === 0) continue;

    const entry = (date: string, status: string): LandscapeEntry => ({
      recordId: input.id,
      path: changePath(input),
      title: input.title,
      date,
      status,
      sourceName: strong.source.name,
      sourceUrl: strong.source.url,
    });

    for (const m of primary) {
      const l = byFollow.get(m.follow)!;
      l.totalCount += 1;
      if (!l.latestRecord || strong.publishedDate > l.latestRecord) l.latestRecord = strong.publishedDate;
      const age = days(strong.publishedDate, today);
      if (age >= 0 && age <= RECENT_DAYS) l.recentCount += 1;

      // A record amended by a later one is history; the later record carries
      // the current state and appears in its own right.
      if (later.length > 0) continue;

      if (input.classification === "proposed_rule") {
        l.proposals.push(entry(strong.publishedDate, `Proposed ${strong.publishedDate}`));
      } else if (RULE_CLASSES.has(input.classification)) {
        const eff = strong.effectiveDate;
        if (!eff) l.undatedFinalCount += 1;
        else if (eff > today) l.comingUp.push(entry(eff, `${kindLabel(input.classification)} · takes effect ${eff}`));
        else l.tookEffect.push(entry(eff, `${kindLabel(input.classification)} · stated effective ${eff}`));
      }
    }
  }

  for (const l of byFollow.values()) {
    l.comingUp.sort((a, b) => a.date.localeCompare(b.date));
    l.tookEffect.sort((a, b) => b.date.localeCompare(a.date));
    l.proposals.sort((a, b) => b.date.localeCompare(a.date));
  }

  const adapters = EVENT_STORE_META.adapters;
  return {
    follows: follows.map((f) => byFollow.get(f)!),
    coverage: {
      checked: adapters.filter((a) => a.ok && a.eventCount > 0).map((a) => a.name),
      quietOrFailed: adapters.filter((a) => !a.ok || a.eventCount === 0).map((a) => a.name),
      notCovered: adaptersByStatus("blocked").map((a) => a.name),
      lastRefresh: EVENT_STORE_META.generatedAt,
    },
    limitations: LANDSCAPE_LIMITATIONS,
  };
}
