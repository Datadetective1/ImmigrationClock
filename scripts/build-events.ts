#!/usr/bin/env tsx
/**
 * EVENT STORE BUILD — the heart of ImmigrationClock.
 *
 * Runs every runnable source adapter, validates what they produce, merges it
 * with the events already committed, and writes src/lib/generated/events.json.
 *
 * DESIGN RULES
 * ------------
 * 1. MERGE, NEVER REPLACE. Events are historical facts. A source that goes down,
 *    changes its API, or drops a document from its feed must not erase what we
 *    already recorded — the archive is the point. Existing events are retained;
 *    a re-ingested event updates in place by its stable id.
 *
 * 2. NEVER PUBLISH AN INVALID EVENT. validateEvent() runs on everything. A
 *    malformed event is dropped with a loud warning rather than shipped, and the
 *    build fails if a runnable adapter produces nothing but errors.
 *
 * 3. FAILURE IS SURVIVABLE, NOT SILENT. If every adapter fails we keep the
 *    committed store and exit non-zero, so the site stays up on last-good data
 *    while CI reports the problem. Same contract as build-warn.ts, and the
 *    opposite of build-employers.ts before its 2026-08 fix.
 *
 * Usage:
 *   npm run build:events            # incremental, last 90 days
 *   EVENTS_SINCE=2026-01-01 npm run build:events
 *   EVENTS_OFFLINE=1 npm run build:events   # validate the store without network
 *   EVENTS_LIMIT=500 npm run build:events   # raise the per-adapter cap
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runnableAdapters, ADAPTERS } from "../src/domains/graph/adapters";
import { federalRegisterAdapter, __testing as frTesting } from "../src/domains/graph/adapters/federal-register";
const { isImmigrationRelevant } = frTesting;
import { executiveActionsAdapter } from "../src/domains/graph/adapters/executive-actions";
import { uscisNewsroomAdapter } from "../src/domains/graph/adapters/uscis-newsroom";
import { uscisPolicyManualAdapter } from "../src/domains/graph/adapters/uscis-policy-manual";
import { federalCourtsAdapter } from "../src/domains/graph/adapters/federal-courts";
import { congressAdapter } from "../src/domains/graph/adapters/congress";
import { cbpEncountersAdapter } from "../src/domains/graph/adapters/cbp-encounters";
import { dolOflcAdapter } from "../src/domains/graph/adapters/dol-oflc";
import { validateEvent, dedupeEvents, sortEvents, type ImmigrationEvent } from "../src/domains/graph/events";

const OUT = fileURLToPath(new URL("../src/lib/generated/events.json", import.meta.url));

/**
 * A slim companion to the store, written for the BROWSER.
 *
 * /what-changed needs to search and filter the whole archive, which on a static
 * site means the data has to reach the client. The full store is 332KB at 190
 * events and grows without bound — shipping it would put the entire archive,
 * every evidence quote and limitation, into a page bundle.
 *
 * The index carries only what a result row needs, which is roughly a quarter of
 * the size. It is generated HERE, by the same run that writes the store, so the
 * two cannot drift: there is no second pipeline to forget to run.
 */
const INDEX_OUT = fileURLToPath(new URL("../src/lib/generated/events-index.json", import.meta.url));

/** Summary length in the index. Enough to recognise an event, not to replace it. */
const INDEX_SUMMARY_CHARS = 220;

/**
 * Hard ceiling on what /what-changed ships to the browser.
 *
 * 400KB uncompressed is roughly 80KB over the wire, and tests/event-index.test.ts
 * asserts it. The archive grows without bound; this does not. When the two
 * collide the index gets SHORTER — the store keeps every event, and the page
 * says which window search covers.
 *
 * Truncating silently would be the same class of error as the Federal Register
 * page-one bug: a reader searching the "whole archive" and finding nothing would
 * conclude the event never happened. So the cut is reported in the index file
 * itself and rendered on the page.
 */
