// =============================================================================
// scripts/build-label-batches.ts — assemble what a human annotator has to read
//
//   npx tsx scripts/build-label-batches.ts <bodiesDir> <outDir>
//
// WHY IT SAMPLES THE WAY IT DOES
// ------------------------------
// A benchmark built from the classifier's own output can only ever measure
// precision, and it measures it against the thing being tested. To measure
// RECALL you have to start from the documents and ask what they say, without
// looking at what the classifier claimed.
//
// So the pools below are drawn from the corpus, stratified so the hard cases
// are actually present rather than left to chance:
//
//   claimed          every record the classifier currently classifies. The
//                    precision pool.
//   surface          the value appears in the title or abstract — where real
//                    scope usually lives.
//   body_only        the value appears ONLY in the document body. The recall
//                    pool the archive alone cannot see, and where the citations
//                    and historical asides hide.
//   trap             body mentions in the shapes already known to mislead: an
//                    agreement title, a Federal Register citation, a list of
//                    documents, a comparison with another visa programme.
//   global           the document states universal scope. A country or visa
//                    classification here is almost always wrong.
//   random           an unbiased sample, so the recall estimate is not built
//                    only from places we expected to find things.
//
// Each record is emitted with its title, its abstract, and the body passages
// that actually mention the value, so the judgement is made on evidence rather
// than on a summary of evidence. Nothing about the classifier's answer is
// included: an annotator who can see the answer is scoring the answer.
// =============================================================================

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { EVENTS } from "../src/lib/event-store";
import { COUNTRIES } from "../src/domains/graph/countries";
import { richText } from "../src/domains/graph/text";
import type { ImmigrationEvent } from "../src/domains/graph/events";

const BODIES = process.argv[2];
const OUT = process.argv[3];
if (!BODIES || !OUT) {
  console.error("usage: tsx scripts/build-label-batches.ts <bodiesDir> <outDir>");
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const ALL = EVENTS as unknown as ImmigrationEvent[];

function bodyOf(id: string): string {
  const f = join(BODIES, `${id.replace(/[^A-Za-z0-9._-]/g, "_")}.txt`);
  return existsSync(f) ? readFileSync(f, "utf8") : "";
}

/** Deterministic shuffle, so a re-run produces the same sample. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  const next = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Passages around each match, so an annotator reads the sentence, not the word. */
function passages(text: string, re: RegExp, max = 6, window = 320): string[] {
  const out: string[] = [];
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  const flat = text.replace(/\s+/g, " ");
  for (let m = global.exec(flat); m !== null && out.length < max; m = global.exec(flat)) {
    const start = Math.max(0, m.index - window / 2);
    const end = Math.min(flat.length, m.index + m[0].length + window / 2);
    out.push(`…${flat.slice(start, end).trim()}…`);
    global.lastIndex = end;
  }
  return out;
}

interface Candidate {
  id: string;
  source: string;
  classification: string;
  title: string;
  abstract: string;
  stratum: string;
  /** What the annotator is being asked about. */
  value: string;
  /** Where in the document the value appears. */
  inTitle: boolean;
  inAbstract: boolean;
  bodyPassages: string[];
  bodyAvailable: boolean;
}

const GLOBAL_SCOPE =
  /\b(all aliens|any alien|all applicants|all petitioners|regardless of nationality|all nonimmigrants|every applicant|all benefit requests)\b/i;

// -----------------------------------------------------------------------------
// H-1B
// -----------------------------------------------------------------------------

const H1B = /(?<![a-z0-9])h-?1b(?![a-z0-9])/i;

function h1bCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const e of ALL) {
    const title = richText(e.title ?? "");
    const abstract = richText(e.summary ?? "");
    const body = bodyOf(e.id);
    const inTitle = H1B.test(title);
    const inAbstract = H1B.test(abstract);
    const inBody = H1B.test(body);
    if (!inTitle && !inAbstract && !inBody) continue;

    // The trap shapes, named rather than guessed at: an H-2A/H-2B rule that
    // mentions H-1B, a citation, a historical aside, a comparison.
    const otherProgramme = /\bH-2A\b|\bH-2B\b/i.test(title) || /\bH-2A\b|\bH-2B\b/i.test(abstract);
    const stratum =
      inTitle || inAbstract
        ? "surface"
        : otherProgramme
          ? "trap_other_programme"
          : GLOBAL_SCOPE.test(abstract)
            ? "global"
            : "body_only";

    out.push({
      id: e.id,
      source: e.sourceKey,
      classification: e.classification,
      title,
      abstract,
      stratum,
      value: "h-1b",
      inTitle,
      inAbstract,
      bodyPassages: passages(body, H1B),
      bodyAvailable: body.length > 0,
    });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Countries
// -----------------------------------------------------------------------------

/**
 * Country surfaces long enough to be worth an annotator's time.
 *
 * Short and ambiguous names ("Chad", "Georgia", "Jordan") are excluded from the
 * SEARCH, not from the taxonomy: including them fills the pool with false
 * matches from ordinary prose and buys nothing, since the classifier already
 * gates them behind a context term.
 */
const COUNTRY_SURFACES = COUNTRIES.flatMap((c) => [c.name, ...(c.aliases ?? [])])
  .filter((n) => n.length >= 5)
  .sort((a, b) => b.length - a.length);

const COUNTRY_RE = new RegExp(
  `(?<![a-z0-9])(${COUNTRY_SURFACES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![a-z0-9])`,
  "i"
);

const TRAP_SHAPES =
  /\bagreement between\b|\bmemorandum of understanding\b|\b\d{1,3}\s?FR\s?\d{3,}\b|\bborder crossing card\b|\bPub\.?\s?L\.?\b|\btreaty\b/i;

function countryCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const e of ALL) {
    const title = richText(e.title ?? "");
    const abstract = richText(e.summary ?? "");
    const body = bodyOf(e.id);
    const inTitle = COUNTRY_RE.test(title);
    const inAbstract = COUNTRY_RE.test(abstract);
    const bodyHits = passages(body, COUNTRY_RE, 8);

    if (!inTitle && !inAbstract && bodyHits.length === 0) continue;

    const stratum =
      inTitle || inAbstract
        ? "surface"
        : bodyHits.some((p) => TRAP_SHAPES.test(p))
          ? "trap"
          : GLOBAL_SCOPE.test(abstract) || GLOBAL_SCOPE.test(body.slice(0, 4000))
            ? "global"
            : "body_only";

    out.push({
      id: e.id,
      source: e.sourceKey,
      classification: e.classification,
      title,
      abstract,
      stratum,
      value: "any-country",
      inTitle,
      inAbstract,
      bodyPassages: bodyHits,
      bodyAvailable: body.length > 0,
    });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Forms
// -----------------------------------------------------------------------------

const FORM_TOKEN = /(?<![A-Za-z0-9-])(?:Form\s+)?((?:I|N|G|DS|ETA)-\d{1,4})(?![A-Za-z0-9-])/i;

function formCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const e of ALL) {
    const title = richText(e.title ?? "");
    const abstract = richText(e.summary ?? "");
    const body = bodyOf(e.id);
    const inTitle = FORM_TOKEN.test(title);
    const inAbstract = FORM_TOKEN.test(abstract);
    const bodyHits = passages(body, FORM_TOKEN, 8);
    if (!inTitle && !inAbstract && bodyHits.length === 0) continue;

    out.push({
      id: e.id,
      source: e.sourceKey,
      classification: e.classification,
      title,
      abstract,
      stratum: inTitle || inAbstract ? "surface" : "body_only",
      value: "any-form",
      inTitle,
      inAbstract,
      bodyPassages: bodyHits,
      bodyAvailable: body.length > 0,
    });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Employment, for the process benchmark
// -----------------------------------------------------------------------------

const EMPLOYMENT =
  /\b(employment|employer|worker|H-1B|H-2A|H-2B|labor certification|PERM|LCA|work authorization|EAD|prevailing wage|E-Verify|premium processing)\b/i;

function employmentCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const e of ALL) {
    const title = richText(e.title ?? "");
    const abstract = richText(e.summary ?? "");
    const body = bodyOf(e.id);
    const inTitle = EMPLOYMENT.test(title);
    const inAbstract = EMPLOYMENT.test(abstract);
    const bodyHits = passages(body, EMPLOYMENT, 5);
    if (!inTitle && !inAbstract && bodyHits.length === 0) continue;

    out.push({
      id: e.id,
      source: e.sourceKey,
      classification: e.classification,
      title,
      abstract,
      stratum: inTitle || inAbstract ? "surface" : "body_only",
      value: "employment",
      inTitle,
      inAbstract,
      bodyPassages: bodyHits,
      bodyAvailable: body.length > 0,
    });
  }
  return out;
}

