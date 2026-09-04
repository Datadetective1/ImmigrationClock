// =============================================================================
// HOW GOOD IS THIS EMPLOYER MATCH? — the join, audited per row
//
// WHY A PROSE CAVEAT WAS NOT ENOUGH
// ---------------------------------
// The overlap signal already carried a paragraph explaining that employers are
// matched on a normalized name and that the matching goes wrong three ways.
// The paragraph is true and a consumer cannot act on it: it says the same
// thing about Google, whose two records plainly describe one company, and
// about "CA", where a two-character key joined the H-1B export's "CA INC" to
// the WARN feed's "CA Technologies". A monitoring product has to treat those
// differently, and it can only do that if the difference is a field.
//
// THE ROOT CAUSE, FOUND BY READING THE NORMALIZER
// -----------------------------------------------
// normalizeEmployer() removes two quite different kinds of word, and until now
// they were one list. Removing "Inc" loses nothing — no two companies are
// distinguished by their legal form. Removing "Technologies", "Solutions",
// "Services" or "USA" loses a real part of a name, and those words are exactly
// what separates entities that file separately:
//
//   QUALCOMM TECHNOLOGIES INC + QUALCOMM INCORPORATED   → QUALCOMM
//   HCL AMERICA INC + HCL AMERICA SOLUTIONS INC         → HCL AMERICA
//   NTT DATA INC + NTT DATA SERVICES LLC                → NTT DATA
//   H-1B "CA INC" + WARN "CA Technologies"              → CA
//
// So the useful question about a match is not "is the key short" but "what did
// the normalizer have to throw away to produce it". That is computable, it is
// explainable to a customer, and it separates the cases correctly: IBM and F5
// match on three and two characters and are clean, because only a legal form
// was removed. HSBC and AT&T match on four and three characters and are not,
// because a descriptive word was.
//
// WHAT WAS MEASURED, ON THE COMMITTED DATA
// ----------------------------------------
//   • 162 employers appear in both datasets.
//   • 7 matched on a key of four characters or fewer: IBM, SNAP, AT T, F5, CA,
//     CBRE, HSBC.
//   • 20 normalized keys carry more than one distinct H-1B filer, and the
//     cross-link keeps ONE record per key — so 21 filers are dropped from it
//     and the approvals shown for such a key belong to a single entity rather
//     than to the group.
//   • The sponsorship side is a fiscal-year export and ages: FY2023 figures are
//     about three years old as of this writing.
//
// WHAT THIS IS NOT
// ----------------
// NOT A RISK SCORE, and not a confidence number to sort by. Every value here
// describes THE JOIN — how two government records came to be shown together.
// None describes the employer, none ranks one company against another, and
// nothing here could be read as a judgement about a company or about anyone
// who works there.
// =============================================================================

import { EMPLOYER_DESCRIPTIVE_WORDS } from "@/lib/format";

/**
 * What kind of match produced this row. Exactly one applies.
 *
 * Tested in the order below: ambiguity beats family, because a key that may
 * belong to a different company is a larger caveat than one that aggregates a
 * known group.
 */
export type EmployerMatchKind =
  /**
   * The key survived removal of legal forms only ("Inc", "LLC", "Corporation"),
   * and one entity on each side produces it. "GOOGLE LLC" and "Google".
   */
  | "exact_normalized"
  /**
   * More than one distinct legal entity on one side produces this key.
   * "QUALCOMM TECHNOLOGIES INC" and "QUALCOMM INCORPORATED" are both real
   * filers. The figures shown may describe one of them while the name reads
   * like the group.
   */
  | "possible_corporate_family"
  /**
   * Producing the key required discarding a descriptive part of a name, and
   * the key that survived is short enough to belong to something else. Read
   * both source records before treating this as one company.
   */
  | "ambiguous_normalization";

