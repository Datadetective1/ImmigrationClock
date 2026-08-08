// =============================================================================
// RANKING — editorial priority by impact, not by keyword strength
//
// The order used to be severity then recency, both properties of the DOCUMENT
// rather than of the CHANGE. A policy alert about DNA testing outranked a
// revision of the evidentiary standards governing every Request for Evidence
// USCIS issues, because the first summary happened to contain "require".
//
// These tests fix the PRIORITY ORDER, not this week's stories. Every fixture is
// synthetic; none names a real headline from the issue being launched.
// =============================================================================

import { describe, it, expect } from "vitest";
import { rankEvents, rankingFactors } from "@/lib/newsletter/ranking";
import type { ImmigrationEvent } from "@/domains/graph/events";

const FROM = "2026-08-01";
const TO = "2026-08-08";

/** Minimal event. Only the fields ranking reads are meaningful. */
function ev(over: Partial<ImmigrationEvent> & { id: string }): ImmigrationEvent {
  return {
    sourceKey: "federal_register",
    classification: "final_rule",
    severity: "notable",
    title: "",
    summary: "",
    publishedAt: "2026-08-05",
    effectiveAt: null,
    lastVerifiedAt: "2026-08-08",
    sourceUrl: "https://www.federalregister.gov/documents/x",
    entities: [],
    impact: {
      countries: [],
      visaCategories: [],
      agencies: [],
      employers: [],
      universities: [],
      states: [],
      completeness: "unspecified",
    },
    reviewStatus: "auto",
    limitations: [],
    ...over,
  } as unknown as ImmigrationEvent;
}

const score = (e: ImmigrationEvent) => rankingFactors(e, FROM, TO).score;
const order = (es: ImmigrationEvent[]) => rankEvents(es, FROM, TO).map((e) => e.id);

describe("the priority order the product promises", () => {
  it("puts breadth above every other factor", () => {
    // A universal change with nothing else going for it must beat a narrow one
    // that maxes out obligation, magnitude and authority.
    const broad = ev({
      id: "broad",
      title: "Requests for Evidence and Notices of Intent to Deny",
      summary: "Updating guidance on evidentiary standards.",
      classification: "announcement",
      severity: "routine",
      publishedAt: FROM,
    });
    const narrow = ev({
      id: "narrow",
      title: "Termination of status for certain aliens",
      summary: "Terminates eligibility, revokes benefits and requires a fee. Nationals of one country.",
      classification: "executive_action",
      severity: "major",
      publishedAt: TO,
    });
    expect(score(broad)).toBeGreaterThan(score(narrow));
    expect(order([narrow, broad])).toEqual(["broad", "narrow"]);
  });

  it("puts an obligation change above magnitude, authority and recency", () => {
    const obligation = ev({
      id: "obligation",
      title: "Fee and eligibility requirements revised",
      summary: "Requires a bond and revises eligibility.",
      classification: "announcement",
      severity: "routine",
      publishedAt: FROM,
    });
    const merelyFinal = ev({
      id: "merely-final",
      title: "Program post designations",
      summary: "Updates a list.",
      classification: "final_rule",
      severity: "major",
      publishedAt: TO,
    });
    expect(score(obligation)).toBeGreaterThan(score(merelyFinal));
  });

  it("puts authority above recency", () => {
    const common = { title: "Visa processing update", summary: "Updates processing." };
    const older = ev({ ...common, id: "older", classification: "final_rule", publishedAt: FROM });
    const newer = ev({ ...common, id: "newer", classification: "proposed_rule", publishedAt: TO });
    expect(score(older)).toBeGreaterThan(score(newer));
  });

  it("uses recency only to break a genuine tie", () => {
    const common = { title: "Visa processing update", summary: "Updates processing." };
    const older = ev({ ...common, id: "a-older", publishedAt: FROM });
    const newer = ev({ ...common, id: "b-newer", publishedAt: TO });
    expect(order([older, newer])).toEqual(["b-newer", "a-older"]);
  });
});

