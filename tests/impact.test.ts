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
import { BODY_SCAN_LIMIT, formsFor } from "@/domains/graph/forms";
import { richText } from "@/domains/graph/text";
import { isStrong } from "@/domains/graph/classification";
import { VISA_CATEGORIES, type EntityId } from "@/domains/graph/entities";
import { findCountriesInText, countriesFor, COUNTRIES, AMBIGUOUS_COUNTRY_NAMES } from "@/domains/graph/countries";
import { confidenceFor } from "@/domains/graph/classification";
import { toPublicChange } from "@/lib/intelligence/change";
import { sourceTextFor } from "@/lib/source-text";
import { EVENTS, EVENT_STORE_META, significantEvents, eventsAffecting, eventCoverageNote } from "@/lib/event-store";
import { validateEvent } from "@/domains/graph/events";

const BARE_EVENT = {
  id: "e:0",
  title: "",
  summary: "",
  date: "2026-09-01",
  sourceKey: "federal_register",
  source: { name: "Federal Register", url: "https://www.federalregister.gov/" },
  severity: "medium",
  classification: "rule",
  status: "in_effect",
  entities: [],
  reviewStatus: "auto",
  limitations: [],
};

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
    // Mentioned in background, not designated.
    expect(names).not.toContain("country:canada");
  });

  it("keeps every country in a coordinated designation list", () => {
    // WAS A KNOWN LIMITATION, NOW FIXED. Relations are read from the words
    // immediately before a name, and a designation phrase only ever sits
    // immediately before the FIRST name in a list, so "nationals of Nigeria and
    // Zambia" kept Nigeria and dropped Zambia. That is the standard grammar of
    // a designation notice, which made it a systematic hole rather than an edge
    // case: on the committed archive the fix recovers 14 classifications,
    // including every country named in the H-2B supplemental cap allocation.
    const listed = (text: string) =>
      findCountriesInText(text).filter((h) => h.isScope).map((h) => h.entityId).sort();

    expect(listed("This restriction applies to nationals of Nigeria and Zambia.")).toEqual([
      "country:nigeria",
      "country:zambia",
    ]);
    expect(listed("Citizens of Cuba and Haiti may apply.")).toEqual([
      "country:cuba",
      "country:haiti",
    ]);
    expect(listed("Applicants from Mexico and Guatemala must provide documentation.")).toEqual([
      "country:guatemala",
      "country:mexico",
    ]);
    // A long list, an Oxford comma, and an item carrying its own article.
    expect(
      listed("The suspension applies to nationals of Afghanistan, Burma, Chad, and the Republic of the Congo.")
    ).toEqual(["country:afghanistan", "country:chad", "country:congo-republic", "country:myanmar"]);
  });

  it("does not let a designation list reach across prose into a background mention", () => {
    // THE ADVERSARIAL HALF, and the reason the rule demands a pure enumeration
    // between the designation phrase and the name. Loosening it to "a
    // designation phrase appears somewhere earlier in the sentence" would
    // promote every country named later in the same sentence, which is exactly
    // the precision failure the relation model was built to prevent.
    const scoped = (text: string) =>
      findCountriesInText(text).filter((h) => h.isScope).map((h) => h.entityId);

    // A verb between the list and the name breaks it.
    expect(scoped("Nationals of Nigeria were discussed alongside Canada in the report.")).toEqual([
      "country:nigeria",
    ]);
    // A comparison, not a designation. No designation phrase at all.
    expect(
      scoped("other countries/locations such as Canada, the UK, Australia and New Zealand are shut down")
    ).toEqual([]);
    // A citation naming two parties is still a citation.
    expect(scoped("Agreement Between the United States and Guatemala on Cooperation.")).toEqual([]);
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
// THE INGESTION PATH READS THE BODY FOR FORMS
//
// The defect these tests exist to prevent: formsFor() grew a `body` parameter
// and the offline re-extraction pass started passing one, but extractImpact()
// — the only classifier that runs on a live deploy — was never updated. So the
// published forms recall of 58% was earned by a pass that never ran in
// production, while every newly ingested document was silently classified by
// the title and abstract alone, which scores 31% on the same ground truth.
//
// Paperwork Reduction Act notices are the reason this matters: their titles are
// all "Agency Information Collection Activities" and the form they are actually
// about is named only in the body.
//
// These tests pin the fix from both sides. Reading the body must find the form,
// and it must NOT become a licence to promote every form a rule happens to
// cite — that precision is what the whole classification grade rests on.
// =============================================================================
describe("forms are classified from the document body at ingestion", () => {
  const PRA_TITLE = "Agency Information Collection Activities; Revision of a Currently Approved Collection";
  const PRA_ABSTRACT =
    "The Department of Homeland Security invites the general public and other Federal agencies to comment " +
    "upon this proposed collection of information.";

  const formIds = (im: ReturnType<typeof extractImpact>) => (im.forms ?? []).map((f) => f.entityId);
  const strongFormIds = (im: ReturnType<typeof extractImpact>) =>
    (im.forms ?? []).filter((f) => isStrong(f.method)).map((f) => f.entityId);

  it("retains a form named only in the body, which the title never mentions", () => {
    // THE REGRESSION. Before the fix this returned no forms at all, because the
    // body was not passed to the classifier.
    const im = extractImpact({
      title: PRA_TITLE,
      abstract: PRA_ABSTRACT,
      body:
        "Revision of the currently approved collection: Form I-765, Application for Employment " +
        "Authorization. The estimated annual burden is 1,200,000 responses.",
      agencyIds: ["agency:uscis"],
    });
    expect(strongFormIds(im)).toContain("form:i-765");
    expect(validateImpact(im, "e:1")).toEqual([]);
  });

  it("carries the body quote it derived the form from", () => {
    // A classification whose evidence cannot be re-read is the thing the source
    // text store was built to stop. Reading the body must not reintroduce it.
    const im = extractImpact({
      title: PRA_TITLE,
      abstract: PRA_ABSTRACT,
      body: "Revision of the currently approved collection: Form I-765, Application for Employment Authorization.",
      agencyIds: ["agency:uscis"],
    });
    const form = (im.forms ?? []).find((f) => f.entityId === "form:i-765")!;
    expect(form.evidence).toBeTruthy();
    expect(form.evidence).toMatch(/I-765/);
    expect(form.basis).toBe("stated");
  });

  it("does not promote a form the body merely cites", () => {
    // PRECISION GUARD. Federal Register prose cites forms constantly. Reading
    // the body must not turn every citation into a subject.
    const im = extractImpact({
      title: "Visas: Visa Bond Program",
      abstract: "A rule concerning visa bonds.",
      body:
        "As discussed in the 2019 rulemaking, see 84 FR 12345, applicants have historically submitted " +
        "Form I-134, Declaration of Financial Support, in support of such requests.",
      agencyIds: ["agency:dos"],
    });
    expect(strongFormIds(im)).not.toContain("form:i-134");
  });

  it("still reads a form from the title, at full strength", () => {
    const im = extractImpact({
      title: "Fee Adjustment for Form I-246, Application for a Stay of Deportation or Removal",
      abstract: "ICE is adjusting the fee.",
      agencyIds: ["agency:ice"],
    });
    const form = (im.forms ?? []).find((f) => f.entityId === "form:i-246")!;
    expect(form).toBeTruthy();
    expect(form.method).toBe("explicit_source");
  });

  it("still reads a form from the abstract when the title omits it", () => {
    const im = extractImpact({
      title: "Naturalization Application Fee Adjustments",
      abstract: "This rule adjusts the fee for Form N-400, Application for Naturalization.",
      agencyIds: ["agency:uscis"],
    });
    expect(strongFormIds(im)).toContain("form:n-400");
  });

  it("finds nothing when there is no body and no form is named", () => {
    const im = extractImpact({ title: PRA_TITLE, abstract: PRA_ABSTRACT, agencyIds: ["agency:uscis"] });
    expect(formIds(im)).toEqual([]);
  });

  it("stops reading at the body scan limit", () => {
    // The offline pass truncated the body and the ingestion path did not, which
    // is a second way for the two to disagree. The cap now lives in the
    // classifier, so neither caller can drift from the measured behaviour.
    const named = "Revision of the currently approved collection: Form I-765, Application for Employment Authorization.";
    const beyond = `${"filler sentence about unrelated matters. ".repeat(2_000)}${named}`;
    expect(beyond.length).toBeGreaterThan(BODY_SCAN_LIMIT);

    const im = extractImpact({ title: PRA_TITLE, abstract: PRA_ABSTRACT, body: beyond });
    expect(formIds(im)).toEqual([]);

    const within = extractImpact({ title: PRA_TITLE, abstract: PRA_ABSTRACT, body: named });
    expect(strongFormIds(within)).toContain("form:i-765");
  });

});

// =============================================================================
// THE MAINTENANCE PASS READS THE SAME TEXT AS INGESTION
//
// scripts/reclassify-events.ts re-runs the classifier over the committed
// archive and OVERWRITES impact.forms wholesale. That is intentional — re-
// running the classifier is the point of the pass — and it is exactly why the
// text it reads has to match what ingestion reads.
//
// It did not. formsFor() grew a body parameter, the script kept passing two
// arguments, and a maintenance run would have replaced body-derived forms with
// a title-and-abstract-only answer. Measured on this archive: 17 classifications
// across 55 records, every one of them weak — which is why a strong-only guard
// would have watched it happen in silence.
//
// The script cannot be imported (it is a main() with side effects), so what is
// pinned here is the contract it depends on: the retained body is the canonical
// text, and reclassifying from it is a no-op on the archive.
// =============================================================================
describe("reclassification cannot silently degrade the archive", () => {
  const stored = (EVENTS as unknown as { id: string; title: string; summary: string; impact?: { forms?: { entityId: string; method?: string }[] } }[]);

  it("stores the same text ingestion classifies, byte for byte", () => {
    // The whole fix rests on this. The store holds richText(body); ingestion
    // passes richText(body). They are the same string only because richText is
    // idempotent, so that is asserted rather than assumed.
    let checked = 0;
    for (const e of stored) {
      const text = sourceTextFor(e.id);
      if (!text) continue;
      checked++;
      expect(richText(text), e.id).toBe(text);
    }
    expect(checked, "the store holds documents").toBeGreaterThan(100);
  });

  it("reproduces every stored form classification from title, summary and body", () => {
    // If this fails, a maintenance run would rewrite the archive into something
    // other than what it holds — which is the defect, in the form it shipped.
    const shape = (list: readonly { entityId: string; method?: string }[]) =>
      [...list].map((f) => `${f.entityId}|${f.method}`).sort().join(",");
    let compared = 0;
    for (const e of stored) {
      const before = e.impact?.forms ?? [];
      if (before.length === 0) continue;
      compared++;
      const after = formsFor(richText(e.title ?? ""), richText(e.summary ?? ""), sourceTextFor(e.id) ?? "");
      expect(shape(after), e.id).toBe(shape(before));
    }
    expect(compared, "some records carry forms").toBeGreaterThan(100);
  });

  it("loses body-derived classifications when the body is withheld", () => {
    // The defect itself, measured. This test is the reason the guard in
    // reclassify-events.ts counts weak losses too.
    let lost = 0;
    for (const e of stored) {
      const withoutBody = formsFor(richText(e.title ?? ""), richText(e.summary ?? ""));
      if (withoutBody.length === 0) continue; // no overwrite would happen
      const after = new Set(withoutBody.map((f) => f.entityId));
      for (const b of e.impact?.forms ?? []) if (!after.has(b.entityId)) lost++;
    }
    expect(lost, "withholding the body still costs classifications").toBeGreaterThan(0);
  });

  it("keeps a body-only form, a title form, and invents neither", () => {
    const body = "Revision of the currently approved collection: Form I-765, Application for Employment Authorization.";
    const bodyOnly = formsFor("Agency Information Collection Activities", "", body);
    expect(bodyOnly.map((f) => f.entityId)).toContain("form:i-765");

    const titled = formsFor("Fee Adjustment for Form I-246", "", body);
    const ids = titled.map((f) => f.entityId);
    expect(ids).toContain("form:i-246");
    expect(ids).toContain("form:i-765");

    // No malformed or partial identifier from either route.
    for (const f of [...bodyOnly, ...titled]) {
      expect(f.entityId, f.entityId).toMatch(/^form:[a-z]+-\d{1,4}[a-z]?$/);
      expect(f.evidence, f.entityId).toBeTruthy();
      expect(f.method, f.entityId).toBeTruthy();
    }
  });
});

// =============================================================================
// EVERY STORED QUOTE MUST RE-DERIVE ITS OWN CLAIM
//
// A span runs to 400 characters and clip() trims at 320, so a visa named in the
// last eighty produced a quote that did not contain it. One record claimed H-1B
// on a quote about 8 CFR 214.2(j), which is J-1. That is worse than a missing
// classification: it is one a reader cannot check, on a platform whose entire
// claim is that the quotes are real.
// =============================================================================
describe("a visa quote contains the visa it is a quote for", () => {
  // Built exactly as extract-impact builds them, from the same seed entities,
  // so the test asks the question the extractor asked rather than a guess at it.
  const HYPHENATED = /^[a-z]{1,2}-\d/i;
  const SURFACES = new Map<string, RegExp[]>(
    VISA_CATEGORIES.map((v) => [
      v.id as string,
      [v.name, ...(v.aliases ?? [])]
        .filter((x) => x.length >= 4 || HYPHENATED.test(x))
        .map(
          (x) =>
            new RegExp(
              `(?<![a-z0-9])${x.toLowerCase()}(?![a-z0-9])`,
              "i"
            )
        ),
    ])
  );

  it("holds for every record in the archive that ingestion classifies", () => {
    let checked = 0;
    for (const e of (EVENTS as unknown as { id: string; title: string; summary: string }[])) {
      const im = extractImpact({
        title: e.title ?? "",
        abstract: e.summary ?? "",
        body: sourceTextFor(e.id),
        agencyIds: [],
        effectiveAt: null,
      });
      for (const v of im.visaCategories ?? []) {
        const surfaces = SURFACES.get(v.entityId) ?? [];
        if (surfaces.length === 0) continue;
        checked++;
        expect(v.evidence, `${e.id} ${v.entityId}`).toBeTruthy();
        expect(
          surfaces.some((re) => re.test(v.evidence ?? "")),
          `${e.id} ${v.entityId}: the stored quote does not contain the visa it claims`
        ).toBe(true);
      }
    }
    expect(checked, "some classifications were checked").toBeGreaterThan(30);
  });

  it("re-centres the quote when a plain clip would lose the term", () => {
    const tail = "This part applies to aliens who are described in the preceding paragraph. ";
    const body = `${tail.repeat(6)}This rule applies to aliens who are beneficiaries of H-1B petitions and must be registered.`;
    const im = extractImpact({ title: "Registration", abstract: "A rule.", body });
    const h1bEntry = (im.visaCategories ?? []).find((v) => v.entityId === "visa:h-1b");
    expect(h1bEntry, "H-1B is classified").toBeTruthy();
    expect(h1bEntry!.evidence).toMatch(/H-1B/i);
  });
});

// =============================================================================
// COUNTRY CLASSIFICATIONS CARRY THEIR PROVENANCE
//
// The defect: extractImpact() built country entries with no `method`. Nothing
// failed. isStrong(undefined) is false, so the default public view — which is
// what every consumer sees unless it asks for weak matches — silently dropped
// every country ingestion produced. It stayed hidden because an offline pass
// rewrote the same records with a real grade, and because no document in the
// 90-day refetch window designated a country.
//
// These tests pin the contract from both ends: a legitimately designated
// country must survive all the way into the default representation, and a
// country the document merely mentions must still be refused.
// =============================================================================
describe("a country classified at ingestion reaches the default API view", () => {
  const TPS = {
    title: "Extension of the Designation of Yemen for Temporary Protected Status",
    abstract: "The Secretary is extending the designation of Yemen for Temporary Protected Status.",
    agencyIds: ["agency:uscis"] as EntityId[],
  };

  it("carries a method, a relation and a matching confidence", () => {
    const [country] = extractImpact(TPS).countries ?? [];
    expect(country, "Yemen is classified").toBeTruthy();
    expect(country.entityId).toBe("country:yemen");
    expect(country.method, "a classification says how it was made").toBeTruthy();
    expect(isStrong(country.method)).toBe(true);
    expect(country.relation).toBeTruthy();
    expect(country.evidence).toMatch(/Yemen/);
    // Confidence is pinned to the method, not chosen freely.
    expect(country.confidence).toBe(confidenceFor(country.method!));
  });

  it("survives into the default public view, which is what actually broke", () => {
    // The end-to-end assertion. Everything above could pass while the entry
    // still vanished at the boundary a consumer actually reads.
    const change = toPublicChange(
      { ...BARE_EVENT, id: "e:tps", title: TPS.title, summary: TPS.abstract, impact: extractImpact(TPS) } as never,
      "2026-09-05"
    );
    expect(change.countries.map((c) => c.id)).toContain("yemen");
  });

  it("passes validation, which now refuses a stated classification with no method", () => {
    expect(validateImpact(extractImpact(TPS), "e:tps")).toEqual([]);

    const forged = extractImpact(TPS);
    delete (forged.countries![0] as { method?: string }).method;
    forged.countries![0].confidence = 1;
    expect(validateImpact(forged, "e:tps").join(" ")).toMatch(/carries no method/);
  });

  it("still refuses a country the document only mentions in passing", () => {
    // THE NEGATIVE CASE. Reading the body must not turn every named country
    // into a classification — that is the failure the relation model exists to
    // prevent, and it is worth more than the recall it costs.
    const im = extractImpact({
      title: "Visas: Visa Bond Program",
      abstract: "A rule concerning visa bonds.",
      body:
        "In the DHS FY 2024 Entry/Exit Overstay Report, DHS data indicated there were over 480,000 " +
        "suspected in-country overstays, including aliens who arrived from Canada and Mexico by land.",
      agencyIds: ["agency:dos"] as EntityId[],
    });
    expect(im.countries).toEqual([]);
  });

  it("refuses every country when the document delegates its list elsewhere", () => {
    const im = extractImpact({
      title: "Visa Bond Program",
      abstract: "A rule about bonds.",
      body:
        "Visa bonds may be required from certain business/pleasure visa applicants who are nationals of " +
        "countries with high overstay rates, deficient information sharing, and insufficient identity verification.",
      agencyIds: ["agency:dos"] as EntityId[],
    });
    expect(im.countries).toEqual([]);
  });

  it("never drops a country the committed archive already carries", () => {
    // ONE CONTRACT, AND NO SILENT REGRESSION.
    //
    // This asserted exact equality with the committed snapshot until the
    // coordinated-list fix landed, at which point the classifier legitimately
    // began finding MORE than the snapshot holds — 14 classifications the
    // archive is simply stale on, since nothing has re-run the maintenance pass
    // against it. Equality would now punish an improvement.
    //
    // What matters is the direction. Ingestion and the maintenance pass call
    // one function, so they agree by construction; what a test still has to
    // catch is the classifier quietly LOSING ground, which is how the forms
    // defect reached production. Superset, not equality.
    const key = (c: { entityId: string; method?: string; relation?: string }) =>
      `${c.entityId}|${c.method}|${c.relation}`;
    let compared = 0;
    const lost: string[] = [];
    for (const e of (EVENTS as unknown as { id: string; title: string; summary: string; impact?: { countries?: { entityId: string; method?: string; relation?: string }[] } }[])) {
      const stored = e.impact?.countries ?? [];
      if (stored.length === 0) continue;
      compared++;
      const fresh = new Set(countriesFor(e.title, e.summary, sourceTextFor(e.id) ?? "").map(key));
      for (const c of stored) if (!fresh.has(key(c))) lost.push(`${e.id} ${key(c)}`);
    }
    expect(lost, "the classifier lost classifications the archive holds").toEqual([]);
    expect(compared, "some records carry countries").toBeGreaterThan(20);
  });
});

describe("reading the body for forms changes nothing else", () => {
  // The fix touched one call site. These pin the blast radius: the three other
  // classified dimensions must behave exactly as they did, including the
  // deliberate decision that processes do NOT read the body.
  const withFormInBody = {
    title: "Restriction on Entry",
    abstract: "The Secretary designates certain countries. This rule concerns H-1B nonimmigrants.",
    body:
      "This restriction applies to nationals of Nigeria. Revision of the currently approved collection: " +
      "Form I-765, Application for Employment Authorization. Labor certification is discussed at length below.",
    agencyIds: ["agency:dos"] as EntityId[],
  };

  it("classifies countries exactly as it did before", () => {
    const im = extractImpact(withFormInBody);
    expect(im.countries.map((c) => c.entityId)).toContain("country:nigeria");
    // Still only from designation language, never from a form sentence.
    expect(im.countries.map((c) => c.entityId)).not.toContain("country:canada");
  });

  it("classifies visa categories exactly as it did before", () => {
    const im = extractImpact(withFormInBody);
    expect(im.visaCategories.map((v) => v.entityId)).toContain("visa:h-1b");
    expect(im.visaCategories.every((v) => v.evidence)).toBe(true);
  });

  it("still refuses to classify a process from the body", () => {
    // processesFor has never taken a body. Giving it one would be a change to a
    // measured dimension, not a bug fix, so the fix deliberately did not.
    const im = extractImpact(withFormInBody);
    expect((im.processes ?? []).map((p) => p.entityId)).not.toContain("process:labor-certification");

    // ...but the title and abstract still work.
    const titled = extractImpact({
      title: "Labor Certification Program Changes",
      abstract: "A rule about labor certification.",
    });
    expect((titled.processes ?? []).map((p) => p.entityId)).toContain("process:labor-certification");
  });

  it("produces a record that still validates with a body present", () => {
    expect(validateImpact(extractImpact(withFormInBody), "e:1")).toEqual([]);
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
