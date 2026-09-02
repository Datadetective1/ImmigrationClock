// =============================================================================
// OPEN GRAPH SPECS — what each card says, decided by fields and nothing else
//
// A card is the loudest thing the platform publishes: it is what a reader sees
// in a feed before they have read a word of the post. So what it says is held
// to the same rule as every figure on the site — derived from a recorded field,
// deterministically, and never composed by a model or by hand.
//
// Every builder here is a pure function of a record the repository already
// holds. The status pill on a change card is the clearest case: it reads
// "PROPOSED — NOT IN FORCE" because `classification` says so, "IN EFFECT SINCE
// MAR 3, 2026" because `effectiveAt` says so, and nothing else can put those
// words on a card. The order of the rules is the order of the questions a
// reader asks: is it a proposal, is it a court, when does it apply, was it
// undone, and only then what kind of document it is.
//
// The hub-page registry at the bottom gives each section page its own card with
// a live figure where one is cheap to read from the committed snapshots — the
// same numbers the pages themselves render, so the card can never promise a
// directory the site does not have.
// =============================================================================

import type { EventClassification, EventSeverity } from "@/domains/graph/events";
import { CLASSIFICATION_LABEL } from "@/lib/event-labels";
import { SOURCE_BY_KEY } from "@/lib/sources";
import type { Explainer } from "@/lib/editorial/explainers";
import type { DataSignal } from "@/lib/editorial/signals";
import { EMPLOYERS_META } from "@/lib/employers";
import { WARN_SUMMARY } from "@/lib/warn-summary";
import { CBP_LIVE } from "@/lib/dataset";
import { INDEX_COVERAGE } from "@/lib/event-index";
import { KEY_DATES } from "@/lib/key-dates";
import { formatNumber, formatDate } from "@/lib/format";
import { stripAlertPrefix } from "@/lib/stories";
import { HEADLINE_MAX_CHARS, fitText } from "./text";
import type { OgCardSpec, OgTone } from "./card";

export type { OgCardSpec, OgTone };
export { stripAlertPrefix };

// -----------------------------------------------------------------------------
// CHANGES
// -----------------------------------------------------------------------------

/** The fields a change card is derived from. A subset of ImmigrationEvent. */
export interface ChangeCardInput {
  title: string;
  summary: string;
  classification: EventClassification;
  severity: EventSeverity;
  sourceKey: string;
  effectiveAt?: string | null;
  publishedAt: string;
  /** "agency:uscis" and the like, when the adapter recorded one. */
  issuingAgencyId?: string;
}

/**
 * The issuing agency, as the eyebrow.
 *
 * The issuing-agency entity is the better answer when the adapter recorded
 * one: a Department of State rule arrives through the Federal Register, and
 * "FEDERAL REGISTER" says where it was printed rather than who issued it. The
 * source registry's agency string is the fallback, and the Federal Register
 * itself the fallback for that.
 */
const AGENCY_BY_ENTITY: Record<string, string> = {
  "agency:uscis": "USCIS",
  "agency:dhs": "DHS",
  "agency:cbp": "CBP",
  "agency:ice": "ICE",
  "agency:dol": "Department of Labor",
  "agency:dos": "Department of State",
  "agency:doj": "Department of Justice",
  "agency:eoir": "EOIR",
};

const AGENCY_BY_PATTERN: [RegExp, string][] = [
  [/Citizenship and Immigration Services/i, "USCIS"],
  [/Customs and Border Protection/i, "CBP"],
  [/Immigration and Customs Enforcement/i, "ICE"],
  [/Department of Homeland Security/i, "DHS"],
  [/Department of Labor/i, "Department of Labor"],
  [/Department of State/i, "Department of State"],
  [/Executive Office for Immigration Review/i, "EOIR"],
  [/Department of Justice/i, "Department of Justice"],
  [/federal judiciary/i, "Federal courts"],
  [/State labor and workforce/i, "State agencies"],
];

