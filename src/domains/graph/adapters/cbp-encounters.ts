// =============================================================================
// CBP NATIONWIDE ENCOUNTERS ADAPTER
//
// -----------------------------------------------------------------------------
// THIS ADAPTER DOES NOT FETCH, AND THAT IS DELIBERATE
// -----------------------------------------------------------------------------
// CBP encounters are already ingested. scripts/refresh-data.mjs finds the
// monthly CSV, sums it, and writes both the current figure to refresh.json and
// an append-only archive to history.json. Re-fetching the same CSV from here
// would give the platform two independent readings of one dataset that could
// disagree — and if they ever did, every page would have to decide which to
// trust.
//
// So this adapter is a PROJECTION of the existing pipeline into the event model,
// not a second reader of CBP. Its job is to answer "what changed" for a
// statistical source, where the change is the release itself.
//
// -----------------------------------------------------------------------------
// THE DATE PROBLEM, AND WHY publishedAt IS APPROXIMATE HERE
// -----------------------------------------------------------------------------
// Three genuinely different dates are involved, and conflating them is how a
// statistics page misleads without lying:
//
//   dataThrough  — the month the figures cover. EXACT. "June 2026".
//   publishedAt  — when CBP released it. CBP does not publish a release DATE;
//                  its CSVs live in a year-month folder ("2026-07"), so the
//                  month is known and the day is not.
//   lastVerified — when our pipeline last confirmed the file. Exact.
//
// An event needs a date to sit on a timeline, so publishedAt is set to the first
// of CBP's publication month and every event says so in its limitations. The
// precise, load-bearing fact — which month the numbers cover — is carried in
// dataThrough, where it belongs and where it is exact.
//
// -----------------------------------------------------------------------------
// BACKFILLED FIGURES ARE LABELLED
// -----------------------------------------------------------------------------
// history.json marks entries `backfilled` when the figure was reconstructed from
// a later cumulative CSV rather than observed at release time. The number is the
// same either way — CBP's own published total — but "we watched this happen" and
// "we read it out of a file months later" are different epistemic claims, and
// the archive already tracks the difference. It would be a waste of an honest
// record not to pass it through.
// =============================================================================

import { capEvents } from "../adapters";
import type { AdapterContext, AdapterResult, SourceAdapter } from "../adapters";
import type { EventEntityLink, ImmigrationEvent } from "../events";
import { entityId } from "../entities";

const SOURCE_KEY = "cbp_encounters";

/** One entry from history.json's cbpNationwideYtd archive. */
export interface CbpHistoryEntry {
  period: string;
  month: string | null;
  order: number;
  fy: number;
  cbpNationwideYtd: number;
  /** CBP's own publication folder, "YYYY-MM". The day is not published. */
  publishedFolder: string | null;
  backfilled?: boolean;
}

export interface CbpRefreshState {
  ok?: boolean;
  reportingMonth?: string | null;
  reportingMonthLabel?: string | null;
  currentFy?: number | null;
  currentFyYtd?: number | null;
  datasetUrl?: string | null;
  sourceUrl?: string | null;
  sourceUpdatedAt?: string | null;
}

const MONTH_NUMBER: Record<string, string> = {
  JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
  JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12",
};

/**
 * The last day the figures cover, as an ISO date.
 *
 * "June 2026" becomes 2026-06-30 — the END of the covered period, because
 * `dataThrough` answers "through when", and the 1st would understate coverage by
 * a month.
 */
export function dataThroughDate(entry: { period: string; month: string | null }): string | null {
  const m = /^([A-Za-z]+)\s+(\d{4})$/.exec(entry.period.trim());
  if (!m) return null;
  const monthKey = (entry.month ?? m[1].slice(0, 3)).toUpperCase();
  const mm = MONTH_NUMBER[monthKey];
  const year = Number(m[2]);
  if (!mm || !Number.isFinite(year)) return null;
  // Day 0 of the following month is the last day of this one, leap years included.
  const last = new Date(Date.UTC(year, Number(mm), 0)).getUTCDate();
  return `${year}-${mm}-${String(last).padStart(2, "0")}`;
}

/**
 * Publication date, from CBP's folder month.
 *
 * Returns null rather than guessing when the folder is missing — an undated
 * release cannot be placed on a timeline, and a fabricated date is worse than a
 * dropped event.
 */
export function publishedDate(entry: CbpHistoryEntry): string | null {
  if (entry.publishedFolder && /^\d{4}-\d{2}$/.test(entry.publishedFolder)) {
    return `${entry.publishedFolder}-01`;
  }
  return null;
}

