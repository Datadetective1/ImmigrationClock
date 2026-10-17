// =============================================================================
// STAGE AND IMPORTANCE — two separate questions, never one badge
//
// STAGE is where a document stands as a legal or official instrument: a
// proposal, a final rule whose stated effective date is ahead or has passed, an
// announcement, a court decision, a data release. It is derived only from the
// record's own fields: its classification, the effective date the document
// states, and the archive's amendment links.
//
// IMPORTANCE is ImmigrationClock's editorial weighting of the record (its
// severity): whether it changes requirements, is notable, or is routine. It
// says nothing about stage, and stage says nothing about importance.
//
// What this module never does:
//   • say "in force", "in effect", "current" or "active". A stated effective
//     date that has passed means only that: a later rule, a court order or a
//     withdrawal can change whether a rule still applies, and the archive may
//     not hold that later record;
//   • date a proposal by anything but its publication;
//   • invent a date the document does not state.
// =============================================================================

import type { PublicChange } from "@/lib/intelligence/change";

export type StageKind =
  /** proposed_rule: open for comment, not final. */
  | "proposed"
  /** Final rule or executive action whose stated effective date is ahead. */
  | "final_ahead"
  /** Final rule or executive action whose stated effective date has passed. */
  | "final_date_passed"
  /** Final rule or executive action that states no effective date. */
  | "final_undated"
  /** Agency announcements, updates and new information: not a rule by itself. */
  | "announcement"
  | "court"
  | "legislative"
  | "data"
  | "correction"
  | "deadline";

export interface Stage {
  kind: StageKind;
  /** Short, for a pill: the kind of instrument, never its legal effect. */
  label: string;
  /** The one date that matters for this stage, named for what it is. */
  keyDate: { label: string; date: string } | null;
  /** A later record in the archive amends this one. Independent of kind. */
  amended: boolean;
  /** One sentence, only where it changes what a reader should conclude. */
  caveat: string | null;
}

type StageInput = Pick<PublicChange, "classification" | "effectiveDate" | "publishedDate" | "amendedBy">;

const INSTRUMENT: Record<string, string> = {
  final_rule: "Final rule",
  executive_action: "Executive action",
};

export const DATE_PASSED_CAVEAT =
  "The stated effective date has passed. A later rule, court order or withdrawal can change whether it still applies; check the source and any later records.";

export function stageOf(change: StageInput, today: string): Stage {
  const published = { label: "Published", date: change.publishedDate };
  const amended = change.amendedBy.length > 0;
  const withAmendment = (s: Omit<Stage, "amended">): Stage =>
    amended
      ? { ...s, amended, caveat: "A later record amends this one. Read that record first." }
      : { ...s, amended };

  const c = change.classification;
  if (c === "proposed_rule") {
    return withAmendment({
      kind: "proposed",
      label: "Proposed rule",
      keyDate: { label: "Proposed", date: change.publishedDate },
      caveat: "A proposal is not final. It can change or never take effect.",
    });
  }
  if (c === "final_rule" || c === "executive_action") {
    const label = INSTRUMENT[c];
    const eff = change.effectiveDate;
    if (!eff) {
      return withAmendment({ kind: "final_undated", label, keyDate: published, caveat: "The document states no effective date." });
    }
    if (eff > today) {
      return withAmendment({ kind: "final_ahead", label, keyDate: { label: "Takes effect", date: eff }, caveat: null });
    }
    return withAmendment({
      kind: "final_date_passed",
      label,
      keyDate: { label: "Stated effective date", date: eff },
      caveat: DATE_PASSED_CAVEAT,
    });
  }
  if (c === "court_decision") {
    return withAmendment({
      kind: "court",
      label: "Court decision",
      keyDate: published,
      caveat: "A decision can be appealed, or apply only to the parties in the case.",
    });
  }
  if (c === "legislative_action") return withAmendment({ kind: "legislative", label: "Legislative action", keyDate: published, caveat: null });
  if (c === "data_release") return withAmendment({ kind: "data", label: "Data release", keyDate: published, caveat: null });
  if (c === "correction" || c === "historical_revision") {
    return withAmendment({ kind: "correction", label: "Correction", keyDate: published, caveat: null });
  }
  if (c === "deadline") return withAmendment({ kind: "deadline", label: "Deadline", keyDate: published, caveat: null });
  return withAmendment({
    kind: "announcement",
    label: c === "updated_information" ? "Agency update" : "Agency announcement",
    keyDate: published,
    caveat: null,
  });
}

export type ImportanceKind = "changes_requirements" | "notable" | "routine";

export interface Importance {
  kind: ImportanceKind;
  label: string;
}

/** ImmigrationClock's editorial weighting of the record. Not its legal stage. */
export function importanceOf(change: Pick<PublicChange, "severity">): Importance {
  if (change.severity === "major") return { kind: "changes_requirements", label: "Changes requirements" };
  if (change.severity === "notable") return { kind: "notable", label: "Notable" };
  return { kind: "routine", label: "Routine" };
}