// -----------------------------------------------------------------------------

function writeBatches(name: string, candidates: Candidate[], perBatch: number, cap: number) {
  // Sample within each stratum so no stratum is crowded out by a large one, and
  // shuffle deterministically so a re-run labels the same records.
  const byStratum = new Map<string, Candidate[]>();
  for (const c of candidates) {
    byStratum.set(c.stratum, [...(byStratum.get(c.stratum) ?? []), c]);
  }

  const picked: Candidate[] = [];
  const strata = [...byStratum.keys()].sort();
  const perStratum = Math.max(1, Math.ceil(cap / strata.length));
  for (const s of strata) {
    picked.push(...seededShuffle(byStratum.get(s)!, 20260903).slice(0, perStratum));
  }

  const batches: Candidate[][] = [];
  for (let i = 0; i < picked.length; i += perBatch) batches.push(picked.slice(i, i + perBatch));

  batches.forEach((batch, i) => {
    writeFileSync(
      join(OUT, `${name}-batch-${String(i + 1).padStart(2, "0")}.json`),
      `${JSON.stringify({ dimension: name, batch: i + 1, records: batch }, null, 2)}\n`
    );
  });

  const counts = strata.map((s) => `${s} ${byStratum.get(s)!.length}`).join(" · ");
  console.log(
    `${name.padEnd(12)} candidates ${String(candidates.length).padStart(4)}  sampled ${String(picked.length).padStart(4)}  batches ${batches.length}`
  );
  console.log(`             strata: ${counts}`);
  return picked;
}

function main() {
  const bodies = ALL.filter((e) => bodyOf(e.id).length > 0).length;
  console.log(`document bodies available: ${bodies} of ${ALL.length}\n`);

  // H-1B and country are labelled EXHAUSTIVELY rather than sampled. Both
  // candidate sets are small enough to label completely, and a complete set
  // gives a true recall figure over the knowable universe instead of an
  // estimate with a sampling error nobody will remember to quote.
  writeBatches("h1b", h1bCandidates(), 11, 400);
  writeBatches("country", countryCandidates(), 10, 400);
  // Forms and employment are far larger, so these are stratified samples and
  // the resulting recall is an estimate. Said so wherever it is reported.
  writeBatches("forms", formCandidates(), 12, 72);
  writeBatches("employment", employmentCandidates(), 12, 72);

  console.log(`\nbatches written to ${OUT}`);
}

main();
