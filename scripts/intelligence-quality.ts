// =============================================================================
// scripts/intelligence-quality.ts — the regression scorecard
//
//   npm run intelligence:quality
//   npm run intelligence:quality -- --strict     (exit 1 on a real regression)
//
// WHAT THIS IS FOR
// ----------------
// Coverage percentages are easy to move and easy to fake. This reports coverage
// AND measured quality against a hand-labelled ground truth
// (fixtures/h1b-ground-truth.json), so a change that classifies more records by
// loosening a matcher shows up as falling precision rather than as progress.
//
// --strict fails on quality regressions and on a coverage collapse. It does not
// fail on a coverage target: there is no number of classified records that is
// correct, and a quota would be an incentive to invent classifications.
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EVENTS } from "../src/lib/event-store";
import {
  EMPLOYERS,
  EMPLOYERS_META,
  h1bFilersOnRelatedKeys,
  h1bFilersSharingKey,
} from "../src/lib/employers";
import { WARN_META, warnEmployersSharingKey, warnH1bCrossLink } from "../src/lib/warn";
import { normalizeEmployer } from "../src/lib/format";
import { describeMatch } from "../src/lib/intelligence/employer-match";
import { measureAll } from "../src/lib/intelligence/benchmarks";
import { readinessOf, renderMatrix, type DimensionReadiness } from "../src/lib/intelligence/readiness";
import { isStrong } from "../src/domains/graph/classification";
import type { ImmigrationEvent } from "../src/domains/graph/events";

const STRICT = process.argv.includes("--strict");
const TODAY = new Date().toISOString().slice(0, 10);
const ALL = EVENTS as ImmigrationEvent[];

interface Labelled {
  relevant: { id: string; why: string }[];
  notRelevant: { id: string; why: string; failureClass?: string }[];
}

const truth = JSON.parse(
  readFileSync(resolve("fixtures/h1b-ground-truth.json"), "utf8")
) as Labelled;

interface Score {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
  falsePositives: string[];
  falseNegatives: string[];
}

