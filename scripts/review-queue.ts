// =============================================================================
// scripts/review-queue.ts — what a human should look at, in order
//
//   npm run review:queue
//   npm run review:queue -- --limit=40 --since=2026-08-01
//
// THE PROBLEM THIS SOLVES
// -----------------------
// Every one of the 544 records carries `reviewStatus: "auto"`. Nothing has been
// human-verified, and nothing in the product claims otherwise — the API returns
// `verification: "auto"` truthfully. But "nobody has checked any of it" is not
// a position a B2B monitoring product can hold indefinitely, and "check all 544"
// is not a task anyone will start.
//
// So this ranks. A human reviewing the top twenty rows covers the records that
// a subscriber is most likely to act on, and the ranking is stated rather than
// mysterious:
//
//   in force soon    a future effective date is the one thing a reader plans
//                    around, and getting it wrong is the costliest error here
//   material         major severity, as the archive already classifies it
//   recent           published in the last 30 days
//   consequential    a final rule, an executive action or a court decision,
//                    rather than a statistical release
//   weakly tagged    classified on a dimension where the evidence quote does
//                    not appear in the title or summary — the shape that
//                    produced an H-2A wage rule tagged visa:h-1b from a
//                    footnote about section 212(p)
//
// WHAT IT DOES NOT DO: it does not change any record, and it cannot mark
// anything reviewed. Marking requires a person, and a script that could set
// `reviewStatus: "approved"` on its own would make the field a lie. Promoting a
// record is a commit to the store by a human who read the source.
// =============================================================================

import { isStrong } from "../src/domains/graph/classification";
import { EVENTS } from "../src/lib/event-store";
import type { ImmigrationEvent } from "../src/domains/graph/events";

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const TODAY = new Date().toISOString().slice(0, 10);
const LIMIT = Number(arg("limit", "25"));
const SINCE = arg("since");

interface Scored {
  event: ImmigrationEvent;
  score: number;
  reasons: string[];
}

/** Days from today. Negative means the future. */
function daysFromToday(date: string): number {
  return Math.round((Date.parse(TODAY) - Date.parse(date)) / 86_400_000);
}

/**
 * Classifications the grader marked weak — drawn from a citation, a footnote
 * or a historical aside rather than from the document's own subject. Those are
 * where the false positives were found, so they are worth a human's attention
 * first.
 *
 * ONE DEFINITION OF WEAK. This function used to re-derive weakness by checking
 * whether the value appeared in the title or summary, which was a second,
 * slightly different classifier living in a review script. It now reads the
 * `method` the grader recorded, so what the queue calls weak and what the API
 * excludes from a default filter are the same set by construction.
 */
function weakClassifications(e: ImmigrationEvent): string[] {
  const weak: string[] = [];
  for (const dimension of ["visaCategories", "countries", "forms"] as const) {
    const list = (e.impact as Record<string, unknown> | undefined)?.[dimension] as
      | { entityId: string; method?: string }[]
      | undefined;
    for (const entry of list ?? []) {
      if (!isStrong(entry.method)) weak.push(entry.entityId);
    }
  }
  return weak;
}

function score(e: ImmigrationEvent): Scored {
  const reasons: string[] = [];
  let score = 0;

  if (e.effectiveAt && e.effectiveAt > TODAY) {
    const days = -daysFromToday(e.effectiveAt);
    score += days <= 30 ? 100 : 60;
    reasons.push(`takes effect in ${days}d (${e.effectiveAt})`);
  }
  if (e.severity === "major") {
    score += 40;
    reasons.push("major");
  }
  const age = daysFromToday(e.publishedAt);
  if (age <= 30) {
    score += 30;
    reasons.push(`published ${age}d ago`);
  }
  if (["final_rule", "executive_action", "court_decision"].includes(e.classification)) {
    score += 25;
    reasons.push(e.classification.replace(/_/g, " "));
  }
  const weak = weakClassifications(e);
  if (weak.length) {
    score += 35;
    reasons.push(`weak tag: ${weak.join(", ")} — evidence reads as a citation or an aside`);
  }
  return { event: e, score, reasons };
}

function main() {
  const pool = (EVENTS as ImmigrationEvent[]).filter((e) => (SINCE ? e.publishedAt >= SINCE : true));
  const ranked = pool
    .map(score)
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.event.publishedAt.localeCompare(a.event.publishedAt));

  const rule = "─".repeat(78);
  console.log(rule);
  console.log(`REVIEW QUEUE · ${TODAY} · ${pool.length} records considered, ${ranked.length} scored`);
  console.log(`Every record is reviewStatus="auto". Nothing here has been read by a person.`);
  console.log(rule);

  for (const [i, s] of ranked.slice(0, LIMIT).entries()) {
    console.log(`\n${String(i + 1).padStart(3)}. [${String(s.score).padStart(3)}] ${s.event.title.slice(0, 68)}`);
    console.log(`     ${s.event.sourceKey} · ${s.event.classification} · published ${s.event.publishedAt}`);
    console.log(`     why: ${s.reasons.join(" · ")}`);
    console.log(`     source: ${s.event.sourceUrl}`);
  }

  const weakTotal = pool.filter((e) => weakClassifications(e).length > 0).length;
  const upcoming = pool.filter((e) => e.effectiveAt && e.effectiveAt > TODAY).length;

  console.log(`\n${rule}`);
  console.log(`Records with a future effective date : ${upcoming}`);
  console.log(`Records with a weakly-evidenced tag  : ${weakTotal}`);
  console.log(`Reviewing the top 20 rows covers the records a subscriber is most likely to act on.`);
  console.log(`Marking one verified is a human editing the record and committing it — this script cannot.`);
}

main();
