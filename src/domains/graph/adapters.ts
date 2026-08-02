// =============================================================================
// SOURCE ADAPTERS — the pluggable edge of the knowledge graph
//
// Founder Directive Part 4: an immigration event may originate from USCIS, the
// Department of State, DHS, CBP, ICE, the Department of Labor, the Federal
// Register, Executive Orders, federal courts, Congress, or verified government
// datasets. The founder's Phase 2 direction extends that to Presidential
// Proclamations, the Visa Bulletin, state governments, WARN notices, H-1B
// employer data, PERM data, and labour statistics.
//
// Sixteen sources with sixteen wildly different formats — JSON APIs, XML, CSV,
// HTML tables, PDFs — must not become sixteen bespoke pipelines. They all
// implement ONE contract and emit ONE type (`ImmigrationEvent`). That is the
// difference between a knowledge graph and a pile of feeds.
//
// EVERY named source is registered here from day one, including the ones with no
// implementation. Declaring them is not aspirational padding: it makes coverage
// legible (`/methodology` renders this table), it fixes each source's identity
// before an adapter is written, and it means adding an adapter is a local change
// rather than a schema change.
// =============================================================================

import type { ImmigrationEvent } from "./events";

/** Where an adapter stands. Shown publicly — we do not imply coverage we lack. */
export type AdapterStatus =
  /** Implemented, running, feeding events. */
  | "live"
  /** Implemented but not yet enabled in the build. */
  | "ready"
  /** Specified and prioritized; no code yet. */
  | "planned"
  /** Known to be hard (PDF-only, no stable endpoint). Documented honestly. */
  | "blocked";

export interface AdapterContext {
  /** Only fetch documents published on or after this date. */
  since: string;
  /** Hard cap so one source cannot dominate a run. */
  limit: number;
  /** Set for local/CI runs that must not hit the network. */
  offline?: boolean;
}

export interface AdapterResult {
  adapterKey: string;
  events: ImmigrationEvent[];
  /** Non-fatal problems. A partial result is better than none, but never silent. */
  warnings: string[];
  /** True when the adapter could not fetch and returned nothing. */
  failed: boolean;
}

/**
 * The contract every source implements.
 *
 * `fetchEvents` must be pure with respect to the graph: it returns events, it
 * does not write files, and it never throws for a recoverable problem — it
 * reports through `warnings` / `failed` so one bad source cannot take down a
 * whole ingestion run. Same resilience principle as the WARN pipeline, which
 * keeps its last-good snapshot rather than publishing an empty feed.
 */
export interface SourceAdapter {
  key: string;
  name: string;
  /** Key into the canonical source registry (src/lib/sources.ts). */
  sourceKey: string;
  status: AdapterStatus;
  /** What this adapter can and cannot see. Rendered publicly. */
  coverage: string;
  /** Why it is blocked, when status is "blocked". */
  blockedReason?: string;
  fetchEvents?: (ctx: AdapterContext) => Promise<AdapterResult>;
}

/**
 * The full adapter registry — every source in the long-term architecture.
 *
 * Ordering reflects implementation priority: the sources that produce genuine
 * CHANGE (rulemaking, executive action, courts) come before the statistical
 * releases, because "What Changed" is the flagship feature and statistics move
 * monthly at best.
 */
