// =============================================================================
// IMMIGRATION COURT CASELOAD ADAPTER (EOIR)
//
// Like the CBP adapter, this one does not fetch. scripts/eoir-caseload.mjs reads
// EOIR's "Pending Cases, New Cases, and Total Completions" table during the data
// refresh and writes it to refresh.json; this adapter projects that reading into
// the event store, so one dataset has one reading.
//
// Each distinct edition of the table (keyed by its "Data Generated" date) is one
// routine data_release event. The store keeps earlier editions, so the archive
// shows how the backlog moved from one edition to the next.
//
// When the refresh could not read the table, this adapter reports a failure with
// the reason and when it last succeeded. That is what puts "could not be
// reached" on the site's health line instead of quietly serving an old figure
// as if it were current.
// =============================================================================

import type { AdapterContext, AdapterResult, SourceAdapter } from "../adapters";
import type { EventEntityLink, ImmigrationEvent } from "../events";
import { entityId } from "../entities";

const KEY = "eoir-caseload";
const SOURCE_KEY = "eoir_caseload";
const STATS_PAGE = "https://www.justice.gov/eoir/workload-and-adjudication-statistics";

export interface EoirCaseloadRow {
  fy: number;
  pending: number;
  receipts: number;
  completions: number;
}

export interface EoirRefreshState {
  ok?: boolean;
  stale?: boolean;
  fy?: number | null;
  pending?: number | null;
  receipts?: number | null;
  completions?: number | null;
  dataGenerated?: string | null;
  postedAt?: string | null;
  series?: EoirCaseloadRow[];
  datasetUrl?: string | null;
  sourceUrl?: string | null;
  fetchedAt?: string | null;
  lastError?: string | null;
  note?: string | null;
}

const fmt = (n: number) => n.toLocaleString("en-US");

export function stableId(state: EoirRefreshState): string {
  return `${SOURCE_KEY}:generated-${state.dataGenerated}`;
}

/** Change in pending cases since the previous fiscal year in the same table, as a phrase. */
export function changeSincePriorYear(series: EoirCaseloadRow[], fy: number): string | null {
  const cur = series.find((r) => r.fy === fy);
  const prev = series.find((r) => r.fy === fy - 1);
  if (!cur || !prev) return null;
  const diff = cur.pending - prev.pending;
  if (diff === 0) return `unchanged from FY ${prev.fy}`;
  return `${diff < 0 ? "down" : "up"} ${fmt(Math.abs(diff))} from ${fmt(prev.pending)} in FY ${prev.fy}`;
}

export function toEvent(state: EoirRefreshState, verifiedAt: string): ImmigrationEvent {
  const fy = state.fy!;
  const pending = state.pending!;
  const change = changeSincePriorYear(state.series ?? [], fy);
  const publishedAt =
    state.postedAt && state.postedAt <= verifiedAt ? state.postedAt : state.dataGenerated!;

  const links: EventEntityLink[] = [
    { entityId: entityId("agency", "eoir"), relation: "issued_by", basis: "explicit", confidence: 1 },
    { entityId: entityId("topic", "processing-times"), relation: "categorized_as", basis: "explicit", confidence: 1 },
  ];

  const parts = [
    `EOIR reports ${fmt(pending)} cases pending in the immigration courts for fiscal year ${fy}` +
      (change ? `, ${change}.` : "."),
  ];
  if (state.receipts != null && state.completions != null) {
    parts.push(
      `In FY ${fy} the courts received ${fmt(state.receipts)} new cases and completed ${fmt(state.completions)}.`
    );
  }
  parts.push(`Figures as reported in EOIR's table generated ${state.dataGenerated}.`);

  return {
    id: stableId(state),
    sourceKey: SOURCE_KEY,
    issuingAgencyId: entityId("agency", "eoir"),
    classification: "data_release",
    severity: "routine",
    title: `Immigration court backlog: ${fmt(pending)} cases pending (FY ${fy}, as reported by EOIR)`,
    summary: parts.join(" "),
    publishedAt,
    dataThrough: state.dataGenerated ?? null,
    effectiveAt: null,
    lastVerifiedAt: verifiedAt,
    sourceUrl: state.sourceUrl || STATS_PAGE,
    sourceDataUrl: state.datasetUrl || undefined,
    entities: links,
    provenance: "reported",
    impact: {
      countries: [],
      visaCategories: [],
      agencies: [{ entityId: entityId("agency", "eoir"), basis: "derived", confidence: 1 }],
      employers: [],
      universities: [],
      states: [],
      completeness: "unspecified",
      undetermined:
        "A statistical release does not change anyone's status or obligations. It reports the courts' workload.",
    },
    reviewStatus: "auto",
    limitations: [
      "Pending cases are removal, deportation, exclusion, asylum-only and withholding-only proceedings, as EOIR defines them. A case is not a person: a family can be one case or several.",
      "Completions include both initial and subsequent case completions, so they are not the number of people ordered removed or granted relief.",
      `The current fiscal year may be partial: EOIR generated this table on ${state.dataGenerated}, and the fiscal year runs from 1 October.`,
    ],
  };
}

export function buildEvents(
  state: EoirRefreshState | undefined,
  verifiedAt: string
): { events: ImmigrationEvent[]; warnings: string[]; failed: boolean } {
  if (!state) {
    return { events: [], warnings: ["the data refresh has not read EOIR's caseload table yet"], failed: true };
  }
  const events =
    state.pending != null && state.fy != null && state.dataGenerated ? [toEvent(state, verifiedAt)] : [];

  if (state.ok) return { events, warnings: [], failed: false };

  const when = state.fetchedAt ? state.fetchedAt.slice(0, 10) : "never";
  return {
    events,
    warnings: [
      `EOIR's caseload table could not be read (${state.lastError ?? state.note ?? "unknown error"}); last read ${when}`,
    ],
    failed: true,
  };
}

async function fetchEvents(ctx: AdapterContext): Promise<AdapterResult> {
  const verifiedAt = new Date().toISOString().slice(0, 10);
  let state: EoirRefreshState | undefined;
  try {
    const refresh = (await import("@/lib/generated/refresh.json").then((m) => m.default ?? m)) as {
      eoir?: EoirRefreshState;
    };
    state = refresh.eoir;
  } catch (err) {
    return {
      adapterKey: KEY,
      events: [],
      warnings: [`could not read the committed refresh output: ${(err as Error)?.message ?? String(err)}`],
      failed: true,
    };
  }
  const { events, warnings, failed } = buildEvents(state, verifiedAt);
  return {
    adapterKey: KEY,
    events: events.filter((e) => e.publishedAt >= ctx.since),
    warnings,
    failed,
  };
}

export const eoirCaseloadAdapter: SourceAdapter = {
  key: KEY,
  name: "Immigration court caseload (EOIR)",
  sourceKey: SOURCE_KEY,
  status: "live",
  coverage:
    "Pending immigration court cases, new cases and completions by fiscal year, read from EOIR's published statistics table during each data refresh and projected into the event store. Each new edition of the table is a routine data release; figures are as EOIR reports them.",
  fetchEvents,
};

export const __testing = { stableId, changeSincePriorYear, toEvent, buildEvents };
