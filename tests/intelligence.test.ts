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

describe("a classification carries the evidence for itself", () => {
  const serialized = ALL.map((e) => toPublicChange(e, TODAY, []));

  it("attaches the verbatim quote to every classification", () => {
    // The reason this matters, found by hand: an H-2A wage rule is classified
    // visa:h-1b because the rule body cites section 212(p) in a historical
    // aside. Flattened to ["h-1b"], that is indistinguishable from a real H-1B
    // rule. With the quote attached, a consumer can see it and refuse it.
    const classified = serialized.flatMap((c) => c.visaCategories);
    expect(classified.length).toBeGreaterThan(0);
    for (const entry of classified) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.basis.length).toBeGreaterThan(0);
      expect(typeof entry.confidence).toBe("number");
      // Every visa classification in the committed store is basis "stated",
      // and a stated fact without its quote is just an assertion.
      if (entry.basis === "stated") expect(entry.evidence, entry.id).toBeTruthy();
    }
  });

  it("distinguishes not-classified from not-applicable from known", () => {
    // Three different meanings behind one empty array. A consumer that cannot
    // tell them apart reads every one as "not relevant", which is wrong for
    // the 90% of records nobody has classified.
    const states = serialized.map((c) => c.classificationState.visaCategories);
    expect(new Set(states).size).toBeGreaterThan(1);
    for (const c of serialized) {
      if (c.visaCategories.length > 0) {
        expect(c.classificationState.visaCategories, c.recordId).toBe("known");
      } else if (c.scopeCompleteness === "unspecified") {
        expect(c.classificationState.visaCategories, c.recordId).toBe("not_classified");
      } else {
        expect(c.classificationState.visaCategories, c.recordId).toBe("not_applicable");
      }
    }
    // The measured shape of the archive: most records are simply unclassified.
    const unclassified = states.filter((s) => s === "not_classified").length;
    expect(unclassified / states.length).toBeGreaterThan(0.5);
  });

  it("states its own measured quality rather than implying completeness", () => {
    // A filter that presents itself as complete is worse than no filter, so
    // the measurement travels in every response. This assertion is about the
    // SHAPE of the claim, not a particular number: it must name both precision
    // and recall, say what they were measured against, and keep the number
    // from being read as coverage.
    const q: string = ATTRIBUTION.classificationQuality;
    expect(q).toMatch(/precision \d+%/i);
    expect(q).toMatch(/recall \d+%/i);
    expect(q).toMatch(/hand-labelled/i);
    expect(q).toMatch(/not yet benchmarked/i);
    expect(q).toMatch(/classificationState/);
    expect(q).toMatch(/evidence/i);
  });

  it("does not let the quality statement claim more than was measured", () => {
    const q: string = ATTRIBUTION.classificationQuality;
    // One dimension has ground truth. The statement must not imply the others do.
    expect(q).toMatch(/visa:h-1b/);
    expect(q).not.toMatch(/every dimension|all dimensions|fully classified|complete coverage/i);
    // And it must not let a reader mistake partial coverage for a judgement of
    // irrelevance — the failure mode that makes a monitoring product lie.
    expect(q).toMatch(/empty list/i);
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
    expect(overlap.join).toMatch(/not as proof they are the same company/i);
    expect(overlap.caveat).toMatch(/does not imply that one caused the other/i);

    // The failure modes used to be listed in this paragraph, identically for
    // every employer. They now travel per row on matchQuality, which is what a
    // consumer can actually act on, so the paragraph must point at it rather
    // than repeat aggregate statistics that are true of other rows.
    expect(overlap.join).toMatch(/matchQuality/);
    expect(overlap.matchQuality).toBeTruthy();
  });

  it("describes THIS row's join rather than the average one", () => {
    // Acme Corp is a clean one-to-one match on a distinctive key. Saying "20
    // pairs of filers collide" here would be true of the dataset and false of
    // this row, which is how a caveat becomes noise a consumer learns to skip.
    const overlap = employerSignals(WARN_SIDE, H1B_SIDE, "why", TODAY).find(
      (s) => s.kind === "warn_h1b_overlap"
    )!;
    const q = overlap.matchQuality!;
    expect(q.kind).toBe("exact_normalized");
    expect(q.key).toBe("ACME");
    expect(q.h1bFilersNotShown).toBe(0);
    expect(q.discardedWords).toEqual([]);
    // The sponsorship figures are a fiscal-year export and they age. That must
    // be said on an otherwise clean match, not hidden by it.
    expect(q.staleSponsorEvidence).toBe(true);
    expect(q.note).toMatch(/not sponsorship today/i);
  });

  it("reports the collision when the names actually collide", () => {
    const overlap = employerSignals(
      { ...WARN_SIDE, name: "HCL America", siblingNames: ["HCL America"] },
      {
        ...H1B_SIDE,
        name: "HCL AMERICA INC",
        siblingNames: ["HCL AMERICA INC", "HCL AMERICA SOLUTIONS INC"],
      },
      "why",
      TODAY
    ).find((s) => s.kind === "warn_h1b_overlap")!;
    const q = overlap.matchQuality!;
    expect(q.kind).toBe("possible_corporate_family");
    expect(q.h1bNames).toContain("HCL AMERICA SOLUTIONS INC");
    expect(q.h1bFilersNotShown).toBe(1);
    expect(q.note).toMatch(/not counted in the approvals shown/i);
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

  it("says how old a filing is, and what its date actually means", () => {
    // Measured: the median most-recent filing across the 162 overlap employers
    // is 1,136 days old. An alert that said only "WARN notice detected" would
    // be reporting three-year-old news for most of them.
    const [warnSignal] = employerSignals(WARN_SIDE, null, "why", "2026-09-03");
    expect(warnSignal.recency).toBe("recent");
    expect(warnSignal.ageDays).toBe(2);
    expect(warnSignal.dateMeaning).toBe("filing_or_effective_date");
    // 2,292 of 7,457 notices carry only a layoff date, so the wording cannot
    // claim the date is when the notice was filed.
    expect(warnSignal.fact).toMatch(/either the date the notice was filed or the date the layoff takes effect/i);

    const old = employerSignals({ ...WARN_SIDE, latestNotice: "2021-01-01" }, null, "why", "2026-09-03")[0];
    expect(old.recency).toBe("historical");
    expect(old.ageDays).toBeGreaterThan(1_000);

    const h1bSignal = employerSignals(null, H1B_SIDE, "why", "2026-09-03")[0];
    expect(h1bSignal.dateMeaning).toBe("fiscal_year_start");
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