const INDEX_BUDGET_BYTES = 400 * 1024;
/** Leave headroom so a single long title cannot tip the file over the budget. */
const INDEX_TARGET_BYTES = Math.floor(INDEX_BUDGET_BYTES * 0.95);

function buildIndex(events: ImmigrationEvent[]) {
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    publishedAt: e.publishedAt,
    effectiveAt: e.effectiveAt ?? null,
    scheduled: e.scheduled ?? false,
    severity: e.severity,
    classification: e.classification,
    sourceKey: e.sourceKey,
    sourceUrl: e.sourceUrl,
    summary:
      e.summary.length > INDEX_SUMMARY_CHARS
        ? `${e.summary.slice(0, INDEX_SUMMARY_CHARS).trimEnd()}…`
        : e.summary,
    // Entity ids power "does this affect me" filtering by country, visa, or
    // agency without shipping the whole impact record.
    entityIds: [...new Set(e.entities.map((l) => l.entityId))],
  }));
}

/**
 * Adapter implementations, attached to their registry entries.
 *
 * The registry declares all sixteen sources; this is where the built ones get
 * their `fetchEvents`. Adding an adapter means one import and one line here.
 */
const IMPLEMENTATIONS = [
  federalRegisterAdapter,
  executiveActionsAdapter,
  uscisNewsroomAdapter,
  uscisPolicyManualAdapter,
  federalCourtsAdapter,
  congressAdapter,
  cbpEncountersAdapter,
  dolOflcAdapter,
];

function attachImplementations() {
  for (const impl of IMPLEMENTATIONS) {
    const entry = ADAPTERS.find((a) => a.key === impl.key);
    if (entry) entry.fetchEvents = impl.fetchEvents;
  }
}

/**
 * RETRACTIONS — the escape hatch that merge-never-replace requires.
 *
 * Rule 1 says a source dropping a document must not erase what we recorded.
 * That is right for outages, and wrong for our own mistakes: when an adapter's
 * relevance filter is too loose, the junk it ingested is preserved forever and
 * no amount of fixing the filter removes it. Tightening a filter would silently
 * become a no-op for everything already in the store.
 *
 * So retraction is explicit rather than automatic. An id lands here only by a
 * reviewed code change, it carries its reason, and it lives in git history — so
 * removing an event from the public store is as auditable as adding one. A
 * source outage still cannot delete anything, because an outage cannot edit
 * this file.
 */
const RETRACTED: Record<string, string> = {
  "federal_register:2026-15434":
    "Not an immigration document. An Administrative Procedure Act notice about petitioning DOJ to issue, amend, or repeal a regulation, ingested because the relevance filter matched the bare word 'petition'. The filter was narrowed on 2026-08-02; this removes the event it already admitted.",
};

/**
 * RULE-BASED RETRACTION — for when a filter bug admitted more than a list can hold.
 *
 * The id map above is the right instrument for a handful of mistakes. It is the
 * wrong one for 167, which is how many customs documents the Federal Register
 * adapter ingested because "U.S. Customs and Border Protection" contains the
 * word "border" (see withoutAgencyNames in that adapter). Pasting 167 ids here
 * would be unreviewable and would rot the moment the count changed.
 *
 * So the rule is expressed as the thing we actually mean: AN EVENT THE CURRENT
 * FILTER WOULD NOT ADMIT DOES NOT BELONG IN THE STORE. It stays auditable —
 * this is a reviewed code change with a stated reason, living in git history,
 * exactly like the map — and it self-corrects rather than needing a new id list
 * every time the filter is tightened.
 *
 * It applies ONLY to sources whose filter is re-runnable against stored fields.
 * A source outage still cannot delete anything, because an outage cannot edit
 * this file.
 */
