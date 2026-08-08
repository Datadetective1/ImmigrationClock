// =============================================================================
// IMMIGRATION RELEVANCE AND MATERIALITY
//
// Two questions, both previously answered by substring matching, and both
// answered wrongly often enough to put a Coast Guard boat-race schedule at the
// top of a newsletter about U.S. immigration policy.
//
//   1. Is this document about immigration at all?
//   2. If it is, how much does it actually change?
//
// -----------------------------------------------------------------------------
// WHY SUBSTRING MATCHING KEPT FAILING
// -----------------------------------------------------------------------------
// The old filter asked `haystack.includes(term)` over a list of bare words. The
// failures were not marginal. Measured against the live store on 2026-08-08:
//
//   "perm"     admitted 152 documents on its own, 64 of them ranked major. It
//              was there for the PERM labor certification programme and matched
//              "permanent", "permission", "permit", "permissible". Nearly all of
//              it was Coast Guard safety zones, pension-plan exemptions and mine
//              safety lamps.
//   "removal"  admitted 21 on its own — controlled-substance schedules,
//              drawbridge demolition, Great Lakes pilotage rates.
//   "o-1"/"l-1" matched the chemical names "Bromazolam" and "CUMYL-PEGACLONE".
//   "eb-"      matched "web-based".
//   "tps"      matched inside unrelated words entirely.
//
// This is the fourth time a bare keyword has done this here. "petition" caused
// it twice and "border" (via CBP's own name) once, and each fix removed one word
// while leaving the technique that produced it. So the technique is what changes
// here: every signal is anchored at a word boundary, ambiguous class codes must
// appear next to immigration vocabulary, and a positive match is no longer
// sufficient on its own.
//
// -----------------------------------------------------------------------------
// THE VETO
// -----------------------------------------------------------------------------
// Some document families are never immigration policy no matter what words
// appear in their abstract. A safety zone for a fireworks display is not an
// immigration development if it happens to say "permanent", and no amount of
// keyword tuning makes that judgement for us.
//
// The veto reads the TITLE only. A document's family lives in its title; its
// abstract may legitimately mention anything. "Finding of Mass Influx of Aliens"
// stays in even if its body discusses maritime interdiction, because its title
// says what it is.
// =============================================================================

/**
 * Unambiguous immigration subject matter.
 *
 * Every pattern is word-boundary anchored. Class codes that collide with
 * chemical names and table labels (F-1, J-1, L-1, O-1, EB-x) additionally
 * require immigration vocabulary within a short distance, because "Table F-1"
 * and "CUMYL-PEGACLONE" are not visa categories.
 */
const SUBJECT_PATTERNS: RegExp[] = [
  // Core vocabulary
  /\bimmigrat(e|ion|ing)\b/,
  /\bimmigrants?\b/,
  /\bnonimmigrants?\b/,
  /\bmigrants?\b/,
  /\bvisas?\b/,
  /\baliens?\b/,
  /\bnaturaliz(e|ed|ation)\b/,
  /\bcitizenship\b/,
  /\basylum\b/,
  /\basylees?\b/,
  /\brefugees?\b/,
  /\bdeport(ed|ation|able)?\b/,

  // Status and benefits
  /\bgreen cards?\b/,
  /\b(lawful )?permanent residents?\b/,
  /\badjustment of status\b/,
  /\btemporary protected status\b/,
  /\bdaca\b/,
  /\bdeferred action\b/,
  /\bemployment authorization\b/,
  /\bwork authorization\b/,
  /\bemployment authorization document\b/,
  /\bpublic charge\b/,
  /\badvance parole\b/,
  /\bhumanitarian parole\b/,

  // Enforcement and process
  /\bremoval proceedings?\b/,
  /\border of removal\b/,
  /\bordered removed\b/,
  /\bremovable alien\b/,
  /\bexpedited removal\b/,
  /\bnotice to appear\b/,
  /\bimmigration judges?\b/,
  /\bimmigration court\b/,
  /\bimmigration bonds?\b/,
  /\bdetention of aliens?\b/,
  /\bports? of entry\b/,
  /\bborder patrol\b/,
  /\b(southern|southwest|southwestern|northern|land) border\b/,
  /\bborder wall\b/,
  /\bborder security\b/,
  /\bmass influx\b/,
  // "Border" is only a subject when it is near immigration vocabulary. Bare, it
  // matched shipping fairways and binational bridge meetings; guarded, it still
  // catches "Securing the Border — restricting entry between ports of entry".
  /\bborders?\b(?=[\s\S]{0,80}\b(entry|entrant|migrant|alien|immigrat|asylum|crossing|patrol|apprehension|admission|inadmissib)\w*\b)/,
  /\b(entry|entrant|migrant|alien|immigrat|asylum|crossing|patrol|apprehension)\w*\b(?=[\s\S]{0,80}\bborders?\b)/,

  // Employment-based immigration
  /\bh-1b\b/,
  /\bh-2a\b/,
  /\bh-2b\b/,
  /\blabor certification\b/,
  /\bpermanent employment certification\b/,
  /\(perm\)/,
  /\bprevailing wage\b/,
  /\bvisa bulletin\b/,

  // Agencies and systems whose remit IS immigration
  /\buscis\b/,
  /\bsevis\b/,
  /\bsevp\b/,
  /\beoir\b/,
  /\bexecutive office for immigration review\b/,
  /\bimmigration and customs enforcement\b/,
  /\bcitizenship and immigration services\b/,
  /\bstudent and exchange visitor\b/,
  /\bconsular\b/,
  /\bvisa waiver\b/,
  /\brefugee admissions\b/,

  // Class codes that need company to be believable
  /\b[fjlo]-1\b(?=[\s\S]{0,60}\b(visa|status|student|exchange|worker|petition|nonimmigrant|classification)\b)/,
  /\beb-[1-5]\b/,
  /\be-2\b(?=[\s\S]{0,60}\b(visa|status|treaty|investor|nonimmigrant)\b)/,
];

