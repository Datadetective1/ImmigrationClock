// =============================================================================
// DATA SIGNALS — factual observations computed from ImmigrationClock's own data
//
// A data signal is a sentence with a number in it that the repository can stand
// behind: "the ten largest H-1B sponsors in the USCIS export account for X% of
// its approvals". It is computed here, deterministically, from the committed
// snapshots the site already renders — never typed in, never estimated, never
// written by a model. The social copy engine may restate a signal; it may not
// calculate one, and the validator rejects any numeral that is not in the
// signal's own text.
//
// THE PROVENANCE LINE
// -------------------
// ImmigrationClock labels every figure by how it was derived (see /methodology).
// Only two kinds of figure are allowed here:
//
//   reported     an agency published the number — the USCIS Employer Data Hub,
//                CBP's encounters file, state WARN feeds
//   own-archive  a count of ImmigrationClock's own records, which can be
//                counted exactly
//
// Nothing projected, estimated or modeled. That rules out the curated sponsor
// ranking, the country splits on the migration map and the current-year ICE
// figures, and it is meant to: a signal that could be wrong is not a signal.
//
// Each signal is also a page (/insights/<slug>) with its own Open Graph card, so
// a post about it links to a record that shows the figure, the method, the
// source and the caveats.
// =============================================================================

import { EMPLOYERS, EMPLOYERS_META, AVG_APPROVAL_RATE, displayEmployer } from "@/lib/employers";
import { WARN_SUMMARY, warnCompleteMonths } from "@/lib/warn-summary";
import { CBP_LIVE, cbpRows, CURRENT_FY } from "@/lib/dataset";
import { EVENT_INDEX } from "@/lib/event-index";
import { KEY_DATES, nextOccurrence, daysUntil } from "@/lib/key-dates";
import { SOURCE_BY_KEY } from "@/lib/sources";
import { formatNumber, formatDate } from "@/lib/format";
import { changePath } from "@/lib/share";

export type SignalGroup = "work-visas" | "workforce" | "border" | "rulemaking" | "deadlines";

export type SignalProvenance = "reported" | "own-archive";

export interface DataSignal {
  /** URL slug under /insights/. Stable. */
  slug: string;
  /**
   * True when the figure moves with the calendar ("days until", "the last
   * 30 days"). The site computes such a signal once, at build, from the
   * refresh date; the publisher must not post it on a day the site was not
   * built for, or the post states one number and the page another.
   */
  dayRelative?: boolean;
  /** The headline, as an observation. */
  title: string;
  /** The single figure a card leads with, already formatted. */
  figure: string;
  /** What the figure counts. Short. */
  figureLabel: string;
  /**
   * The closed world: finished sentences with their numbers in them. The copy
   * engine may restate these and nothing else.
   */
  points: string[];
  /** Limitations that must survive into any copy. */
  caveats: string[];
  /** Who published the underlying figures. */
  sourceName: string;
  sourceUrl: string;
  provenance: SignalProvenance;
  /** The period the figure covers, as a reader would say it. */
  periodLabel: string;
  /** The ImmigrationClock page where the underlying data can be explored. */
  explorePath: string;
  /** Related change records, as site paths. */
  relatedChangePaths: string[];
  group: SignalGroup;
  /** Topic key for same-day variety, matching the social layer's vocabulary. */
  topicKey: string;
}

