// =============================================================================
// THE INTELLIGENCE LAYER
//
// This is the first representation of a change that something other than this
// website can consume, so the tests are about the promises the shape makes
// rather than about its plumbing:
//
//   1. EVERY RECORD CARRIES ITS EVIDENCE. Source, URL, dates, verification.
//      A consumer must be able to answer "why are you telling me this?".
//   2. NOTHING IS INVENTED. Absent stays absent: a record with no effective
//      date serializes to null, never to a guess.
//   3. NO INDIVIDUAL DETERMINATION. No field says who is affected, eligible,
//      or at risk — because the data cannot support one.
//   4. NO INTERNAL DETAIL leaks: no file paths, no adapter internals, no
//      secrets, no draft records.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  ATTRIBUTION,
  CHANGE_SCHEMA_VERSION,
  amendmentIndex,
  statusFor,
  toPublicChange,
  type ChangeInput,
} from "@/lib/intelligence/change";
import { employerSignals, type H1bSide, type WarnSide } from "@/lib/intelligence/employer-signals";
import { EVENTS } from "@/lib/event-store";
import { EMPLOYERS, EMPLOYERS_META } from "@/lib/employers";
import { WARN_META, warnH1bCrossLink } from "@/lib/warn";

const TODAY = "2026-09-03";
const ALL = EVENTS as unknown as ChangeInput[];

// -----------------------------------------------------------------------------
// THE NUMBERS, VERIFIED FROM THE REPOSITORY
// -----------------------------------------------------------------------------

describe("the datasets this layer is built on", () => {
  it("has the archive, the sponsors and the layoff feed at the scale claimed", () => {
    // Asserted as floors rather than exact counts: the data refreshes daily and
    // a test that pins today's number fails tomorrow for no reason. What must
    // not silently change is the order of magnitude.
    expect(ALL.length).toBeGreaterThan(400);
    expect(EMPLOYERS.length).toBeGreaterThan(2_000);
    expect(WARN_META.noticeCount).toBeGreaterThan(5_000);
    expect(WARN_META.stateCount).toBeGreaterThanOrEqual(5);
  });

  it("joins a meaningful number of employers across the two datasets", () => {
    // The differentiated asset, measured rather than assumed. An earlier note
    // implied the two datasets overlap almost entirely; they do not. What
    // matters is that the overlap is real, non-trivial, and not everything.
    const rows = warnH1bCrossLink();
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.length).toBeLessThan(EMPLOYERS.length);
    for (const row of rows.slice(0, 20)) {
      expect(row.approvals).toBeGreaterThan(0);
      expect(row.notices).toBeGreaterThan(0);
      expect(row.name.length).toBeGreaterThan(0);
    }
  });
});

// -----------------------------------------------------------------------------
// THE PUBLIC CHANGE
// -----------------------------------------------------------------------------