const RETRACTION_RULES: { reason: string; applies: (e: ImmigrationEvent) => boolean }[] = [
  {
    reason:
      "Not an immigration document. Two generations of relevance filter admitted " +
      "these. The first read 'Customs and Border Protection' — the agency's own " +
      "name — as the topical term 'border' (measured 2026-08-03: 24% of Federal " +
      "Register events had no immigration signal except that name). The second " +
      "still matched bare substrings, so 'perm' matched 'permanent', 'permission' " +
      "and 'permit' and admitted 152 documents on its own — Coast Guard safety " +
      "zones, pension-plan exemptions, mine safety lamps — 64 of them ranked major. " +
      "Corrected 2026-08-08 by replacing substring matching with word-anchored " +
      "subject patterns plus a veto on document families that are never " +
      "immigration policy. This removes what the older filters had admitted.",
    applies: (e) =>
      e.sourceKey === "federal_register" &&
      !isImmigrationRelevant({ title: e.title, abstract: e.summary }),
  },
];

function retractionReason(e: ImmigrationEvent): string | null {
  if (RETRACTED[e.id]) return RETRACTED[e.id];
  for (const rule of RETRACTION_RULES) {
    if (rule.applies(e)) return rule.reason;
  }
  return null;
}

interface EventStoreFile {
  generatedAt: string;
  /** Events, newest first. */
  events: ImmigrationEvent[];
  /** Per-adapter outcome of the most recent run. Rendered on the status page. */
  adapters: {
    key: string;
    name: string;
    status: string;
    lastRunAt: string | null;
    ok: boolean;
    eventCount: number;
    warnings: string[];
  }[];
  /** How far back this run looked. */
  since: string;
  counts: { total: number; bySeverity: Record<string, number>; byClassification: Record<string, number> };
}

