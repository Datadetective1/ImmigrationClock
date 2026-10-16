// =============================================================================
// THE LANDSCAPE — what the record shows per follow, and nothing more
// =============================================================================

import { describe, expect, it } from "vitest";
import { EVENTS } from "@/lib/event-store";
import type { ChangeInput } from "@/lib/intelligence/change";
import { buildLandscape } from "@/lib/pro/landscape";

const ALL = EVENTS as unknown as ChangeInput[];
const TODAY = "2026-10-16";
const byId = new Map(ALL.map((e) => [e.id, e] as const));
const BIOMETRIC_FEE = "federal_register:2026-16231";

describe("the landscape on real records", () => {
  const land = buildLandscape({ follows: ["visa:h-1b", "visa:f-1", "agency:dhs", "topic:h1b"], today: TODAY });

  it("calls nothing 'in force' and dates only what the record dates", () => {
    for (const f of land.follows) {
      for (const e of [...f.tookEffect, ...f.comingUp, ...f.proposals]) expect(e.status).not.toMatch(/in force/i);
      for (const e of f.tookEffect) {
        const r = byId.get(e.recordId)!;
        expect(["final_rule", "executive_action"]).toContain(r.classification);
        expect(r.effectiveAt!.slice(0, 10)).toBe(e.date);
        expect(e.date <= TODAY).toBe(true);
        expect(e.status).toMatch(/stated effective/);
      }
      for (const e of f.comingUp) {
        expect(byId.get(e.recordId)!.effectiveAt!.slice(0, 10) > TODAY).toBe(true);
      }
      for (const e of f.proposals) {
        const r = byId.get(e.recordId)!;
        expect(r.classification).toBe("proposed_rule");
        expect(e.date).toBe(r.publishedAt.slice(0, 10)); // a proposal is dated by publication, never by an effective date
        expect(e.status).toBe(`Proposed ${r.publishedAt.slice(0, 10)}`);
      }
    }
  });

  it("counts H-1B records named in the title or summary, including the biometric fee rule", () => {
    const h1b = land.follows.find((f) => f.follow === "visa:h-1b")!;
    expect(h1b.totalCount).toBeGreaterThan(0);
    expect(h1b.tookEffect.map((e) => e.recordId)).toContain(BIOMETRIC_FEE);
  });

  it("does not describe F-1 with a record that mentions F-1 only in its body", () => {
    const f1 = land.follows.find((f) => f.follow === "visa:f-1")!;
    for (const list of [f1.tookEffect, f1.comingUp, f1.proposals]) {
      expect(list.map((e) => e.recordId)).not.toContain(BIOMETRIC_FEE);
    }
  });

  it("names the sources checked and the ones it cannot cover", () => {
    expect(land.coverage.checked).toContain("Federal Register");
    expect(land.coverage.notCovered).toContain("Visa Bulletin");
    expect(land.limitations.join(" ")).toMatch(/not a complete statement of current law/);
  });
});

describe("the landscape's rules", () => {
  const base = byId.get(BIOMETRIC_FEE)!;
  const rec = (over: Partial<ChangeInput>) => ({ ...base, ...over }) as ChangeInput;

  it("never dates a final rule that states no effective date", () => {
    const undated = rec({ id: "federal_register:2099-10", effectiveAt: undefined });
    const l = buildLandscape({ follows: ["visa:h-1b"], today: TODAY }, [undated]).follows[0];
    expect(l.tookEffect).toEqual([]);
    expect(l.comingUp).toEqual([]);
    expect(l.undatedFinalCount).toBe(1);
  });

  it("drops a proposal once a later record amends it, and keeps the later record", () => {
    const proposal = rec({ id: "federal_register:2099-11", classification: "proposed_rule", effectiveAt: undefined });
    const final = rec({
      id: "federal_register:2099-12",
      effectiveAt: "2026-12-01",
      entities: [...base.entities, { entityId: "federal_register:2099-11", relation: "amends", basis: "explicit", confidence: 1 }],
    });
    const l = buildLandscape({ follows: ["visa:h-1b"], today: TODAY }, [proposal, final]).follows[0];
    expect(l.proposals).toEqual([]);
    expect(l.comingUp.map((e) => e.recordId)).toEqual(["federal_register:2099-12"]);
    expect(l.totalCount).toBe(2);
  });

  it("an empty follow says so, without claiming nothing changed", () => {
    const l = buildLandscape({ follows: ["country:atlantis"], today: TODAY }, [base]).follows[0];
    expect(l).toMatchObject({ totalCount: 0, latestRecord: null, tookEffect: [], comingUp: [], proposals: [] });
  });
});
