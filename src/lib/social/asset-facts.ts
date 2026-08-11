// =============================================================================
// STANDING-ASSET INSIGHTS — what the evening slot is actually allowed to say
//
// The evening slot draws on durable pages rather than news. The first version of
// this layer handed the copy engine nothing but the page's own description, and
// the result was exactly what that guarantees: technically true posts that
// described what a page contains instead of telling anyone anything. "A ranked
// view of the employers filing the most H-1B petitions" is a table of contents,
// not an insight.
//
// This module closes that gap WITHOUT loosening the closed world. Every figure
// below is read out of a dataset the repository already holds and already
// renders, computed here in deterministic TypeScript, and handed to the engine
// as a finished sentence. The model is never asked to calculate anything, and
// validate.ts still rejects any numeral that did not come from here.
//
// THE LINE THIS FILE DRAWS
// ------------------------
// ImmigrationClock labels every figure by how it was derived: `reported`,
// `projected`, `estimated`, or `modeled` (src/lib/types.ts). Only `reported`
// figures — the ones an agency published, or facts about our own archive that we
// can count exactly — are exposed here.
//
// That rules out more than it might seem, and deliberately:
//
//   • /h1b/top-sponsors ranks a CURATED set of large sponsors anchored to
//     published FY2024 rankings. Its own page labels those totals `modeled`. No
//     figures.
//   • /border/encounters shows sector and demographic splits derived from the
//     nationwide totals with a seeded jitter. The nationwide totals are real, so
//     those are exposed and the splits are not.
//   • /immigration/enforcement-trends carries ICE figures for the current and
//     last fiscal year that are round curated values, and a detention snapshot
//     already past its own staleness window. No figures.
//   • /migration-map draws H-1B country counts that are real only for the two
//     largest origins and apportioned for the rest. No figures.
//
// Where the numbers do not survive that test, the asset gets a NON-NUMERIC
// insight instead — but only where there is a genuinely useful thing to say,
// usually the methodological point a reader gets wrong. Where there is neither,
// `assetInsights` returns null, the asset leaves the rotation, and the slot goes
// quiet. A skipped evening is cheaper than a post that says nothing.
//
// CAVEATS ARE PART OF THE PAYLOAD
// -------------------------------
// Each entry carries the source's own `limitations` string from the canonical
// registry (src/lib/sources.ts) rather than a restatement of it. That is what
// makes a WARN post able to say the coverage is partial, and unable to imply the
// notices say anything about immigration status.
// =============================================================================

import { EMPLOYERS, EMPLOYERS_META, AVG_APPROVAL_RATE, displayEmployer } from "@/lib/employers";
import { WARN_SUMMARY, warnCompleteMonths } from "@/lib/warn-summary";
import { warnH1bCrossLink } from "@/lib/warn";
import { CBP_LIVE, cbpRows, CURRENT_FY } from "@/lib/dataset";
import { EVENT_INDEX, INDEX_COVERAGE } from "@/lib/event-index";
import { KEY_DATES } from "@/lib/key-dates";
import { SOURCES, SOURCE_BY_KEY, officialSources, machineIngestedSources } from "@/lib/sources";
import { formatNumber, formatDate } from "@/lib/format";

/**
 * Everything the copy engine may know about one standing asset beyond its own
 * description.
 */
export interface AssetInsight {
  /**
   * Finished statements of fact, each already carrying its own numbers.
   *
   * Sentences rather than a bag of figures on purpose: a bare list of numerals
   * is an invitation to attach them to the wrong nouns, and the whole point of
   * this layer is that the arithmetic and the attribution both happen here.
   */
  points: string[];
  /** Limitations that must survive into the copy. Rendered as hard constraints. */
  caveats: string[];
  /**
   * Who published the underlying figures, when it is not us. Drives the
   * validator's attribution check as well as the prompt's SOURCE line.
   */
  sourceName?: string;
  /** True when `points` contain figures. False for the non-numeric insights. */
  numeric: boolean;
}

/** The `limitations` string a source publishes about itself. */
function limitation(key: string): string[] {
  const l = SOURCE_BY_KEY[key]?.limitations;
  return l ? [l] : [];
}

