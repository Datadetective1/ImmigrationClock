// =============================================================================
// IMMIGRATION RELEVANCE AND MATERIALITY
//
// This is the fourth generation of this filter. The first three were lists of
// bare words matched with `includes()`, and each one shipped a category of
// document that had nothing to do with immigration to the top of a feed whose
// entire promise is "official U.S. immigration changes".
//
// Every false positive named below was measured in the live archive, not
// imagined. They are tests rather than a changelog because the failure mode is
// recurrent: someone adds one plausible-looking short word and 150 documents
// about boat races become immigration policy.
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  isImmigrationRelevant,
  materiality,
  isNonSubstantive,
  subjectHits,
  vetoedBy,
} from "@/domains/graph/immigration-filter";

describe("documents that must be admitted", () => {
  const REAL: Array<[string, string]> = [
    ["DHS Terminates Temporary Protected Status for Yemen", ""],
    ["Visas: Visa Bond Program", "An alien applying for a visa as a temporary visitor may be required to submit a bond."],
    ["Alien Registration Form and Evidence of Registration", ""],
    ["Naturalization Application Fee Adjustments", ""],
    ["Public Charge Ground of Inadmissibility", ""],
    ["Affirmative Asylum Referrals Without Interview", ""],
    ["9-11 Response and Biometric Entry-Exit Fee for H-1B and L-1 Visas", ""],
    ["Immigration Bonds; Technical Amendment", ""],
    ["EOIR Fees", "Executive Office for Immigration Review fee schedule."],
    ["Finding of Mass Influx of Aliens", ""],
    ["Permanent Employment Certification (PERM) Online Filing Release Notes", ""],
    ["Schedule of Fees for Consular Services", ""],
    ["Exercise of Time-Limited Authority To Increase the Fiscal Year 2026 Numerical Limitation for the H-2B Program", ""],
    ["Continuation of the National Emergencies With Respect to the Southern Border", ""],
    ["Student and Exchange Visitor Program: Optional Practical Training", ""],
  ];

  for (const [title, abstract] of REAL) {
    it(`admits "${title.slice(0, 56)}"`, () => {
      expect(isImmigrationRelevant(title, abstract), `subject hits: ${subjectHits(title, abstract)}`).toBe(true);
    });
  }
});

describe("documents that must be rejected", () => {
  // Each of these was in the live archive, labelled as a U.S. immigration
  // change, when this suite was written.
  const JUNK: Array<[string, string]> = [
    // "perm" matching "permission" / "permanent" / "permit" — 152 documents,
    // 64 of them ranked major. The single worst offender.
    ["Safety Zones; Annual Events in the Captain of the Port Detroit Zone", "permission of the Captain of the Port"],
    ["Safety Zones; Recurring Safety Zones in Captain of the Port Northern Great Lakes", "permission"],
    ["Safety Zone; Chevron GENESIS SPAR Outer Continental Shelf Facility", "permanent safety zone"],
    ["Safety Zone; Graduation Fireworks, San Francisco Bay", "permanent"],
    ["Limited Access Areas; Marine Events Within Captain of the Port Zone", "permission"],
    ["Amendment to Exemption for Certain Prohibited Transactions Involving AT&T Inc.", "permit"],
    ["Improving and Eliminating Regulations; Use of Permissible Flame Safety Lamps", "permissible"],
    ["Security Zone; Port of Corpus Christi Inner Harbor", "permanent"],

    // "removal" matching demolition and de-scheduling
    ["Schedules of Controlled Substances; Removal of Exemption Status", "removal"],
    ["Drawbridge Operation Regulation; Technical Amendment; Removal of Obsolete Drawbridges", "removal"],
    ["Great Lakes Pilotage Rates-2026 Annual Review", "removal"],
    ["Safety Zone; Cypress Passage Overhead Powerline Demolition and Removal", "removal"],

    // Class codes matching chemical names and table labels
    ["Schedules of Controlled Substances: Placement of Bromazolam in Schedule I", ""],
    ["Schedules of Controlled Substances: Placement of CUMYL-PEGACLONE in Schedule I", ""],

    // "border" matching maritime geography rather than immigration
    ["Shipping Safety Fairways Along the Atlantic Coast", ""],

    // Other families seen wearing an immigration label
    ["Longshore and Harbor Workers' Compensation Act: Quality Standards for Hearing Aids", ""],
    ["Registering NFA Firearms That Fall Out of Government Control", "permitting"],
    ["Sunrise Wind Farm Project Area, Outer Continental Shelf", "permanent"],
    ["Safety Zones; Rocket Launches in the Gulf of America", "permanent"],
  ];

  for (const [title, abstract] of JUNK) {
    it(`rejects "${title.slice(0, 56)}"`, () => {
      expect(isImmigrationRelevant(title, abstract)).toBe(false);
    });
  }

  it("rejects Coast Guard safety zones even if the abstract talks about aliens", () => {
    // The veto is deliberately stronger than the subject test. A safety zone is
    // not immigration policy however its abstract is worded.
    expect(
      isImmigrationRelevant("Safety Zone; Detroit River", "alien visa immigration asylum refugee")
    ).toBe(false);
    expect(vetoedBy("Safety Zone; Detroit River")).toBeTruthy();
  });
});

