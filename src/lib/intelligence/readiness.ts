// =============================================================================
// READINESS, PER DIMENSION — what may this data be used for?
//
// WHY IT IS A MATRIX AND NOT A VERDICT
// ------------------------------------
// "Is ImmigrationClock ready?" has no useful answer. H-1B classification scores
// perfectly against a hand-labelled set; country classification does not; forms
// have never been measured at all. A single yes hides the second two and a
// single no hides the first, and either way a customer is told something false.
//
// So readiness is computed per dimension, from measurements, and the tiers are
// defined by what a consumer would actually be doing with the data:
//
//   PULL API                    They ask, we answer, and every claim carries
//                               the quote it came from. A dimension qualifies
//                               as long as it never asserts more than it can
//                               show — which is a property of the shape, not of
//                               the accuracy.
//   HUMAN-ASSISTED MONITORING   A person reads the match before acting on it.
//                               Precision is what matters, because their time
//                               is what a false positive costs.
//   PUSH / WEBHOOK              Nobody reads it before it fires. Now recall
//                               matters too, because a miss is silent, and the
//                               benchmark has to be big enough that the numbers
//                               mean something.
//   NOT READY                   Anything that fails the above, or has not been
//                               measured. Unmeasured is NOT READY, never
//                               "probably fine".
//
// THE ONE RULE THIS FILE ENFORCES ABOVE ALL
// -----------------------------------------
// An unmeasured metric is null and prints as NOT MEASURED. It is never zero,
// never assumed, and never quietly inherited from a neighbouring dimension. A
// zero would understate; an assumption would overstate; both would be a number
// where there is no measurement, which is the specific dishonesty this whole
// layer exists to avoid.
// =============================================================================

export type ReadinessTier =
  | "READY FOR PUSH/WEBHOOK"
  | "READY FOR HUMAN-ASSISTED MONITORING"
  | "READY FOR PULL API"
  | "NOT READY";

export interface DimensionMeasurement {
  /** Display name. */
  dimension: string;
  /** Null means NOT MEASURED. Never zero-as-unknown. */
  precision: number | null;
  recall: number | null;
  /** How many judgements the measurement rests on. Null when unmeasured. */
  benchmarkN: number | null;
  /** Records carrying this dimension that a person has approved. */
  humanReviewed: number;
  /**
   * True when every claim on this dimension carries the verbatim quote it was
   * derived from. This is what makes a dimension safe to expose at all.
   */
  evidenceComplete: boolean;
  /** Anything a reader must know to interpret the row. */
  note: string;
}

export interface DimensionReadiness extends DimensionMeasurement {
  f1: number | null;
  tier: ReadinessTier;
  /** Why it landed in that tier, in one sentence. */
  because: string;
}

/** The bars. Stated once, here, so they cannot drift between report and code. */
export const PRECISION_BAR = 0.9;
export const RECALL_BAR = 0.85;
/**
 * Below this many judgements a percentage is a rounding artefact.
 *
 * Twenty-one hand-labelled records produced a clean 100%/100% for H-1B, and a
 * single relabelled record would have moved it five points. That is a real
 * result and a fragile one, which is exactly why a push promise needs a bigger
 * set behind it than a pull API does.
 */
export const MIN_BENCHMARK_FOR_PUSH = 30;

export function f1Of(precision: number | null, recall: number | null): number | null {
  if (precision === null || recall === null) return null;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export function readinessOf(m: DimensionMeasurement): DimensionReadiness {
  const f1 = f1Of(m.precision, m.recall);
  const base = { ...m, f1 };

  if (!m.evidenceComplete) {
    return {
      ...base,
      tier: "NOT READY",
      because: "not every claim on this dimension carries the quote it came from",
    };
  }

  if (m.precision === null) {
    return {
      ...base,
      tier: "READY FOR PULL API",
      because:
        "every claim carries its evidence, so it is safe to answer a question with — but nothing about its accuracy has been measured, so nothing may be pushed on it",
    };
  }

  if (m.precision < PRECISION_BAR) {
    return {
      ...base,
      tier: "READY FOR PULL API",
      because: `precision ${pct(m.precision)} is below the ${pct(PRECISION_BAR)} bar, so a match is a lead to check rather than a fact to act on`,
    };
  }

  if (m.recall === null) {
    return {
      ...base,
      tier: "READY FOR HUMAN-ASSISTED MONITORING",
      because:
        "precision clears the bar so a person can trust what arrives, but recall is unmeasured, so nothing may promise completeness",
    };
  }

  if (m.recall < RECALL_BAR) {
    return {
      ...base,
      tier: "READY FOR HUMAN-ASSISTED MONITORING",
      because: `precision ${pct(m.precision)} clears the bar but recall ${pct(m.recall)} is below ${pct(RECALL_BAR)}, so a silent miss is likely`,
    };
  }

  if ((m.benchmarkN ?? 0) < MIN_BENCHMARK_FOR_PUSH) {
    return {
      ...base,
      tier: "READY FOR HUMAN-ASSISTED MONITORING",
      because: `both bars are cleared, but on only ${m.benchmarkN} judgements — too few to promise on when nobody is reading before it fires`,
    };
  }

  return {
    ...base,
    tier: "READY FOR PUSH/WEBHOOK",
    because: `precision ${pct(m.precision)} and recall ${pct(m.recall)} on ${m.benchmarkN} hand-labelled judgements`,
  };
}

export function pct(x: number | null): string {
  return x === null ? "NOT MEASURED" : `${(x * 100).toFixed(0)}%`;
}

export function num(x: number | null): string {
  return x === null ? "NOT MEASURED" : String(x);
}

/** The matrix, as fixed-width text. One row per dimension, nothing inferred. */
export function renderMatrix(rows: DimensionReadiness[]): string {
  const head = ["Dimension", "Precision", "Recall", "F1", "Benchmark N", "Human review", "Readiness"];
  const body = rows.map((r) => [
    r.dimension,
    pct(r.precision),
    pct(r.recall),
    r.f1 === null ? "NOT MEASURED" : r.f1.toFixed(2),
    num(r.benchmarkN),
    r.humanReviewed === 0 ? "none" : String(r.humanReviewed),
    r.tier,
  ]);

  const widths = head.map((h, i) =>
    Math.max(h.length, ...body.map((row) => row[i].length))
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();

  return [
    line(head),
    widths.map((w) => "─".repeat(w)).join("  "),
    ...body.map(line),
  ].join("\n");
}
