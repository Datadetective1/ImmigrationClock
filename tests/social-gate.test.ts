// =============================================================================
// THE GATE — what a scheduled firing does before it costs anything
//
// scripts/social-gate.ts runs before `npm ci` and before any API call. These
// tests run the real script, at chosen instants, against fixture ledgers and
// event indexes, and read only its exit code and message. Nothing here can
// publish: the gate has no publisher, and it is the step that decides whether
// the publishing steps run at all.
// =============================================================================

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { EMPTY_POST_LEDGER, appendRecords, serializePostLedger, type PostRecord } from "@/lib/social/ledger";

const TSX = resolve("node_modules/.bin/tsx");
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "social-gate-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function row(over: Partial<PostRecord>): PostRecord {
  return {
    localDate: "2026-10-09",
    localTime: "09:03",
    runAtUtc: "2026-10-09T14:03:00.000Z",
    slot: "daily",
    pool: "news",
    platform: "x",
    decision: "POSTED",
    reason: "Published",
    subjectId: "event:posted",
    subjectLabel: "Posted",
    angle: "breaking_change",
    score: 1,
    text: "x",
    deepLink: "/what-changed/x",
    externalId: null,
    externalUrl: null,
    model: null,
    promptVersion: null,
    validatorVersion: null,
    factsHash: null,
    approvalId: null,
    approvedBy: null,
    topicKey: null,
    topicFamily: null,
    category: null,
    readerValue: null,
    readerValueExplain: null,
    treatment: null,
    adjustedScore: null,
    rotationExplain: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    attempts: null,
    ...over,
  };
}

/** Run the gate at `now` with this ledger and event index. */
function gate(now: string, rows: PostRecord[], events: { id: string; severity: string; publishedAt: string }[] = []) {
  const ledgerPath = join(dir, `ledger-${Math.abs(hash(now + JSON.stringify(rows)))}.json`);
  const eventsPath = join(dir, `events-${Math.abs(hash(JSON.stringify(events)))}.json`);
  writeFileSync(ledgerPath, serializePostLedger(appendRecords(EMPTY_POST_LEDGER, rows)));
  writeFileSync(eventsPath, JSON.stringify({ events }));
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH,
    SOCIAL_GATE_NOW: now,
    SOCIAL_POST_LEDGER: ledgerPath,
    SOCIAL_EVENTS_INDEX: eventsPath,
  };
  try {
    const out = execFileSync(TSX, ["scripts/social-gate.ts"], { env, encoding: "utf8" });
    return { open: true, out };
  } catch (err) {
    const e = err as { status: number; stdout: string };
    if (e.status !== 1) throw err;
    return { open: false, out: e.stdout };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

describe("the scheduled firings of a day", () => {
  it("opens the daily window at the first firing, 09:03 CDT", () => {
    const r = gate("2026-10-09T14:03:00Z", []);
    expect(r.open).toBe(true);
    expect(r.out).toMatch(/Window open: daily/);
  });

  it("stops the CST twin of that firing, which lands at 08:03 in winter", () => {
    const r = gate("2026-12-09T14:03:00Z", []);
    expect(r.open).toBe(false);
    expect(r.out).toMatch(/No window open at 2026-12-09 08:03/);
  });

  it("opens at 09:03 CST in winter", () => {
    expect(gate("2026-12-09T15:03:00Z", []).open).toBe(true);
  });

  it("stops every later daily firing once the day's post is out", () => {
    const r = gate("2026-10-09T16:03:00Z", [row({})]);
    expect(r.open).toBe(false);
    expect(r.out).toMatch(/already published today/);
  });

  it("stops every later firing the day X refused for an empty balance", () => {
    const refused = row({
      decision: "SKIPPED_PUBLISH_FAILED",
      reason: "X API credits depleted (HTTP 402). Top up the pay-per-use balance in the X developer portal.",
    });
    const r = gate("2026-10-09T16:03:00Z", [refused]);
    expect(r.open).toBe(false);
    expect(r.out).toMatch(/HTTP 402/);
    // The next day starts fresh.
    expect(gate("2026-10-10T14:03:00Z", [refused]).open).toBe(true);
  });

  it("retries a transient failure at the next firing", () => {
    const down = row({ decision: "SKIPPED_PUBLISH_FAILED", reason: "X returned HTTP 503" });
    expect(gate("2026-10-09T16:03:00Z", [down]).open).toBe(true);
  });
});

describe("the breaking checks", () => {
  const at = "2026-10-09T21:03:00Z"; // 16:03 CDT

  it("stop before installing anything on a day with no major development", () => {
    const r = gate(at, [row({})], [
      { id: "notable", severity: "notable", publishedAt: "2026-10-09" },
      { id: "old-major", severity: "major", publishedAt: "2026-10-01" },
    ]);
    expect(r.open).toBe(false);
    expect(r.out).toMatch(/no major development from today or yesterday is unposted/);
  });

  it("stop when the only major development is the one the daily post covered", () => {
    const r = gate(at, [row({ subjectId: "event:big" })], [{ id: "big", severity: "major", publishedAt: "2026-10-09" }]);
    expect(r.open).toBe(false);
  });

  it("open for an unposted major development from today or yesterday", () => {
    const r = gate(at, [row({})], [{ id: "big", severity: "major", publishedAt: "2026-10-08" }]);
    expect(r.open).toBe(true);
    expect(r.out).toMatch(/Window open: breaking/);
  });

  it("stop once the day's breaking post is out", () => {
    const r = gate(at, [row({}), row({ slot: "breaking", runAtUtc: "2026-10-09T19:03:00.000Z" })], [
      { id: "big", severity: "major", publishedAt: "2026-10-09" },
    ]);
    expect(r.open).toBe(false);
  });
});