/** Score a predicate against the labelled set. Strong classifications only. */
function score(predicate: (e: ImmigrationEvent) => boolean): Score {
  const relevant = new Set(truth.relevant.map((r) => r.id));
  const notRelevant = new Set(truth.notRelevant.map((r) => r.id));
  const judged = ALL.filter((e) => relevant.has(e.id) || notRelevant.has(e.id));

  let tp = 0;
  let fp = 0;
  let fn = 0;
  const falsePositives: string[] = [];
  const falseNegatives: string[] = [];

  for (const e of judged) {
    const predicted = predicate(e);
    const actual = relevant.has(e.id);
    if (predicted && actual) tp++;
    else if (predicted && !actual) {
      fp++;
      falsePositives.push(e.title.slice(0, 66));
    } else if (!predicted && actual) {
      fn++;
      falseNegatives.push(e.title.slice(0, 66));
    }
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, precision, recall, f1, falsePositives, falseNegatives };
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

function has(e: ImmigrationEvent, dimension: "visaCategories" | "countries" | "forms", id: string, strongOnly = true): boolean {
  const list = (e.impact as Record<string, unknown> | undefined)?.[dimension] as
    | { entityId: string; method?: string }[]
    | undefined;
  return (list ?? []).some((x) => x.entityId === id && (!strongOnly || isStrong(x.method)));
}

function main() {
  const rule = "─".repeat(78);
  console.log(rule);
  console.log(`INTELLIGENCE QUALITY · ${TODAY}`);
  console.log(rule);

  // ---- corpus -------------------------------------------------------------
  const bySource: Record<string, number> = {};
  const byReview: Record<string, number> = {};
  for (const e of ALL) {
    bySource[e.sourceKey] = (bySource[e.sourceKey] ?? 0) + 1;
    byReview[e.reviewStatus] = (byReview[e.reviewStatus] ?? 0) + 1;
  }
  console.log(`\nCORPUS`);
  console.log(`  records                    ${ALL.length}`);
  console.log(`  by source                  ${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`  by review state            ${Object.entries(byReview).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

  // ---- coverage -----------------------------------------------------------
  const count = (f: (e: ImmigrationEvent) => boolean) => ALL.filter(f).length;
  const anyIn = (e: ImmigrationEvent, d: string) =>
    (((e.impact as Record<string, unknown> | undefined)?.[d] as unknown[]) ?? []).length > 0;
  const strongIn = (e: ImmigrationEvent, d: string) =>
    (((e.impact as Record<string, unknown> | undefined)?.[d] as { method?: string }[]) ?? []).some((x) =>
      isStrong(x.method)
    );

  console.log(`\nCOVERAGE (records with at least one classification)`);
  for (const d of ["visaCategories", "forms", "processes", "countries"]) {
    const all = count((e) => anyIn(e, d));
    const strong = count((e) => strongIn(e, d));
    console.log(`  ${d.padEnd(16)} ${String(all).padStart(4)} (${pct(all / ALL.length)})  of which strong: ${strong}`);
  }
  const withEffective = count((e) => Boolean(e.effectiveAt));
  const upcoming = count((e) => Boolean(e.effectiveAt && e.effectiveAt > TODAY));
  console.log(`  effectiveAt      ${String(withEffective).padStart(4)} (${pct(withEffective / ALL.length)})  upcoming: ${upcoming}`);
  console.log(`  limitations      ${String(count((e) => (e.limitations ?? []).length > 0)).padStart(4)}`);

  const weak = ALL.flatMap((e) =>
    (((e.impact as Record<string, unknown> | undefined)?.visaCategories as { method?: string }[]) ?? []).filter(
      (x) => !isStrong(x.method)
    )
  ).length;
  console.log(`  weak visa classifications  ${weak}`);

  // ---- benchmark ----------------------------------------------------------
  const strongOnly = score((e) => has(e, "visaCategories", "visa:h-1b", true));
  const includingWeak = score((e) => has(e, "visaCategories", "visa:h-1b", false));

  console.log(`\nBENCHMARK — visa:h-1b against ${truth.relevant.length + truth.notRelevant.length} hand-labelled records`);
  console.log(`  strong classifications only (the API default)`);
  console.log(`    precision ${pct(strongOnly.precision)}  recall ${pct(strongOnly.recall)}  F1 ${strongOnly.f1.toFixed(2)}`);
  console.log(`    tp ${strongOnly.tp} · fp ${strongOnly.fp} · fn ${strongOnly.fn}`);
  for (const x of strongOnly.falsePositives) console.log(`    FALSE POSITIVE: ${x}`);
  for (const x of strongOnly.falseNegatives) console.log(`    FALSE NEGATIVE: ${x}`);
  console.log(`  including weak (?include=weak)`);
  console.log(`    precision ${pct(includingWeak.precision)}  recall ${pct(includingWeak.recall)}  F1 ${includingWeak.f1.toFixed(2)}`);

  // ---- the readiness matrix -----------------------------------------------
  //
  // The headline. One row per dimension, every figure measured or explicitly
  // NOT MEASURED, and a readiness tier that follows from the numbers rather
  // than from anybody's confidence. See lib/intelligence/readiness.ts.
  const approvedByDimension = (dimension: string) =>
    ALL.filter(
      (e) =>
        e.reviewStatus === "approved" &&
        (((e.impact as Record<string, unknown> | undefined)?.[dimension] as unknown[]) ?? []).length > 0
    ).length;

  const evidenceComplete = (dimension: string) =>
    ALL.every((e) =>
      (
        (((e.impact as Record<string, unknown> | undefined)?.[dimension] as {
          basis: string;
          evidence?: string;
        }[]) ?? [])
      ).every((x) => x.basis !== "stated" || Boolean(x.evidence?.trim()))
    );

  const scores = measureAll(ALL);
  const dimensionField: Record<string, string> = {
    "H-1B (original 21)": "visaCategories",
    "H-1B (expanded)": "visaCategories",
    Country: "countries",
    Forms: "forms",
    "Employment / process": "processes",
  };

  const rows: DimensionReadiness[] = scores.map((d) => {
    const field = dimensionField[d.dimension] ?? "visaCategories";
    return readinessOf({
      dimension: d.dimension,
      // The COMBINED figure is reported, and the holdout is printed beneath so
      // a divergence cannot hide inside an average.
      precision: d.combined.precision,
      recall: d.combined.recall,
      benchmarkN: d.combined.n > 0 ? d.combined.n : null,
      humanReviewed: approvedByDimension(field),
      evidenceComplete: evidenceComplete(field),
      note: d.note,
    });
  });

  // Employer signals are not classification and have no ground truth. They are
  // in the matrix because leaving them out would let a reader assume they were
  // covered by a neighbouring row.
  rows.push(
    readinessOf({
      dimension: "Employer signals",
      precision: null,
      recall: null,
      benchmarkN: null,
      humanReviewed: 0,
      evidenceComplete: true,
      note: "a name-based join, described per row rather than scored; no ground truth exists",
    })
  );

  console.log(`\nREADINESS MATRIX`);
  console.log(renderMatrix(rows));
  console.log(`\n  Holdout figures, which are the ones to believe where they differ:`);
  for (const d of scores) {
    if (d.holdout.n === 0) continue;
    console.log(
      `    ${d.dimension.padEnd(22)} precision ${d.holdout.precision === null ? "NOT MEASURED" : `${(d.holdout.precision * 100).toFixed(0)}%`.padEnd(4)}  recall ${
        d.holdout.recall === null ? "NOT MEASURED" : `${(d.holdout.recall * 100).toFixed(0)}%`
      }   n ${d.holdout.n}`
    );
  }
  for (const d of scores) {
    if (!d.independentlyReviewed) {
      console.log(`    ⚠ ${d.dimension}: single-annotator labels, not independently reviewed.`);
    }
  }
  for (const r of rows) console.log(`    ${r.dimension.padEnd(22)} ${r.because}`);

  // ---- retrieval ----------------------------------------------------------
  //
  // Coverage says how many records carry a tag. This says whether a
  // professional can actually FIND what they monitor, which is the question a
  // filter exists to answer and the one coverage cannot.
  const EMPLOYMENT_VISAS = new Set([
    "visa:h-1b", "visa:h-1b1", "visa:h-2a", "visa:h-2b", "visa:h-3", "visa:l-1", "visa:l-1a",
    "visa:l-1b", "visa:o-1", "visa:tn", "visa:e-3", "visa:eb-1", "visa:eb-2", "visa:eb-3",
    "visa:eb-4", "visa:eb-5",
  ]);
  const EMPLOYMENT_FORMS = new Set([
    "form:i-129", "form:i-140", "form:i-765", "form:i-9", "form:eta-9089", "form:eta-9035",
    "form:eta-790", "form:i-907",
  ]);
  const strongIds = (e: ImmigrationEvent, d: string): string[] =>
    ((((e.impact as Record<string, unknown> | undefined)?.[d] as { entityId: string; method?: string }[]) ?? [])
      .filter((x) => isStrong(x.method))
      .map((x) => x.entityId));

  const reachable = (e: ImmigrationEvent) =>
    strongIds(e, "visaCategories").some((i) => EMPLOYMENT_VISAS.has(i)) ||
    strongIds(e, "forms").some((i) => EMPLOYMENT_FORMS.has(i)) ||
    strongIds(e, "processes").length > 0;

  const mentionsEmployment =
    /\b(employment|employer|worker|H-1B|H-2A|H-2B|labor certification|PERM|LCA|work authorization|EAD)\b/i;
  const candidates = ALL.filter(
    (e) => e.sourceKey === "uscis_newsroom" && mentionsEmployment.test(`${e.title} ${e.summary}`)
  );
  const found = candidates.filter(reachable);
  const missed = candidates.filter((e) => !reachable(e));

  console.log(`\nEMPLOYMENT RETRIEVAL — can a mobility team find what they monitor?`);
  console.log(`  USCIS records whose text concerns employment  ${candidates.length}`);
  console.log(`  reachable by visa, form or process filter     ${found.length} (${pct(found.length / candidates.length)})`);
  console.log(`  whole corpus reachable                        ${ALL.filter(reachable).length}`);
  for (const e of missed) console.log(`    UNREACHABLE: ${e.title.slice(0, 66)}`);

  // ---- employer signals ---------------------------------------------------
  const overlap = warnH1bCrossLink();
  const ages = overlap
    .filter((r) => r.latestNotice)
    .map((r) => Math.round((Date.parse(TODAY) - Date.parse(r.latestNotice as string)) / 86_400_000))
    .sort((a, b) => a - b);
  const median = ages[Math.floor(ages.length / 2)] ?? 0;
  const stale = ages.filter((d) => d > 730).length;

  const collisions = new Map<string, Set<string>>();
  for (const e of EMPLOYERS) {
    const k = normalizeEmployer(e.name);
    collisions.set(k, new Set([...(collisions.get(k) ?? []), e.name]));
  }
  const collidingKeys = [...collisions].filter(([, names]) => names.size > 1).length;

  // Match quality, per row, from the same describer the API uses.
  const matches = overlap.map((r) =>
    describeMatch({
      key: normalizeEmployer(r.name),
      h1bNames: h1bFilersSharingKey(r.name),
      warnNames: warnEmployersSharingKey(r.name),
      relatedFilersOnOtherKeys: h1bFilersOnRelatedKeys(r.name),
      fiscalYear: String(EMPLOYERS_META.fiscalYear),
      today: TODAY,
    })
  );
  const byKind: Record<string, number> = {};
  for (const m of matches) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
  const withRelated = matches.filter((m) => m.relatedFilersOnOtherKeys.length > 0);
  const approvalsUncounted = withRelated.reduce((sum, m) => sum + m.approvalsNotCounted, 0);
  const shortKeys = matches.filter((m) => m.fragileKey).length;

  console.log(`\nEMPLOYER SIGNALS`);
  console.log(`  H-1B sponsors ${EMPLOYERS.length} (FY${EMPLOYERS_META.fiscalYear}) · WARN notices ${WARN_META.noticeCount} across ${WARN_META.stateCount} states`);
  console.log(`  normalized overlap         ${overlap.length}`);
  console.log(`  median newest filing age   ${median} days`);
  console.log(`  stale (> 2 years)          ${stale} (${pct(stale / overlap.length)})`);
  console.log(`  colliding normalized keys  ${collidingKeys}`);
  console.log(`  MATCH QUALITY, per overlap row`);
  for (const kind of ["exact_normalized", "possible_corporate_family", "ambiguous_normalization"]) {
    console.log(`    ${kind.padEnd(26)} ${String(byKind[kind] ?? 0).padStart(4)}`);
  }
  console.log(`    on a key <= 4 chars        ${String(shortKeys).padStart(4)}  (short is not by itself wrong)`);
  console.log(`    rows understated by a group split across keys  ${withRelated.length}`);
  console.log(`    approvals those rows do not count              ${approvalsUncounted.toLocaleString()}`);
  for (const m of matches.filter((x) => x.kind === "ambiguous_normalization")) {
    console.log(`    AMBIGUOUS "${m.key}": [${m.h1bNames.join(" | ")}] vs [${m.warnNames.join(" | ")}]`);
  }

  // ---- review -------------------------------------------------------------
  const needsReview = ALL.filter(
    (e) => (e.effectiveAt && e.effectiveAt > TODAY) || e.severity === "major"
  ).length;
  console.log(`\nREVIEW`);
  console.log(`  human-reviewed records     ${byReview.approved ?? 0}`);
  console.log(`  high-priority candidates   ${needsReview}   (npm run review:queue)`);

  // ---- gate ---------------------------------------------------------------
  const problems: string[] = [];
  if (strongOnly.precision < 0.9) problems.push(`h-1b precision ${pct(strongOnly.precision)} is below 90%`);
  if (strongOnly.recall < 0.85) problems.push(`h-1b recall ${pct(strongOnly.recall)} is below 85%`);
  if (count((e) => anyIn(e, "visaCategories")) < 100) problems.push("visa coverage collapsed below 100 records");
  // Country precision has no floor to defend yet — it is below any bar worth
  // gating on, and that is the honest reading rather than a failing build on
  // every commit. What IS gated is that the measurement keeps being made: an
  // emitted pair nobody has labelled means the number stopped being a
  // measurement and became an estimate.
  // Per-dimension floors, from the measurements rather than from a coverage
  // quota. A dimension may sit anywhere in the matrix; what it may not do is
  // get worse than it is today without the build saying so.
  const floors: Record<string, { precision: number; recall: number }> = {
    "H-1B (original 21)": { precision: 0.9, recall: 0.85 },
    "H-1B (expanded)": { precision: 0.95, recall: 0.75 },
    Country: { precision: 0.9, recall: 0.5 },
    Forms: { precision: 0.9, recall: 0.5 },
    "Employment / process": { precision: 0.9, recall: 0.55 },
  };
  for (const d of scores) {
    const floor = floors[d.dimension];
    if (!floor) continue;
    if ((d.combined.precision ?? 0) < floor.precision) {
      problems.push(`${d.dimension} precision ${pct(d.combined.precision ?? 0)} is below its floor of ${pct(floor.precision)}`);
    }
    if ((d.combined.recall ?? 0) < floor.recall) {
      problems.push(`${d.dimension} recall ${pct(d.combined.recall ?? 0)} is below its floor of ${pct(floor.recall)}`);
    }
  }
  // Not a coverage quota: this is the retrieval promise the process dimension
  // was built to make, and losing it would mean employment monitoring silently
  // stopped working while every other number looked fine.
  if (found.length / candidates.length < 0.9) {
    problems.push(`employment retrieval fell to ${pct(found.length / candidates.length)} (floor 90%)`);
  }

  console.log(`\n${rule}`);
  if (problems.length === 0) {
    console.log("No regression against the benchmark.");
  } else {
    console.log("REGRESSIONS:");
    for (const p of problems) console.log(`  ✗ ${p}`);
    if (STRICT) process.exitCode = 1;
  }
}

main();
