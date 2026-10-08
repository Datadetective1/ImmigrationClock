// =============================================================================
// scripts/build-health.ts — write the pipeline health record
//
//   npm run build:health        (runs in prebuild, after build-events)
//
// Reads what build-events just wrote, carries last-success timestamps forward
// from the previous health file, and writes:
//
//   src/lib/generated/pipeline-health.json   read by the site at build time
//   public/api/health.json                    the same record, served publicly
//                                             so the monitor workflow can read
//                                             what PRODUCTION actually deployed
//
// Never fails the build. Health reporting that can take the site down is worse
// than none; a problem here is logged and the previous file is left in place.
// See src/lib/pipeline-health.ts for the states and thresholds.
// =============================================================================

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { buildHealth, evaluateHealth, type PipelineHealth } from "../src/lib/pipeline-health";

const EVENTS = resolve("src/lib/generated/events.json");
const OUT = resolve("src/lib/generated/pipeline-health.json");
const PUBLIC_OUT = resolve("public/api/health.json");

function readJson<T>(path: string): T | null {
  try {
    return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : null;
  } catch {
    return null;
  }
}

try {
  const store = readJson<{
    generatedAt: string;
    adapters: Parameters<typeof buildHealth>[0]["adapters"];
    addedIds?: string[];
    events: { id: string; title: string; publishedAt: string; severity: string }[];
  }>(EVENTS);
  if (!store) throw new Error("events.json missing or unreadable");

  const previous = readJson<PipelineHealth>(OUT);
  const health = buildHealth({
    now: store.generatedAt,
    adapters: store.adapters ?? [],
    events: store.events ?? [],
    addedIds: new Set(store.addedIds ?? []),
    previous,
  });

  const json = JSON.stringify(health, null, 2) + "\n";
  for (const p of [OUT, PUBLIC_OUT]) {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, json, "utf8");
  }

  const verdict = evaluateHealth(health, health.generatedAt);
  console.log(
    `[build-health] ${verdict.state} — ${health.counts.sourcesConfigured - health.counts.sourcesFailing}/` +
      `${health.counts.sourcesConfigured} sources ok; newest significant ` +
      `${health.latestSignificantRecord?.publishedAt ?? "none"}; last accepted ` +
      `${health.lastAcceptedRecord?.id ?? "none"}`
  );
  for (const r of verdict.reasons) console.log(`  - ${r}`);
} catch (err) {
  console.warn(`[build-health] skipped: ${(err as Error).message}. Previous health file left in place.`);
}