export const ADAPTERS: SourceAdapter[] = [
  {
    key: "federal-register",
    name: "Federal Register",
    sourceKey: "federal_register",
    status: "ready",
    coverage:
      "Rules, proposed rules, and notices from USCIS, DHS, CBP, ICE, State, and Labor. Free JSON API, no key, full-text searchable, updated every publication day. The single richest source of actual policy change.",
  },
  {
    key: "executive-actions",
    name: "Executive Orders & Presidential Proclamations",
    sourceKey: "federal_register",
    status: "ready",
    coverage:
      "Presidential documents are published in the Federal Register and share its API, so this reuses the same transport with a different document-type filter and its own severity rules — an executive action is materially different from a routine notice.",
  },
  {
    key: "uscis-newsroom",
    name: "USCIS newsroom & policy alerts",
    sourceKey: "uscis_newsroom",
    status: "ready",
    coverage:
      "Policy manual updates, alerts, and cap announcements. USCIS publishes RSS, which is stable and machine-readable.",
  },
  {
    key: "uscis-policy-manual",
    name: "USCIS Policy Manual",
    sourceKey: "uscis_policy_manual",
    status: "ready",
    coverage:
      "Policy alerts and technical updates to the controlling adjudication guidance USCIS officers apply. HTML with no API, so it is scraped — but unlike the Visa Bulletin it publishes documents rather than a table of dates, so a parse failure yields a missing event rather than a confidently wrong figure. Severity follows USCIS's own labelling.",
  },
  {
    key: "dos-announcements",
    name: "State Department visa announcements",
    sourceKey: "dos_visa",
    status: "blocked",
    blockedReason:
      "State Department publishing channels are not machine-accessible to an identified crawler. Verified 2026-08-01: every www.state.gov URL, including the homepage and the press-release feed, returned a site-wide 'Technical Difficulties' page; travel.state.gov returned HTTP 403 from Cloudflare bot protection, which we do not attempt to circumvent. The only feed that resolved was the Travel Advisories XML, which is safety guidance for U.S. citizens travelling abroad rather than immigration policy, so it is deliberately not ingested. DOS RULEMAKING IS ALREADY COVERED: the Federal Register adapter tracks the state-department agency slug, so DOS visa rules and public notices reach the event store through it. This adapter would add consular announcements that never reach the Federal Register — it is not a gap in DOS policy coverage.",
    coverage:
      "Consular announcements, visa news, and operational notices from the Bureau of Consular Affairs that are not published in the Federal Register.",
  },
  {
    key: "visa-bulletin",
    name: "Visa Bulletin",
    sourceKey: "dos_visa",
    status: "blocked",
    blockedReason:
      "Two independent blockers. First, access: the bulletin is published on travel.state.gov, which returned HTTP 403 from Cloudflare bot protection when verified on 2026-08-01 — the same root cause that blocks the DOS announcements adapter. Second, and unchanged even if access were restored: the bulletin is a TABLE OF DATES with an inconsistent structure, and a mis-parsed priority date is not a degraded event but a confidently wrong fact a reader will act on. It needs a verification step, not a blind parse.",
    coverage:
      "Monthly final-action and filing dates by preference category and country of chargeability.",
  },
  {
    key: "federal-courts",
    name: "Federal court decisions",
    sourceKey: "federal_courts",
    status: "ready",
    coverage:
      "Decisions that establish or change immigration law: published appellate rulings and institutional litigation against immigration agencies, via CourtListener's free API. Routine individual petitions, asylum appeals, visa denials, and detainee habeas cases are excluded by editorial policy — the platform reports the legal rule, not the people in a case. Measured against live data, this excludes roughly 9 in 10 immigration decisions.",
  },
  {
    key: "congress",
    name: "Congress — bills and public laws",
    sourceKey: "congress",
    status: "ready",
    coverage:
      "Immigration bills that have moved past introduction: reported by committee, passed a chamber, or enacted, via the official Congress.gov API. Introduced and referred bills are excluded — roughly 2% of bills become law, so reporting introductions as change would be wrong nearly every time, and wrong in the direction that alarms readers. Requires a free api.congress.gov key; without one the source reports as unconfigured rather than failing."
  },
  {
    key: "warn",
    name: "State WARN notices",
    sourceKey: "warn_layoffs",
    status: "live",
    coverage:
      "Layoff notices from states publishing machine-readable feeds. Already ingested by scripts/build-warn.ts; will emit events once the event store is wired.",
  },
  {
    key: "uscis-h1b-datahub",
    name: "USCIS H-1B Employer Data Hub",
    sourceKey: "uscis_h1b",
    status: "live",
    coverage:
      "Per-employer H-1B approvals and denials by fiscal year. Already ingested by scripts/build-employers.ts; a new annual export is itself a data_release event.",
  },
  {
    key: "cbp-encounters",
    name: "CBP nationwide encounters",
    sourceKey: "cbp_encounters",
    status: "live",
    coverage:
      "Monthly encounter totals by sector and demographic. Already ingested; each monthly release is a data_release event.",
  },
  {
    key: "bls",
    name: "BLS labor statistics",
    sourceKey: "bls_unemployment",
    status: "live",
    coverage: "National unemployment rate, as labour-market context. Already ingested.",
  },
  {
    key: "dol-perm",
    name: "DOL PERM disclosure data",
    sourceKey: "dol_lca",
    status: "planned",
    coverage:
      "Permanent labour certification filings and outcomes by employer. Quarterly bulk files, machine-readable, and the natural companion to the H-1B directory for employer intelligence.",
  },
  {
    key: "dol-lca",
    name: "DOL LCA disclosure data",
    sourceKey: "dol_lca",
    status: "planned",
    coverage:
      "Labour Condition Applications: worksites, job titles, and offered wages. Large quarterly files. Would replace today's modeled wage figures with real ones.",
  },
  {
    key: "ice-detention",
    name: "ICE detention & enforcement statistics",
    sourceKey: "ice_stats",
    status: "blocked",
    blockedReason:
      "ICE publishes as XLSX on an irregular schedule with changing sheet layouts. Ingestible, but the layout drift means it needs a verification step rather than a blind parse.",
    coverage: "Detention population, arrests, removals, and facility-level detail.",
  },
  {
    key: "dos-visa-statistics",
    name: "State Department visa statistics",
    sourceKey: "dos_visa",
    status: "blocked",
    blockedReason:
      "Published as monthly PDFs with no machine-readable feed, and hosted on travel.state.gov, which returned HTTP 403 from Cloudflare bot protection when verified on 2026-08-01. Currently transcribed by hand.",
    coverage: "Nonimmigrant and immigrant visa issuances by class and country.",
  },
  {
    key: "state-agencies",
    name: "State government immigration actions",
    sourceKey: "state_agencies",
    status: "planned",
    coverage:
      "State-level policies touching immigrants — licensing, benefits, tuition, enforcement cooperation. No single feed exists; this is a per-state effort and the least tractable source in the set.",
  },
  {
    key: "sevis",
    name: "SEVIS / SEVP student data",
    sourceKey: "sevis",
    status: "planned",
    coverage:
      "Certified schools and international-student counts by school and country. Enables the `university` entity type.",
  },
];