/** "a, b and c". */
function andList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function pct(numerator: number, denominator: number): string {
  if (!denominator) return "0%";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function isoShift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

export function stateName(code: string): string {
  return STATE_NAMES[code] ?? code;
}

const USCIS_HUB = {
  sourceName: EMPLOYERS_META.sourceName,
  sourceUrl: EMPLOYERS_META.sourceUrl,
};

type Builder = (today: string) => DataSignal | null;

const BUILDERS: Record<string, Builder> = {
  // --- USCIS H-1B Employer Data Hub — reported -------------------------------

  "h1b-sponsor-concentration": () => {
    const m = EMPLOYERS_META;
    if (!m.nationalApprovals || EMPLOYERS.length < 10) return null;
    const top10 = EMPLOYERS.slice(0, 10);
    const top10Sum = top10.reduce((s, e) => s + e.approvals, 0);
    const top50Sum = EMPLOYERS.slice(0, 50).reduce((s, e) => s + e.approvals, 0);
    const share10 = pct(top10Sum, m.nationalApprovals);
    return {
      slug: "h1b-sponsor-concentration",
      title: "H-1B sponsorship is far more concentrated than the employer count suggests",
      figure: share10,
      figureLabel: `of FY${m.fiscalYear} H-1B approvals went to the 10 largest sponsors`,
      points: [
        `The USCIS H-1B Employer Data Hub export for fiscal year ${m.fiscalYear} records ${formatNumber(m.nationalApprovals)} petition approvals across ${formatNumber(m.totalEmployers)} employers.`,
        `The 10 largest sponsors account for ${formatNumber(top10Sum)} of those approvals — ${share10} of the total.`,
        `The 50 largest account for ${formatNumber(top50Sum)}, or ${pct(top50Sum, m.nationalApprovals)}.`,
        `${formatNumber(m.count)} employers had at least ${m.minApprovals} approvals; the remaining ${formatNumber(m.totalEmployers - m.count)} had fewer.`,
      ],
      caveats: [
        "Approvals count petitions, not workers: one person can be the beneficiary of more than one approved petition.",
        `The export covers fiscal year ${m.fiscalYear}, the latest USCIS has published at employer level.`,
      ],
      ...USCIS_HUB,
      provenance: "reported",
      periodLabel: `FY${m.fiscalYear}`,
      explorePath: "/h1b/employers",
      relatedChangePaths: [],
      group: "work-visas",
      topicKey: "visa:h-1b",
    };
  },

  "h1b-largest-sponsors": () => {
    const m = EMPLOYERS_META;
    if (EMPLOYERS.length < 5) return null;
    const top5 = EMPLOYERS.slice(0, 5);
    return {
      slug: "h1b-largest-sponsors",
      title: "The employers with the most H-1B approvals in the latest USCIS export",
      figure: formatNumber(top5[0].approvals),
      figureLabel: `approvals for ${displayEmployer(top5[0].name)}, the largest sponsor in FY${m.fiscalYear}`,
      points: [
        `In the USCIS H-1B Employer Data Hub export for fiscal year ${m.fiscalYear}, the five employers with the most petition approvals were ${andList(
          top5.map((e) => `${displayEmployer(e.name)} (${formatNumber(e.approvals)})`)
        )}.`,
        `The export records ${formatNumber(m.nationalApprovals)} approvals in total across ${formatNumber(m.totalEmployers)} employers.`,
        `ImmigrationClock's employer directory lists every employer in the export with at least ${m.minApprovals} approvals — ${formatNumber(m.count)} of them — with approvals, denials and approval rate for each.`,
      ],
      caveats: [
        "Approvals count petitions (initial and continuing), not workers and not visas issued.",
        "Employer names are the legal names in the USCIS export; related entities file separately and appear separately.",
      ],
      ...USCIS_HUB,
      provenance: "reported",
      periodLabel: `FY${m.fiscalYear}`,
      explorePath: "/h1b/employers",
      relatedChangePaths: [],
      group: "work-visas",
      topicKey: "visa:h-1b",
    };
  },

  "h1b-sponsors-by-state": () => {
    const m = EMPLOYERS_META;
    if (EMPLOYERS.length < 50) return null;
    const counts = new Map<string, number>();
    for (const e of EMPLOYERS) {
      if (!e.topState) continue;
      counts.set(e.topState, (counts.get(e.topState) ?? 0) + 1);
    }
    const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    if (ranked.length < 5) return null;
    const top5 = ranked.slice(0, 5);
    const top5Sum = top5.reduce((s, [, n]) => s + n, 0);
    return {
      slug: "h1b-sponsors-by-state",
      title: "Where the H-1B sponsors are",
      figure: formatNumber(top5[0][1]),
      figureLabel: `of the ${formatNumber(m.count)} listed sponsors have most of their approvals in ${stateName(top5[0][0])}`,
      points: [
        `Of the ${formatNumber(m.count)} employers in ImmigrationClock's H-1B directory, the five states where the most sponsors concentrate their approvals are ${andList(
          top5.map(([code, n]) => `${stateName(code)} (${formatNumber(n)})`)
        )}.`,
        `Those five states account for ${formatNumber(top5Sum)} of the ${formatNumber(m.count)} listed sponsors — ${pct(top5Sum, m.count)}.`,
        `The state is each employer's top state by approvals in the USCIS export for fiscal year ${m.fiscalYear}; an employer with worksites in several states is counted once, in the state with the most.`,
      ],
      caveats: [
        "This counts employers, not petitions or workers. A state with many small sponsors ranks above a state with a few very large ones.",
        `Directory coverage is employers with at least ${m.minApprovals} approvals in fiscal year ${m.fiscalYear}.`,
      ],
      ...USCIS_HUB,
      provenance: "reported",
      periodLabel: `FY${m.fiscalYear}`,
      explorePath: "/h1b/employers",
      relatedChangePaths: [],
      group: "work-visas",
      topicKey: "visa:h-1b",
    };
  },

  "h1b-approval-rate": () => {
    const m = EMPLOYERS_META;
    if (!m.nationalApprovals || !m.nationalDenials) return null;
    const rate = (AVG_APPROVAL_RATE * 100).toFixed(1);
    return {
      slug: "h1b-approval-rate",
      title: "How often H-1B petitions were approved in the latest USCIS export",
      figure: `${rate}%`,
      figureLabel: `of adjudicated H-1B petitions were approved in FY${m.fiscalYear}`,
      points: [
        `Across the whole USCIS H-1B Employer Data Hub export for fiscal year ${m.fiscalYear}, USCIS recorded ${formatNumber(m.nationalApprovals)} approvals and ${formatNumber(m.nationalDenials)} denials.`,
        `That is an approval rate of ${rate}% of the petitions the export records as adjudicated.`,
        `Approval rates differ by employer: ImmigrationClock's directory shows each listed sponsor's own approvals, denials and rate.`,
      ],
      caveats: [
        "The export covers petitions USCIS adjudicated in the fiscal year; it does not include registrations that were never selected in the cap lottery.",
        "Approvals and denials count petitions, initial and continuing, not people.",
      ],
      ...USCIS_HUB,
      provenance: "reported",
      periodLabel: `FY${m.fiscalYear}`,
      explorePath: "/h1b/employers",
      relatedChangePaths: [],
      group: "work-visas",
      topicKey: "visa:h-1b",
    };
  },

  // --- State WARN notices — reported ------------------------------------------

  "warn-latest-month": (today) => {
    const s = WARN_SUMMARY;
    const { latest, prior } = warnCompleteMonths(new Date(`${today}T00:00:00Z`));
    if (!latest || !prior) return null;
    return {
      slug: "warn-latest-month",
      title: "WARN layoff notices in the latest complete month",
      figure: formatNumber(latest.employees),
      figureLabel: `employees named in ${monthName(latest.month)} WARN notices across ${s.stateCount} states`,
      points: [
        `In ${monthName(latest.month)}, the most recent complete month, the ${s.stateCount} states in ImmigrationClock's WARN feed — ${s.stateCodes.join(", ")} — recorded ${formatNumber(latest.notices)} layoff notices covering ${formatNumber(latest.employees)} employees.`,
        `In ${monthName(prior.month)} it was ${formatNumber(prior.notices)} notices covering ${formatNumber(prior.employees)} employees.`,
        `The feed holds ${formatNumber(s.noticeCount)} notices in total, covering ${formatNumber(s.employeesTotal)} employees at ${formatNumber(s.employerCount)} employers.`,
      ],
      caveats: [
        "Two months is not a trend. The figures are stated side by side; no direction is claimed.",
        "WARN notices record an employer, a location, a date and a headcount. They say nothing about the immigration status of the workers affected.",
        `Coverage is the ${s.stateCount} states with a machine-readable feed, not a national total.`,
      ],
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl,
      provenance: "reported",
      periodLabel: `${monthName(latest.month)} vs ${monthName(prior.month)}`,
      explorePath: "/layoffs",
      relatedChangePaths: [],
      group: "workforce",
      topicKey: "topic:layoffs",
    };
  },

  "warn-by-state": () => {
    const s = WARN_SUMMARY;
    const states = [...s.states].sort((a, b) => b.noticeCount - a.noticeCount);
    if (states.length < 3) return null;
    const lead = states[0];
    return {
      slug: "warn-by-state",
      title: "Which states file the most WARN notices in ImmigrationClock's feed",
      figure: formatNumber(lead.noticeCount),
      figureLabel: `WARN notices on file from ${stateName(lead.code)}, the most of any state in the feed`,
      points: [
        `ImmigrationClock's WARN feed covers ${s.stateCount} states: ${s.stateCodes.join(", ")}.`,
        `By number of notices on file, the states rank ${andList(
          states.map((st) => `${stateName(st.code)} (${formatNumber(st.noticeCount)} notices, ${formatNumber(st.employeesTotal)} employees)`)
        )}.`,
        `Across all ${s.stateCount} states the feed holds ${formatNumber(s.noticeCount)} notices naming ${formatNumber(s.employeesTotal)} employees.`,
      ],
      caveats: [
        "States publish WARN notices differently and over different periods, so a comparison across states reflects reporting practice as much as layoffs.",
        "A notice says nothing about the immigration status of the workers it covers.",
      ],
      sourceName: s.sourceName,
      sourceUrl: s.sourceUrl,
      provenance: "reported",
      periodLabel: s.minNoticeDate && s.maxNoticeDate ? `${formatDate(s.minNoticeDate)} to ${formatDate(s.maxNoticeDate)}` : "all notices on file",
      explorePath: "/layoffs",
      relatedChangePaths: [],
      group: "workforce",
      topicKey: "topic:layoffs",
    };
  },

  // --- CBP nationwide encounters — reported, live file -------------------------

  "cbp-fiscal-year-to-date": () => {
    if (!CBP_LIVE.ok || CBP_LIVE.currentFyYtd == null || !CBP_LIVE.reportingMonthLabel) return null;
    const complete = cbpRows
      .filter((r) => r.border === "nationwide" && r.fiscalYear < CURRENT_FY)
      .sort((a, b) => a.fiscalYear - b.fiscalYear)
      .slice(-3);
    if (complete.length < 2) return null;
    return {
      slug: "cbp-fiscal-year-to-date",
      title: "Border encounters so far this fiscal year",
      figure: formatNumber(CBP_LIVE.currentFyYtd),
      figureLabel: `nationwide encounters in FY${CBP_LIVE.currentFy}, through ${CBP_LIVE.reportingMonthLabel}`,
      points: [
        `CBP has recorded ${formatNumber(CBP_LIVE.currentFyYtd)} nationwide encounters so far in fiscal year ${CBP_LIVE.currentFy}, through ${CBP_LIVE.reportingMonthLabel}.`,
        `The complete fiscal years before it were ${andList(
          complete.map((r) => `${formatNumber(r.totalEncounters)} in fiscal year ${r.fiscalYear}`)
        )}.`,
        `An encounter is an event, not a person: the same individual can be encountered more than once.`,
      ],
      caveats: [
        `Fiscal year ${CBP_LIVE.currentFy} is incomplete — it runs through ${CBP_LIVE.reportingMonthLabel} only. It is never compared to a full year as though both covered the same span, and no rise or fall is claimed.`,
        "Only the nationwide totals come straight from CBP's file; sector and demographic breakdowns on the page are derived estimates and are not stated here.",
      ],
      sourceName: "CBP Nationwide Encounters",
      sourceUrl: SOURCE_BY_KEY.cbp_encounters?.datasetUrl ?? "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
      provenance: "reported",
      periodLabel: `FY${CBP_LIVE.currentFy} through ${CBP_LIVE.reportingMonthLabel}`,
      explorePath: "/border/encounters",
      relatedChangePaths: [],
      group: "border",
      topicKey: "topic:border",
    };
  },

  // --- ImmigrationClock's own archive — counted exactly -----------------------

  "changes-last-30-days": (today) => {
    const from = isoShift(today, -30);
    const recent = EVENT_INDEX.filter(
      (e) => e.publishedAt >= from && e.publishedAt <= today && e.severity !== "routine"
    );
    if (recent.length < 3) return null;
    const count = (c: string) => recent.filter((e) => e.classification === c).length;
    const finalRules = count("final_rule");
    const proposed = count("proposed_rule");
    const policyManual = recent.filter((e) => e.sourceKey === "uscis_policy_manual").length;
    const courts = count("court_decision");
    const withDate = recent.filter((e) => e.effectiveAt && e.effectiveAt > today);
    const parts = [
      finalRules ? `${finalRules} final rule${finalRules === 1 ? "" : "s"}` : null,
      proposed ? `${proposed} proposed rule${proposed === 1 ? "" : "s"}` : null,
      policyManual ? `${policyManual} USCIS Policy Manual update${policyManual === 1 ? "" : "s"}` : null,
      courts ? `${courts} court decision${courts === 1 ? "" : "s"}` : null,
    ].filter((p): p is string => p !== null);
    return {
      slug: "changes-last-30-days",
      dayRelative: true,
      title: "How much U.S. immigration policy changed in the last 30 days",
      figure: formatNumber(recent.length),
      figureLabel: `official immigration changes recorded in the 30 days to ${formatDate(today)}, routine notices excluded`,
      points: [
        `In the 30 days to ${formatDate(today)}, ImmigrationClock recorded ${recent.length} U.S. immigration changes it classifies above routine, from official sources.`,
        parts.length ? `They include ${andList(parts)}.` : `Routine notices are counted separately and excluded here.`,
        withDate.length
          ? `${withDate.length} of them carr${withDate.length === 1 ? "ies" : "y"} an effective date that has not arrived yet.`
          : `None of them carries a future effective date.`,
      ],
      caveats: [
        "This is a count of what the feeds ImmigrationClock ingests published, not a complete record of every U.S. immigration change.",
        "Severity is assigned by explicit rules per source, never by a model and never by attention.",
      ],
      sourceName: "ImmigrationClock change archive",
      sourceUrl: "https://immigrationclock.com/what-changed",
      provenance: "own-archive",
      periodLabel: `${formatDate(from)} to ${formatDate(today)}`,
      explorePath: "/what-changed",
      relatedChangePaths: recent.slice(0, 5).map(changePath),
      group: "rulemaking",
      topicKey: "topic:policy-changes",
    };
  },

  "effective-dates-ahead": (today) => {
    const horizon = isoShift(today, 60);
    const ahead = EVENT_INDEX.filter(
      (e) => e.effectiveAt && e.effectiveAt > today && e.effectiveAt <= horizon && e.severity !== "routine"
    ).sort((a, b) => a.effectiveAt!.localeCompare(b.effectiveAt!));
    if (ahead.length === 0) return null;
    const next = ahead.slice(0, 3);
    return {
      slug: "effective-dates-ahead",
      dayRelative: true,
      title: "Immigration rules that take effect in the next 60 days",
      figure: formatNumber(ahead.length),
      figureLabel: `recorded change${ahead.length === 1 ? "" : "s"} with an effective date between now and ${formatDate(horizon)}`,
      points: [
        `${ahead.length} change${ahead.length === 1 ? "" : "s"} in ImmigrationClock's archive take${ahead.length === 1 ? "s" : ""} effect between ${formatDate(today)} and ${formatDate(horizon)}.`,
        `The next ${next.length === 1 ? "one is" : "are"} ${andList(next.map((e) => `${e.title.replace(/^Policy alert: /, "")} (${formatDate(e.effectiveAt!)})`))}.`,
        `Each effective date is the one stated in the document itself; ImmigrationClock never assigns one.`,
      ],
      caveats: [
        "An effective date can be delayed, enjoined or rescinded before it arrives. Each record links the document so the current status can be checked.",
        "Only changes whose documents state an effective date are counted.",
      ],
      sourceName: "ImmigrationClock change archive",
      sourceUrl: "https://immigrationclock.com/what-changed",
      provenance: "own-archive",
      periodLabel: `${formatDate(today)} to ${formatDate(horizon)}`,
      explorePath: "/what-changed",
      relatedChangePaths: next.map(changePath),
      group: "deadlines",
      topicKey: "topic:deadlines",
    };
  },

  "proposed-rules-open": (today) => {
    const from = isoShift(today, -90);
    const proposed = EVENT_INDEX.filter(
      (e) => e.classification === "proposed_rule" && e.publishedAt >= from && e.publishedAt <= today
    ).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
    if (proposed.length === 0) return null;
    const latest = proposed.slice(0, 3);
    return {
      slug: "proposed-rules-open",
      dayRelative: true,
      title: "Proposed immigration rules that are not in force",
      figure: formatNumber(proposed.length),
      figureLabel: `proposed rule${proposed.length === 1 ? "" : "s"} recorded in the last 90 days, none of them in effect`,
      points: [
        `In the 90 days to ${formatDate(today)}, ImmigrationClock recorded ${proposed.length} proposed immigration rule${proposed.length === 1 ? "" : "s"}. A proposed rule changes nothing until it is finalised, and it may never be.`,
        `The most recent ${latest.length === 1 ? "is" : "are"} ${andList(latest.map((e) => `${e.title} (${formatDate(e.publishedAt)})`))}.`,
        `Every one is labelled "not in force" in the archive, and none carries an effective date.`,
      ],
      caveats: [
        "Whether a proposal is finalised, and in what form, is decided by the agency after the comment period. ImmigrationClock does not predict it.",
      ],
      sourceName: "ImmigrationClock change archive",
      sourceUrl: "https://immigrationclock.com/what-changed",
      provenance: "own-archive",
      periodLabel: `${formatDate(from)} to ${formatDate(today)}`,
      explorePath: "/what-changed",
      relatedChangePaths: latest.map(changePath),
      group: "rulemaking",
      topicKey: "topic:policy-changes",
    };
  },

  "next-key-date": (today) => {
    const now = new Date(`${today}T00:00:00Z`);
    const dated = KEY_DATES.filter((k) => k.month !== undefined && k.day !== undefined)
      .map((k) => {
        const next = nextOccurrence(k.month!, k.day!, now);
        return { k, days: daysUntil(next, now), date: next.toISOString().slice(0, 10) };
      })
      .sort((a, b) => a.days - b.days);
    if (dated.length === 0) return null;
    const first = dated[0];
    return {
      slug: "next-key-date",
      dayRelative: true,
      title: "The next recurring immigration date on the calendar",
      figure: String(first.days),
      figureLabel: `days until the ${first.k.title.toLowerCase()}${first.k.approx ? " (approximate window)" : ""}`,
      points: [
        `The next recurring date ImmigrationClock tracks is the ${first.k.title}, ${first.days} days from ${formatDate(today)}${first.k.approx ? ". The exact window is announced by the agency each year, so the date is approximate" : `, on ${formatDate(first.date)}`}.`,
        `${first.k.detail}`,
        `ImmigrationClock keeps ${KEY_DATES.length} recurring immigration dates on one page, each linked to the government source that sets it.`,
      ],
      caveats: [
        ...(first.k.approx ? ["The window is approximate until the agency announces it. No precise date is stated."] : []),
        "Nothing here is legal or tax advice.",
      ],
      sourceName: first.k.sourceName,
      sourceUrl: first.k.sourceUrl,
      provenance: "own-archive",
      periodLabel: `as of ${formatDate(today)}`,
      explorePath: "/key-dates",
      relatedChangePaths: [],
      group: "deadlines",
      topicKey: `topic:${first.k.category}`,
    };
  },
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function monthName(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

export const SIGNAL_SLUGS = Object.keys(BUILDERS);

/** One signal, or null when today's data cannot support it. */
export function buildSignal(slug: string, today: string): DataSignal | null {
  const build = BUILDERS[slug];
  if (!build) return null;
  const signal = build(today);
  if (!signal || signal.points.length === 0) return null;
  return signal;
}

/** Every signal today's data supports, in registry order. */
export function buildSignals(today: string): DataSignal[] {
  return SIGNAL_SLUGS.map((slug) => buildSignal(slug, today)).filter((s): s is DataSignal => s !== null);
}
