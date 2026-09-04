// =============================================================================
// EMPLOYER SIGNALS — the join, exposed with its working shown
//
// WHAT THE AUDIT ACTUALLY FOUND, WHICH IS NOT WHAT WAS ASSUMED
// ------------------------------------------------------------
// The earlier note described "7,457 WARN notices matched against 2,614 H-1B
// sponsoring employers", which reads as though the two datasets overlap almost
// entirely. Run against the committed data through the site's own normalizer
// (`warnH1bCrossLink()`), the real figure is:
//
//   7,457 WARN notices across 5,834 employers in 5 states (2004 → 2026-08-31)
//   2,614 H-1B sponsoring employers (USCIS Data Hub, FY2023, ≥10 approvals)
//   → 162 employers appear in BOTH
//
// 162 is the asset. It is small enough to be precise about and large enough to
// matter, and it contains the employers people ask about: Microsoft, Google,
// Meta, Cognizant, JPMorgan, Apple. Neither source publishes this overlap;
// producing it needs employer-name normalization across a federal export and
// five state portals, which is the part that is hard to copy.
//
// THE SHAPE OF A SIGNAL, AND WHY IT IS THIS SHAPE
// -----------------------------------------------
// Every signal carries three things, always, and a consumer can print all
// three:
//
//   FACT   — what a government source published, with its own numbers.
//   JOIN   — how two records were matched, and on what key.
//   MATCH  — why this employer surfaced for this query.
//
// WHAT A SIGNAL MAY NEVER SAY
// ---------------------------
//   • That a layoff affected, or will affect, any visa holder. The employer
//     pages already carry the correct wording; it travels inside the signal
//     rather than as a footnote a caller can drop.
//   • That an employer is "high risk", "declining", or any other label we
//     cannot defend with a stated methodology. There is no risk score here and
//     there should not be one until there is a methodology worth defending.
//   • Anything about a person. A signal is about a company and a filing.
// =============================================================================

import { normalizeEmployer } from "@/lib/format";
import { describeMatch, type EmployerMatch } from "./employer-match";

/**
 * How old the underlying filing is, and what that means for monitoring.
 *
 * MEASURED ACROSS THE 162 OVERLAP EMPLOYERS: the median most-recent filing is
 * 1,136 days old and 106 of 162 are older than two years. An alert that says
 * only "WARN notice detected" would, for two thirds of these employers, be
 * reporting something from before the subscriber's product existed. Monitoring
 * implies recency; this field is what stops the implication being false.
 */
export type SignalRecency = "recent" | "past_year" | "historical";

export type { EmployerMatch, EmployerMatchKind } from "./employer-match";

export function recencyOf(date: string, today: string): SignalRecency {
  const days = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  if (days <= 90) return "recent";
  if (days <= 365) return "past_year";
  return "historical";
}

export interface EmployerSignal {
  /** Stable within an employer: kind + the dates that produced it. */
  id: string;
  kind: "warn_notice" | "h1b_sponsorship" | "warn_h1b_overlap";
  employerSlug: string;
  employerName: string;
  /** The date the underlying government record is dated. See `dateMeaning`. */
  date: string;
  /**
   * WHAT THAT DATE ACTUALLY IS, which is not the same across states.
   *
   * 5,154 of 7,457 WARN notices carry a filing date. The other 2,292 — every
   * notice New Jersey publishes — carry only the date the layoff takes effect,
   * so the feed's per-employer "latest" is a mix of the two. Reporting it as
   * "notice dated" was wrong for a third of the corpus, and for New Jersey
   * employers it produced dates in the future.
   */
  dateMeaning: "filing_or_effective_date" | "fiscal_year_start";
  /** How old this is. Monitoring implies recency; this says whether it is there. */
  recency: SignalRecency;
  /** Days between the date above and the query. Negative when a layoff is scheduled ahead. */
  ageDays: number;
  /** What a source published. Numbers only, in the source's own terms. */
  fact: string;
  /** How records were matched, when this signal required a join. Null when none. */
  join: string | null;
  /**
   * The join, described per row rather than in a blanket paragraph.
   *
   * Present only on a signal that required a join. See employer-match.ts —
   * these values describe how two government records came to be shown
   * together. None of them describes the employer, and none is a score.
   */
  matchQuality?: EmployerMatch;
  /** Why this employer matched the query. */
  matched: string;
  /** The caveat that must travel with this fact. */
  caveat: string;
  sources: { name: string; url: string }[];
}

export interface WarnSide {
  slug: string;
  name: string;
  notices: number;
  employees: number;
  states: string[];
  latestNotice: string | null;
  /**
   * Every WARN employer name that normalizes to the same key, this one
   * included. Supplied by the caller, which holds the index; without it the
   * join cannot tell one company from a corporate family.
   */
  siblingNames?: string[];
}

export interface H1bSide {
  slug: string;
  name: string;
  approvals: number;
  denials: number;
  fiscalYear: string;
  sourceName: string;
  sourceUrl: string;
  /**
   * Filers sharing this key's first word but normalizing to a different key.
   * They are never candidates for the join, so their approvals are missing
   * from any figure it reports. See h1bFilersOnRelatedKeys().
   */
  relatedFilers?: { name: string; approvals: number }[];
  /**
   * Every H-1B filer name that normalizes to the same key, this one included.
   *
   * This matters more here than on the WARN side: the employer index keeps one
   * record per normalized key, so on the 20 keys carrying several filers the
   * approvals shown belong to a single entity. Passing the siblings is what
   * lets the signal say so instead of quietly understating a group.
   */
  siblingNames?: string[];
}

