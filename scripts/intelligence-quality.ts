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

interface CountryTruth {
  pairs: { id: string; country: string; correct: boolean; failureClass?: string; debatable?: boolean }[];
}
const countryTruth = JSON.parse(
  readFileSync(resolve("fixtures/country-ground-truth.json"), "utf8")
) as CountryTruth;

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

  // ---- country precision --------------------------------------------------
  //
  // PRECISION ONLY, AND SAID SO. Every pair the classifier emits is labelled by
  // hand, so precision is a real measurement. Recall is not: finding the false
  // negatives would mean reading 544 documents for unstated country scope, and
  // there is no honest shortcut. Unknown is reported as unknown.
  const countryLabels = new Map(
    countryTruth.pairs.map((p) => [`${p.id}|${p.country}`, p] as const)
  );
  const emittedPairs: { id: string; country: string }[] = [];
  for (const e of ALL) {
    for (const c of (e.impact as { countries?: { entityId: string; method?: string }[] } | undefined)
      ?.countries ?? []) {
      if (!isStrong(c.method)) continue;
      emittedPairs.push({ id: e.id, country: c.entityId.replace("country:", "") });
    }
  }
  const labelled = emittedPairs.filter((p) => countryLabels.has(`${p.id}|${p.country}`));
  const wrong = labelled.filter((p) => countryLabels.get(`${p.id}|${p.country}`)!.correct === false);
  const unlabelled = emittedPairs.length - labelled.length;
  const countryPrecision = labelled.length > 0 ? (labelled.length - wrong.length) / labelled.length : 0;

  console.log(`\nCOUNTRY PRECISION — every emitted pair labelled by hand`);
  console.log(`  record+country pairs emitted   ${emittedPairs.length}`);
  console.log(`  labelled                       ${labelled.length}${unlabelled ? `  (${unlabelled} NOT labelled — label them)` : ""}`);
  console.log(`  precision                      ${pct(countryPrecision)}`);
  console.log(`  recall                         not measured (see the fixture's readme for why)`);
  for (const p of wrong) {
    const label = countryLabels.get(`${p.id}|${p.country}`)!;
    console.log(`    WRONG ${p.country} on ${p.id} — ${label.failureClass}`);
  }

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
  if (unlabelled > 0) {
    problems.push(`${unlabelled} country pair(s) emitted but never hand-labelled`);
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