async function readExisting(): Promise<ImmigrationEvent[]> {
  if (!existsSync(OUT)) return [];
  try {
    const raw = JSON.parse(await readFile(OUT, "utf8")) as EventStoreFile;
    return raw.events ?? [];
  } catch {
    console.warn("[build-events] existing store unreadable; starting fresh");
    return [];
  }
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  attachImplementations();

  const since = process.env.EVENTS_SINCE || daysAgo(90);
  const offline = process.env.EVENTS_OFFLINE === "1";
  // Per-adapter cap, so one source cannot dominate a run. Raised from 100 after
  // a backfill showed USCIS silently losing 12 documents to it — the cap now
  // reports when it engages (see capEvents), and can be lifted for a deep
  // backfill without editing code.
  const limit = Number(process.env.EVENTS_LIMIT) || 250;
  const existing = await readExisting();
  // Advisory to adapters whose enrichment costs a request per item. See
  // AdapterContext.knownIds.
  const knownIds: ReadonlySet<string> = new Set(existing.map((e) => e.id));
  console.log(`[build-events] ${existing.length} event(s) already in the store; fetching since ${since}`);

  const adapters = runnableAdapters();
  if (adapters.length === 0) {
    console.error("[build-events] no runnable adapters — nothing to do");
    process.exit(1);
  }

  const fresh: ImmigrationEvent[] = [];
  const report: EventStoreFile["adapters"] = [];
  let anySucceeded = false;

  for (const adapter of adapters) {
    const result = await adapter.fetchEvents!({ since, limit, offline, knownIds });

    // Validate before anything reaches the store. A malformed event is dropped,
    // never published, and always reported.
    const valid: ImmigrationEvent[] = [];
    const invalidMessages: string[] = [];
    for (const e of result.events) {
      const errors = validateEvent(e);
      if (errors.length) invalidMessages.push(...errors);
      else valid.push(e);
    }

    if (invalidMessages.length) {
      console.warn(`[build-events] ${adapter.key}: dropped ${invalidMessages.length} invalid event(s)`);
      for (const m of invalidMessages.slice(0, 5)) console.warn(`  - ${m}`);
    }

    fresh.push(...valid);
    if (!result.failed) anySucceeded = true;

    report.push({
      key: adapter.key,
      name: adapter.name,
      status: adapter.status,
      lastRunAt: new Date().toISOString(),
      ok: !result.failed,
      eventCount: valid.length,
      warnings: [...result.warnings, ...invalidMessages.slice(0, 10)],
    });

    console.log(
      `[build-events] ${adapter.key}: ${valid.length} valid event(s)` +
        (result.failed ? " — FAILED" : "") +
        (result.warnings.length ? ` (${result.warnings.length} warning(s))` : "")
    );
  }

  if (!anySucceeded && !offline) {
    console.error(
      "[build-events] every adapter failed. Keeping the committed store so the site " +
        "stays on last-good data, but exiting non-zero so this is visible in CI."
    );
    process.exit(1);
  }

  // Merge: a freshly fetched event replaces its committed twin by stable id, and
  // everything previously recorded is retained. dedupeEvents keeps first-seen,
  // so fresh must come first.
  const all = sortEvents(dedupeEvents([...fresh, ...existing]));

  // Apply retractions last, so a re-ingested event cannot sneak a retracted id
  // back into the store.
  const merged = all.filter((e) => retractionReason(e) === null);
  const removed = all.length - merged.length;
  if (removed > 0) {
    // Group by reason: 167 identical lines is not a log, it is noise.
    const byReason = new Map<string, string[]>();
    for (const e of all) {
      const reason = retractionReason(e);
      if (!reason) continue;
      byReason.set(reason, [...(byReason.get(reason) ?? []), e.id]);
    }
    console.log(`[build-events] retracted ${removed} event(s):`);
    for (const [reason, ids] of byReason) {
      console.log(`  - ${ids.length} event(s): ${reason}`);
      for (const id of ids.slice(0, 5)) console.log(`      ${id}`);
      if (ids.length > 5) console.log(`      … and ${ids.length - 5} more`);
    }
  }

  const bySeverity: Record<string, number> = {};
  const byClassification: Record<string, number> = {};
  for (const e of merged) {
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
    byClassification[e.classification] = (byClassification[e.classification] ?? 0) + 1;
  }

  const payload: EventStoreFile = {
    generatedAt: new Date().toISOString(),
    since,
    adapters: report,
    counts: { total: merged.length, bySeverity, byClassification },
    events: merged,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");

  // The browser index, written from the same merged list in the same run.
  // `merged` is already newest-first, so trimming from the end drops the oldest.
  const full = buildIndex(merged);
  let index = full;
  const envelope = (events: typeof full) =>
    JSON.stringify({
      generatedAt: payload.generatedAt,
      // What the STORE holds, so the page can state how far search reaches
      // relative to the whole archive rather than presenting a window as the lot.
      storedTotal: merged.length,
      indexedTotal: events.length,
      oldestIndexed: events.length ? events[events.length - 1].publishedAt : null,
      events,
    });

  if (envelope(full).length > INDEX_TARGET_BYTES) {
    // Binary search for the largest prefix that fits. Cheaper and more exact
    // than guessing an average event size, which varies by a factor of three
    // between a CBP release and a Federal Register rule.
    let lo = 0;
    let hi = full.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (envelope(full.slice(0, mid)).length <= INDEX_TARGET_BYTES) lo = mid;
      else hi = mid - 1;
    }
    index = full.slice(0, lo);
  }

  const indexJson = envelope(index);
  await writeFile(INDEX_OUT, indexJson + "\n", "utf8");
  const dropped = full.length - index.length;
  console.log(
    `[build-events] wrote search index: ${index.length} event(s), ${(indexJson.length / 1024).toFixed(0)}KB` +
      (dropped > 0
        ? ` — ${dropped} older event(s) held in the store but not shipped to the browser ` +
          `(${(INDEX_BUDGET_BYTES / 1024).toFixed(0)}KB payload budget). The page discloses the window.`
        : "")
  );

  const added = merged.length - existing.length;
  console.log(
    `[build-events] wrote ${merged.length} event(s) (${added >= 0 ? "+" : ""}${added}) — ` +
      `${bySeverity.major ?? 0} major, ${bySeverity.notable ?? 0} notable, ${bySeverity.routine ?? 0} routine`
  );
}

main().catch((err) => {
  console.error(`[build-events] FAILED: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
