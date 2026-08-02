// =============================================================================
// CONGRESS ADAPTER
//
// The load-bearing rule here is INTRODUCTION IS NOT CHANGE. Around 15,000 bills
// are introduced per Congress and roughly 2% become law, so a feed that treated
// introduction as change would be wrong almost every time — and wrong in the
// direction that frightens people, since the alarming bills are exactly the ones
// introduced for position-taking and never voted on.
//
// The action strings below are real Congress.gov `latestAction.text` values.
// =============================================================================
import { describe, it, expect } from "vitest";
import { __testing as CG } from "@/domains/graph/adapters/congress";
import { validateEvent } from "@/domains/graph/events";

const TODAY = new Date().toISOString().slice(0, 10);

function bill(over: Record<string, unknown> = {}) {
  return {
    congress: 119,
    type: "HR",
    number: "1234",
    title: "Immigration Reform and Visa Modernization Act",
    latestAction: { actionDate: "2026-07-15", text: "Became Public Law No: 119-42." },
    updateDate: "2026-07-16T00:00:00Z",
    originChamber: "House",
    policyArea: null,
    ...over,
  } as never;
}

describe("legislative stage", () => {
  it("reads enactment before chamber passage", () => {
    // "Became Public Law" also contains "Passed" in many records; if the weaker
    // signal were tested first every enacted law would be filed as a vote.
    expect(CG.stageFromAction("Became Public Law No: 119-42.")).toBe("became_law");
    expect(CG.stageFromAction("Signed by President.")).toBe("became_law");
    expect(CG.stageFromAction("Passed over President's veto by the Yeas and Nays: 68-32")).toBe("became_law");
  });

  it("recognises a bill awaiting only a signature", () => {
    expect(CG.stageFromAction("Presented to President.")).toBe("passed_both");
    expect(CG.stageFromAction("Cleared for White House.")).toBe("passed_both");
  });

  it("recognises passage by one chamber", () => {
    expect(CG.stageFromAction("Passed House by recorded vote: 220 - 210.")).toBe("passed_one");
    expect(CG.stageFromAction("Passed Senate with an amendment by Unanimous Consent.")).toBe("passed_one");
  });

  it("recognises committee action as procedural", () => {
    expect(CG.stageFromAction("Reported by the Committee on the Judiciary.")).toBe("reported");
    expect(CG.stageFromAction("Placed on the Union Calendar, Calendar No. 122.")).toBe("reported");
  });

  it("treats referral and anything unrecognised as introduced", () => {
    expect(CG.stageFromAction("Referred to the House Committee on the Judiciary.")).toBe("introduced");
    expect(CG.stageFromAction("Introduced in House")).toBe("introduced");
    expect(CG.stageFromAction("")).toBe("introduced");
    expect(CG.stageFromAction(null)).toBe("introduced");
  });
});

describe("introduction is not change", () => {
  it("excludes an introduced bill from the feed entirely", () => {
    // The whole point. A reader seeing "Bill to end birthright citizenship
    // introduced" has learned that one member filed a document, not that
    // anything about their status changed.
    expect(CG.isReportable("introduced")).toBe(false);
  });

  it("reports everything that has actually moved", () => {
    for (const stage of ["reported", "passed_one", "passed_both", "became_law"] as const) {
      expect(CG.isReportable(stage), stage).toBe(true);
    }
  });

  it("reserves major for bills that are law or awaiting only a signature", () => {
    expect(CG.severity("became_law")).toBe("major");
    expect(CG.severity("passed_both")).toBe("major");
    expect(CG.severity("passed_one")).toBe("notable");
    expect(CG.severity("reported")).toBe("routine");
  });
});

describe("immigration relevance", () => {
  it("keeps immigration bills", () => {
    for (const title of [
      "Immigration Reform and Visa Modernization Act",
      "Dream Act of 2026",
      "H-1B Integrity and Fairness Act",
      "Asylum Processing Improvement Act",
      "Birthright Citizenship Clarification Act",
    ]) {
      expect(CG.isImmigrationRelevant(bill({ title })), title).toBe(true);
    }
  });

  it("drops bills that are not about immigration", () => {
    for (const title of [
      "National Defense Authorization Act for Fiscal Year 2027",
      "Post Office Naming Act",
      "Rural Broadband Expansion Act",
    ]) {
      expect(CG.isImmigrationRelevant(bill({ title })), title).toBe(false);
    }
  });
});

// =============================================================================
// COVERAGE STRATEGY
//
// Both regressions below were found by verifying the adapter against the live
// API rather than by a unit test — which is the point of verifying.
// =============================================================================
describe("which Congress to read", () => {
  it("computes the Congress for a year rather than hardcoding it", () => {
    // Hardcoding 119 would quietly stop finding new laws in January 2027.
    expect(CG.congressForYear(2025)).toBe(119);
    expect(CG.congressForYear(2026)).toBe(119);
    expect(CG.congressForYear(2027)).toBe(120);
    expect(CG.congressForYear(1789)).toBe(1);
  });

  it("covers every Congress the window touches, newest first", () => {
    expect(CG.congressesInRange("2025-01-01", new Date("2026-08-02"))).toEqual([119]);
    expect(CG.congressesInRange("2023-01-01", new Date("2026-08-02"))).toEqual([119, 118]);
  });

  it("bounds how far back it will reach", () => {
    // A very old `since` must not fan out into dozens of API sweeps.
    expect(CG.congressesInRange("1990-01-01", new Date("2026-08-02")).length).toBeLessThanOrEqual(4);
  });
});