export interface EmployerMatch {
  kind: EmployerMatchKind;
  /** The normalized key both sides collapsed to. Published so it can be argued with. */
  key: string;
  /** Distinct H-1B filer names that produce this key. */
  h1bNames: string[];
  /** Distinct WARN employer names that produce this key. */
  warnNames: string[];
  /**
   * True when the key is four characters or fewer.
   *
   * Reported separately from `kind` because a short key is not by itself a
   * defect — IBM and F5 are short and correct. It is a property a consumer may
   * want to filter on, not a verdict.
   */
  fragileKey: boolean;
  /**
   * Words the normalizer discarded that were part of a name rather than a
   * legal form: "Technologies", "Services", "USA". Empty on a clean match.
   */
  discardedWords: string[];
  /**
   * True when the H-1B figures come from a fiscal year that is now old.
   *
   * Orthogonal to `kind` on purpose: an exact match on stale data is still an
   * exact match, and a consumer filtering for recency needs a different field
   * from one filtering for join quality.
   */
  staleSponsorEvidence: boolean;
  /** Age of the sponsorship fiscal year in whole years, at the query date. */
  sponsorEvidenceAgeYears: number;
  /**
   * H-1B filers on this key beyond the one whose figures are shown. Zero on a
   * clean match; above zero means the counts understate the group.
   */
  h1bFilersNotShown: number;
  /**
   * Filers whose name begins with the same word but which normalize to a
   * DIFFERENT key, and so were never candidates for this join at all.
   *
   * This is the larger of the two understatement problems and it is invisible
   * from inside the join. Amazon files under five entities in the FY export —
   * AMAZON.COM SERVICES LLC, AMAZON WEB SERVICES INC, AMAZON DEVELOPMENT
   * CENTER US INC and two more — which produce four different keys, so a WARN
   * notice filed as "Amazon" can match at most one of them. Deloitte files
   * under six, Qualcomm four, Cognizant three.
   *
   * STATED AS A NAME OBSERVATION, NOT A CORPORATE-STRUCTURE CLAIM. Sharing a
   * first word is not proof of common ownership, and this field never asserts
   * one. It says: here are other filings you may also want to read.
   */
  relatedFilersOnOtherKeys: { name: string; approvals: number }[];
  /** Approvals held by those filers, which the figures shown do not include. */
  approvalsNotCounted: number;
  /** One paragraph a consumer can print verbatim. */
  note: string;
}

/**
 * A key this short can belong to more than one company on its own.
 *
 * Four is read off the data rather than chosen: at and below it the committed
 * keys stop being distinctive words and start being initialisms — CA, F5, GE,
 * HP, UPS, IBM. There are about 110 keys of three characters or fewer across
 * the two datasets.
 */
const FRAGILE_KEY_LENGTH = 4;

/** Sponsorship data older than this is reported as historical rather than current. */
const STALE_SPONSOR_YEARS = 2;

/** Which descriptive words normalization removed from these names. */
function discardedFrom(names: string[]): string[] {
  const found = new Set<string>();
  for (const name of names) {
    for (const word of EMPLOYER_DESCRIPTIVE_WORDS) {
      if (new RegExp(`\\b${word}\\b`, "i").test(name)) found.add(word);
    }
  }
  return [...found].sort();
}

export interface DescribeMatchInput {
  /** The normalized key. */
  key: string;
  /** Every distinct H-1B filer name collapsing to that key. */
  h1bNames: string[];
  /** Every distinct WARN employer name collapsing to that key. */
  warnNames: string[];
  /**
   * Filers sharing this key's first word but normalizing elsewhere. The caller
   * supplies them because it holds the directory index; pass an empty array
   * when there is no index to consult.
   */
  relatedFilersOnOtherKeys?: { name: string; approvals: number }[];
  /** The fiscal year of the sponsorship figures, e.g. "2023". */
  fiscalYear: string;
  /** ISO date the question is being asked on. */
  today: string;
}

/**
 * Describe one employer join, from the names that actually produced it.
 *
 * Deterministic and free of side effects: the same inputs always produce the
 * same description, and every branch is reachable from the committed data.
 */