describe("the specific words that caused this", () => {
  it("no longer treats bare 'perm' as an immigration signal", () => {
    for (const w of ["permanent", "permission", "permit", "permissible", "permitting"]) {
      expect(isImmigrationRelevant(`Notice of ${w} something`, ""), w).toBe(false);
    }
  });

  it("still admits the PERM programme it was there for", () => {
    expect(isImmigrationRelevant("Permanent Employment Certification (PERM) Filing", "")).toBe(true);
    expect(isImmigrationRelevant("Labor Certification Process for Permanent Employment", "")).toBe(true);
  });

  it("no longer treats bare 'removal' as an immigration signal", () => {
    expect(isImmigrationRelevant("Removal of Obsolete Regulations", "")).toBe(false);
  });

  it("still admits immigration removal", () => {
    for (const t of ["Removal Proceedings Before an Immigration Judge", "Expedited Removal Expansion"]) {
      expect(isImmigrationRelevant(t, ""), t).toBe(true);
    }
  });

  it("does not read an agency's own name as the document's subject", () => {
    // "U.S. Customs and Border Protection" contains "border", and CBP names
    // itself in everything it publishes.
    expect(isImmigrationRelevant("Cargo Manifest Requirements", "U.S. Customs and Border Protection announces")).toBe(false);
  });

  it("does read USCIS as a subject signal, because that agency does one thing", () => {
    expect(isImmigrationRelevant("Fee Schedule Update", "USCIS is revising the fee schedule")).toBe(true);
  });
});

describe("materiality — Major must mean something", () => {
  it("rates a termination, a ban and a fee change as high impact", () => {
    expect(materiality("DHS Terminates Temporary Protected Status for Yemen", "")).toBe("high");
    expect(materiality("Naturalization Application Fee Adjustments", "")).toBe("high");
    expect(materiality("Suspension of Entry for Certain Nonimmigrants", "")).toBe("high");
  });

  it("rates a new obligation as high impact even when phrased as 'may be required'", () => {
    // The Visa Bond Program final rule, which the first cut of this list missed
    // because it matched only the noun "requirement".
    expect(
      materiality("Visas: Visa Bond Program", "An alien may be required to submit a bond and establishes a permanent program.")
    ).toBe("high");
  });

  it("rates housekeeping as low impact regardless of what it mentions", () => {
    for (const t of [
      "Agency Information Collection Activities; Revision; Guam-CNMI Visa Waiver",
      "Immigration Bonds; Technical Amendment",
      "Delegation of Authority 614-1",
      "OFLC Announces Webinar on March 25, 2026",
      "Privacy Act of 1974; System of Records",
    ]) {
      expect(materiality(t, ""), t).toBe("low");
      expect(isNonSubstantive(t), t).toBe(true);
    }
  });

  it("lets a non-substantive marker win over an impact word", () => {
    // A technical amendment that mentions a fee is still a technical amendment.
    expect(materiality("Immigration Bonds; Technical Amendment", "fee eligibility requirement")).toBe("low");
  });
});
