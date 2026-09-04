// =============================================================================
// scripts/reclassify-events.ts — apply the graded classifier to the archive
//
//   npm run intelligence:reclassify -- --dry-run     (default: prints, writes nothing)
//   npm run intelligence:reclassify -- --write
//
// WHY THIS EXISTS AND WHY IT IS NOT A SECOND SYSTEM
// -------------------------------------------------
// The extractor was fixed at ingestion (extract-impact.ts), which is the right
// place — but the 544 records already in the archive were built by the old one,
// and rebuilding them means re-fetching every government source. This pass
// upgrades what is already committed WITHOUT a network call, using the same
// grader the extractor now uses (domains/graph/classification.ts). One model,
// applied in two places, rather than two models that will drift.
//
// WHAT IT MAY USE
// ---------------
// Only what is committed: each record's title, summary, and the verbatim
// evidence quote the original extraction stored. The full document body is not
// in the archive, so a body-derived classification can be RE-GRADED from its
// stored quote but a new one cannot be invented from a body nobody has.
//
// WHAT IT MAY NOT DO
// ------------------
// It adds a classification only where the record's own title or summary names
// the value. It never guesses from a topic, a source, or a neighbouring record.
// A record that says nothing about H-1B stays unclassified for H-1B, and
// unclassified is a legitimate answer this product is built to give.
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { VISA_CATEGORIES } from "../src/domains/graph/entities";
import { confidenceFor, gradeClassification, looksHistorical } from "../src/domains/graph/classification";
import { FORM_MATCHERS, formsFor } from "../src/domains/graph/forms";
import { PROCESSES, processesFor } from "../src/domains/graph/processes";
import { richText } from "../src/domains/graph/text";

const PATH = resolve("src/lib/generated/events.json");
const WRITE = process.argv.includes("--write");

interface Impacted {
  entityId: string;
  basis: string;
  evidence?: string;
  method?: string;
  confidence: number;
}