/**
 * Apply the per-run cap, and SAY SO when it bites.
 *
 * Every adapter ends with `slice(0, ctx.limit)`, and every one of them used to
 * do it silently. That is the worst kind of data loss: a backfill run over 2025
 * had USCIS return exactly 100 events, which looks like a number and is
 * actually a ceiling — the documents beyond it were dropped with nothing in the
 * build output to say they existed.
 *
 * A cap is a legitimate guard against one source dominating a run. Hiding that
 * it engaged is not.
 */
export function capEvents<T>(events: T[], limit: number): { events: T[]; warnings: string[] } {
  if (events.length <= limit) return { events, warnings: [] };
  return {
    events: events.slice(0, limit),
    warnings: [
      `truncated to the per-run cap of ${limit} (had ${events.length}). ` +
        "The newest are kept; re-run with a narrower window to pick up the rest.",
    ],
  };
}

export const ADAPTER_BY_KEY = new Map(ADAPTERS.map((a) => [a.key, a]));

export function adaptersByStatus(status: AdapterStatus): SourceAdapter[] {
  return ADAPTERS.filter((a) => a.status === status);
}

/** Adapters that can actually run right now. */
export function runnableAdapters(): SourceAdapter[] {
  return ADAPTERS.filter((a) => (a.status === "live" || a.status === "ready") && a.fetchEvents);
}

/**
 * Honest one-line coverage statement for the methodology page. Counts what is
 * built versus what is declared, so a reader can see the gap rather than infer
 * completeness from a long list.
 */
export function adapterCoverageSummary(): string {
  const live = adaptersByStatus("live").length + adaptersByStatus("ready").length;
  const blocked = adaptersByStatus("blocked").length;
  return (
    `${live} of ${ADAPTERS.length} government sources are ingested automatically. ` +
    `${adaptersByStatus("planned").length} are specified and not yet built; ` +
    `${blocked} publish only in formats (PDF, irregular spreadsheets) that we will not parse blindly. ` +
    `We list every source, built or not, so coverage gaps are visible rather than implied.`
  );
}
