// =============================================================================
// STAGE AND IMPORTANCE, against every record in the archive
//
// Stage is the instrument's standing (proposal, final rule with a stated date
// ahead or passed, announcement, decision…); importance is our editorial
// weight. Neither may imply that a rule is currently operative, and no date
// may appear that the document does not state.
// =============================================================================

import { describe, expect, it } from "vitest";
import { EVENTS } from "@/lib/event-store";
import { amendmentIndex, toPublicChange, type ChangeInput } from "@/lib/intelligence/change";
import { DATE_PASSED_CAVEAT, importanceOf, stageOf } from "@/lib/stage";

const TODAY = "2026-10-16";
const ALL = EVENTS as unknown as ChangeInput[];
const amendments = amendmentIndex(ALL);
const changes = ALL.map((e) => toPublicChange(e, TODAY, amendments.get(e.id) ?? []));
const FORBIDDEN = /in force|in effect|currently|\bactive\b|operative|remains/i;

describe("stage, on all records", () => {
  const staged = changes.map((c) => ({ c, s: stageOf(c, TODAY) }));

  it("never says a rule is in force, in effect or operative", () => {
    for (const { c, s } of staged) {
      expect(s.label, c.id).not.toMatch(FORBIDDEN);
      if (s.caveat) expect(s.caveat, c.id).not.toMatch(FORBIDDEN);
    }
  });

  it("uses only dates the document states", () => {
    for (const { c, s } of staged) {
      if (s.keyDate) expect([c.publishedDate, c.effectiveDate], c.id).toContain(s.keyDate.date);
    }
  });

  it("dates proposals only by publication, and never calls them final", () => {
    const proposals = staged.filter(({ c }) => c.classification === "proposed_rule");
    expect(proposals.length).toBeGreaterThan(0);
    for (const { c, s } of proposals) {
      expect(s.kind).toBe("proposed");
      expect(s.keyDate).toEqual({ label: "Proposed", date: c.publishedDate });
    }
  });

  it("splits final rules by their stated effective date, and says a passed date is only a passed date", () => {
    const finals = staged.filter(({ c }) => c.classification === "final_rule" || c.classification === "executive_action");
    expect(finals.length).toBeGreaterThan(0);
    for (const { c, s } of finals) {
      if (!c.effectiveDate) expect(s.kind, c.id).toBe("final_undated");
      else if (c.effectiveDate > TODAY) expect(s.kind, c.id).toBe("final_ahead");
      else {
        expect(s.kind, c.id).toBe("final_date_passed");
        expect(s.keyDate!.label).toBe("Stated effective date");
        if (!s.amended) expect(s.caveat).toBe(DATE_PASSED_CAVEAT);
      }
    }
    expect(finals.some(({ s }) => s.kind === "final_ahead")).toBe(true); // the EB-5 fee rule, effective 2026-11-30
  });

  it("flags records a later record amends, whatever their kind", () => {
    const amended = staged.filter(({ c }) => c.amendedBy.length > 0);
    for (const { s } of amended) {
      expect(s.amended).toBe(true);
      expect(s.caveat).toMatch(/later record amends this one/);
    }
    for (const { c, s } of staged) if (c.amendedBy.length === 0) expect(s.amended).toBe(false);
  });

  it("does not treat announcements as rules", () => {
    for (const { c, s } of staged.filter(({ c }) => c.classification === "announcement")) {
      expect(s.kind, c.id).toBe("announcement");
      expect(s.label).not.toMatch(/rule/i);
    }
  });
});

describe("importance is a separate question", () => {
  it("is our weighting, independent of stage", () => {
    // Real records with the other weighting: the two answers must not move together.
    const proposal = changes.find((c) => c.classification === "proposed_rule")!;
    const final = changes.find((c) => c.classification === "final_rule")!;
    const majorProposal = { ...proposal, severity: "major" };
    const routineFinal = { ...final, severity: "routine" };
    expect(stageOf(majorProposal!, TODAY).kind).toBe("proposed");
    expect(importanceOf(majorProposal!).kind).toBe("changes_requirements");
    expect(stageOf(routineFinal!, TODAY).label).toBe("Final rule");
    expect(importanceOf(routineFinal!).kind).not.toBe("changes_requirements");
  });

  it("never borrows stage words", () => {
    for (const c of changes) expect(importanceOf(c).label).not.toMatch(/rule|propos|effective|final/i);
  });
});