describe("the specific inversion this replaced", () => {
  // A change to Requests for Evidence touches every benefit request USCIS
  // adjudicates. A change to DNA evidence touches the subset claiming a genetic
  // relationship. Both say "evidence"; only one says "require".
  const rfe = ev({
    id: "rfe",
    title: "Evidence, Requests for Evidence, and Notices of Intent to Deny",
    summary: "Updating policy guidance regarding evidentiary standards, RFEs and NOIDs.",
    classification: "updated_information",
    severity: "notable",
  });
  const dna = ev({
    id: "dna",
    title: "Suggesting DNA Testing When Issuing a Request for Additional Evidence",
    summary: "Requires officers to suggest DNA testing to establish a claimed genetic relationship.",
    classification: "updated_information",
    severity: "major",
  });

  it("ranks the universally applicable change first", () => {
    expect(order([dna, rfe])).toEqual(["rfe", "dna"]);
  });

  it("does so on breadth, not on any downstream factor", () => {
    expect(rankingFactors(rfe, FROM, TO).breadth).toBeGreaterThan(rankingFactors(dna, FROM, TO).breadth);
  });

  it("does NOT simply invert the old order — a stronger keyword still helps at equal breadth", () => {
    const bland = ev({ ...dna, id: "bland", summary: "Guidance on evidence." });
    expect(score(dna)).toBeGreaterThan(score(bland));
  });
});

describe("scoped is not narrow", () => {
  // The first cut of this module demoted the Visa Bond Program final rule to
  // the narrowest band because it names one visa category, B-1/B-2 — the
  // largest visa class there is — putting it below a district-court FOIA
  // decision. Naming a category says WHERE a rule applies, not how few people
  // are there.
  const visaScoped = ev({
    id: "visa-scoped",
    title: "Visa Bond Program",
    summary: "An alien applying for a B-1/B-2 visa may be required to submit a bond.",
    classification: "final_rule",
    severity: "major",
    impact: {
      countries: [],
      visaCategories: [{ entityId: "visa:b-1-b-2", basis: "derived", confidence: 0.9 }],
      agencies: [],
      employers: [],
      universities: [],
      states: [],
      completeness: "unspecified",
    },
  } as never);

  it("does not demote a rule merely for naming a visa category", () => {
    expect(rankingFactors(visaScoped, FROM, TO).breadth).toBe(2);
  });

  it("DOES demote a rule scoped to a handful of countries", () => {
    const countryScoped = ev({
      ...visaScoped,
      id: "country-scoped",
      impact: {
        countries: [{ entityId: "country:yemen", basis: "explicit", confidence: 1 }],
        visaCategories: [],
        agencies: [],
        employers: [],
        universities: [],
        states: [],
        completeness: "explicit",
      },
    } as never);
    expect(rankingFactors(countryScoped, FROM, TO).breadth).toBe(1);
  });

  it("keeps a country-scoped termination high on magnitude, where it belongs", () => {
    const tps = ev({
      id: "tps",
      title: "DHS Terminates Temporary Protected Status for Yemen",
      summary: "Terminates the designation and ends eligibility.",
      classification: "final_rule",
      severity: "major",
      impact: {
        countries: [{ entityId: "country:yemen", basis: "explicit", confidence: 1 }],
        visaCategories: [],
        agencies: [],
        employers: [],
        universities: [],
        states: [],
        completeness: "explicit",
      },
    } as never);
    const f = rankingFactors(tps, FROM, TO);
    expect(f.breadth).toBe(1);
    expect(f.magnitude).toBe(3);
    expect(f.obligation).toBe(3);
  });
});

describe("determinism", () => {
  const sample = [
    ev({ id: "a", title: "Fee schedule", summary: "Requires a fee." }),
    ev({ id: "b", title: "Guidance update", summary: "Updates guidance." }),
    ev({ id: "c", title: "Benefit request standards", summary: "Adjudication standards." }),
  ];

  it("produces the same order every time", () => {
    const once = order(sample);
    for (let i = 0; i < 5; i++) expect(order(sample)).toEqual(once);
  });

  it("does not depend on input order", () => {
    expect(order(sample)).toEqual(order([...sample].reverse()));
  });

  it("breaks exact ties by id, never by position or clock", () => {
    const twin = (id: string) => ev({ id, title: "Same", summary: "Same." });
    expect(order([twin("z"), twin("a")])).toEqual(["a", "z"]);
  });

  it("reads no clock — the same archive ranks identically on any day", () => {
    const a = rankEvents(sample, FROM, TO).map((e) => e.id);
    const b = rankEvents(sample, FROM, TO).map((e) => e.id);
    expect(a).toEqual(b);
  });
});
