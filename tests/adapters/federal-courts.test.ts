// =============================================================================
// FEDERAL COURTS ADAPTER
//
// This adapter's filter IS its editorial policy, so these tests are the policy
// in executable form. Founder decision, 2026-08-02:
//
//   Include: decisions that establish or change immigration law.
//   Exclude: routine individual petitions, asylum appeals, visa denials, and
//            detainee cases that identify private individuals.
//
// Every caption in the "must exclude" list below is a REAL case returned by
// CourtListener for this adapter's own query. They are the actual thing the
// filter has to keep out, not hypotheticals.
// =============================================================================
import { describe, it, expect } from "vitest";
import { __testing as FC } from "@/domains/graph/adapters/federal-courts";
import { validateEvent } from "@/domains/graph/events";

const TODAY = new Date().toISOString().slice(0, 10);

function op(over: Partial<Parameters<typeof FC.assessInclusion>[0]> = {}) {
  return {
    caseName: "League of Women Voters v. U.S. Department of Homeland Security",
    court: "District Court, District of Columbia",
    court_id: "dcd",
    dateFiled: "2026-07-15",
    docketNumber: "Civil Action No. 2025-1234",
    status: "Published",
    suitNature: "",
    absolute_url: "/opinion/123456/league-v-dhs/",
    cluster_id: 123456,
    ...over,
  };
}

// =============================================================================
// The privacy rule. This is the whole point of the adapter.
// =============================================================================
describe("individual-case exclusion", () => {
  // Every one of these was returned live by the adapter's own query.
  const REAL_INDIVIDUAL_CASES = [
    "Liu v. Noem",
    "Hernandez v. Noem",
    "Morrissey v. Noem",
    "Almeida Porfirio v. Noem",
    "Perez Correa Camarena v. Noem",
    "Prado-Majano v. Blanche",
    "Bland v. Bondi",
    "Regis v. Mayorkas",
    "Graves-Buckingham v. Mayorkas",
    "Reid v. Mayorkas",
    "Smythe v. Department of Homeland Security",
    "Challa v. United States Department of Homeland Security",
    "Walsh v. United States Department of Homeland Security",
    "Neguse v. U.S. Immigration and Customs Enforcement",
    "Tesfamariam v. U.S. Citizenship and Immigration Services",
    "Josue Fuentes v. United States Citizenship and Immigration Services",
  ];

  it.each(REAL_INDIVIDUAL_CASES)("excludes the private individual in %s", (caseName) => {
    const d = FC.assessInclusion(op({ caseName }));
    expect(d.include).toBe(false);
    expect(d.reason).toMatch(/private individual/);
  });

  it("excludes an individual even from the Supreme Court", () => {
    // A KNOWN AND ACCEPTED GAP. A SCOTUS decision captioned with a person's name
    // can change asylum law nationwide and is still excluded, because the filter
    // cannot tell a landmark from a routine petition by caption alone. Surfacing
    // those needs editorial review, not an automatic rule. This test exists so
    // the gap is a decision on the record rather than an accident.
    const d = FC.assessInclusion(op({ caseName: "Barton v. Barr", court_id: "scotus", court: "Supreme Court" }));
    expect(d.include).toBe(false);
  });

  it("treats an unrecognised party as a person rather than admitting it", () => {
    // The asymmetry that governs the whole filter: a misfiled organization costs
    // one case, a misfiled person publishes someone's immigration matter.
    expect(FC.classifyParty("Qwertyuiop Asdfghjkl")).toBe("individual");
    expect(FC.assessInclusion(op({ caseName: "Qwertyuiop v. Noem" })).include).toBe(false);
  });
});

// =============================================================================
// What SHOULD get through.
// =============================================================================
describe("policy-impact inclusion", () => {
  const POLICY_CASES = [
    "League of Women Voters v. U.S. Department of Homeland Security",
    "American Immigration Lawyers Association v. Department of Homeland Security",
    "National Immigration Law Center v. Noem",
    "Texas v. United States Department of Homeland Security",
    "Chamber of Commerce v. United States Department of Homeland Security",
    "Northwest Immigrant Rights Project v. Mayorkas",
  ];

  it.each(POLICY_CASES)("includes institutional litigation: %s", (caseName) => {
    expect(FC.assessInclusion(op({ caseName })).include).toBe(true);
  });

  it("includes a state suing the federal government", () => {
    expect(FC.classifyParty("Texas")).toBe("organization");
    expect(FC.assessInclusion(op({ caseName: "Texas v. Noem" })).include).toBe(true);
  });

  it("requires a government party", () => {
    // Two private organizations disputing something is not immigration
    // administration, however immigration-adjacent the names.
    const d = FC.assessInclusion(op({ caseName: "Refugee Council v. Legal Aid Society" }));
    expect(d.include).toBe(false);
    expect(d.reason).toMatch(/no government party/);
  });

  it("excludes an unpublished appellate decision as non-precedential", () => {
    const d = FC.assessInclusion(
      op({ caseName: "Texas v. Noem", court_id: "ca5", status: "Unpublished" })
    );
    expect(d.include).toBe(false);
    expect(d.reason).toMatch(/not precedential/);
  });

  it("includes a published appellate decision as binding precedent", () => {
    const d = FC.assessInclusion(op({ caseName: "Texas v. Noem", court_id: "ca5", status: "Published" }));
    expect(d.include).toBe(true);
    expect(d.reason).toMatch(/binding precedent/);
  });

  it("rejects a caption it cannot split into parties", () => {
    expect(FC.assessInclusion(op({ caseName: "In re Something" })).include).toBe(false);
  });
});