describe("a change, serialized", () => {
  const serialized = ALL.map((e) => toPublicChange(e, TODAY, []));

  it("carries its evidence on every single record", () => {
    for (const c of serialized) {
      expect(c.id, c.recordId).toMatch(/^[a-z0-9]{6}$/);
      expect(c.recordId.length, c.recordId).toBeGreaterThan(0);
      expect(c.source.url, c.recordId).toMatch(/^https?:\/\//);
      expect(c.source.key.length, c.recordId).toBeGreaterThan(0);
      expect(c.publishedDate, c.recordId).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.url, c.recordId).toContain("/what-changed/");
      expect(c.verification.length, c.recordId).toBeGreaterThan(0);
    }
  });

  it("gives every record a unique, stable id", () => {
    expect(new Set(serialized.map((c) => c.id)).size).toBe(serialized.length);
    // Stable across calls: the id is derived from the record, not generated.
    expect(toPublicChange(ALL[0], TODAY, []).id).toBe(toPublicChange(ALL[0], "2027-01-01", []).id);
  });

  it("never invents an effective date", () => {
    // 126 of 544 records state one. The rest must serialize to null rather
    // than to a publication date standing in for one.
    for (const [i, c] of serialized.entries()) {
      const source = ALL[i];
      if (!source.effectiveAt) expect(c.effectiveDate, c.recordId).toBeNull();
      else expect(c.effectiveDate).toBe(source.effectiveAt);
    }
    expect(serialized.some((c) => c.effectiveDate === null)).toBe(true);
    expect(serialized.some((c) => c.effectiveDate !== null)).toBe(true);
  });

  it("has no field that determines anything about a person", () => {
    // The boundary this product must not cross. A field named for eligibility,
    // risk or an individual outcome would be read as a determination whatever
    // the documentation said.
    const keys = Object.keys(serialized[0]);
    for (const forbidden of ["eligible", "eligibility", "risk", "affectedPeople", "outcome", "advice", "recommendation"]) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden.toLowerCase())), forbidden).toBe(false);
    }
    expect(ATTRIBUTION.notLegalAdvice).toMatch(/not legal advice/i);
    expect(ATTRIBUTION.notLegalAdvice).toMatch(/no determination about any individual/i);
  });

  it("leaks no internal detail", () => {
    const blob = JSON.stringify(serialized);
    expect(blob).not.toMatch(/src\/lib|node_modules|\.\.\//);
    expect(blob).not.toMatch(/sk_(test|live)_|whsec_|Bearer /);
    // Only the public host appears as our own; source URLs are government hosts.
    expect(blob).not.toMatch(/localhost|127\.0\.0\.1/);
  });

  it("excludes nothing the site itself publishes", () => {
    // EVENTS is already the published set — drafts are filtered upstream — so
    // the API and the website cannot disagree about what exists.
    expect(serialized.length).toBe(ALL.length);
    expect(ALL.every((e) => e.reviewStatus !== "draft")).toBe(true);
  });

  it("states how complete its scope fields are", () => {
    // An empty visaCategories list means "not determined" on an unspecified
    // record and "none" on an exhaustive one. A consumer filtering on it has
    // to be able to tell the difference.
    for (const c of serialized) {
      expect(["exhaustive", "partial", "unspecified"], c.recordId).toContain(c.scopeCompleteness);
    }
  });

  it("carries the limitations the site already publishes", () => {
    expect(serialized.filter((c) => c.limitations.length > 0).length).toBeGreaterThan(100);
  });
});

describe("status is derived by a stated rule", () => {
  function change(over: Partial<ChangeInput>): ChangeInput {
    return { ...ALL[0], ...over } as ChangeInput;
  }

  it("never calls a proposal in force", () => {
    expect(statusFor(change({ classification: "proposed_rule", effectiveAt: "2020-01-01" }), TODAY)).toBe("proposed");
  });

  it("separates scheduled from in force by the effective date", () => {
    expect(statusFor(change({ classification: "final_rule", effectiveAt: "2026-12-01" }), TODAY)).toBe("scheduled");
    expect(statusFor(change({ classification: "final_rule", effectiveAt: "2026-01-01" }), TODAY)).toBe("in_force");
    expect(statusFor(change({ classification: "final_rule", effectiveAt: null }), TODAY)).toBe("in_force");
  });

  it("marks a court decision as decided, not as a rule change", () => {
    expect(statusFor(change({ classification: "court_decision" }), TODAY)).toBe("decided");
  });

  it("marks a data release as informational", () => {
    expect(statusFor(change({ classification: "data_release" }), TODAY)).toBe("informational");
  });

  it("marks a record superseded when a later one amends it", () => {
    expect(statusFor(change({ classification: "final_rule" }), TODAY, ["later:1"])).toBe("superseded");
  });
});

describe("supersession", () => {
  it("is read from the relation the store already carries", () => {
    // 92 `amends` relations exist in the committed store, so this is not a
    // hypothetical field.
    const index = amendmentIndex(ALL);
    expect(index.size).toBeGreaterThan(0);
    for (const [target, amenders] of index) {
      expect(target.length).toBeGreaterThan(0);
      expect(amenders.length).toBeGreaterThan(0);
    }
  });

  it("puts both directions on the record", () => {
    const index = amendmentIndex(ALL);
    const [target, amenders] = [...index][0];
    const record = ALL.find((e) => e.id === target);
    if (record) {
      expect(toPublicChange(record, TODAY, amenders).amendedBy).toEqual(amenders);
      expect(toPublicChange(record, TODAY, amenders).status).toBe("superseded");
    }
    const amender = ALL.find((e) => e.id === amenders[0])!;
    expect(toPublicChange(amender, TODAY, []).amends).toContain(target);
  });
});

