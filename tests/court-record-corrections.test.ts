// =============================================================================
// STORED COURT RECORDS — corrected where checking them against CourtListener
// (2026-11-13) found them wrong. Fresh fetches cannot reach these events, so
// the build re-applies the corrections to what is already in the store.
// =============================================================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { correctStoredCourtRecord } from "@/domains/graph/court-record-corrections";
import { validateEvent, type ImmigrationEvent } from "@/domains/graph/events";

const store = JSON.parse(readFileSync(join(process.cwd(), "src/lib/generated/events.json"), "utf8")) as {
  events: ImmigrationEvent[];
};
const byId = (id: string) => store.events.find((e) => e.id === id)!;
const build = readFileSync(join(process.cwd(), "scripts/build-events.ts"), "utf8");

describe("stored court-record corrections", () => {
  it("reclassifies the DOJ press release that named the Alien Terrorist Removal Court", () => {
    const e = byId("uscis_newsroom:85cbcecc-cce6-483c-9e98-1dd737e7c1a8");
    const fixed = correctStoredCourtRecord(e);
    expect(fixed.classification).not.toBe("court_decision");
    expect(validateEvent(fixed)).toEqual([]);
  });

  it("rewrites the Supreme Court stay ruling's description, and nothing else about it", () => {
    const e = byId("federal_courts:10983722");
    const fixed = correctStoredCourtRecord(e);
    expect(fixed.summary).toMatch(/order on an application/);
    expect(`${fixed.summary} ${fixed.limitations?.join(" ")}`).not.toMatch(/precedent in its (own )?circuit/);
    expect({ ...fixed, summary: e.summary, limitations: e.limitations }).toEqual(e);
    expect(validateEvent(fixed)).toEqual([]);
  });

  it("leaves every genuine court record as it is", () => {
    for (const e of store.events) {
      if (["uscis_newsroom:85cbcecc-cce6-483c-9e98-1dd737e7c1a8", "federal_courts:10983722"].includes(e.id)) continue;
      expect(correctStoredCourtRecord(e), e.id).toBe(e);
    }
  });

  it("retracts the duplicate Dorcas order and runs the corrections in the build", () => {
    expect(build).toContain('"federal_courts:10948750":');
    expect(build).toContain(".map(correctStoredCourtRecord)");
  });
});