describe("relevance from the CRS policy area", () => {
  it("finds an immigration law whose title contains no immigration word", () => {
    // REGRESSION, found against the live API: title matching alone scored ZERO
    // immigration laws across the 104 public laws of the 119th Congress. The
    // Laken Riley Act and the Secure America Act are both immigration statutes
    // named after a person and a slogan. A platform tracking immigration policy
    // that misses the Laken Riley Act is failing at its core job.
    expect(
      CG.isImmigrationRelevant(bill({ title: "Laken Riley Act", policyArea: { name: "Immigration" } }))
    ).toBe(true);
    expect(
      CG.isImmigrationRelevant(bill({ title: "Secure America Act", policyArea: { name: "Immigration" } }))
    ).toBe(true);
  });

  it("still misses nothing the title would have caught", () => {
    // The title check stays as a secondary signal for bills filed under another
    // policy area that nonetheless carry immigration provisions.
    expect(
      CG.isImmigrationRelevant(bill({ title: "Border Security Supplemental", policyArea: { name: "Armed Forces" } }))
    ).toBe(true);
  });

  it("excludes a law whose policy area is something else", () => {
    for (const [title, area] of [
      ["Lulu's Law", "Science, Technology, Communications"],
      ["21st Century ROAD to Housing Act", "Housing and Community Development"],
      ["Emergency Conservation Program Improvement Act", "Agriculture and Food"],
    ] as const) {
      expect(CG.isImmigrationRelevant(bill({ title, policyArea: { name: area } })), title).toBe(false);
    }
  });

  it("is not fooled by casing or padding in the policy area", () => {
    expect(CG.isImmigrationRelevant(bill({ title: "X", policyArea: { name: "  immigration " } }))).toBe(true);
  });

  it("falls back to the title when no policy area is present", () => {
    expect(CG.isImmigrationRelevant(bill({ title: "Asylum Processing Act", policyArea: null }))).toBe(true);
    expect(CG.isImmigrationRelevant(bill({ title: "Post Office Naming Act", policyArea: null }))).toBe(false);
  });
});

describe("identity and labelling", () => {
  it("formats chamber-specific bill labels", () => {
    expect(CG.billLabel(bill({ type: "HR", number: "1234" }))).toBe("H.R. 1234");
    expect(CG.billLabel(bill({ type: "S", number: "56" }))).toBe("S. 56");
    expect(CG.billLabel(bill({ type: "HJRES", number: "7" }))).toBe("H.J.Res. 7");
  });

  it("produces a deterministic id that survives re-ingestion", () => {
    // A bill is re-fetched at every stage. If the id changed with its status,
    // one bill would appear in the feed five times as five separate events.
    expect(CG.stableId(bill())).toBe("congress:119-hr-1234");
    const later = bill({ latestAction: { actionDate: "2026-08-01", text: "Passed House." } });
    expect(CG.stableId(later)).toBe(CG.stableId(bill()));
  });

  it("links to the bill on congress.gov", () => {
    expect(CG.sourceUrl(bill({ type: "HR", number: "1234" }))).toBe(
      "https://www.congress.gov/bill/119th-congress/house-bill/1234"
    );
    expect(CG.sourceUrl(bill({ type: "S", number: "56" }))).toBe(
      "https://www.congress.gov/bill/119th-congress/senate-bill/56"
    );
  });
});

describe("event construction", () => {
  const enacted = () => CG.toEvent(bill(), "became_law", TODAY);
  const passedOne = () =>
    CG.toEvent(bill({ latestAction: { actionDate: "2026-07-15", text: "Passed House." } }), "passed_one", TODAY);

  it("produces events that pass validation", () => {
    expect(validateEvent(enacted())).toEqual([]);
    expect(validateEvent(passedOne())).toEqual([]);
  });

  it("states plainly when a bill is NOT law", () => {
    // The most consequential caveat this source carries.
    expect(passedOne().limitations?.[0]).toMatch(/has NOT become law/);
    expect(passedOne().limitations?.[0]).toMatch(/most bills do/);
  });

  it("does not equate enactment with being in force", () => {
    expect(enacted().limitations?.[0]).toMatch(/enactment is not the same as being in force/i);
  });

  it("never asserts an effective date", () => {
    expect(enacted().effectiveAt).toBeNull();
    expect(passedOne().effectiveAt).toBeNull();
  });

  it("puts the stage in the title so a vote never reads as a law", () => {
    expect(enacted().title).toMatch(/^Enacted: H\.R\. 1234/);
    expect(passedOne().title).toMatch(/^Passed one chamber: H\.R\. 1234/);
  });

  it("always explains that introductions are excluded", () => {
    // A reader seeing few congressional events deserves to know that is policy,
    // not an empty docket.
    expect(enacted().limitations?.join(" ")).toMatch(/Introduced and referred bills are excluded/);
  });

  it("classifies every event as legislative action", () => {
    expect(enacted().classification).toBe("legislative_action");
  });

  it("dates the event by the recorded action", () => {
    expect(enacted().publishedAt).toBe("2026-07-15");
  });
});

describe("configuration", () => {
  it("treats DEMO_KEY as unconfigured", () => {
    // DEMO_KEY is rate-limited to roughly 50 requests a day. Accepting it would
    // produce a source that works in testing and silently truncates in
    // production.
    const prev = process.env.CONGRESS_API_KEY;
    process.env.CONGRESS_API_KEY = "DEMO_KEY";
    expect(CG.apiKey()).toBeUndefined();
    process.env.CONGRESS_API_KEY = prev;
  });

  it("reads a real key when one is set", () => {
    const prev = process.env.CONGRESS_API_KEY;
    process.env.CONGRESS_API_KEY = "realkey123";
    expect(CG.apiKey()).toBe("realkey123");
    process.env.CONGRESS_API_KEY = prev;
  });
});
