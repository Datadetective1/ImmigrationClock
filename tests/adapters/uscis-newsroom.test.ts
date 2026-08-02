// =============================================================================
// USCIS NEWSROOM ADAPTER
//
// This adapter currently produces the MAJORITY of events in the store, and it
// carries the most consequential editorial rule in the codebase: the filter that
// keeps individual criminal-prosecution press releases — named private people,
// in charged language — off a platform that promised in /methodology never to
// publish them.
//
// That promise is enforced by one array of substrings. If it silently stops
// matching, the platform breaks a public commitment at scale and nothing else in
// the build would notice. These tests exist so it cannot drift unobserved.
//
// Adapter tests live in tests/adapters/ so that the eight sources still to be
// built each get their own file rather than growing one shared suite.
// =============================================================================
import { describe, it, expect } from "vitest";
import { __testing as UN } from "@/domains/graph/adapters/uscis-newsroom";
import { validateEvent } from "@/domains/graph/events";
import type { RssItem } from "@/domains/graph/rss";

const TODAY = new Date().toISOString().slice(0, 10);

function item(over: Partial<RssItem> = {}): RssItem {
  return {
    title: "USCIS Announces Updated Guidance",
    link: "https://www.uscis.gov/newsroom/alerts/example",
    description: "USCIS announced updated guidance for a benefit request.",
    publishedAt: "2026-07-15",
    guid: "uscis-node-12345",
    categories: [],
    ...over,
  };
}

