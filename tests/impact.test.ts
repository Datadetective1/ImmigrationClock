import { describe, it, expect } from "vitest";
import {
  validateImpact,
  impactDisclaimer,
  statedImpact,
  allImpacted,
  EMPTY_IMPACT,
  type EventImpact,
} from "@/domains/graph/impact";
import { extractImpact } from "@/domains/graph/extract-impact";
import { findCountriesInText, COUNTRIES, AMBIGUOUS_COUNTRY_NAMES } from "@/domains/graph/countries";
import { EVENTS, EVENT_STORE_META, significantEvents, eventsAffecting, eventCoverageNote } from "@/lib/event-store";
import { validateEvent } from "@/domains/graph/events";

function impact(over: Partial<EventImpact> = {}): EventImpact {
  return { ...EMPTY_IMPACT, countries: [], visaCategories: [], agencies: [], employers: [], universities: [], states: [], ...over };
}

// =============================================================================
// The highest-stakes claim the platform makes. A reader uses "who is affected"
// to decide whether a rule applies to them.
// =============================================================================
describe("impact validation", () => {
  it("requires an evidence quote for anything marked stated", () => {
    const errs = validateImpact(
      impact({ countries: [{ entityId: "country:nigeria", basis: "stated", confidence: 1 }] }),
      "e:1"
    );
    expect(errs.join()).toMatch(/no evidence quote/);
  });

  it("requires full confidence for a stated claim", () => {
    const errs = validateImpact(
      impact({
        countries: [{ entityId: "country:nigeria", basis: "stated", evidence: "Nationals of Nigeria…", confidence: 0.8 }],
      }),
      "e:1"
    );
    expect(errs.join()).toMatch(/confidence is not 1/);
  });

  it("refuses an inferred claim asserting full confidence", () => {
    const errs = validateImpact(
      impact({ visaCategories: [{ entityId: "visa:h-1b", basis: "inferred", confidence: 1 }] }),
      "e:1"
    );
    expect(errs.join()).toMatch(/inferred but claims full confidence/);
  });

  it("refuses to call a list exhaustive when it contains inferences", () => {
    const errs = validateImpact(
      impact({
        completeness: "exhaustive",
        countries: [{ entityId: "country:nigeria", basis: "inferred", confidence: 0.6 }],
      }),
      "e:1"
    );
    expect(errs.join()).toMatch(/exhaustive but includes inferred/);
  });

  it("refuses an empty impact that does not say why", () => {
    const bare = impact({ undetermined: undefined });
    expect(validateImpact(bare, "e:1").join()).toMatch(/empty but does not say why/);
  });

  it("rejects action text that reads as advice", () => {
    // ImmigrationClock describes what a document requires. It never tells an
    // individual what to do — that is legal advice, which the Directive forbids.
    const errs = validateImpact(
      impact({
        undetermined: "n/a",
        actionRequired: { summary: "You must post a bond before travelling.", evidence: "…" },
      }),
      "e:1"
    );
    expect(errs.join()).toMatch(/reads as advice/);
  });

  it("accepts a conditional description of the document's requirement", () => {
    const errs = validateImpact(
      impact({
        undetermined: "n/a",
        actionRequired: {
          summary: "The document states a requirement for those it covers.",
          evidence: "…may be required to submit a bond…",
        },
      }),
      "e:1"
    );
    expect(errs).toEqual([]);
  });

  it("always discloses that impact is not individual advice", () => {
    for (const c of ["exhaustive", "partial", "unspecified"] as const) {
      expect(impactDisclaimer(c)).toMatch(/not legal advice/i);
    }
    expect(impactDisclaimer("partial")).toMatch(/may be incomplete/i);
  });
});