export function stableId(entry: CbpHistoryEntry): string {
  const month = (entry.month ?? entry.period.slice(0, 3)).toUpperCase();
  return `${SOURCE_KEY}:fy${entry.fy}-${month.toLowerCase()}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function toEvent(
  entry: CbpHistoryEntry,
  publishedAt: string,
  refresh: CbpRefreshState,
  verifiedAt: string
): ImmigrationEvent {
  const links: EventEntityLink[] = [
    { entityId: entityId("agency", "cbp"), relation: "issued_by", basis: "explicit", confidence: 1 },
    { entityId: entityId("topic", "border"), relation: "categorized_as", basis: "explicit", confidence: 1 },
  ];

  const backfilled = entry.backfilled === true;

  return {
    id: stableId(entry),
    sourceKey: SOURCE_KEY,
    issuingAgencyId: entityId("agency", "cbp"),
    classification: "data_release",
    // A scheduled statistical release is routine BY DEFINITION. The number can
    // be striking; the release is still the calendar doing its job, and ranking
    // it higher would manufacture importance the Directive warns against.
    severity: "routine",
    title: `CBP nationwide encounters: data through ${entry.period}`,
    summary:
      `CBP published nationwide encounter figures covering fiscal year ${entry.fy} through ${entry.period}. ` +
      `The cumulative year-to-date total is ${formatNumber(entry.cbpNationwideYtd)} encounters. ` +
      "An encounter is an enforcement action, not a person: one individual can be encountered more than once, " +
      "so encounters and people are different counts.",
    publishedAt,
    // The exact, load-bearing fact.
    dataThrough: dataThroughDate(entry),
    // A statistical release has no effective date; it changes no one's obligations.
    effectiveAt: null,
    lastVerifiedAt: verifiedAt,
    sourceUrl: refresh.sourceUrl || "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
    sourceDataUrl: refresh.datasetUrl || undefined,
    entities: links,
    provenance: "reported",
    // Impact is stated rather than extracted: a statistical release affects
    // nobody's status. Saying so is more useful than an empty section, which
    // would read as "we could not work it out".
    impact: {
      countries: [],
      visaCategories: [],
      agencies: [
        { entityId: entityId("agency", "cbp"), basis: "derived", confidence: 1 },
      ],
      employers: [],
      universities: [],
      states: [],
      completeness: "unspecified",
      undetermined:
        "A statistical release does not change anyone's status or obligations. It reports what already happened.",
    },
    reviewStatus: "auto",
    limitations: [
      "An encounter is an enforcement action, not a person. Title 8 apprehensions, Title 8 inadmissibles, and expulsions are counted together, and one person can be encountered several times in a year, so encounters exceed the number of individuals.",
      `Figures are year-to-date for fiscal year ${entry.fy}, which begins on 1 October — they are not a calendar-year count and are not comparable to a full year until the year closes.`,
      "CBP does not publish a release date, only a publication month, so this event is dated to the first of that month. The month the figures actually cover is given as the data-through date and is exact.",
      ...(backfilled
        ? [
            "This figure was reconstructed from a later cumulative CBP file rather than observed at the time of release. The number is CBP's own published total; what we cannot attest is the release as it happened.",
          ]
        : []),
    ],
  };
}

// -----------------------------------------------------------------------------
// Build
// -----------------------------------------------------------------------------

export interface CbpInput {
  history: { cbpNationwideYtd?: CbpHistoryEntry[] };
  refresh: { cbp?: CbpRefreshState };
}

/**
 * Turn the committed pipeline output into events.
 *
 * Pure and synchronous, so the whole adapter is testable without a network or a
 * filesystem — the reason the fetch wrapper below is so thin.
 */
export function buildEvents(
  input: CbpInput,
  verifiedAt: string
): { events: ImmigrationEvent[]; warnings: string[] } {
  const warnings: string[] = [];
  const series = input.history.cbpNationwideYtd ?? [];
  const refresh = input.refresh.cbp ?? {};

  if (series.length === 0) {
    return {
      events: [],
      warnings: ["no CBP history recorded yet — nothing to project into events"],
    };
  }

  const events: ImmigrationEvent[] = [];
  let undated = 0;

  for (const entry of series) {
    let publishedAt = publishedDate(entry);

    // The newest entry is usually still in the folder CBP has not archived, so
    // it has no publishedFolder. The refresh record knows when our pipeline saw
    // it, which is a real observed date rather than a guess.
    if (!publishedAt && entry.period === refresh.reportingMonthLabel && refresh.sourceUpdatedAt) {
      publishedAt = refresh.sourceUpdatedAt;
    }
    if (!publishedAt) {
      undated++;
      continue;
    }
    events.push(toEvent(entry, publishedAt, refresh, verifiedAt));
  }

  if (undated > 0) {
    warnings.push(
      `${undated} CBP release(s) had no publication month recorded and were skipped rather than dated by guess`
    );
  }
  return { events, warnings };
}

async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  const key = "cbp-encounters";
  const verifiedAt = new Date().toISOString().slice(0, 10);

  // Reads committed pipeline output, so it works identically offline. That is a
  // property worth having: the whole event store can be rebuilt with no network.
  let input: CbpInput;
  try {
    const [history, refresh] = await Promise.all([
      import("@/lib/generated/history.json").then((m) => m.default ?? m),
      import("@/lib/generated/refresh.json").then((m) => m.default ?? m),
    ]);
    input = { history: history as CbpInput["history"], refresh: refresh as CbpInput["refresh"] };
  } catch (err) {
    return {
      adapterKey: key,
      events: [],
      warnings: [`could not read the committed CBP pipeline output: ${(err as Error)?.message ?? String(err)}`],
      failed: true,
    };
  }

  const { events, warnings } = buildEvents(input, verifiedAt);
  const inWindow = events.filter((e) => e.publishedAt >= ctx.since);
  const capped = capEvents(inWindow, ctx.limit);

  return {
    adapterKey: key,
    // The archive is small and grows one entry a month, so the window is applied
    // for consistency with other adapters rather than to control volume.
    events: capped.events,
    warnings: [...warnings, ...capped.warnings],
    failed: false,
  };
}

export const cbpEncountersAdapter: SourceAdapter = {
  key: "cbp-encounters",
  name: "CBP nationwide encounters",
  sourceKey: SOURCE_KEY,
  status: "live",
  coverage:
    "Monthly nationwide encounter totals, projected into the event store from the existing CBP pipeline rather than fetched again — one dataset, one reading. Each monthly release is a routine data_release: the numbers can be striking, but a scheduled release is the calendar doing its job, not a policy change. Encounters count enforcement actions, not people.",
  fetchEvents,
};

export const __testing = {
  dataThroughDate,
  publishedDate,
  stableId,
  toEvent,
  buildEvents,
};