// =============================================================================
// The editorial filter. Both directions matter equally: it must exclude
// individual prosecutions AND must not quietly swallow policy news.
// =============================================================================
describe("individual criminal-case exclusion", () => {
  const PROSECUTIONS = [
    "Foreign National Sentenced for Immigration Fraud",
    "Man Pleads Guilty to Marriage Fraud Scheme",
    "Former Contractor Convicted of Bribery",
    "Grand Jury Indicts Three in Visa Scheme",
    "USCIS Investigation Resulting in Arrest of Fugitive",
    "Justice Department Moves to Denaturalize Convicted Offender",
    "Defendant Sentenced to 60 Months in Prison",
    "USCIS Assists Federal Partners in Smuggling Conspiracy Case",
  ];

  it.each(PROSECUTIONS)("excludes an individual criminal case: %s", (title) => {
    expect(UN.isIndividualCriminalCase(item({ title }))).toBe(true);
  });

  const POLICY = [
    "USCIS Reaches H-1B Cap for Fiscal Year 2027",
    "DHS Designates Venezuela for Temporary Protected Status",
    "USCIS Announces Fee Schedule Changes",
    "Court Issues Administrative Stay of Certain USCIS Policies",
    "USCIS Updates Policy Manual Guidance on Adjustment of Status",
    "USCIS Extends Employment Authorization Documents",
  ];

  it.each(POLICY)("keeps genuine policy news: %s", (title) => {
    expect(UN.isIndividualCriminalCase(item({ title }))).toBe(false);
  });

  it("judges only the title, so a policy item is not excluded by its body text", () => {
    // Descriptions of policy items routinely reference enforcement in the
    // abstract. Matching on the body would delete real policy change.
    const policyWithEnforcementProse = item({
      title: "USCIS Announces Updated Guidance for Employment Authorization",
      description:
        "The guidance addresses cases where an applicant was previously arrested or convicted of an offense.",
    });
    expect(UN.isIndividualCriminalCase(policyWithEnforcementProse)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(UN.isIndividualCriminalCase(item({ title: "MAN SENTENCED FOR FRAUD" }))).toBe(true);
  });

  it.each([
    ["Man Indicted in Visa Scheme", "Grand Jury Indicts Three in Visa Scheme"],
    ["Defendant Sentenced to 60 Months", "Court Sentences Defendant to 60 Months"],
    ["Foreign National Convicted of Fraud", "Jury Convicts Foreign National of Fraud"],
  ])("excludes both the passive and active voice of the same case (%s / %s)", (passive, active) => {
    // REGRESSION: the marker list carried "indicted" but not "indicts", so the
    // active-voice headline for the same prosecution was published. A list that
    // covers one voice looks complete while leaking the other.
    expect(UN.isIndividualCriminalCase(item({ title: passive })), passive).toBe(true);
    expect(UN.isIndividualCriminalCase(item({ title: active })), active).toBe(true);
  });
});

describe("policy relevance", () => {
  it("keeps items that change something a reader could act on", () => {
    expect(UN.isPolicyRelevant(item({ title: "USCIS Announces New Filing Fee" }))).toBe(true);
    expect(UN.isPolicyRelevant(item({ title: "DHS Designates Somalia for TPS" }))).toBe(true);
  });

  it("reads the description as well as the title", () => {
    const it_ = item({
      title: "Statement From the Director",
      description: "The agency will extend the registration period for the coming fiscal year.",
    });
    expect(UN.isPolicyRelevant(it_)).toBe(true);
  });

  it("drops items with no policy content", () => {
    expect(
      UN.isPolicyRelevant(item({ title: "USCIS Celebrates Anniversary", description: "A ceremony was held." }))
    ).toBe(false);
  });
});

// =============================================================================
// Classification and severity. These decide what a reader sees first, so a
// drift here changes the platform's editorial judgement without a code review
// noticing.
// =============================================================================
describe("classification", () => {
  it("recognises court action", () => {
    expect(UN.classify(item({ title: "Court Issues Administrative Stay of USCIS Policies" }))).toBe(
      "court_decision"
    );
    expect(UN.classify(item({ title: "Judge Blocks Rule in Ongoing Litigation" }))).toBe("court_decision");
  });

  it("distinguishes a final rule from a proposed rule", () => {
    expect(UN.classify(item({ title: "DHS Publishes Final Rule on Public Charge" }))).toBe("final_rule");
    expect(UN.classify(item({ title: "DHS Issues Proposed Rule on Fees" }))).toBe("proposed_rule");
  });

  it("recognises filing deadlines and cap exhaustion", () => {
    expect(UN.classify(item({ title: "USCIS Reaches H-1B Cap for FY 2027" }))).toBe("deadline");
    expect(UN.classify(item({ title: "H-1B Registration Period Opens in March" }))).toBe("deadline");
  });

  it("recognises corrections and updates", () => {
    expect(UN.classify(item({ title: "Correction to Previously Announced Fee Schedule" }))).toBe("correction");
    expect(UN.classify(item({ title: "USCIS Updates Guidance on Form I-765" }))).toBe("updated_information");
  });

  it("falls back to `announcement` rather than guessing at something stronger", () => {
    // The honest default. Guessing "final_rule" from an ambiguous headline would
    // tell a reader a legal instrument exists when it may not.
    expect(UN.classify(item({ title: "USCIS Announces New Office in Kansas City" }))).toBe("announcement");
  });
});

describe("severity rules", () => {
  const sev = (title: string) => {
    const i = item({ title });
    return UN.severity(i, UN.classify(i));
  };

  it("ranks rules and court orders as major", () => {
    expect(sev("DHS Publishes Final Rule on Public Charge")).toBe("major");
    expect(sev("Court Issues Administrative Stay of USCIS Policies")).toBe("major");
  });

  it("ranks status designations and cap exhaustion as major", () => {
    // These change who can do what, which is the definition of major here.
    expect(sev("DHS Designates Venezuela for Temporary Protected Status")).toBe("major");
    expect(sev("USCIS Reaches H-1B Cap for FY 2027")).toBe("major");
  });

  it("ranks office openings and outreach as routine, not policy change", () => {
    expect(sev("USCIS Opens New Field Office in Kansas City")).toBe("routine");
    expect(sev("USCIS Hosts Public Engagement Webinar")).toBe("routine");
  });

  it("never invents a fourth severity", () => {
    for (const t of ["USCIS Announces Updated Processing Times", "USCIS Extends Form Validity"]) {
      expect(["major", "notable", "routine"]).toContain(sev(t));
    }
  });
});

// =============================================================================
// Event construction.
// =============================================================================
describe("event construction", () => {
  it("produces events that pass validation", () => {
    expect(validateEvent(UN.toEvent(item(), TODAY))).toEqual([]);
  });

  it("produces a deterministic id for the same item", () => {
    expect(UN.stableId(item())).toBe(UN.stableId(item()));
  });

  it("derives the id from the feed guid so a re-run does not re-announce", () => {
    // If ids drifted between runs, every build would report every old item as
    // new — the change feed would become noise.
    expect(UN.stableId(item({ guid: "uscis-node-12345" }))).toBe("uscis_newsroom:uscis-node-12345");
  });

  it("falls back to the link path when the feed carries no guid", () => {
    const id = UN.stableId(item({ guid: null, link: "https://www.uscis.gov/newsroom/alerts/cap-reached" }));
    expect(id).toMatch(/^uscis_newsroom:/);
    expect(id).toContain("cap-reached");
  });

  it("distinguishes two different items", () => {
    expect(UN.stableId(item({ guid: "a" }))).not.toBe(UN.stableId(item({ guid: "b" })));
  });

  it("never assigns an effective date to a press release", () => {
    // USCIS does not give announcements an effective date. Inventing one would
    // tell a reader when an obligation starts, which is exactly the kind of
    // unsupported legal conclusion the platform forbids.
    expect(UN.toEvent(item(), TODAY).effectiveAt).toBeNull();
  });

  it("marks the issuing agency explicit and text matches inferred", () => {
    const e = UN.toEvent(item({ title: "USCIS Updates Guidance for H-1B Petitions in India" }), TODAY);
    const issued = e.entities.find((l) => l.relation === "issued_by")!;
    expect(issued.entityId).toBe("agency:uscis");
    expect(issued.basis).toBe("explicit");
    expect(issued.confidence).toBe(1);
    for (const l of e.entities.filter((x) => x.relation === "mentions")) {
      expect(l.basis).toBe("matched");
      expect(l.confidence).toBeLessThan(1);
    }
  });

  it("does not link the same entity twice", () => {
    const e = UN.toEvent(item({ title: "USCIS USCIS Guidance", description: "USCIS said." }), TODAY);
    expect(new Set(e.entities.map((l) => l.entityId)).size).toBe(e.entities.length);
  });

  it("says so plainly when the feed published no summary", () => {
    const e = UN.toEvent(item({ description: null }), TODAY);
    expect(e.summary).toMatch(/No summary was published/);
    expect(e.limitations?.join(" ")).toMatch(/no summary/i);
  });

  it("copies the summary from the feed rather than authoring one", () => {
    const e = UN.toEvent(item({ description: "USCIS announced a change to filing fees." }), TODAY);
    expect(e.summary).toBe("USCIS announced a change to filing fees.");
  });

  it("always notes that an announcement is not the legal instrument", () => {
    // The distinction between an agency saying something and the rule taking
    // effect is the single most load-bearing caveat this adapter carries.
    expect(UN.toEvent(item(), TODAY).limitations?.[0]).toMatch(/Legal effect/i);
  });

  it("emits no generated prose, so it needs no human review gate", () => {
    expect(UN.toEvent(item(), TODAY).reviewStatus).toBe("auto");
  });

  it("cites the original USCIS URL, never a secondary report", () => {
    const e = UN.toEvent(item(), TODAY);
    expect(e.sourceUrl).toBe("https://www.uscis.gov/newsroom/alerts/example");
    expect(e.sourceKey).toBe("uscis_newsroom");
  });

  it("refuses to publish a future-dated item as though it had already happened", () => {
    // The adapter does not mark newsroom items `scheduled`, so a future date is
    // a data error. validateEvent must reject it and build-events drops it,
    // rather than the site announcing something that has not occurred.
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const errors = validateEvent(UN.toEvent(item({ publishedAt: future }), TODAY));
    expect(errors.join(" ")).toMatch(/future/i);
  });
});
