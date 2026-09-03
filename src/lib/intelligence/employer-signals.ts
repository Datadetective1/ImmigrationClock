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

export interface EmployerSignal {
  /** Stable within an employer: kind + the dates that produced it. */
  id: string;
  kind: "warn_notice" | "h1b_sponsorship" | "warn_h1b_overlap";
  employerSlug: string;
  employerName: string;
  /** The date the underlying government record is dated. */
  date: string;
  /** What a source published. Numbers only, in the source's own terms. */
  fact: string;
  /** How records were matched, when this signal required a join. Null when none. */
  join: string | null;
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
}

export interface H1bSide {
  slug: string;
  name: string;
  approvals: number;
  denials: number;
  fiscalYear: string;
  sourceName: string;
  sourceUrl: string;
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
  matchedBecause: string
): EmployerSignal[] {
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
      fact:
        `${warn.notices} WARN notice${warn.notices === 1 ? "" : "s"} on file covering ` +
        `${warn.employees.toLocaleString()} employees in ${warn.states.join(", ")}. ` +
        `Most recent notice dated ${warn.latestNotice}.`,
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
      fact:
        `An employer with ${h1b.approvals.toLocaleString()} H-1B petition approvals in FY${h1b.fiscalYear} ` +
        `also appears in the state WARN layoff feed, with ${warn.notices} notice` +
        `${warn.notices === 1 ? "" : "s"} covering ${warn.employees.toLocaleString()} employees.`,
      join:
        "The USCIS H-1B Employer Data Hub record and the state WARN notices were matched on a " +
        "normalized employer name (case, punctuation and legal suffixes removed). Matching is by " +
        "name only: it can miss a subsidiary filing under a different name, and it can join two " +
        "unrelated companies that normalize alike.",
      matched: matchedBecause,
      caveat: OVERLAP_CAVEAT,
      sources: [WARN_SOURCE, { name: h1b.sourceName, url: h1b.sourceUrl }],
    });
  }

  return signals.sort((a, b) => b.date.localeCompare(a.date));
}