/**
 * Document families that are never U.S. immigration policy.
 *
 * Matched against the TITLE only — see the header note. Each entry here is a
 * family that actually appeared in the archive wearing an immigration label.
 */
const EXCLUDED_FAMILIES: RegExp[] = [
  // Coast Guard navigation and maritime regulation. The single largest source
  // of contamination: 39 safety-zone documents, most of them ranked major.
  /\bsafety zones?\b/,
  /\bsecurity zones?\b/,
  /\bspecial local regulations?\b/,
  /\bregatta\b/,
  /\bmarine events?\b/,
  /\blimited access areas?\b/,
  /\bdrawbridge\b/,
  /\banchorage grounds?\b/,
  /\bshipping safety fairway/,
  /\bpilotage\b/,
  /\bouter continental shelf\b/,
  /\bvessel traffic\b/,
  /\bnavigation rules?\b/,

  // Energy, aviation and launch infrastructure
  /\bwind farm\b/,
  /\brocket (launch|test)/,
  /\bairworthiness\b/,

  // Wholly unrelated regulatory families seen in the archive
  /\bschedules of controlled substances\b/,
  /\bprohibited transactions?\b/,
  /\b(retirement|pension|employee benefit) plan\b/,
  /\bflame safety lamp/,
  /\bdiesel particulate\b/,
  /\blongshore and harbor\b/,
  /\bhearing aid/,
  /\bfirearms?\b/,
  /\bendangered species\b/,
  /\bmigratory bird\b/,
];

const lower = (s: string) => s.toLowerCase();

/**
 * Strip AMBIGUOUS agency proper names before testing subject.
 *
 * Kept from the previous implementation and for the same reason: CBP names
 * itself in the abstract of everything it publishes, and "border" in the phrase
 * "U.S. Customs and Border Protection" is attribution, not topic. Attribution
 * already arrives as a structured entity link, so nothing is lost.
 *
 * USCIS is deliberately NOT stripped — that agency does immigration and nothing
 * else, so its name genuinely is evidence of subject.
 */
export function withoutAgencyNames(text: string): string {
  return lower(text)
    .replace(/u\.?s\.?\s+customs and border protection/g, " ")
    .replace(/customs and border protection/g, " ")
    .replace(/\bcbp\b/g, " ");
}

/** Which subject signals fired. Exported so a test can assert the reason, not just the verdict. */
export function subjectHits(title: string, abstract = ""): string[] {
  const haystack = withoutAgencyNames(`${title} ${abstract}`);
  return SUBJECT_PATTERNS.filter((re) => re.test(haystack)).map((re) => re.source);
}