/**
 * Caveat used wherever an asset qualifies on a non-numeric insight alone.
 *
 * Worded against *statistics* rather than against digits, because the digits in
 * a visa name are unavoidable: "H-1B" and "F-1" put a numeral in the fact set
 * whether or not any figure was supplied, and a rule the model can see is
 * violated by the word "H-1B" is a rule it will start reasoning around.
 */
const NO_FIGURES =
  "No statistic from this dataset has been provided to you. Any digit you can see here belongs to a visa name, not to a measurement. Do not state a count, total, ranking, share or trend — there is nothing to derive one from, and it will be rejected.";

// -----------------------------------------------------------------------------
// MEMOISED DERIVATIONS
//
// standingPool() rebuilds every asset's facts on every slot of every simulated
// day. The WARN × H-1B join walks six thousand employers; doing that twenty-one
// times to produce the same three numbers is waste, not caution.
// -----------------------------------------------------------------------------

let crossLinkCache: { rows: number; layoffs: number; approvals: number } | null = null;

function crossLinkTotals() {
  if (!crossLinkCache) {
    const rows = warnH1bCrossLink();
    crossLinkCache = {
      rows: rows.length,
      layoffs: rows.reduce((s, r) => s + r.layoffs, 0),
      approvals: rows.reduce((s, r) => s + r.approvals, 0),
    };
  }
  return crossLinkCache;
}

let archiveCache: { sources: string[]; finalRules: number; proposedRules: number } | null = null;

function archiveTotals() {
  if (!archiveCache) {
    const keys = new Set<string>();
    let finalRules = 0;
    let proposedRules = 0;
    for (const e of EVENT_INDEX) {
      keys.add(e.sourceKey);
      if (e.classification === "final_rule") finalRules++;
      if (e.classification === "proposed_rule") proposedRules++;
    }
    archiveCache = {
      sources: [...keys].map((k) => SOURCE_BY_KEY[k]?.name ?? k).sort(),
      finalRules,
      proposedRules,
    };
  }
  return archiveCache;
}