const WARN_CAVEAT =
  "A WARN notice reports a planned layoff at an employer. It does not indicate whether or how those roles relate to visa sponsorship, and it says nothing about any individual worker.";

const H1B_CAVEAT =
  "These are petition counts, not people: one worker can be the beneficiary of more than one petition, and an approval is not a visa issuance.";

const OVERLAP_CAVEAT =
  "Appearing in both datasets does not imply that one caused the other. The two records are matched only on a normalized employer name.";

const WARN_SOURCE = {
  name: "State WARN Act notices (state open-data portals)",
  url: "https://www.dol.gov/agencies/eta/layoffs/warn",
};

/**
 * Everything we can honestly say about one employer.
 *
 * Either side may be absent: most WARN employers never sponsor an H-1B, and
 * most sponsors never file a WARN notice. The overlap signal is emitted only
 * when both sides are present, which is the whole point of it.
 */
export function employerSignals(
  warn: WarnSide | null,
  h1b: H1bSide | null,
  matchedBecause: string,
  today: string = new Date().toISOString().slice(0, 10)
): EmployerSignal[] {
  const age = (date: string) => Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  const signals: EmployerSignal[] = [];
  const name = warn?.name ?? h1b?.name ?? "";
  const slug = warn?.slug ?? h1b?.slug ?? "";

  if (warn && warn.latestNotice) {
    signals.push({
      id: `warn:${warn.slug}:${warn.latestNotice}`,
      kind: "warn_notice",
      employerSlug: warn.slug,
      employerName: warn.name,
      date: warn.latestNotice,
      dateMeaning: "filing_or_effective_date",
      recency: recencyOf(warn.latestNotice, today),
      ageDays: age(warn.latestNotice),
      fact:
        `${warn.notices} WARN notice${warn.notices === 1 ? "" : "s"} on file covering ` +
        `${warn.employees.toLocaleString()} employees in ${warn.states.join(", ")}. ` +
        `Most recent filing dated ${warn.latestNotice} — depending on the state, that is either the ` +
        `date the notice was filed or the date the layoff takes effect.`,
      join: null,
      matched: matchedBecause,
      caveat: WARN_CAVEAT,
      sources: [WARN_SOURCE],
    });
  }

  if (h1b) {
    const total = h1b.approvals + h1b.denials;
    const rate = total > 0 ? Math.round((h1b.approvals / total) * 1000) / 10 : null;
    signals.push({
      id: `h1b:${h1b.slug}:${h1b.fiscalYear}`,
      kind: "h1b_sponsorship",
      employerSlug: h1b.slug,
      employerName: h1b.name,
      // The export is a fiscal year, so the signal is dated to its start.
      date: `${h1b.fiscalYear}-10-01`,
      dateMeaning: "fiscal_year_start",
      recency: recencyOf(`${h1b.fiscalYear}-10-01`, today),
      ageDays: age(`${h1b.fiscalYear}-10-01`),
      fact:
        `USCIS recorded ${h1b.approvals.toLocaleString()} H-1B petition approvals and ` +
        `${h1b.denials.toLocaleString()} denials for fiscal year ${h1b.fiscalYear}` +
        `${rate === null ? "" : ` (${rate}% approved)`}.`,
      join: null,
      matched: matchedBecause,
      caveat: H1B_CAVEAT,
      sources: [{ name: h1b.sourceName, url: h1b.sourceUrl }],
    });
  }

  if (warn && h1b && warn.latestNotice) {
    signals.push({
      id: `overlap:${slug}:${warn.latestNotice}:${h1b.fiscalYear}`,
      kind: "warn_h1b_overlap",
      employerSlug: slug,
      employerName: name,
      date: warn.latestNotice,
      dateMeaning: "filing_or_effective_date",
      recency: recencyOf(warn.latestNotice, today),
      ageDays: age(warn.latestNotice),
      fact:
        `An employer with ${h1b.approvals.toLocaleString()} H-1B petition approvals in FY${h1b.fiscalYear} ` +
        `also appears in the state WARN layoff feed, with ${warn.notices} notice` +
        `${warn.notices === 1 ? "" : "s"} covering ${warn.employees.toLocaleString()} employees.`,
      join:
        "The USCIS H-1B Employer Data Hub record and the state WARN notices were matched on a " +
        "normalized employer name (case, punctuation and legal suffixes removed). Matching is by " +
        "name only. Treat a match as a pointer to two source records, not as proof they are the " +
        "same company — and read matchQuality, which says how this particular row was joined.",
      matchQuality: describeMatch({
        key: normalizeEmployer(h1b.name),
        h1bNames: h1b.siblingNames?.length ? h1b.siblingNames : [h1b.name],
        warnNames: warn.siblingNames?.length ? warn.siblingNames : [warn.name],
        relatedFilersOnOtherKeys: h1b.relatedFilers ?? [],
        fiscalYear: h1b.fiscalYear,
        today,
      }),
      matched: matchedBecause,
      caveat: OVERLAP_CAVEAT,
      sources: [WARN_SOURCE, { name: h1b.sourceName, url: h1b.sourceUrl }],
    });
  }

  return signals.sort((a, b) => b.date.localeCompare(a.date));
}