export function agencyShortName(sourceKey: string, issuingAgencyId?: string): string {
  if (issuingAgencyId && AGENCY_BY_ENTITY[issuingAgencyId]) return AGENCY_BY_ENTITY[issuingAgencyId];
  const agency = SOURCE_BY_KEY[sourceKey]?.agency ?? "";
  for (const [pattern, name] of AGENCY_BY_PATTERN) {
    if (pattern.test(agency)) return name;
  }
  return "Federal Register";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mar 3" or "Mar 3, 2026", from an ISO date, in UTC. */
function monthDay(iso: string, withYear: boolean): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const month = MONTHS[m - 1] ?? iso;
  return withYear ? `${month} ${d}, ${y}` : `${month} ${d}`;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The status pill, from fields only. See the file header for why the order is
 * what it is. `today` is a parameter so a test can pin it.
 */
export function changeStatus(
  e: ChangeCardInput,
  today: string = todayIso()
): { status: string; tone: OgTone } {
  if (e.classification === "proposed_rule") return { status: "Proposed — not in force", tone: "amber" };
  if (e.classification === "court_decision") return { status: "Court decision", tone: "red" };

  const effective = e.effectiveAt && ISO_DATE.test(e.effectiveAt) ? e.effectiveAt.slice(0, 10) : null;
  if (effective && effective > today) {
    // The year is stated only when it is not this year, so "EFFECTIVE OCT 1"
    // stays short in the common case and "EFFECTIVE JAN 1, 2027" cannot be
    // misread in December.
    return { status: `Effective ${monthDay(effective, effective.slice(0, 4) !== today.slice(0, 4))}`, tone: "accent" };
  }
  if (effective) return { status: `In effect since ${monthDay(effective, true)}`, tone: "green" };

  if (/rescind/i.test(e.summary) && /reinstat|revert|restor/i.test(e.summary)) {
    return { status: "Prior guidance restored", tone: "accent" };
  }
  if (/rescind|rescission/i.test(e.summary)) return { status: "Rescinded", tone: "amber" };

  if (e.sourceKey === "uscis_policy_manual") return { status: "Policy Manual update", tone: "accent" };

  switch (e.classification) {
    case "executive_action":
      return { status: "Executive action", tone: "accent" };
    case "announcement":
      return { status: "Agency announcement", tone: "muted" };
    case "data_release":
      return { status: "Data release", tone: "muted" };
    case "final_rule":
      return { status: CLASSIFICATION_LABEL.final_rule, tone: "accent" };
    default:
      return { status: CLASSIFICATION_LABEL[e.classification] ?? e.classification, tone: "muted" };
  }
}

export function ogSpecForChange(e: ChangeCardInput, today: string = todayIso()): OgCardSpec {
  const { status, tone } = changeStatus(e, today);
  // The kicker is the publication date, worded the way EventCard words it: a
  // Federal Register document on public inspection is SCHEDULED, not published,
  // and a card must not say otherwise. Derived from the date, not a flag.
  const published = ISO_DATE.test(e.publishedAt) ? formatDate(e.publishedAt) : e.publishedAt;
  const kicker =
    e.publishedAt > today
      ? `${CLASSIFICATION_LABEL[e.classification] ?? e.classification} · Scheduled for publication on ${published}`
      : `${CLASSIFICATION_LABEL[e.classification] ?? e.classification} · Published ${published}`;
  return {
    eyebrow: agencyShortName(e.sourceKey, e.issuingAgencyId),
    // Capped here as well as in the renderer, so the spec a test or a log sees
    // is the text the card will carry.
    headline: fitText(stripAlertPrefix(e.title) || e.title, HEADLINE_MAX_CHARS),
    kicker,
    status,
    statusTone: tone,
    source: SOURCE_BY_KEY[e.sourceKey]?.name ?? e.sourceKey,
  };
}

// -----------------------------------------------------------------------------
// EXPLAINERS AND DATA SIGNALS
// -----------------------------------------------------------------------------

export function ogSpecForExplainer(e: Pick<Explainer, "title" | "kicker" | "sources">): OgCardSpec {
  return {
    eyebrow: "Explainer",
    headline: e.title,
    kicker: e.kicker,
    source: e.sources[0]?.name,
  };
}

export function ogSpecForSignal(
  s: Pick<DataSignal, "title" | "figure" | "figureLabel" | "sourceName" | "provenance" | "periodLabel">
): OgCardSpec {
  // The same label the site's ProvenanceTag gives a figure: green for a number
  // an agency published, accent for one counted from our own archive. Both are
  // "reported" in /methodology's vocabulary; the wording says which.
  const provenance =
    s.provenance === "reported" ? { status: `Reported · ${s.periodLabel}`, tone: "green" as const } : { status: `Counted from our archive · ${s.periodLabel}`, tone: "accent" as const };
  return {
    eyebrow: "Data signal",
    headline: s.title,
    kicker: s.title,
    figure: s.figure,
    figureLabel: s.figureLabel,
    status: provenance.status,
    statusTone: provenance.tone,
    source: s.sourceName,
  };
}

// -----------------------------------------------------------------------------
// HUB PAGES — one card per section page, with a live figure where one is cheap
// -----------------------------------------------------------------------------

export type OgPageKey =
  | "what-changed"
  | "h1b-employers"
  | "h1b-top-sponsors"
  | "layoffs"
  | "layoffs-vs-h1b"
  | "border-encounters"
  | "key-dates"
  | "enforcement-trends"
  | "f1-student-visas"
  | "following"
  | "explained"
  | "insights"
  | "migration-map"
  | "work-visas"
  | "developers"
  | "timeline"
  | "pulse"
  | "enforcement";

export interface OgPage {
  path: string;
  build: () => OgCardSpec;
}

export const OG_PAGES: Record<OgPageKey, OgPage> = {
  "what-changed": {
    path: "/what-changed",
    build: () => ({
      eyebrow: "What changed",
      headline: "U.S. immigration policy changes, traced to the source",
      figure: formatNumber(INDEX_COVERAGE.stored),
      figureLabel: "recorded changes, each linked to the official government document it came from",
      source: "Federal Register, USCIS, DOL and the federal courts",
    }),
  },
  "h1b-employers": {
    path: "/h1b/employers",
    build: () => ({
      eyebrow: "H-1B employer directory",
      headline: "Look up any H-1B sponsor",
      figure: formatNumber(EMPLOYERS_META.count),
      figureLabel: `H-1B sponsoring employers, with reported FY${EMPLOYERS_META.fiscalYear} approvals, denials and approval rate`,
      source: EMPLOYERS_META.sourceName,
    }),
  },
  "h1b-top-sponsors": {
    path: "/h1b/top-sponsors",
    build: () => ({
      eyebrow: "Top H-1B sponsors",
      headline: "The employers filing the most H-1B petitions",
      kicker: "Approvals, denials, approval rates and offered wages, by fiscal year",
      source: "USCIS H-1B Employer Data Hub; DOL OFLC disclosure data",
    }),
  },
  layoffs: {
    path: "/layoffs",
    build: () => ({
      eyebrow: "Live layoffs",
      headline: "WARN layoff notices from state portals",
      figure: formatNumber(WARN_SUMMARY.noticeCount),
      figureLabel: `WARN notices on file across ${WARN_SUMMARY.stateCount} states, each linked to its source`,
      source: WARN_SUMMARY.sourceName,
    }),
  },
  "layoffs-vs-h1b": {
    path: "/layoffs-vs-h1b",
    build: () => ({
      eyebrow: "Layoffs vs H-1B",
      headline: "Layoff notices and H-1B sponsorship, side by side",
      kicker: "Where the same employer appears in state WARN filings and the USCIS H-1B export — shown separately, never combined into one figure",
      source: "State WARN portals; USCIS H-1B Employer Data Hub",
    }),
  },
  "border-encounters": {
    path: "/border/encounters",
    build: () =>
      CBP_LIVE.ok && CBP_LIVE.currentFyYtd != null && CBP_LIVE.reportingMonthLabel
        ? {
            eyebrow: "CBP",
            headline: "Border encounters, by fiscal year and month",
            figure: formatNumber(CBP_LIVE.currentFyYtd),
            figureLabel: `nationwide encounters in FY${CBP_LIVE.currentFy}, through ${CBP_LIVE.reportingMonthLabel}`,
            status: `Reported · FY${CBP_LIVE.currentFy} year to date`,
            statusTone: "green",
            source: "CBP Nationwide Encounters",
          }
        : {
            eyebrow: "CBP",
            headline: "Border encounters, by fiscal year and month",
            kicker: "Southwest, northern and nationwide encounters, with family, single-adult and minor breakdowns",
            source: "CBP Nationwide Encounters",
          },
  },
  "key-dates": {
    path: "/key-dates",
    build: () => ({
      eyebrow: "Key dates",
      headline: "Key U.S. immigration dates, counted down",
      figure: formatNumber(KEY_DATES.length),
      figureLabel: "recurring dates — H-1B registration, the Visa Bulletin, the DV lottery, the OPT window — each linked to its official source",
      source: "USCIS, the Department of State and the IRS",
    }),
  },
  "enforcement-trends": {
    path: "/immigration/enforcement-trends",
    build: () => ({
      eyebrow: "ICE",
      headline: "Arrests, removals and detention, by fiscal year",
      kicker: "Three different numbers on three different calendars, each labelled reported or projected",
      source: "ICE Enforcement and Removal Statistics",
    }),
  },
  "f1-student-visas": {
    path: "/visa/f1-student-visas",
    build: () => ({
      eyebrow: "Department of State",
      headline: "F-1 student visas and visa flow",
      kicker: "Student, exchange, H-1B, employment-based and family-based visa issuances by fiscal year and country",
      source: "Department of State Visa Statistics",
    }),
  },
  following: {
    path: "/following",
    build: () => ({
      eyebrow: "Follow what matters",
      headline: "Follow a country, a visa or a topic",
      kicker: "ImmigrationClock organises the recorded changes around your choices — stored in your browser, never on our servers",
      source: "ImmigrationClock change archive",
    }),
  },
  explained: {
    path: "/explained",
    build: () => ({
      eyebrow: "Explained",
      headline: "Immigration data, in plain English",
      kicker: "The same concept explained simply, technically, or by how it is measured — and the distinctions immigration news gets wrong",
      source: "ImmigrationClock",
    }),
  },
  insights: {
    path: "/insights",
    build: () => ({
      eyebrow: "Insights",
      headline: "What the numbers say",
      kicker: "Plain-language takeaways computed from official data, each labelled reported, projected or estimated",
      source: "USCIS, CBP, ICE, the Department of State and BLS",
    }),
  },
  "migration-map": {
    path: "/migration-map",
    build: () => ({
      eyebrow: "Visa origin map",
      headline: "Where America's H-1B workers and F-1 students come from",
      kicker: "The top origin countries by visa type — annual data, not live tracking",
      source: "Department of State Visa Statistics",
    }),
  },
  "work-visas": {
    path: "/work-visas",
    build: () => ({
      eyebrow: "Work & visas",
      headline: "H-1B sponsors, salaries and visa data",
      figure: formatNumber(EMPLOYERS_META.count),
      figureLabel: "sponsoring employers in the directory, plus offered wages, student visas and layoffs beside sponsorship",
      source: "USCIS, DOL and the Department of State",
    }),
  },
  developers: {
    path: "/developers",
    build: () => ({
      eyebrow: "Developers",
      headline: "A free WARN layoff API",
      figure: formatNumber(WARN_SUMMARY.noticeCount),
      figureLabel: `layoff notices across ${WARN_SUMMARY.stateCount} states as JSON and CSV — no key, no sign-up`,
      source: WARN_SUMMARY.sourceName,
    }),
  },
  timeline: {
    path: "/timeline",
    build: () => ({
      eyebrow: "Timeline",
      headline: "Immigration policy, law and the data, on one timeline",
      kicker: "Major events, each linked to its official source and to the figure at the time",
      source: "Official U.S. government documents",
    }),
  },
  pulse: {
    path: "/pulse",
    build: () => ({
      eyebrow: "Immigration Pulse",
      headline: "The week's immigration changes, in one email",
      kicker: "Ranked by impact and linked to the source — in English, Spanish, French or Arabic",
      source: "ImmigrationClock change archive",
    }),
  },
  enforcement: {
    path: "/enforcement",
    build: () => ({
      eyebrow: "Enforcement & border",
      headline: "ICE, detention and CBP data at a glance",
      kicker: "Arrests, removals, detention and border encounters, every figure sourced and labelled",
      source: "ICE Enforcement and Removal Statistics; CBP Nationwide Encounters",
    }),
  },
};

export const OG_PAGE_KEYS = Object.keys(OG_PAGES) as OgPageKey[];

export function isOgPageKey(key: string): key is OgPageKey {
  return Object.prototype.hasOwnProperty.call(OG_PAGES, key);
}

export function ogSpecForPage(key: string): OgCardSpec | null {
  return isOgPageKey(key) ? OG_PAGES[key].build() : null;
}

/** One line for a build log: `USCIS | Voter registration… [Prior guidance restored]`. */
export function describeOgSpec(spec: OgCardSpec): string {
  const lead = spec.figure ? `${spec.figure} — ${spec.headline}` : spec.headline;
  return `${spec.eyebrow} | ${lead}${spec.status ? ` [${spec.status}]` : ""}`;
}
