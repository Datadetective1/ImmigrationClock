// =============================================================================
// IMPLICATIONS — "why it matters", derived and never generated
//
// A why-it-matters post is the most useful thing this account can publish and
// the easiest to get wrong, because the natural way to write one is to reason
// about consequences. This account does not reason about consequences. It
// restates fields.
//
// Every line this module produces is a restatement of one verified field on the
// record — the classification, the effective date, the words "rescind" and
// "reinstate" in the source's own summary, the entities the archive linked. The
// same discipline as src/domains/graph/explain.ts, which renders "what this
// means" on the change page from the same fields. If a field is absent, the
// line is absent. There is no default sentence and no "likely".
//
// The copy engine is shown these as the ONLY implications it may state, and
// validate.ts grounds the copy's figures and quotations against them. A model
// that wants to say what a rule "could mean" has nothing here to say it with.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import { describeEntities } from "./facts";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-09-30" → "September 30, 2026". The form a human writes. */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const RESCIND = /\brescind(s|ed|ing)?\b|\brescission\b|\bwithdraw(s|n|ing)?\b/i;
const RESTORE = /\breinstat(e|es|ed|ing)\b|\brestor(e|es|ed|ing)\b|\brevert(s|ed|ing)?\b/i;
// The verb applied to a thing that has a date — not the noun "extension",
// which names a form ("Extension of Stay"), a procedure and a class of
// paperwork notice, none of which moves a date.
const EXTEND =
  /\bextend(s|ed|ing)?\s+(?:the\s+|its\s+|a\s+|an\s+)?(?:deadline|comment period|designation|tps|temporary protected status|parole|validity|registration|filing window|period|program|through|until|to\s+\w+\s+\d)/i;
const NOT_AN_EXTENSION = /information collection|extension of stay|extend\/change|application to extend|extend or change/i;
/** The record's own words for a court stopping something. Without them, "stops enforcement" is a guess. */
const COURT_STOPS = /\b(enjoin(s|ed|ing)?|injunction|stay(s|ed)?|vacat(e|ed|es|ing)|blocked|halted|barred|restrain(s|ed|ing)?)\b/i;
/** The same test validate.ts applies: a proposal by classification, or by its own title with no date. */
const PROPOSE = /\bpropos(e|es|ed|al|als|ing)\b/i;
const RAISE_FEE = /\b(increas|rais|adjust)\w*\b[^.]{0,60}\bfee/i;

/** What a change means, as lines that each restate one field of the record. */
export function implicationsFor(e: IndexedEvent, today: string): string[] {
  const out: string[] = [];
  const text = `${e.title} ${e.summary}`;
  const future = Boolean(e.effectiveAt && e.effectiveAt > today);
  const past = Boolean(e.effectiveAt && e.effectiveAt <= today);
  const proposal = e.classification === "proposed_rule" || (!e.effectiveAt && PROPOSE.test(e.title));

  // --- stage: what kind of instrument this is, and whether it is in force -----
  if (proposal) {
    // A newsroom item announcing a proposal is a proposal, whatever its
    // classification field says; it gets the proposal's lines, not an
    // announcement's.
    out.push(
      "This is a proposal open for comment, not a rule. Nothing changes until it is finalised, it may change before it is, and it may never be."
    );
  } else switch (e.classification) {
    case "final_rule":
      if (future) {
        out.push(
          `The rule is final but does not apply until ${longDate(e.effectiveAt!)}, ${daysBetween(today, e.effectiveAt!)} days from today. Until then the rules in force today stay in force.`
        );
      } else if (past) {
        out.push(`The rule has been in effect since ${longDate(e.effectiveAt!)}.`);
      } else {
        out.push(
          "The document does not state an effective date, so when it applies has to be read from the original."
        );
      }
      break;
    case "court_decision":
      out.push(
        COURT_STOPS.test(text)
          ? "A court order binds according to the court that issued it, and it can be stayed, narrowed or reversed on appeal. It stops enforcement as the order specifies; it does not rewrite the policy text."
          : "A court decision binds according to the court that issued it, and it can be appealed. What it changes in practice depends on the order itself, which this record does not summarise."
      );
      break;
    case "executive_action":
      out.push(
        "An executive action directs federal agencies. What it means in practice arrives separately, in the agency guidance and rulemaking that implement it."
      );
      break;
    case "announcement":
      out.push(
        "This is an agency announcement. It records what the agency said; the legal instrument, and the detail of how it applies, are published separately."
      );
      break;
    case "updated_information":
      if (e.sourceKey === "uscis_policy_manual") {
        out.push(
          "Policy Manual guidance instructs USCIS officers on how to adjudicate. It is not a regulation, it did not go through notice and comment, and it can be revised or withdrawn without rulemaking."
        );
      } else {
        out.push(
          "This updates material the agency had already published. It changes existing guidance rather than creating a new requirement on its own."
        );
      }
      break;
    case "data_release":
      out.push("This is a statistical release. It reports what has already happened and changes no one's obligations.");
      break;
    default:
      break;
  }

  // --- reversal: what stops being true, and what comes back ---------------------
  if (RESCIND.test(text) && RESTORE.test(text)) {
    out.push(
      "What changes is which guidance applies: the later policy is withdrawn and the earlier guidance is back in force. The underlying authority is not itself removed."
    );
  } else if (RESCIND.test(text)) {
    out.push(
      `A rescission removes the rule it names${future ? ` from ${longDate(e.effectiveAt!)}` : ""}. It does not by itself change the statute the rule was issued under, or the agency's other authorities.`
    );
  } else if (EXTEND.test(text) && !NOT_AN_EXTENSION.test(text) && !proposal) {
    out.push("An extension moves a date that already existed. What was true before the change stays true for longer.");
  }

  // --- money: the fee figure is the fact, not an inference ---------------------
  if (RAISE_FEE.test(text) && !proposal) {
    out.push("The document changes what a filing costs. The amounts it states are the amounts that apply, from the date it gives.");
  }

  // --- population: only what the archive linked ------------------------------------
  const named = describeEntities(
    (e.entityIds ?? []).filter((id) => id.startsWith("visa:") || id.startsWith("country:"))
  );
  if (named.length) {
    out.push(`The record is linked to ${named.slice(0, 4).join(", ")}. Whether it reaches any particular person depends on facts this account does not have.`);
  }

  // --- what ImmigrationClock is watching -----------------------------------------
  if (proposal) {
    out.push("ImmigrationClock is watching for a final rule. Until one publishes, this remains a proposal.");
  } else if (future) {
    out.push(`ImmigrationClock is watching the ${longDate(e.effectiveAt!)} effective date.`);
  } else if (!e.effectiveAt && e.classification !== "court_decision" && e.classification !== "data_release") {
    out.push("ImmigrationClock is watching for a separately posted effective date. None has been recorded.");
  } else if (e.classification === "court_decision") {
    out.push("ImmigrationClock is watching the docket for a stay or an appeal, and the agency's own notice of how it will comply.");
  }

  return out;
}
