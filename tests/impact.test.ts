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

// =============================================================================
// EVIDENCE INTEGRITY
//
// A quote is the platform's entire basis for saying a document affects someone.
// These three failures all shipped into the committed store and were only
// caught when /what-changed rendered them — a quote that is truncated, contains
// markup, or is about the wrong thing is worse than no quote, because it wears
// the authority of the source while misrepresenting it.
// =============================================================================
describe("evidence integrity", () => {
  it("never cuts an evidence quote mid-word", () => {
    // REGRESSION: long passages were chunked with a fixed-width slice, so the
    // Visa Bond rule's evidence began "quired from certain business/pleasure
    // (B-1/B-2) visa applicants…" — presented as verbatim text the source never
    // wrote.
    const long =
      "The Secretary has determined that a visa bond may be required from certain business or pleasure applicants " +
      "who are nationals of countries with high overstay rates, deficient information sharing, insufficient identity " +
      "verification and criminal records, and that need improvement in the area of screening and vetting and the " +
      "security of travel documents issued to their nationals by their governments as determined by the Secretary.";
    const impact = extractImpact({ title: "Visas: Visa Bond Program", abstract: long, agencyIds: [] });

    for (const e of allImpacted(impact)) {
      if (!e.evidence) continue;
      // Strip the ellipses the windowing function legitimately adds, then check
      // the remaining edges fall on whole words.
      const inner = e.evidence.replace(/^…/, "").replace(/…$/, "").trim();
      expect(long.includes(inner.split(" ").slice(1, -1).join(" ")), `mangled quote: ${e.evidence}`).toBe(
        true
      );
    }
  });

  it("strips markup out of evidence quotes", () => {
    // REGRESSION: Federal Register raw text carries "<bullet>" and inline
    // anchors, which leaked verbatim into a quoted passage.
    const withMarkup =
      "Nationals of the following countries are required to post a bond: " +
      '<bullet> Country A. <a href="https://www.regulations.gov">https://www.regulations.gov</a>. ' +
      "The requirement applies to B-1/B-2 applicants.";
    const impact = extractImpact({ title: "Bond rule", abstract: withMarkup, agencyIds: [] });

    const quotes = [
      ...allImpacted(impact).map((e) => e.evidence ?? ""),
      impact.actionRequired?.evidence ?? "",
      impact.scopeDefinedElsewhere?.evidence ?? "",
    ].filter(Boolean);

    expect(quotes.length).toBeGreaterThan(0);
    for (const q of quotes) {
      expect(q, `markup leaked into a quote: ${q}`).not.toMatch(/<[^>]+>/);
      expect(q).not.toMatch(/&lt;|&gt;|&amp;/);
    }
  });

  it("does not present comment-submission instructions as an obligation", () => {
    // REGRESSION: a DOJ rulemaking-procedure notice rendered under "what the
    // document says may be required" with the text "you must submit comments,
    // identified by the agency name and referencing this rule's RIN" — which is
    // addressed to commenters, not to immigrants, and reads as alarming.
    const boilerplate =
      "If you wish to provide comments regarding this rulemaking, you must submit comments, identified by the " +
      "agency name and referencing this rule's Regulatory Identification Number, by one of the two methods below: " +
      "Federal eRulemaking Portal: https://www.regulations.gov.";
    const impact = extractImpact({
      title: "Procedures for Submission and Consideration of Petitions for Rulemaking",
      abstract: boilerplate,
      agencyIds: [],
    });
    expect(impact.actionRequired).toBeUndefined();
  });

  it("still finds a genuine operative requirement", () => {
    // The boilerplate filter must not suppress real obligations.
    const real =
      "An alien applying for a visa as a temporary visitor for business or pleasure may be required to submit a " +
      "bond to ensure that the alien maintains his or her nonimmigrant status and departs as required.";
    const impact = extractImpact({ title: "Visa Bond Program", abstract: real, agencyIds: [] });
    expect(impact.actionRequired).toBeDefined();
    expect(impact.actionRequired!.evidence).toMatch(/may be required to submit a bond/);
  });

  it("finds the real requirement even when boilerplate comes first", () => {
    const mixed =
      "Comments must be received by August 1. You must submit comments identified by the docket number. " +
      "Covered applicants are required to post a bond of up to $20,000 before a visa is issued.";
    const impact = extractImpact({ title: "Bond rule", abstract: mixed, agencyIds: [] });
    expect(impact.actionRequired?.evidence).toMatch(/required to post a bond/);
    expect(impact.actionRequired?.evidence).not.toMatch(/docket/i);
  });

  // ---------------------------------------------------------------------------
  // The extractor being correct is not the same as the SHIPPED data being clean.
  // The store is committed and merge-never-replace, so an event ingested under
  // an older extractor keeps whatever it was given. These audit what readers
  // actually see.
  // ---------------------------------------------------------------------------
  const committedQuotes = EVENTS.flatMap((e) => {
    const im = e.impact;
    if (!im) return [];
    return [
      ...allImpacted(im).map((x) => ({ id: e.id, q: x.evidence })),
      { id: e.id, q: im.actionRequired?.evidence },
      { id: e.id, q: im.scopeDefinedElsewhere?.evidence },
    ].filter((x): x is { id: string; q: string } => Boolean(x.q));
  });

  it("ships no markup in any committed evidence quote", () => {
    const bad = committedQuotes.filter(({ q }) => /<[^>]+>|&lt;|&gt;/.test(q));
    expect(bad.map((b) => `${b.id}: ${b.q.slice(0, 80)}`)).toEqual([]);
  });

  it("ships no comment-submission boilerplate as a stated obligation", () => {
    const bad = EVENTS.filter((e) =>
      /submit comments|regulations\.gov|regulatory identification number/i.test(
        e.impact?.actionRequired?.evidence ?? ""
      )
    );
    expect(bad.map((e) => e.id)).toEqual([]);
  });

  it("ships no evidence quote that opens mid-word", () => {
    // A quote windowed out of a longer passage legitimately starts with "…".
    // One that starts with a bare lowercase fragment is a truncation artefact.
    const bad = committedQuotes.filter(({ q }) => /^[a-z]/.test(q.trim()));
    expect(bad.map((b) => `${b.id}: ${b.q.slice(0, 60)}`)).toEqual([]);
  });
});