describe("attribution travels with the data", () => {
  it("names the publisher, disclaims origin, and versions the schema", () => {
    expect(ATTRIBUTION.publisher).toBe("ImmigrationClock");
    expect(ATTRIBUTION.statement).toMatch(/not the originating authority/i);
    expect(ATTRIBUTION.statement).toMatch(/government sources/i);
    expect(ATTRIBUTION.schemaVersion).toBe(CHANGE_SCHEMA_VERSION);
    expect(CHANGE_SCHEMA_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// -----------------------------------------------------------------------------
// EMPLOYER SIGNALS
// -----------------------------------------------------------------------------

const WARN_SIDE: WarnSide = {
  slug: "acme-corp",
  name: "Acme Corp",
  notices: 3,
  employees: 1_250,
  states: ["TX", "WA"],
  latestNotice: "2026-09-01",
};

const H1B_SIDE: H1bSide = {
  slug: "acme-corp",
  name: "Acme Corp",
  approvals: 400,
  denials: 100,
  fiscalYear: "2023",
  sourceName: "USCIS H-1B Employer Data Hub",
  sourceUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
};

describe("employer signals show their working", () => {
  it("emits the overlap signal only when both datasets have the employer", () => {
    expect(employerSignals(WARN_SIDE, H1B_SIDE, "why").some((s) => s.kind === "warn_h1b_overlap")).toBe(true);
    expect(employerSignals(WARN_SIDE, null, "why").some((s) => s.kind === "warn_h1b_overlap")).toBe(false);
    expect(employerSignals(null, H1B_SIDE, "why").some((s) => s.kind === "warn_h1b_overlap")).toBe(false);
    expect(employerSignals(null, null, "why")).toEqual([]);
  });

  it("carries a fact, a reason it matched, and a caveat on every signal", () => {
    for (const signal of employerSignals(WARN_SIDE, H1B_SIDE, "employer slug lookup")) {
      expect(signal.fact.length).toBeGreaterThan(20);
      expect(signal.matched).toBe("employer slug lookup");
      expect(signal.caveat.length).toBeGreaterThan(20);
      expect(signal.sources.length).toBeGreaterThan(0);
      for (const source of signal.sources) expect(source.url).toMatch(/^https?:\/\//);
    }
  });

  it("explains the join, and admits how it can be wrong", () => {
    const overlap = employerSignals(WARN_SIDE, H1B_SIDE, "why").find((s) => s.kind === "warn_h1b_overlap")!;
    expect(overlap.join).toMatch(/normalized employer name/i);
    // The honest part: name matching misses subsidiaries and can join
    // unrelated companies. A consumer must be told before they act on it.
    expect(overlap.join).toMatch(/miss a subsidiary/i);
    expect(overlap.join).toMatch(/unrelated companies/i);
    expect(overlap.caveat).toMatch(/does not imply that one caused the other/i);
  });

  it("never claims a layoff touched a visa holder", () => {
    const all = employerSignals(WARN_SIDE, H1B_SIDE, "why");
    const blob = JSON.stringify(all).toLowerCase();
    for (const forbidden of ["at risk", "high risk", "will lose", "affected worker", "loses status", "must leave"]) {
      expect(blob, forbidden).not.toContain(forbidden);
    }
    const warnSignal = all.find((s) => s.kind === "warn_notice")!;
    expect(warnSignal.caveat).toMatch(/does not indicate whether or how those roles relate to visa sponsorship/i);
    expect(warnSignal.caveat).toMatch(/nothing about any individual worker/i);
  });

  it("labels H-1B numbers as petitions rather than people", () => {
    const signal = employerSignals(null, H1B_SIDE, "why").find((s) => s.kind === "h1b_sponsorship")!;
    expect(signal.fact).toContain("80% approved");
    expect(signal.caveat).toMatch(/petition counts, not people/i);
  });

  it("does not divide by zero for an employer with no petitions", () => {
    const signal = employerSignals(null, { ...H1B_SIDE, approvals: 0, denials: 0 }, "why")[0];
    expect(signal.fact).not.toContain("NaN");
  });

  it("gives every signal a stable id that changes only when the fact does", () => {
    const first = employerSignals(WARN_SIDE, H1B_SIDE, "why");
    expect(employerSignals(WARN_SIDE, H1B_SIDE, "different reason").map((s) => s.id)).toEqual(
      first.map((s) => s.id)
    );
    const moved = employerSignals({ ...WARN_SIDE, latestNotice: "2026-10-01" }, H1B_SIDE, "why");
    expect(moved.find((s) => s.kind === "warn_notice")!.id).not.toBe(
      first.find((s) => s.kind === "warn_notice")!.id
    );
  });

  it("is built from the same metadata the site publishes", () => {
    expect(EMPLOYERS_META.sourceUrl).toMatch(/^https?:\/\//);
    expect(EMPLOYERS_META.fiscalYear).toBeGreaterThan(2019);
    expect(WARN_META.coverageNote.length).toBeGreaterThan(20);
  });
});
