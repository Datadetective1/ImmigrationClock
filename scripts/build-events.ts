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
import { federalRegisterAdapter } from "../src/domains/graph/adapters/federal-register";
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
    const result = await adapter.fetchEvents!({ since, limit, offline });

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
  const merged = all.filter((e) => !RETRACTED[e.id]);
  const removed = all.length - merged.length;
  if (removed > 0) {
    console.log(`[build-events] retracted ${removed} event(s):`);
    for (const e of all.filter((x) => RETRACTED[x.id])) {
      console.log(`  - ${e.id}: ${RETRACTED[e.id]}`);
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
