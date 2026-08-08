// =============================================================================
// RANKING — which five changes lead the issue
//
// The old order was severity, then recency. Both are properties of the
// DOCUMENT; neither is a property of the CHANGE. So a policy alert requiring
// officers to suggest DNA testing when a genetic relationship is claimed
// outranked a revision of the evidentiary standards governing every Request for
// Evidence and Notice of Intent to Deny that USCIS issues — because the first
// summary happened to contain the word "require".
//
// That is keyword strength deciding editorial priority, which is the failure
// this module exists to remove.
//
// -----------------------------------------------------------------------------
// THE MODEL
// -----------------------------------------------------------------------------
// Five factors, in the order the product cares about them:
//
//   1. breadth      how much of the affected population it reaches
//   2. obligation   whether it changes an obligation, eligibility, right,
//                   requirement, fee, processing step, enforcement posture or
//                   adjudication standard
//   3. magnitude    how much practical difference it makes to those it reaches
//   4. authority    how final and how binding the action is
//   5. recency      newest first, and only ever as a tie-break
//
// The weights below are chosen so each factor STRICTLY DOMINATES every factor
// beneath it: the largest possible contribution from factors 2..5 combined is
// 373, which is less than one step of breadth (1000). The score is therefore a
// lexicographic comparison written as one number — orderable, printable, and
// diffable, which a chain of comparator branches is not.
//
// Nothing here is a model, a heuristic score learned from data, or an editorial
// opinion about a specific story. Every input is a regex over text the
// government published, or a field an adapter already extracted. Given the same
// archive, this produces the same order forever, and `explain()` prints why.
// =============================================================================

import type { ImmigrationEvent } from "@/domains/graph/events";

/**
 * Process stages every applicant passes through.
 *
 * This is the breadth signal that matters most and the one a keyword-strength
 * model cannot see. A change to Requests for Evidence touches every benefit
 * request USCIS adjudicates; a change to DNA evidence touches the subset
 * claiming a genetic relationship. Both say "evidence".
 */
const UNIVERSAL_PROCESS = [
  /\brequests? for (additional )?evidence\b/,
  /\bnotices? of intent to deny\b/,
  /\bevidentiary standards?\b/,
  /\bstandards? of proof\b/,
  /\bbenefit requests?\b/,
  /\badjudicat(e|es|ion|ing)\b/,
  /\bfee schedule\b/,
  /\bfiling (fee|procedure|requirement)/,
  /\bburden of proof\b/,
  /\ball (applicants|petitioners|requestors|benefit)/,
  /\bany (applicant|petitioner|benefit request)/,
  /\beach (applicant|petitioner)/,
  /\bevery (applicant|petitioner|benefit)/,
  /\bgenerally applicable\b/,
];

/**
 * Language that limits a document to a sub-population.
 *
 * Applied as a demotion rather than a veto: a narrow change is still a change,
 * and the product reports it. It simply must not lead the issue ahead of one
 * that reaches everybody.
 */
const NARROWING = [
  /\bchildren born to\b/,
  /\bdiplomatic officers?\b/,
  /\bgenetic relationship\b/,
  /\bdna\b/,
  /\bcertain (aliens|nonimmigrants|immigrants|applicants|petitioners)\b/,
  /\blimited to\b/,
  /\bsolely for\b/,
  /\bonly (those|persons|applicants)\b/,
  /\bspecific (class|category|group)\b/,
  /\bnationals of\b/,
];

/** Creates, removes or alters something a person must do, pay, or qualify for. */
const OBLIGATION_STRONG = [
  /\brequir(e|es|ed|ing|ement|ements)\b/,
  /\beligibilit(y|ies)\b/,
  /\bineligib/,
  /\bfees?\b/,
  /\bbonds?\b/,
  /\bterminat(e|es|ed|ion|ing)\b/,
  /\b(re)?designat(e|es|ed|ion|ing)\b/,
  /\bsuspend(s|ed|ing)?\b|\bsuspension\b/,
  /\bban(s|ned|ning)?\b/,
  /\bprohibit(s|ed|ing|ion)?\b/,
  /\brevok(e|es|ed|ing|ation)\b/,
  /\brescind(s|ed|ing)?\b/,
  /\bmandator(y|ily)\b/,
  /\bnumerical limitation\b|\bcap\b|\bquota\b/,
  /\bpublic charge\b/,
  /\bexpedited removal\b/,
];

/** Changes how a case is decided or processed, without changing who qualifies. */
const OBLIGATION_PROCEDURAL = [
  /\bstandards?\b/,
  /\bprocedures?\b/,
  /\bprocessing\b/,
  /\bguidance\b/,
  /\bpolicy manual\b/,
  /\bdiscretion\b/,
  /\bevidence\b/,
];

/** People lose or gain something concrete, not merely a step in a process. */
const MAGNITUDE_HIGH = [
  /\bterminat(e|es|ed|ion|ing)\b/,
  /\bsuspend(s|ed|ing)?\b|\bsuspension\b/,
  /\bban(s|ned|ning)?\b/,
  /\brevok(e|es|ed|ing|ation)\b/,
  /\bdeni(al|ed|es)\b/,
  /\bremoval\b/,
  /\bdetention\b/,
  /\bineligib/,
  /\bentry\b/,
];

