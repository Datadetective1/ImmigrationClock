// =============================================================================
// EVENT DISPLAY LABELS — one source of truth for the words on the screen
//
// The event model's vocabulary is precise and internal: "proposed_rule",
// "notable", "data_release". None of it means anything to a reader, so every
// surface translates it — and for a while every surface translated it
// SEPARATELY. EventCard and EventExplorer each carried their own copy of the
// classification map, which is three copies of this string in one codebase:
//
//     "Proposed rule — not in force"
//
// That is the most load-bearing string in the product. It is the difference
// between a reader believing an obligation exists and knowing it does not, and
// duplicating it means one surface can drift and start describing a proposal as
// a rule while the other still gets it right. Nothing would fail; a reader would
// just be misinformed on one page.
//
// So the labels live here once, and the tests assert the wording rather than the
// component.
// =============================================================================

import type { EventClassification, EventSeverity } from "@/domains/graph/events";

/**
 * Plain-English classification labels.
 *
 * `proposed_rule` says "not in force" IN THE LABEL rather than relying on a
 * badge colour or a nearby banner, because the label is the one part that
 * survives every layout — compact rows, full cards, and anywhere added later.
 */
export const CLASSIFICATION_LABEL: Record<EventClassification, string> = {
  new_information: "New information",
  updated_information: "Updated",
  correction: "Correction",
  historical_revision: "Historical revision",
  announcement: "Announcement",
  data_release: "Data release",
  proposed_rule: "Proposed rule — not in force",
  final_rule: "Final rule",
  executive_action: "Executive action",
  court_decision: "Court decision",
  legislative_action: "Legislative action",
  deadline: "Deadline",
};

/**
 * Severity, worded as what it MEANS rather than how alarmed to be.
 *
 * Deliberately not colour-coded anywhere it is used. A red badge would tell a
 * reader a change is bad, which is an editorial claim the platform does not
 * make — it reports whether something changed, not whether the change is
 * welcome.
 */
export const SEVERITY_LABEL: Record<EventSeverity, string> = {
  major: "Changes what someone can or must do",
  notable: "Meaningful movement",
  routine: "Routine",
};

/** The same three levels, for places with no room for a sentence. */
export const SEVERITY_SHORT: Record<EventSeverity, string> = {
  major: "Major",
  notable: "Notable",
  routine: "Routine",
};

/** True when this classification must never be presented as being in force. */
export function isNotInForce(classification: EventClassification): boolean {
  return classification === "proposed_rule";
}

export function classificationLabel(classification: string): string {
  return CLASSIFICATION_LABEL[classification as EventClassification] ?? classification;
}
