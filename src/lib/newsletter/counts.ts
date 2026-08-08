// =============================================================================
// CANONICAL COUNTS — one dataset, one set of numbers
//
// THE BUG THIS EXISTS TO PREVENT
// ------------------------------
// The first production issue (2026-08-08) went out saying "5 changes" in its
// subject and "This week brought 5 official immigration updates" in its
// opening, while "By the numbers" reported 6 — 4 USCIS policy updates,
// 1 Federal Register document, 1 court decision.
//
// Both numbers were true and they were computed from different stages of the
// same pipeline:
//
//   stats: statsFor(inWindow)        ← all 6 eligible events in the window
//   items: rest.slice(0, MAX_ITEMS)  ← the 5 the issue actually renders
//
// Nothing was double-counted and nothing leaked. The sixth event — a narrow
// USCIS policy alert about children born to foreign diplomatic officers —
// ranked sixth and fell outside the five-story cap, but the statistics were
// derived before the cap was applied.
//
// So the counts never disagreed about the data. They disagreed about which
// question they were answering: "how many changes did we record" and "how many
// stories are in this issue" are different questions with different answers,
// and the template presented both as though they were the same one.
//
// THE FIX IS NOT ONE NUMBER
// -------------------------
// Collapsing them would be worse. Reporting only the shown count hides changes
// the archive holds; reporting only the recorded count promises five stories
// and prints them alongside a six. Both facts belong in the issue.
//
// What was missing is that the distinction was never stated. Every count now
// derives from ONE canonical set, carries an explicit name for what it counts,
// and the copy says so whenever the two differ.
//
// CATEGORIES ARE A PARTITION
// --------------------------
// The old category counts were overlapping facets computed on different axes:
// `uscis_policy` by source, `court_decisions` by classification,
// `dhs_announcements` by entity link. A DHS-issued Federal Register rule
// counted in two of them. They summed to the total on 2026-08-08 by luck.
//
// A reader adds a printed list up. So the buckets below are assigned by
// precedence and each event lands in exactly one, which makes the sum a fact
// rather than a coincidence.
// =============================================================================

import type { ImmigrationEvent } from "@/domains/graph/events";

export interface IssueStat {
  key: string;
  value: number;
}

export interface IssueCounts {
  /** Every eligible change in the window, after filtering and de-duplication. */
  recorded: number;
  /** How many of those the issue actually renders. Never greater than `recorded`. */
  shown: number;
  /** recorded - shown. Zero when the issue carries everything it found. */
  omitted: number;
  /** A strict partition of `recorded`: every bucket disjoint, summing exactly. */
  categories: IssueStat[];
  /** Categories worth reporting as zero. */
  absent: string[];
}

/**
 * Which single bucket an event belongs to.
 *
 * Precedence, most specific first. A court decision is a court decision even
 * though a court is not an agency; an executive action outranks the register it
 * was published in. Order is the definition — changing it changes the numbers,
 * so it is stated once, here.
 */
export function categoryOf(e: ImmigrationEvent): string {
  if (e.classification === "court_decision") return "court_decisions";
  if (e.classification === "executive_action") return "executive_actions";
  if (e.sourceKey.startsWith("uscis")) return "uscis_policy";
  if (e.sourceKey === "federal_register") return "federal_register";
  if (e.entities.some((l) => l.entityId === "agency:dhs")) return "dhs_announcements";
  return "other_changes";
}

/** Categories worth saying were ZERO — reassurance a reader actively wants. */
const REPORT_ABSENT = ["executive_actions", "court_decisions"] as const;

/**
 * De-duplicate by stable id.
 *
 * Two adapters can legitimately surface the same document — a USCIS newsroom
 * post about a Federal Register rule, say — and ids are stable per source, so
 * this catches a genuine repeat rather than a near-match. Done here, once, so
 * every count downstream sees the same set.
 */
export function dedupe(events: ImmigrationEvent[]): ImmigrationEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
}

/**
 * Derive every user-facing number from one dataset.
 *
 * `selected` is the canonical set: in-window, eligible, de-duplicated.
 * `shownIds` are the ones the issue renders.
 */
export function canonicalCounts(selected: ImmigrationEvent[], shownIds: Set<string>): IssueCounts {
  const canonical = dedupe(selected);
  const tally = new Map<string, number>();
  for (const e of canonical) {
    const k = categoryOf(e);
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }

  const categories = [...tally.entries()]
    .map(([key, value]) => ({ key, value }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));

  const shown = canonical.filter((e) => shownIds.has(e.id)).length;

  return {
    recorded: canonical.length,
    shown,
    omitted: canonical.length - shown,
    categories,
    absent: REPORT_ABSENT.filter((k) => !tally.has(k)),
  };
}

/**
 * Does this set of counts hold together?
 *
 * Returns the problems, empty when sound. Called by validation so an issue
 * whose numbers contradict each other cannot be sent — the defect that reached
 * subscribers on 2026-08-08 was invisible to every gate in the pipeline
 * because no gate compared two numbers to each other.
 */
export function countInconsistencies(counts: IssueCounts): string[] {
  const problems: string[] = [];
  const sum = counts.categories.reduce((n, c) => n + c.value, 0);

  if (sum !== counts.recorded) {
    problems.push(
      `category counts sum to ${sum} but ${counts.recorded} changes were recorded — ` +
        "a reader adding up the printed list gets a different answer from the total"
    );
  }
  if (counts.shown > counts.recorded) {
    problems.push(`the issue renders ${counts.shown} stories but only ${counts.recorded} changes were recorded`);
  }
  if (counts.omitted !== counts.recorded - counts.shown) {
    problems.push("omitted count does not reconcile with recorded minus shown");
  }
  if (counts.recorded < 0 || counts.shown < 0) {
    problems.push("negative count");
  }
  for (const c of counts.categories) {
    if (c.value <= 0) problems.push(`category "${c.key}" is listed with a non-positive value`);
    if (counts.absent.includes(c.key)) {
      problems.push(`category "${c.key}" is reported both present and absent`);
    }
  }
  return problems;
}
