// =============================================================================
// EXPLANATIONS — "what does this actually mean?"
//
// A reader who has just been told that USCIS issued a policy alert still has to
// work out the thing they actually came for: is this in force, does it apply to
// me, and do I have to do anything. This module answers that, in two or three
// short sentences, for every event.
//
// -----------------------------------------------------------------------------
// WHY THIS IS DETERMINISTIC AND NOT GENERATED
// -----------------------------------------------------------------------------
// The requirement was concise explanations that cite their evidence and never
// assert anything the source documents do not. Three constraints decide how:
//
//   1. The platform's own rule (events.ts) is that generated explainers may not
//      auto-publish — anything drafted rather than extracted carries
//      `reviewStatus: "draft"` and is invisible to readers regardless of quality.
//      An LLM explanation would therefore be written and then not shown, until a
//      human review workflow exists to approve it.
//
//   2. There is no runtime AI dependency, deliberately. Adding one to render a
//      sentence would put a third-party service between a reader and a
//      government document.
//
//   3. Most importantly: nothing here NEEDS generating. Every question a reader
//      has is already answered by a field that was extracted and validated —
//      classification, effective date, stated impact, required action. Composing
//      those into English is restatement, not authorship, and restatement cannot
//      hallucinate.
//
// So each clause is derived from exactly one verified field and carries the name
// of that field as its `basis`. The UI shows the basis, so a reader can always
// see WHERE a sentence came from — the same standard the impact model applies to
// evidence quotes.
//
// If LLM drafting is wanted later, the seam already exists: write to
// `whyItMatters` with `reviewStatus: "draft"` and build the approval queue. This
// module would continue to serve everything not yet reviewed.
//
// -----------------------------------------------------------------------------
// THE RULE EVERY CLAUSE OBEYS
// -----------------------------------------------------------------------------
// If the field is absent, the clause is absent. There is no default sentence, no
// "likely", no "typically". An event we know little about gets a short
// explanation, which is the honest outcome — padding it would be inventing.
// =============================================================================

import { isScheduled, type ImmigrationEvent } from "./events";

/**
 * Turns an entity id into words. Injected rather than imported so this domain
 * module keeps no dependency on the presentation layer — and so a raw id like
 * "visa:b-1-b-2" never reaches a reader as "b 1 b 2", which is what the naive
 * slug-to-space fallback produced.
 */
export type LabelFn = (entityId: string) => string;