/** Which veto fired, if any. */
export function vetoedBy(title: string): string | null {
  const t = lower(title);
  const hit = EXCLUDED_FAMILIES.find((re) => re.test(t));
  return hit ? hit.source : null;
}

/**
 * Is this document about U.S. immigration?
 *
 * Requires a positive subject signal AND survival of the family veto. Both
 * halves matter: the veto alone would still admit anything unvetoed, and the
 * subject test alone is what let safety zones through for months.
 */
export function isImmigrationRelevant(title: string, abstract = ""): boolean {
  if (vetoedBy(title)) return false;
  return subjectHits(title, abstract).length > 0;
}

// ---------------------------------------------------------------------------
// MATERIALITY
// ---------------------------------------------------------------------------

/**
 * Changes that alter what someone can or must do.
 *
 * Severity used to be read from document TYPE alone: any final rule was major.
 * That is why a boat-race safety zone and the termination of Temporary
 * Protected Status for Yemen carried the same badge, and why every story in a
 * six-story issue was "Major" — a label that distinguishes nothing tells a
 * reader nothing.
 */
const HIGH_IMPACT: RegExp[] = [
  /\bterminat(e|es|ed|ion|ing)\b/,
  /\b(re)?designat(e|es|ed|ion|ing)\b/,
  /\bsuspend(s|ed|ing)?\b/,
  /\bsuspension\b/,
  /\brestrict(s|ed|ing|ion|ions)?\b/,
  /\bban(s|ned|ning)?\b/,
  /\bprohibit(s|ed|ing|ion)?\b/,
  /\brevok(e|es|ed|ing|ation)\b/,
  /\brescind(s|ed|ing)?\b/,
  /\beliminat(e|es|ed|ing|ion)\b/,
  /\bexpand(s|ed|ing|sion)?\b/,
  /\beligibilit(y|ies)\b/,
  /\bineligib/,
  // "required" as well as "requirement": the Visa Bond Program final rule says
  // an applicant "may be required to submit a bond" and nothing else on this
  // list, so the noun alone missed a rule that creates a new obligation for
  // every B-1/B-2 applicant it covers.
  /\brequir(e|es|ed|ing|ement|ements)\b/,
  /\bestablish(es|ed|ing|ment)?\b/,
  /\bbonds?\b/,
  /\bmandator(y|ily)\b/,
  /\bfees?\b/,
  /\bcap\b|\bquota\b|\bnumerical limitation\b/,
  /\bprevailing wage\b/,
  /\bpublic charge\b/,
  /\bexpedited removal\b/,
  /\bnational emergency\b/,
  /\bproclamation\b/,
  /\bexecutive order\b/,
  /\benforcement priorit/,
  /\bregistration requirement\b/,
  /\bparole\b/,
];

/**
 * Documents that are real and archivable but are not policy change.
 *
 * Kept separate from HIGH_IMPACT rather than folded into it, because these win
 * outright: a technical amendment that mentions a fee is still a technical
 * amendment.
 */
const NON_SUBSTANTIVE: RegExp[] = [
  /\bagency information collection\b/,
  /\bpaperwork reduction act\b/,
  /\binformation collection activities\b/,
  /\bmeeting notice\b/,
  /\bnotice of (a )?meeting\b/,
  /\bprivacy act of 1974\b/,
  /\brecords schedule\b/,
  /\btechnical (amendment|update|correction)\b/,
  /\bdelegation of authority\b/,
  /\bwebinar\b/,
  /\bnotice of availability\b/,
  /\bcomment period\b/,
];

export type Materiality = "high" | "low";

/**
 * Does this document actually change something?
 *
 * Deliberately coarse — two buckets, not five. A finer scale would imply a
 * precision this evidence does not support, and the only decision it feeds is
 * which badge a story carries.
 */
export function materiality(title: string, abstract = ""): Materiality {
  const haystack = withoutAgencyNames(`${title} ${abstract}`);
  if (NON_SUBSTANTIVE.some((re) => re.test(lower(title)))) return "low";
  return HIGH_IMPACT.some((re) => re.test(haystack)) ? "high" : "low";
}

/** True for documents that are archive-worthy but must never lead a feed. */
export function isNonSubstantive(title: string): boolean {
  return NON_SUBSTANTIVE.some((re) => re.test(lower(title)));
}