/** "2026-07" → "July 2026". Month totals are only ever shown as a named month. */
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function monthName(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

/** "a, b and c". These sentences go to a model verbatim; they have to read. */
function andList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// -----------------------------------------------------------------------------
// THE BUILDERS — one per asset, keyed by the asset id in links.ts
// -----------------------------------------------------------------------------

type Builder = (today: string) => AssetInsight | null;

const BUILDERS: Record<string, Builder> = {
  // --- reference registries we own outright ---------------------------------

  "key-dates": () => {
    const fixed = KEY_DATES.filter((k) => k.month !== undefined && k.day !== undefined);
    const approx = fixed.filter((k) => k.approx);
    return {
      numeric: true,
      points: [
        `ImmigrationClock tracks ${KEY_DATES.length} recurring U.S. immigration deadlines on this page.`,
        `${fixed.length} of them fall on a fixed annual date and carry a live countdown; the other ${KEY_DATES.length - fixed.length} recur without one — the Visa Bulletin, which is released monthly, and the F-1 OPT window, which is set relative to each student's own program end date.`,
        `Every entry links to the government page that sets the date.`,
      ],
      caveats: [
        `${approx.length} of the fixed dates are APPROXIMATE — the agency announces the exact window each year. Do not state a precise date for any deadline; the page carries the countdown.`,
        "Nothing here is legal or tax advice.",
      ],
    };
  },

  sources: () => {
    const official = officialSources().length;
    const ingested = machineIngestedSources().length;
    const planned = SOURCES.filter((s) => s.ingestion === "planned").length;
    return {
      numeric: true,
      points: [
        `ImmigrationClock's source registry lists ${SOURCES.length} sources. ${official} are government publishers; the remaining ${SOURCES.length - official} is a third-party dataset used only as a cross-check and never as a headline figure.`,
        `${ingested} of the ${SOURCES.length} are ingested automatically on a schedule. ${planned} are registered as sources we intend to cover but do not ingest yet.`,
        `Each entry records the agency, the exact dataset used, the publication cadence, the typical reporting lag, the date a human last verified it, and a plain-English limitation.`,
      ],
      caveats: [
        "Registering a source is not the same as ingesting it. Do not imply that every listed source is feeding the site.",
        "Several entries carry an older last-verified date. That is shown on the page rather than hidden, and must not be described as a guarantee of currency.",
      ],
    };
  },

  "what-changed": () => {
    const a = archiveTotals();
    const points = [
      `The change feed holds ${formatNumber(INDEX_COVERAGE.stored)} recorded U.S. immigration changes${
        INDEX_COVERAGE.oldest ? `, the oldest published ${formatDate(INDEX_COVERAGE.oldest)}` : ""
      }.`,
      `They come from ${a.sources.length} government feeds: ${andList(a.sources)}.`,
      `${a.finalRules} of the records are classified as final rules and ${a.proposedRules} as proposed rules; the rest are announcements, policy-manual updates, court decisions, data releases and corrections.`,
    ];
    if (INDEX_COVERAGE.bounded) {
      points.push(
        `Search reaches ${formatNumber(INDEX_COVERAGE.indexed)} of them; ${formatNumber(INDEX_COVERAGE.notIndexed)} are held but not reachable from the browser.`
      );
    }
    return {
      numeric: true,
      points,
      caveats: [
        ...limitation("federal_register"),
        "This is a record of what these feeds published. It is not a complete record of every U.S. immigration change, and must not be described as one.",
      ],
    };
  },

  // --- USCIS H-1B Employer Data Hub — reported, machine-ingested -------------

  "h1b-employers": () => {
    const m = EMPLOYERS_META;
    const rate = (AVG_APPROVAL_RATE * 100).toFixed(1);
    return {
      numeric: true,
      sourceName: m.sourceName,
      points: [
        `The USCIS H-1B Employer Data Hub export behind this directory covers fiscal year ${m.fiscalYear} and ${formatNumber(m.totalEmployers)} employers.`,
        `${formatNumber(m.count)} of those employers had at least ${m.minApprovals} approved petitions; those are the ones the directory lists.`,
        `Across the whole export USCIS recorded ${formatNumber(m.nationalApprovals)} approvals and ${formatNumber(m.nationalDenials)} denials — an approval rate of ${rate}%.`,
      ],
      caveats: [
        ...limitation("uscis_h1b"),
        `The approval and denial totals cover the full export, not the ${formatNumber(m.count)} employers the directory lists.`,
      ],
    };
  },

  "h1b-top-sponsors": () => ({
    // No figures. This page ranks a curated set of large sponsors anchored to
    // published FY2024 rankings, and labels its own totals `modeled` — not a
    // USCIS total and not the full directory. The useful thing to say is exactly
    // that, because reading this ranking as a national total is the specific
    // mistake it invites.
    numeric: false,
    points: [
      "This ranking orders a curated set of large H-1B sponsors by approvals, anchored to published fiscal-year rankings.",
      "It is not a national total and not the full sponsor directory: employers outside the curated set do not appear in it at all, however many petitions they filed.",
      "The site labels the totals on this page as modeled rather than reported, and shows that label beside every figure.",
    ],
    caveats: [
      ...limitation("uscis_h1b"),
      "The figures on this page are labelled modeled. Do not present them as official agency totals.",
      NO_FIGURES,
    ],
  }),

  // --- State WARN notices — reported, machine-ingested -----------------------

  layoffs: (today) => {
    const s = WARN_SUMMARY;
    const { latest, prior } = warnCompleteMonths(new Date(`${today}T00:00:00Z`));
    const points = [
      `ImmigrationClock holds ${formatNumber(s.noticeCount)} state-filed WARN layoff notices, covering ${formatNumber(s.employeesTotal)} affected employees across ${formatNumber(s.employerCount)} employers.`,
      `Coverage is the ${s.stateCount} states that publish a machine-readable WARN feed: ${s.stateCodes.join(", ")}.`,
    ];
    if (s.minNoticeDate && s.maxNoticeDate) {
      // Human dates rather than ISO: an ISO date puts "01", "05" and "12" into
      // the permitted-figures list, which reads to the model as spare numbers it
      // might attach to something.
      points.push(
        `The notices in the feed run from ${formatDate(s.minNoticeDate)} to ${formatDate(s.maxNoticeDate)}.`
      );
    }
    if (latest && prior) {
      points.push(
        `In ${monthName(latest.month)}, the most recent complete month, those states recorded ${formatNumber(latest.notices)} notices covering ${formatNumber(latest.employees)} employees. In ${monthName(prior.month)} it was ${formatNumber(prior.notices)} notices covering ${formatNumber(prior.employees)} employees.`
      );
    }
    return {
      numeric: true,
      sourceName: s.sourceName,
      points,
      caveats: [
        ...limitation("warn_layoffs"),
        s.yearBasisNote,
        "Two months is not a trend. State the two figures; do not characterise a direction, a rise or a fall.",
      ],
    };
  },

  "layoffs-vs-h1b": () => {
    const x = crossLinkTotals();
    if (x.rows === 0) return null;
    return {
      numeric: true,
      sourceName: "State WARN Act notices and the USCIS H-1B Employer Data Hub",
      points: [
        `${formatNumber(x.rows)} employers appear in both the state WARN layoff feed and the USCIS H-1B Employer Data Hub.`,
        `Between them those employers filed WARN notices covering ${formatNumber(x.layoffs)} employees, and hold ${formatNumber(x.approvals)} H-1B approvals in the fiscal year ${EMPLOYERS_META.fiscalYear} export.`,
        `The two filings are made to different agencies for different regulatory purposes; this page shows only where the names overlap.`,
      ],
      caveats: [
        ...limitation("warn_layoffs"),
        ...limitation("uscis_h1b"),
        "Appearing in both datasets does not mean a layoff affected sponsored workers, and does not indicate that any worker was displaced. Do not connect the two figures causally, in either direction.",
        "The two figures cover different periods and different populations. Do not subtract, divide or otherwise combine them.",
      ],
    };
  },

  // --- CBP nationwide encounters — reported, live file -----------------------

  "border-encounters": () => {
    // The live feed is what makes these figures reported rather than curated. If
    // it did not resolve, this asset has nothing publishable and leaves the
    // rotation rather than falling back to the seeded breakdowns.
    if (!CBP_LIVE.ok || CBP_LIVE.currentFyYtd == null || !CBP_LIVE.reportingMonthLabel) return null;

    const complete = cbpRows
      .filter((r) => r.border === "nationwide" && r.fiscalYear < CURRENT_FY)
      .sort((a, b) => a.fiscalYear - b.fiscalYear)
      .slice(-3);
    if (complete.length < 2) return null;

    return {
      numeric: true,
      sourceName: "CBP Nationwide Encounters",
      points: [
        `CBP has recorded ${formatNumber(CBP_LIVE.currentFyYtd)} nationwide encounters so far in fiscal year ${CBP_LIVE.currentFy}, through ${CBP_LIVE.reportingMonthLabel}.`,
        `The complete fiscal years before it were ${andList(
          complete.map((r) => `${formatNumber(r.totalEncounters)} in fiscal year ${r.fiscalYear}`)
        )}.`,
        `The figures are summed from CBP's own published encounters file.`,
      ],
      caveats: [
        ...limitation("cbp_encounters"),
        `Fiscal year ${CBP_LIVE.currentFy} is INCOMPLETE — it runs only through ${CBP_LIVE.reportingMonthLabel}. Never compare it to a full year as though both covered the same span, and never describe it as a fall or a rise.`,
        "Only the nationwide totals above come straight from CBP's file. The sector and demographic breakdowns on the page are derived from them and are labelled as estimates, so no figure from those is available to you.",
      ],
    };
  },

  // --- assets that qualify on a non-numeric insight --------------------------

  "enforcement-trends": () => ({
    // ICE's own registry entry says these three measures must never be added
    // together, and the page's current-year figures are curated round values.
    // The distinction is the useful thing here; the numbers are not.
    numeric: false,
    points: [
      "This page tracks three separate ICE measures over time: arrests, removals, and the detained population.",
      "They are not interchangeable and cannot be added together. Arrests and removals are cumulative counts over a fiscal year; the detained population is a snapshot of one day, and a snapshot does not stay true the way a year-end total does.",
      "The site labels each figure by which of the three it is and how complete its period is, because reading one as another is the most common way these numbers get misused.",
    ],
    caveats: [...limitation("ice_stats"), NO_FIGURES],
  }),

  timeline: () => ({
    numeric: false,
    points: [
      "The timeline records major U.S. immigration events in sequence, each linked to the government document that produced it.",
      "Each entry also carries the reported data figure for its fiscal year, placed beside the event without any claim that one caused the other.",
      "It is a curated selection of major events, not a complete record of everything that happened.",
    ],
    caveats: [
      "The timeline is curated and non-exhaustive. Do not describe it as complete, comprehensive or a full record.",
      NO_FIGURES,
    ],
  }),

  "migration-map": () => ({
    numeric: false,
    points: [
      "The map shows the origin countries behind U.S. work and student visas, one visa class at a time.",
      "Only the H-1B layer is drawn from reported USCIS approvals, and only for the largest origin countries. The student, exchange, employment-based and family-based layers are estimated splits of a published national total, not country figures the agency published, and the page labels them that way.",
      "It animates the latest annual data. It is not live tracking, and the site never tracks individuals.",
    ],
    caveats: [
      "Do not describe the map as showing current or real-time movement of people.",
      NO_FIGURES,
    ],
  }),

  methodology: () => ({
    numeric: false,
    points: [
      "Every figure ImmigrationClock publishes carries a label for how it was derived — reported by the agency, projected from a partial period, estimated from a published share, or modeled from our own assumptions — and a label for how complete the period is.",
      "The page also states what the site deliberately does not do: no individual immigrant profiles, no tracking, and no identifying personal data.",
      "Each source's known limitations are published alongside it rather than left for a reader to discover.",
    ],
    caveats: [NO_FIGURES],
  }),

  "work-visas": () => ({
    numeric: false,
    points: [
      "H-1B petition approvals from USCIS, visa issuances from the Department of State, and labour condition applications filed with the Department of Labor count three different things at three different stages, and are not interchangeable.",
      "This hub keeps them apart and labels which agency published which figure.",
      "Sponsorship volume on its own does not indicate that any U.S. worker was displaced.",
    ],
    caveats: [
      "Do not equate approvals, issuances and filings, and do not present a figure from one as a figure from another.",
      NO_FIGURES,
    ],
  }),

  "f1-student-visas": () => ({
    numeric: false,
    points: [
      "A student visa issuance is counted by the Department of State when a consulate issues the visa. That is not the same as a USCIS petition approval, and not the same as a student enrolling.",
      "The State Department publishes these tables as PDFs with no machine-readable feed, so the figures on this page are transcribed by hand and lag the current period.",
      "The page keeps issuance counts separate from petition counts rather than merging them into one number.",
    ],
    caveats: [...limitation("dos_visa"), NO_FIGURES],
  }),

  following: () => ({
    numeric: false,
    points: [
      "A reader can pick countries, visas, agencies and topics to follow, and ImmigrationClock organises matching changes around those choices.",
      "The choices are stored in the reader's own browser. There is no account, no server-side profile and no identifier — nothing about what a reader follows is transmitted to ImmigrationClock or to anyone else.",
      "Clearing browser storage clears the choices, because that is the only place they exist.",
    ],
    caveats: [
      "This describes a product behaviour, not a dataset.",
      NO_FIGURES,
    ],
  }),
};

/**
 * What the copy engine may say about a standing asset today, or null when the
 * asset has nothing worth a post.
 *
 * Null is a real answer and the caller must honour it: select.ts drops the asset
 * from the evening rotation entirely, which is how "skip rather than fill" is
 * enforced structurally instead of being left to the prompt.
 */
export function assetInsights(assetId: string, today: string): AssetInsight | null {
  const build = BUILDERS[assetId];
  if (!build) return null;
  const insight = build(today);
  if (!insight || insight.points.length === 0) return null;
  return insight;
}

/** Asset ids that currently have something to say. Used by the preflight. */
export function assetsWithInsight(ids: string[], today: string): string[] {
  return ids.filter((id) => assetInsights(id, today) !== null);
}