// =============================================================================
// Country extraction. A wrong country tells a real person a rule does or does
// not affect their travel.
// =============================================================================
describe("country extraction", () => {
  it("finds countries in designation language", () => {
    const hits = findCountriesInText("The restriction applies to nationals of Nigeria, Algeria, and Zambia.");
    const names = hits.map((h) => h.name);
    expect(names).toContain("Nigeria");
    expect(names).toContain("Algeria");
    expect(names).toContain("Zambia");
  });

  it("captures the sentence as evidence", () => {
    const hit = findCountriesInText("Nationals of Benin must provide additional documentation.")[0];
    expect(hit.evidence).toMatch(/Nationals of Benin/);
  });

  it("requires country context for ambiguous names", () => {
    // "the State of Georgia" must not create an edge to the country Georgia.
    expect(findCountriesInText("A hearing was held in the State of Georgia.").map((h) => h.name)).not.toContain("Georgia");
    expect(findCountriesInText("Nationals of Georgia are covered.").map((h) => h.name)).toContain("Georgia");
  });

  it("treats Turkey and Chad as ambiguous", () => {
    expect(AMBIGUOUS_COUNTRY_NAMES.has("turkey")).toBe(true);
    expect(AMBIGUOUS_COUNTRY_NAMES.has("chad")).toBe(true);
  });

  it("prefers the longest surface form", () => {
    const names = findCountriesInText("Citizens of South Korea are exempt.").map((h) => h.name);
    expect(names).toContain("South Korea");
  });

  it("resolves alternate official names", () => {
    expect(findCountriesInText("Nationals of Burma are covered.").map((h) => h.name)).toContain("Myanmar");
    expect(findCountriesInText("Citizens of the Republic of Korea are covered.").map((h) => h.name)).toContain("South Korea");
  });

  it("has unique ISO codes", () => {
    const iso = COUNTRIES.map((c) => c.iso2);
    expect(new Set(iso).size).toBe(iso.length);
  });
});

// =============================================================================
// Extraction end-to-end. These pin the two precision failures found against
// live Federal Register documents.
// =============================================================================
describe("impact extraction", () => {
  it("extracts visa scope with its evidence", () => {
    const im = extractImpact({
      title: "Visas: Visa Bond Program",
      abstract:
        "An alien applying for a visa as a temporary visitor for business or pleasure (B-1/B-2) may be required to submit a bond.",
      agencyIds: ["agency:dos"],
      effectiveAt: "2026-08-03",
    });
    expect(im.visaCategories.map((v) => v.entityId)).toContain("visa:b-1-b-2");
    expect(im.visaCategories[0].basis).toBe("stated");
    expect(im.visaCategories[0].evidence).toMatch(/B-1\/B-2/);
    expect(validateImpact(im, "e:1")).toEqual([]);
  });

  it("does not infer countries from background discussion", () => {
    // REGRESSION: a general scope filter pulled Canada and Mexico out of a
    // passage about a DHS overstay report and concluded the Visa Bond rule
    // covered Canadian and Mexican travellers. It does not.
    const im = extractImpact({
      title: "Visas: Visa Bond Program",
      abstract: "A rule concerning visa bonds.",
      body:
        "In the DHS FY 2024 Entry/Exit Overstay Report, DHS data indicated there were over 480,000 suspected " +
        "in-country overstays, including aliens who arrived from Canada and Mexico by land.",
      agencyIds: ["agency:dos"],
    });
    expect(im.countries).toEqual([]);
  });

  it("extracts countries only from explicit designation language", () => {
    const im = extractImpact({
      title: "Restriction",
      abstract: "The Secretary designates certain countries.",
      body: "This restriction applies to nationals of Nigeria and Zambia. Separately, Canada was consulted.",
      agencyIds: ["agency:dos"],
    });
    const names = im.countries.map((c) => c.entityId);
    expect(names).toContain("country:nigeria");
    expect(names).toContain("country:zambia");
    // Mentioned in background, not designated.
    expect(names).not.toContain("country:canada");
  });

  it("says where the list lives when a document delegates its scope", () => {
    const im = extractImpact({
      title: "Visa Bond Program",
      abstract: "A rule about bonds.",
      body:
        "Visa bonds may be required from certain business/pleasure visa applicants who are nationals of " +
        "countries with high overstay rates, deficient information sharing, and insufficient identity verification.",
      agencyIds: ["agency:dos"],
    });
    expect(im.countries).toEqual([]);
    expect(im.scopeDefinedElsewhere).toBeDefined();
    expect(im.scopeDefinedElsewhere!.evidence).toMatch(/high overstay rates/);
    expect(im.scopeDefinedElsewhere!.note).toMatch(/separate government determination/);
  });

  it("never claims exhaustive completeness from an abstract alone", () => {
    const im = extractImpact({
      title: "Rule",
      abstract: "Applies to nationals of Nigeria. The following countries are covered.",
      agencyIds: ["agency:dos"],
    });
    expect(im.completeness).not.toBe("exhaustive");
  });

  it("says so plainly when scope cannot be determined", () => {
    const im = extractImpact({ title: "Meeting notice", abstract: "A public meeting will be held." });
    expect(im.undetermined).toBeTruthy();
    expect(validateImpact(im, "e:1")).toEqual([]);
  });

  it("marks issuing agencies derived, not stated", () => {
    // An agency implementing its own rule is a structural fact, not a textual
    // claim — so it needs no quote, but it must not masquerade as one.
    const im = extractImpact({ title: "Rule", abstract: "Applies to nationals of Nigeria.", agencyIds: ["agency:dos"] });
    const agency = im.agencies[0];
    expect(agency.basis).toBe("derived");
    expect(agency.evidence).toBeUndefined();
    expect(validateImpact(im, "e:1")).toEqual([]);
  });
});