/** A new cost or a new mandatory step. */
const MAGNITUDE_MEDIUM = [/\bfees?\b/, /\bbonds?\b/, /\brequir(e|es|ed|ing|ement)\b/, /\bcosts?\b/];

const anyMatch = (pats: RegExp[], text: string) => pats.some((re) => re.test(text));
const countMatch = (pats: RegExp[], text: string) => pats.filter((re) => re.test(text)).length;

export interface RankingFactors {
  /** 1–3. How much of the population the change reaches. */
  breadth: number;
  /** 0–3. Whether it changes an obligation, eligibility or adjudication standard. */
  obligation: number;
  /** 0–3. How much practical difference it makes. */
  magnitude: number;
  /** 0–3. How final and binding the action is. */
  authority: number;
  /** 0–1. Tie-break only. */
  recency: number;
  /** The weighted total. Higher leads. */
  score: number;
}

/** Weights are positional: each strictly dominates everything beneath it. */
const W = { breadth: 1000, obligation: 100, magnitude: 20, authority: 4, recency: 1 } as const;

function breadthOf(text: string, e: ImmigrationEvent): number {
  const universal = anyMatch(UNIVERSAL_PROCESS, text);

  // SCOPED IS NOT NARROW, and conflating the two is a real modelling error
  // this function made on its first cut: the Visa Bond Program final rule names
  // one visa category, B-1/B-2, and was demoted to the narrowest band for it —
  // below a district-court FOIA decision. B-1/B-2 is the largest visa class
  // there is. Naming a category says where a rule applies, not how few people
  // are there.
  //
  // Country scoping is different and IS narrowing: a rule about nationals of
  // one to three countries reaches only those nationals. Magnitude, not
  // breadth, is what carries a termination that devastates the people it names.
  const countries = e.impact?.countries?.length ?? 0;
  const narrowed = anyMatch(NARROWING, text) || (countries > 0 && countries <= 3);

  if (universal && !narrowed) return 3;
  if (universal && narrowed) return 2;
  if (narrowed) return 1;
  return 2;
}

function obligationOf(text: string): number {
  const strong = countMatch(OBLIGATION_STRONG, text);
  if (strong >= 2) return 3;
  if (strong === 1) return 2;
  return anyMatch(OBLIGATION_PROCEDURAL, text) ? 1 : 0;
}

function magnitudeOf(text: string, e: ImmigrationEvent): number {
  let m = 0;
  if (anyMatch(MAGNITUDE_HIGH, text)) m = 2;
  else if (anyMatch(MAGNITUDE_MEDIUM, text)) m = 1;
  // Severity is the adapters' own read of consequence, derived from the same
  // published text. Folding it in here keeps the badge and the order broadly
  // agreeing, so a reader never sees "Notable" sitting above "Major" without
  // breadth being the visible reason.
  if (e.severity === "major") m += 1;
  return Math.min(3, m);
}

function authorityOf(e: ImmigrationEvent): number {
  switch (e.classification) {
    case "final_rule":
    case "executive_action":
      return 3;
    case "court_decision":
    case "updated_information":
      return 2;
    case "proposed_rule":
      return 1;
    default:
      return 0;
  }
}

/** Newest scores 1, oldest in the window scores 0. Tie-break only. */
function recencyOf(publishedAt: string, from: string, to: string): number {
  const span = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  if (!Number.isFinite(span) || span <= 0) return 1;
  const age = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${publishedAt}T00:00:00Z`);
  return Math.max(0, Math.min(1, 1 - age / span));
}

/** Every factor, plus the total. Exported so a test can assert the reason. */
export function rankingFactors(e: ImmigrationEvent, from: string, to: string): RankingFactors {
  const text = `${e.title} ${e.summary ?? ""}`.toLowerCase();
  const breadth = breadthOf(text, e);
  const obligation = obligationOf(text);
  const magnitude = magnitudeOf(text, e);
  const authority = authorityOf(e);
  const recency = recencyOf(e.publishedAt, from, to);
  return {
    breadth,
    obligation,
    magnitude,
    authority,
    recency,
    score:
      breadth * W.breadth +
      obligation * W.obligation +
      magnitude * W.magnitude +
      authority * W.authority +
      recency * W.recency,
  };
}

/**
 * Order events for an issue: most consequential first.
 *
 * Ties break on id, so a rebuild of the same archive produces the same issue
 * byte for byte. Nothing here reads a clock.
 */
export function rankEvents(events: ImmigrationEvent[], from: string, to: string): ImmigrationEvent[] {
  const scored = events.map((e) => ({ e, f: rankingFactors(e, from, to) }));
  scored.sort((a, b) => b.f.score - a.f.score || a.e.id.localeCompare(b.e.id));
  return scored.map((s) => s.e);
}

/** One auditable line per story, for the build log. */
export function explain(e: ImmigrationEvent, from: string, to: string): string {
  const f = rankingFactors(e, from, to);
  return (
    `score=${f.score.toFixed(1)} ` +
    `breadth=${f.breadth} obligation=${f.obligation} magnitude=${f.magnitude} ` +
    `authority=${f.authority} recency=${f.recency.toFixed(2)}`
  );
}