const defaultLabel: LabelFn = (id) =>
  id
    .split(":")
    .slice(1)
    .join(":")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export interface ExplanationClause {
  /** One sentence, in plain English. */
  text: string;
  /**
   * The event field this restates. Rendered to the reader, so an explanation is
   * auditable the same way an evidence quote is.
   */
  basis: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isPast(iso: string | null | undefined, today: string): boolean {
  return Boolean(iso && ISO.test(iso) && iso <= today);
}

/**
 * Is it in force, and since when — the first thing anyone needs to know.
 *
 * The distinctions here are the ones most often collapsed in public reporting:
 * a proposal is not a rule, publication is not effect, enactment is not
 * implementation, and a district court binds its parties rather than the
 * country.
 */
function forceClause(e: ImmigrationEvent, today: string): ExplanationClause | null {
  switch (e.classification) {
    case "proposed_rule":
      return {
        text:
          "This is a proposal open for comment, not a rule. It changes nothing today, and it may be altered or never finalised.",
        basis: "classification: proposed_rule",
      };

    case "final_rule":
      // Derived from today, not from the stored flag — see isScheduled().
      if (isScheduled(e, today)) {
        return {
          text: `This is a final rule scheduled for publication on ${e.publishedAt}. Its text can still change before then.`,
          basis: "classification + scheduled",
        };
      }
      if (e.effectiveAt && ISO.test(e.effectiveAt)) {
        return isPast(e.effectiveAt, today)
          ? { text: `This rule has been in effect since ${e.effectiveAt}.`, basis: "effectiveAt" }
          : { text: `This rule is final but does not take effect until ${e.effectiveAt}.`, basis: "effectiveAt" };
      }
      return {
        text: "This is a final rule. The document does not state an effective date, so check the original for when it applies.",
        basis: "classification, with no effectiveAt",
      };

    case "executive_action":
      return {
        text:
          "An executive action directs federal agencies. What it means in practice arrives separately, in the agency guidance and rulemaking that implement it.",
        basis: "classification: executive_action",
      };

    case "court_decision":
      return {
        text:
          "A court decision binds according to the court that issued it, and can be stayed, narrowed, or reversed on appeal. Check the docket before relying on it.",
        basis: "classification: court_decision",
      };

    case "legislative_action":
      return {
        text:
          "Enactment changes the statute. When its provisions start, and what agencies must do to implement them, is usually set out in the law itself and in later rulemaking.",
        basis: "classification: legislative_action",
      };

    case "data_release":
      return {
        text:
          "This is a statistical release. It reports what has already happened and changes no one's status or obligations.",
        basis: "classification: data_release",
      };

    case "deadline":
      return {
        text: "This sets or reports a date. Missing a filing window generally cannot be undone, so the date is the operative fact.",
        basis: "classification: deadline",
      };

    case "correction":
      return {
        text: "This corrects something previously published. The earlier version was wrong in the respect described.",
        basis: "classification: correction",
      };

    case "announcement":
      // True of every agency announcement, and the caveat most worth making:
      // the agency saying something is not the same as the instrument that
      // makes it binding.
      return {
        text:
          "This is an agency announcement. It records what the agency said — the legal instrument, and the detail of how it applies, are published separately.",
        basis: "classification: announcement",
      };

    case "updated_information":
      return {
        text:
          "This updates material the agency had already published. It changes existing guidance rather than creating a new requirement on its own.",
        basis: "classification: updated_information",
      };

    case "new_information":
      return {
        text: "This is information published for the first time. It is a record of what was published, not a rule.",
        basis: "classification: new_information",
      };

    case "historical_revision":
      return {
        text:
          "This revises previously published historical figures. The past record changed; nothing about current requirements did.",
        basis: "classification: historical_revision",
      };

    default:
      return null;
  }
}

/**
 * Who the document itself names.
 *
 * STATED impact only. Inferred entries are our reading and have no place in a
 * sentence that tells someone whether a change applies to them.
 */
function scopeClause(e: ImmigrationEvent, labelFor: LabelFn): ExplanationClause | null {
  const im = e.impact;
  if (!im) return null;

  const named = [...im.countries, ...im.visaCategories, ...im.states].filter((x) => x.basis === "stated");
  if (named.length > 0) {
    const shown = named.slice(0, 6).map((x) => labelFor(x.entityId));
    const more = named.length - shown.length;
    const list = shown.join(", ") + (more > 0 ? `, and ${more} more` : "");
    return {
      text:
        im.completeness === "exhaustive"
          ? `The document names a closed list: ${list}.`
          : `The document names ${list}. It may identify others — read the original to be sure.`,
      basis: `impact.stated (${im.completeness})`,
    };
  }

  if (im.scopeDefinedElsewhere) {
    return {
      text:
        "This document sets a rule but leaves the list of who it covers to a separate government determination, so who is affected cannot be read from this document alone.",
      basis: "impact.scopeDefinedElsewhere",
    };
  }

  return null;
}

/**
 * Whether the document states a requirement.
 *
 * Deliberately does NOT paraphrase what the requirement is — the verbatim quote
 * already renders beside it. This clause only tells a reader that there is one
 * and that it is worth reading.
 */
function actionClause(e: ImmigrationEvent): ExplanationClause | null {
  if (!e.impact?.actionRequired) return null;
  return {
    text: "The document states a requirement for the people it covers. The exact wording is quoted above — whether it applies to any particular person depends on facts this platform does not have.",
    basis: "impact.actionRequired",
  };
}

/**
 * Build the explanation for an event.
 *
 * Returns clauses rather than a paragraph so the UI can render each one with
 * its basis. Never longer than three sentences: an explanation that has to be
 * skimmed has failed at the job of being an explanation.
 */
export function explainEvent(
  e: ImmigrationEvent,
  today = new Date().toISOString().slice(0, 10),
  labelFor: LabelFn = defaultLabel
): ExplanationClause[] {
  return [forceClause(e, today), scopeClause(e, labelFor), actionClause(e)].filter(
    (c): c is ExplanationClause => c !== null
  );
}

/** The same explanation as one short paragraph, for contexts without a list. */
export function explanationText(e: ImmigrationEvent, today?: string, labelFor?: LabelFn): string {
  return explainEvent(e, today, labelFor)
    .map((c) => c.text)
    .join(" ");
}