// =============================================================================
// The store itself.
// =============================================================================
describe("event store", () => {
  it("contains only valid events", () => {
    const errs = EVENTS.flatMap(validateEvent);
    expect(errs.slice(0, 5)).toEqual([]);
  });

  it("never exposes a draft", () => {
    expect(EVENTS.every((e) => e.reviewStatus !== "draft")).toBe(true);
  });

  it("is sorted newest first", () => {
    for (let i = 1; i < EVENTS.length; i++) {
      expect(EVENTS[i - 1].publishedAt >= EVENTS[i].publishedAt).toBe(true);
    }
  });

  it("gives every event a traceable government source", () => {
    for (const e of EVENTS) {
      expect(e.sourceUrl).toMatch(/^https:\/\//);
      expect(e.sourceKey).toBeTruthy();
    }
  });

  it("keeps routine paperwork out of the significant feed", () => {
    expect(significantEvents().every((e) => e.severity !== "routine")).toBe(true);
  });

  it("answers 'does this affect me' only from stated impact", () => {
    // eventsAffecting must not return an event that merely mentions an entity.
    for (const e of eventsAffecting("visa:b-1-b-2")) {
      const stated = statedImpact(e.impact!).map((x) => x.entityId);
      expect(stated).toContain("visa:b-1-b-2");
    }
  });

  it("records per-adapter outcomes", () => {
    expect(EVENT_STORE_META.adapters.length).toBeGreaterThan(0);
    for (const a of EVENT_STORE_META.adapters) {
      expect(typeof a.ok).toBe("boolean");
      expect(a.key).toBeTruthy();
    }
  });

  it("describes its own coverage without implying completeness", () => {
    const note = eventCoverageNote();
    expect(note).toMatch(/More sources are being added/);
    expect(note).toMatch(/do not yet ingest/);
  });

  it("carries an impact answer on every event", () => {
    for (const e of EVENTS) {
      expect(e.impact, `${e.id} has no impact record`).toBeDefined();
      const im = e.impact!;
      // Either it names someone, or it explains why it cannot.
      const answered = allImpacted(im).length > 0 || !!im.undetermined || !!im.scopeDefinedElsewhere;
      expect(answered, `${e.id} answers neither who is affected nor why not`).toBe(true);
    }
  });
});