interface Rec {
  id: string;
  title: string;
  summary: string;
  sourceKey: string;
  impact?: {
    visaCategories?: Impacted[];
    forms?: Impacted[];
    processes?: Impacted[];
    countries?: Impacted[];
    completeness?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

const HYPHENATED_CODE = /^[a-z]{1,2}-\d/i;

/** The same surfaces the extractor matches on, built from the same seed data. */
const VISA_MATCHERS = VISA_CATEGORIES.flatMap((v) => {
  const surfaces = [v.name, ...(v.aliases ?? [])].filter((s) => s.length >= 4 || HYPHENATED_CODE.test(s));
  return surfaces.map((surface) => ({
    entityId: v.id as string,
    surface,
    re: new RegExp(`(?<![a-z0-9])${surface.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i"),
  }));
}).sort((a, b) => b.surface.length - a.surface.length);

function clip(text: string, max = 300): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, flat.lastIndexOf(" ", max))}…`;
}

function main() {
  const file = JSON.parse(readFileSync(PATH, "utf8")) as { events: Rec[]; [k: string]: unknown };
  const events = file.events;

  let added = 0;
  let regraded = 0;
  let demoted = 0;
  let formsAdded = 0;
  let processesAdded = 0;
  let countriesGraded = 0;
  let completenessUntouched = 0;
  let quotesCleaned = 0;
  const examples: string[] = [];

  for (const e of events) {
    const impact = (e.impact ??= {});
    const visas = (impact.visaCategories ??= []);
    // Normalized the same way the extractor normalizes, so an evidence quote
    // reads as the document reads. Archive summaries carry HTML entities
    // ("&nbsp;") and the occasional tag; leaking those into a verbatim quote
    // makes it unusable as evidence, which is the only thing it is for.
    const title = richText(e.title ?? "");
    const summary = richText(e.summary ?? "");

    // --- an evidence quote must read as the document reads ------------------
    //
    // Quotes stored by the original extraction carry the archive's HTML
    // entities. A verbatim quote containing "&nbsp;" is not verbatim, and it is
    // the one field a consumer is asked to check a match against.
    for (const dimension of [visas, impact.countries, impact.forms, impact.processes]) {
      for (const entry of dimension ?? []) {
        if (!entry.evidence) continue;
        const clean = richText(entry.evidence);
        if (clean !== entry.evidence) {
          entry.evidence = clean;
          quotesCleaned++;
        }
      }
    }

    // --- re-grade what is already there ------------------------------------
    for (const entry of visas) {
      const matcher = VISA_MATCHERS.find((m) => m.entityId === entry.entityId);
      if (!matcher) continue;
      const method = gradeClassification({
        title,
        summary,
        evidence: entry.evidence ?? null,
        matches: (text) => matcher.re.test(text),
      });
      if (entry.method !== method) {
        if (entry.method) regraded++;
        if (method === "derived_weak") {
          demoted++;
          if (examples.length < 6) {
            examples.push(`DEMOTED ${entry.entityId} on "${title.slice(0, 52)}" — evidence reads as history/citation`);
          }
        }
        entry.method = method;
        entry.confidence = confidenceFor(method);
      }
    }

    // --- add what the title or summary plainly names ------------------------
    const seen = new Set(visas.map((v) => v.entityId));
    for (const m of VISA_MATCHERS) {
      if (seen.has(m.entityId)) continue;
      const inTitle = m.re.test(title);
      const inSummary = !inTitle && m.re.test(summary);
      if (!inTitle && !inSummary) continue;

      const evidence = clip(inTitle ? title : summary);
      // A summary sentence that reads as history is weak even in a summary.
      const method = inTitle
        ? "explicit_source"
        : looksHistorical(evidence)
          ? "derived_weak"
          : "derived_high_confidence";

      seen.add(m.entityId);
      visas.push({
        entityId: m.entityId,
        basis: "stated",
        evidence,
        method,
        confidence: confidenceFor(method as never),
      });
      added++;
      if (examples.length < 12) {
        examples.push(`ADDED   ${m.entityId} on "${title.slice(0, 52)}" (${method})`);
      }
    }

    // --- countries -----------------------------------------------------------
    //
    // The extractor already reads countries ONLY from designation sentences —
    // "nationals of", "citizens of", "designated countries" — which is a far
    // stricter test than the visa matcher used. So an existing country
    // classification is strong evidence by construction, and grading it here
    // records that rather than leaving it methodless (and therefore treated as
    // weak, which would silently empty the country filter).
    for (const entry of impact.countries ?? []) {
      if (entry.method) continue;
      const evidence = entry.evidence ?? "";
      const inVisibleText = evidence && (title.includes(evidence.slice(0, 40)) || summary.includes(evidence.slice(0, 40)));
      const method = looksHistorical(evidence)
        ? "derived_weak"
        : inVisibleText
          ? "derived_high_confidence"
          : "derived_high_confidence";
      entry.method = method;
      entry.confidence = confidenceFor(method as never);
      countriesGraded++;
    }

    // --- forms, which did not exist as a dimension at all -------------------
    const forms = formsFor(title, summary);
    if (forms.length) {
      impact.forms = forms;
      formsAdded += forms.length;
    }

    // --- processes, likewise new ---------------------------------------------
    const processes = processesFor(title, summary);
    if (processes.length) {
      impact.processes = processes;
      processesAdded += processes.length;
    }

    // COMPLETENESS IS DELIBERATELY LEFT ALONE.
    //
    // An earlier version of this pass flipped every record from "unspecified"
    // to "partial" on the reasoning that the record had now been examined.
    // That was wrong, and the test suite caught it: through stateFor(),
    // "partial" plus an empty list reads as not_applicable — "we read this
    // document and it names no visa". This pass reads titles and summaries,
    // because that is all the archive stores. Saying a document names nothing
    // on the strength of not having read it is the exact overclaim this
    // product exists to avoid, and it would have converted 490 honest
    // not_classified answers into false negatives that look authoritative.
    //
    // completeness is a claim about what INGESTION saw. Only ingestion can
    // raise it.
  }

  completenessUntouched = events.filter((e) => (e.impact?.completeness ?? "unspecified") === "unspecified").length;

  const withVisa = events.filter((e) => (e.impact?.visaCategories ?? []).length > 0).length;
  const withForms = events.filter((e) => (e.impact?.forms ?? []).length > 0).length;
  const withProcesses = events.filter((e) => (e.impact?.processes ?? []).length > 0).length;
  const strong = events.filter((e) =>
    (e.impact?.visaCategories ?? []).some((v) => v.method && v.method !== "derived_weak")
  ).length;

  console.log("RECLASSIFY");
  console.log(`  records                      ${events.length}`);
  console.log(`  visa classifications added   ${added}`);
  console.log(`  re-graded                    ${regraded} (of which demoted to weak: ${demoted})`);
  console.log(`  form classifications added   ${formsAdded} across ${withForms} records`);
  console.log(`  country classifications graded ${countriesGraded}`);
  console.log(`  evidence quotes normalized     ${quotesCleaned}`);
  console.log(`  records with a visa now      ${withVisa}`);
  console.log(`  ... at least one strong      ${strong}`);
  console.log(`  process classifications added ${processesAdded} across ${withProcesses} records`);
  console.log(`  form matchers available      ${FORM_MATCHERS.length} · process matchers ${PROCESSES.length}`);
  console.log(`  still completeness=unspecified ${completenessUntouched}  (an empty list there means nobody established one)`);
  console.log("\nEXAMPLES");
  for (const x of examples) console.log(`  ${x}`);

  if (WRITE) {
    writeFileSync(PATH, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`\nWROTE ${PATH}`);
  } else {
    console.log("\nDRY RUN — nothing written. Pass --write to apply.");
  }
}

main();