export function describeMatch(input: DescribeMatchInput): EmployerMatch {
  const { key, h1bNames, warnNames, fiscalYear, today } = input;
  const relatedFilersOnOtherKeys = input.relatedFilersOnOtherKeys ?? [];
  const approvalsNotCounted = relatedFilersOnOtherKeys.reduce((sum, f) => sum + f.approvals, 0);

  const compact = key.replace(/\s/g, "");
  const fragileKey = compact.length > 0 && compact.length <= FRAGILE_KEY_LENGTH;
  const discardedWords = discardedFrom([...h1bNames, ...warnNames]);
  const family = h1bNames.length > 1 || warnNames.length > 1;

  // A short key alone is not a problem, and a discarded word alone is not
  // either. Together they are: the key is both incomplete and too small to
  // stand on its own.
  const ambiguous = fragileKey && discardedWords.length > 0;

  const kind: EmployerMatchKind = ambiguous
    ? "ambiguous_normalization"
    : family
      ? "possible_corporate_family"
      : "exact_normalized";

  // Age from the fiscal year's start, so a year still in progress is never
  // reported as older than it is.
  const ageYears = Math.max(
    0,
    Math.floor((Date.parse(today) - Date.parse(`${fiscalYear}-10-01`)) / (365.25 * 86_400_000))
  );
  const h1bFilersNotShown = Math.max(0, h1bNames.length - 1);

  const parts: string[] = [];
  if (ambiguous) {
    parts.push(
      `The two records were joined on "${key}", ${compact.length} characters left after normalization ` +
        `discarded ${discardedWords.join(", ")} from ${[...h1bNames, ...warnNames].join(" / ")}. ` +
        `A key that short, produced by dropping part of a name, can belong to a different company — ` +
        `read both source records before treating this as one.`
    );
  } else if (family) {
    parts.push(
      `More than one legal entity produces the key "${key}" (${[...h1bNames, ...warnNames].join(", ")}). ` +
        `Large employers file under several entities, so these figures may describe one of them rather ` +
        `than the group` +
        (h1bFilersNotShown > 0
          ? `, and ${h1bFilersNotShown} further H-1B filer${h1bFilersNotShown === 1 ? "" : "s"} on this ` +
            `key ${h1bFilersNotShown === 1 ? "is" : "are"} not counted in the approvals shown.`
          : ".")
    );
  } else {
    parts.push(
      `One H-1B filer and one WARN employer produce the key "${key}", and it survived removal of ` +
        `legal forms only.`
    );
    if (fragileKey) {
      parts.push(
        `The key is short (${compact.length} characters), so it is worth confirming against the two ` +
          `source records even though nothing about this match looks wrong.`
      );
    }
  }
  if (relatedFilersOnOtherKeys.length > 0) {
    parts.push(
      `${relatedFilersOnOtherKeys.length} other filer${relatedFilersOnOtherKeys.length === 1 ? "" : "s"} ` +
        `in the export begin${relatedFilersOnOtherKeys.length === 1 ? "s" : ""} with the same word but ` +
        `normalize${relatedFilersOnOtherKeys.length === 1 ? "s" : ""} to a different key ` +
        `(${relatedFilersOnOtherKeys.map((f) => f.name).join(", ")}), holding ` +
        `${approvalsNotCounted.toLocaleString()} approvals not counted here. Sharing a first word is not ` +
        `proof of common ownership — read them before drawing a conclusion about the group.`
    );
  }
  if (ageYears >= STALE_SPONSOR_YEARS) {
    parts.push(
      `The sponsorship figures are from fiscal year ${fiscalYear}, about ${ageYears} years old. They ` +
        `describe petitions filed then, not sponsorship today.`
    );
  }

  return {
    kind,
    key,
    h1bNames,
    warnNames,
    fragileKey,
    discardedWords,
    staleSponsorEvidence: ageYears >= STALE_SPONSOR_YEARS,
    sponsorEvidenceAgeYears: ageYears,
    h1bFilersNotShown,
    relatedFilersOnOtherKeys,
    approvalsNotCounted,
    note: parts.join(" "),
  };
}
