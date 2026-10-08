// =============================================================================
// PIPELINE HEALTH
//
// 2026-10-08: the homepage's newest change read September 30 for a week while
// every workflow was green. Ingestion was healthy; a severity rule hid what it
// ingested, and nothing distinguished "quiet" from "broken". These tests pin
// the five states, the carry-forward that makes "last success" meaningful, the
// public file's contents, and the archive-level consequence of the fix.
// =============================================================================
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  buildHealth,
  evaluateHealth,
  lastCheckedSentence,
  STALE_AFTER_HOURS,
  type AdapterRun,
  type PipelineHealth,
} from "@/lib/pipeline-health";
import { __testing as FR } from "@/domains/graph/adapters/federal-register";

const NOW = "2026-10-08T12:00:00.000Z";

const run = (over: Partial<AdapterRun> = {}): AdapterRun => ({
  key: "federal-register",
  name: "Federal Register",
  lastRunAt: NOW,
  ok: true,
  eventCount: 10,
  newCount: 0,
  latestPublishedAt: "2026-10-07",
  warnings: [],
  ...over,
});

const ev = (id: string, publishedAt: string, severity = "notable") => ({ id, title: id, publishedAt, severity });

function health(over: Parameters<typeof buildHealth>[0] extends infer I ? Partial<I> : never = {}): PipelineHealth {
  return buildHealth({
    now: NOW,
    adapters: [run()],
    events: [ev("a", "2026-10-06")],
    addedIds: new Set(),
    previous: null,
    ...over,
  });
}

describe("evaluateHealth — the five states", () => {
  it("healthy_new: checked recently and a significant change inside the window", () => {
    expect(evaluateHealth(health(), NOW).state).toBe("healthy_new");
  });

  it("healthy_quiet: checked recently, nothing significant lately — not an alert", () => {
    const h = health({ events: [ev("old", "2026-09-01"), ev("r", "2026-10-07", "routine")] });
    const v = evaluateHealth(h, NOW);
    expect(v.state).toBe("healthy_quiet");
    expect(v.alert).toBe(false);
  });

  it("routine records never make a quiet week look active", () => {
    const h = health({ events: [ev("r1", "2026-10-07", "routine"), ev("r2", "2026-10-06", "routine")] });
    expect(evaluateHealth(h, NOW).state).toBe("healthy_quiet");
  });

  it("stale: no successful check within the threshold", () => {
    const later = new Date(Date.parse(NOW) + (STALE_AFTER_HOURS + 1) * 3_600_000).toISOString();
    const v = evaluateHealth(health(), later);
    expect(v.state).toBe("stale");
    expect(v.alert).toBe(true);
  });

  it("source_failure: a configured source failing twice in a row", () => {
    const first = health({ adapters: [run({ ok: false })], previous: health() });
    expect(evaluateHealth(first, NOW).state).not.toBe("source_failure"); // one blip is not an incident
    const second = health({ adapters: [run({ ok: false })], previous: first });
    expect(second.sources[0].consecutiveFailures).toBe(2);
    expect(evaluateHealth(second, NOW).state).toBe("source_failure");
  });

  it("publish_failure: the repo has a newer check than production serves", () => {
    const repo = health();
    const live = { ...repo, lastBuildAt: "2026-10-07T00:00:00.000Z", lastSuccessfulIngestion: "2026-10-07T00:00:00.000Z" };
    expect(evaluateHealth(repo, NOW, live).state).toBe("publish_failure");
  });

  it("does not call a fresh live build a publish failure", () => {
    const repo = health();
    expect(evaluateHealth(repo, NOW, { ...repo, lastBuildAt: NOW }).state).toBe("healthy_new");
  });
});

describe("buildHealth", () => {
  it("does not count an unconfigured source as failing or as checked", () => {
    const h = health({
      adapters: [run(), run({ key: "congress", name: "Congress", eventCount: 0, warnings: ["CONGRESS_API_KEY is not set, so Congress is not being ingested."] })],
    });
    expect(h.counts.sourcesConfigured).toBe(1);
    expect(h.sources.find((s) => s.key === "congress")!.configured).toBe(false);
  });

  it("carries the last success forward across a failure", () => {
    const ok = health();
    const failed = buildHealth({ now: "2026-10-09T12:00:00.000Z", adapters: [run({ ok: false, lastRunAt: "2026-10-09T12:00:00.000Z" })], events: [], addedIds: new Set(), previous: ok });
    expect(failed.sources[0].lastSuccessAt).toBe(NOW);
    expect(failed.lastSuccessfulSourceCheck).toBe(NOW);
    expect(failed.lastAttemptedIngestion).toBe("2026-10-09T12:00:00.000Z");
  });

  it("keeps publication date and acceptance date apart", () => {
    const h = health({ events: [ev("new", "2026-10-01")], addedIds: new Set(["new"]) });
    expect(h.lastAcceptedRecord).toMatchObject({ id: "new", publishedAt: "2026-10-01", acceptedAt: NOW });
  });

  it("never publishes warning text, which can name environment variables", () => {
    const h = health({ adapters: [run({ warnings: ["CONGRESS_API_KEY is not set"] })] });
    expect(JSON.stringify(h)).not.toContain("CONGRESS_API_KEY");
    expect(h.sources[0].warningCount).toBe(1);
  });
});

describe("the public last-checked sentence", () => {
  it("says what the date is, and what it is not", () => {
    const s = lastCheckedSentence({ lastSuccessfulSourceCheck: NOW, lastSuccessfulIngestion: NOW }, (d) => d.slice(0, 10))!;
    expect(s).toMatch(/last checked 2026-10-08/);
    expect(s).toMatch(/not the date of a change/);
  });
});

describe("the committed archive", () => {
  const store = JSON.parse(readFileSync(resolve("src/lib/generated/events.json"), "utf8")) as {
    events: { id: string; sourceKey: string; title: string; classification: string; severity: string }[];
  };

  it("holds no status- or fee-changing Federal Register notice ranked routine", () => {
    // The 2026-10-08 defect, checked against the data rather than the rule: the
    // build re-scores stored notices, so a regression here means that step was
    // removed or bypassed.
    const hidden = store.events.filter(
      (e) =>
        e.sourceKey === "federal_register" &&
        e.classification === "announcement" &&
        e.severity === "routine" &&
        FR.noticeChangesStatusOrFees(e.title)
    );
    expect(hidden.map((e) => e.id)).toEqual([]);
  });

  it("ships a health record with the public endpoint", () => {
    const pub = JSON.parse(readFileSync(resolve("public/api/health.json"), "utf8")) as PipelineHealth;
    expect(pub.schema).toBe(1);
    expect(pub.sources.length).toBeGreaterThan(0);
  });
});