describe("party classification", () => {
  it("recognises government bodies and officials sued in their official capacity", () => {
    for (const p of [
      "United States Department of Homeland Security",
      "U.S. Citizenship and Immigration Services",
      "Noem",
      "Bondi",
      "Secretary of Homeland Security",
    ]) {
      expect(FC.classifyParty(p), p).toBe("government");
    }
  });

  it("recognises organizations", () => {
    for (const p of [
      "American Immigration Lawyers Association",
      "League of Women Voters",
      "Acme Corp.",
      "Northwest Immigrant Rights Project",
      "County of Santa Clara",
      "Catholic Charities",
    ]) {
      expect(FC.classifyParty(p), p).toBe("organization");
    }
  });

  it("does not let a marker fire inside an unrelated word", () => {
    // "co." must not match inside "Colorado", and the state must still resolve
    // as an organization by name rather than by accident.
    expect(FC.classifyParty("Colorado")).toBe("organization");
    expect(FC.classifyParty("Constantine")).toBe("individual");
  });

  it("splits captions on the several forms of 'v.'", () => {
    expect(FC.parties("Texas v. Noem")).toEqual(["Texas", "Noem"]);
    expect(FC.parties("Texas vs. Noem")).toEqual(["Texas", "Noem"]);
  });
});

// =============================================================================
// Event construction.
// =============================================================================
describe("event construction", () => {
  const decision = () => FC.assessInclusion(op());
  const event = () => FC.toEvent(op(), decision(), TODAY);

  it("produces events that pass validation", () => {
    expect(validateEvent(event())).toEqual([]);
  });

  it("produces a deterministic id from the opinion cluster", () => {
    expect(FC.stableId(op())).toBe("federal_courts:123456");
    expect(FC.stableId(op())).toBe(FC.stableId(op()));
  });

  it("never invents a summary the court did not publish", () => {
    // CourtListener publishes no syllabus for these decisions, and the only
    // prose available is the raw first page of the PDF — a caption block
    // carrying the plaintiff's name in capitals. Every word of this summary is
    // a structured field.
    const s = FC.buildSummary(op(), decision());
    expect(s).toContain("District Court, District of Columbia");
    expect(s).toContain("Civil Action No. 2025-1234");
    expect(s).toMatch(/published no summary/i);
  });

  it("never asserts an effective date for a decision", () => {
    // Appeals and stays change what a decision means in practice, and the API
    // publishes no such date.
    expect(event().effectiveAt).toBeNull();
  });

  it("does not present a district-court decision as nationwide law", () => {
    // The most consequential caveat this source carries. A district judge binds
    // the parties before them, and a reader who thinks otherwise has been
    // seriously misled.
    const e = FC.toEvent(op({ court_id: "dcd" }), decision(), TODAY);
    expect(e.severity).toBe("notable");
    expect(e.limitations?.[0]).toMatch(/not nationwide law/i);
  });

  it("ranks an appellate decision as major and scopes it to its circuit", () => {
    const o = op({ court_id: "ca9", court: "Court of Appeals for the Ninth Circuit", status: "Published" });
    const e = FC.toEvent(o, FC.assessInclusion(o), TODAY);
    expect(e.severity).toBe("major");
    expect(e.limitations?.[0]).toMatch(/its own circuit/i);
  });

  it("always states that individual cases are deliberately excluded", () => {
    // A reader seeing few court events deserves to know that is a policy, not a
    // quiet docket.
    expect(event().limitations?.join(" ")).toMatch(/we report the legal rule, not the people/i);
  });

  it("warns that a decision's reach can change", () => {
    expect(event().limitations?.join(" ")).toMatch(/appeals, stays, and rehearings/i);
  });

  it("links to the opinion on CourtListener", () => {
    expect(FC.sourceUrl(op())).toBe("https://www.courtlistener.com/opinion/123456/league-v-dhs/");
  });

  it("classifies every event as a court decision", () => {
    expect(event().classification).toBe("court_decision");
  });

  it("emits no generated prose, so it needs no human review gate", () => {
    expect(event().reviewStatus).toBe("auto");
  });
});
