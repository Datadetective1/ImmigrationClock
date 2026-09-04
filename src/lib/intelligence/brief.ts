// =============================================================================
// THE IMPACT BRIEF — what a professional needs about one change, in one screen
//
// THE JOB
// -------
// Someone responsible for immigration work asks one thing of a change: does
// this touch anything I am responsible for, and what do I do about it? The
// archive can answer the first half from evidence. It cannot answer the second
// half, and it must not pretend to.
//
// So a brief keeps two kinds of line apart:
//
//   FACTS     what the document is, when it takes effect, what it names — each
//             with the quote and the source behind it.
//   WORKFLOW  a neutral suggestion to review something internal. Never a
//             determination about a person, a case, or an outcome.
//
// THE WORDING RULE
// ----------------
// Every generated sentence is conditional and addressed to a process, never to
// a person: "teams whose work involves those areas may want to review it", not
// "you must update your templates". That is the line between workflow
// intelligence and legal advice, and a test greps the generated text to keep it.
//
// WHAT IS NEVER GENERATED
// -----------------------
//   • Anything about an individual's eligibility, status or options.
//   • Any prediction about what an agency will do next.
//   • Any claim the evidence does not carry. A brief for a record with no
//     classifications says so and stops, rather than reaching for something.
// =============================================================================

import type { PublicChange } from "./change";

export interface BriefLine {
  label: string;
  value: string;
}

export interface ImpactBrief {
  id: string;
  /** What changed, in the document's own words. */
  change: string;
  /**
   * Why it may be operationally relevant. Conditional, addressed to a process,
   * and built only from classifications the evidence supports. Null when the
   * record carries nothing that would let us say anything at all — which is a
   * real answer and a common one.
   */
  potentialRelevance: string | null;
  /** The verified effective date, or an explicit statement that none is stated. */
  effective: string;
  source: { name: string; url: string };
  /** The dimensions the evidence supports, and nothing else. */
  affectedDimensions: BriefLine[];
  /** Quotes, so every dimension above can be checked against the document. */
  evidence: { dimension: string; value: string; method: string; quote: string }[];
  /** A neutral, process-directed next step. Never advice to a person. */
  suggestedProfessionalAction: string;
  limitations: string[];
  /** auto | draft | approved — whether a person has stood behind this record. */
  reviewStatus: string;
}

const DIMENSION_LABEL: Record<string, string> = {
  visaCategories: "Visa categories",
  countries: "Countries",
  forms: "Forms",
  processes: "Processes",
};

/** Human phrasing for a classification id. "i-129" reads badly in a sentence. */
function readable(dimension: string, id: string): string {
  if (dimension === "forms") return `Form ${id.toUpperCase()}`;
  if (dimension === "visaCategories") return id.toUpperCase();
  if (dimension === "processes") return id.replace(/-/g, " ");
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function relevanceSentence(change: PublicChange): string | null {
  const parts: string[] = [];

  if (change.forms.length > 0) {
    parts.push(`names ${change.forms.map((f) => `Form ${f.id.toUpperCase()}`).join(", ")}`);
  }
  if (change.visaCategories.length > 0) {
    parts.push(`concerns ${change.visaCategories.map((v) => v.id.toUpperCase()).join(", ")}`);
  }
  if (change.processes.length > 0) {
    parts.push(`concerns ${change.processes.map((p) => p.id.replace(/-/g, " ")).join(", ")}`);
  }
  if (change.countries.length > 0) {
    parts.push(
      `defines its coverage by ${change.countries.map((c) => readable("countries", c.id)).join(", ")}`
    );
  }
  if (parts.length === 0) return null;

  const subject =
    change.status === "proposed"
      ? "This proposal"
      : change.status === "decided"
        ? "This decision"
        : "This change";

  return (
    `${subject} ${parts.join("; it ")}. Teams whose work involves those areas may want to review ` +
    `it against their own procedures and templates.`
  );
}

function actionSentence(change: PublicChange): string {
  if (change.status === "proposed") {
    return (
      "Verify against the official source. A proposed rule is not in force and may change or never " +
      "be finalised, so this is a candidate to track rather than to act on."
    );
  }
  if (change.status === "superseded") {
    return (
      "Verify against the official source, and read the later record that amends this one before " +
      "relying on it."
    );
  }
  if (change.effectiveDate) {
    return (
      `Verify against the official source, then determine whether internal workflows, templates or ` +
      `checklists need review before ${change.effectiveDate}.`
    );
  }
  return (
    "Verify against the official source, then determine whether internal workflows or templates " +
    "require review."
  );
}

export function buildBrief(change: PublicChange): ImpactBrief {
  const affectedDimensions: BriefLine[] = [];
  const evidence: ImpactBrief["evidence"] = [];

  const dimensions = [
    ["visaCategories", change.visaCategories],
    ["countries", change.countries],
    ["forms", change.forms],
    ["processes", change.processes],
  ] as const;

  for (const [key, list] of dimensions) {
    if (list.length === 0) continue;
    affectedDimensions.push({
      label: DIMENSION_LABEL[key],
      value: list.map((c) => readable(key, c.id)).join(", "),
    });
    for (const c of list) {
      evidence.push({
        dimension: DIMENSION_LABEL[key],
        value: readable(key, c.id),
        method: c.method,
        quote: c.evidence ?? "(no quote stored)",
      });
    }
  }

  const limitations = [...change.limitations];
  if (affectedDimensions.length === 0) {
    limitations.push(
      "No visa, country, form or process is classified on this record. That means the document did " +
        "not name one in its own words — not that it is irrelevant."
    );
  }
  if (change.verification === "auto") {
    limitations.push(
      "Classified automatically. No person has reviewed this record against its source."
    );
  }

  return {
    id: change.id,
    change: change.title,
    potentialRelevance: relevanceSentence(change),
    effective: change.effectiveDate
      ? change.effectiveDate
      : "The document does not state an effective date. Check the source.",
    source: { name: change.source.name, url: change.source.url },
    affectedDimensions,
    evidence,
    suggestedProfessionalAction: actionSentence(change),
    limitations,
    reviewStatus: change.verification,
  };
}
