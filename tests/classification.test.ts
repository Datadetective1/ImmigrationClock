// =============================================================================
// CLASSIFICATION QUALITY — the regressions, named
//
// Every test here exists because something was actually wrong, was measured,
// and was fixed. The file is organised by failure class rather than by module,
// so a future change that reintroduces one of them fails a test that says what
// it broke rather than a test that says an assertion did not hold.
//
// THE FAILURE CLASSES, FROM HAND-LABELLING 21 H-1B RECORDS
// -------------------------------------------------------
//   historical_statutory_reference  An H-2A wage rule was classified H-1B at
//                                   confidence 1 because its body says a
//                                   statute "was enacted in the context of the
//                                   H-1B ... classification".
//   footnote_citation               A rule about signatures was classified
//                                   H-1B from a footnote citing a 2011 H-1B
//                                   notice at 76 FR 11686.
//   headline_dropped                Ten USCIS records whose TITLE names H-1B
//                                   were not classified H-1B, because the
//                                   extractor required an "applies to" style
//                                   scope phrase that headlines never contain.
//   ungraded_confidence             Grading classifications broke the store's
//                                   own invariant that a stated entry carries
//                                   confidence 1, which would have silently
//                                   dropped 161 classifications at the next
//                                   build.
//
// The benchmark itself is asserted here too. Quality that is only measured by
// a script nobody runs is quality that regresses on a Tuesday.
// =============================================================================

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CLASSIFICATION_METHODS,
  confidenceFor,
  gradeClassification,
  isStrong,
  looksHistorical,
} from "@/domains/graph/classification";
import { FORMS, formsFor } from "@/domains/graph/forms";
import { PROCESSES, processesFor } from "@/domains/graph/processes";
import { findCountriesInText } from "@/domains/graph/countries";
import { allImpacted, validateImpact } from "@/domains/graph/impact";
import { toPublicChange, weakClassifications, type ChangeInput } from "@/lib/intelligence/change";
import { EVENTS } from "@/lib/event-store";
import { measureAll } from "@/lib/intelligence/benchmarks";
import { readinessOf } from "@/lib/intelligence/readiness";
import type { ImmigrationEvent } from "@/domains/graph/events";

const TODAY = "2026-09-03";
const ALL = EVENTS as unknown as ChangeInput[];
const BY_ID = new Map(ALL.map((e) => [e.id, e] as const));

const h1b = (text: string) => /(?<![a-z0-9])h-?1b(?![a-z0-9])/i.test(text);

interface GroundTruth {
  relevant: { id: string; why: string }[];
  notRelevant: { id: string; why: string; failureClass?: string }[];
}
const TRUTH = JSON.parse(
  readFileSync(resolve("fixtures/h1b-ground-truth.json"), "utf8")
) as GroundTruth;

function strongVisas(id: string): string[] {
  const e = BY_ID.get(id);
  if (!e) return [];
  return toPublicChange(e, TODAY).visaCategories.map((v) => v.id);
}

// -----------------------------------------------------------------------------
// FAILURE CLASS: historical_statutory_reference
// -----------------------------------------------------------------------------

describe("a statute discussed in passing is not this document's scope", () => {
  const REAL_SENTENCE =
    "Section 212(p) of the INA was enacted in the context of the H-1B nonimmigrant " +
    "classification, and also applies to the PERM immigrant visa program.";

  it("recognises the sentence that caused the original false positive", () => {
    expect(looksHistorical(REAL_SENTENCE)).toBe(true);
  });

  it("grades it weak even though it contains the phrase 'applies to'", () => {
    // "applies to" was the entire original scope test. That is why this failed.
    expect(REAL_SENTENCE).toContain("applies to");
    const method = gradeClassification({
      title: "Adverse Effect Wage Rate Methodology for the Temporary Employment of H-2A Nonimmigrants",
      summary: "The Department is revising the methodology for determining the adverse effect wage rate.",
      evidence: REAL_SENTENCE,
      matches: h1b,
    });
    expect(method).toBe("derived_weak");
    expect(isStrong(method)).toBe(false);
  });

  it("keeps the H-2A wage rule out of a default h-1b filter, without deleting it", () => {
    const record = BY_ID.get("federal_register:2025-19365");
    expect(record, "the labelled H-2A wage rule is still in the archive").toBeTruthy();

    // Excluded from the strong view a filter uses...
    expect(strongVisas("federal_register:2025-19365")).not.toContain("h-1b");

    // ...but still present and labelled, because a weak match is evidence, not
    // an error. Deleting it would trade a precision bug for a recall bug.
    const weak = weakClassifications(record as ChangeInput);
    expect(weak.visaCategories.map((v) => v.id)).toContain("h-1b");
    expect(weak.visaCategories.find((v) => v.id === "h-1b")?.method).toBe("derived_weak");
    expect(weak.visaCategories.find((v) => v.id === "h-1b")?.evidence).toBeTruthy();
  });
});

// -----------------------------------------------------------------------------
// FAILURE CLASS: footnote_citation
// -----------------------------------------------------------------------------

describe("a citation is not a subject", () => {
  it("treats a Federal Register citation as historical", () => {
    expect(looksHistorical("See H-1B Registration Requirement, 76 FR 11686 (Mar. 3, 2011).")).toBe(true);
  });

  it("treats a parenthetical year as historical", () => {
    expect(looksHistorical("the H-1B rule (2011) considered this question")).toBe(true);
  });

  it("keeps the signatures rule out of a default h-1b filter", () => {
    const record = BY_ID.get("federal_register:2026-09289");
    expect(record, "the labelled signatures rule is still in the archive").toBeTruthy();
    expect(strongVisas("federal_register:2026-09289")).not.toContain("h-1b");
  });

  it("does not treat an ordinary scope sentence as historical", () => {
    // The guard must not be so eager that real scope statements are demoted.
    expect(looksHistorical("This rule applies to petitioners filing H-1B petitions.")).toBe(false);
    expect(looksHistorical("Beneficiaries of approved H-1B petitions are covered.")).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// FAILURE CLASS: headline_dropped
// -----------------------------------------------------------------------------

describe("a document's title is its own statement of subject", () => {
  it("grades a title match as explicit, with no scope phrase anywhere", () => {
    const title = "USCIS Reaches Fiscal Year 2027 H-1B Cap";
    expect(title).not.toMatch(/applies to|aliens who/i);
    expect(gradeClassification({ title, summary: "", matches: h1b })).toBe("explicit_source");
  });

  it("classifies the headline records the old extractor dropped", () => {
    // These four are USCIS newsroom records whose title names H-1B outright.
    // Each was a false negative before the fix.
    const headlineRecords = [
      "uscis_newsroom:8d0937a2-6564-412c-8b12-7db83e9fbb39",
      "uscis_newsroom:3f480495-b1a7-4ef9-b61a-f604d3d0923c",
      "uscis_newsroom:023fcea4-8e08-4512-b5c4-33033db19e0f",
      "uscis_newsroom:46d66277-ca68-4424-bc39-12ef2b0c859b",
    ];
    for (const id of headlineRecords) {
      expect(BY_ID.has(id), `${id} is in the archive`).toBe(true);
      expect(strongVisas(id), id).toContain("h-1b");
    }
  });

  it("ranks a title above a summary above a graded body quote", () => {
    const asTitle = gradeClassification({ title: "H-1B Cap Reached", summary: "", matches: h1b });
    const asSummary = gradeClassification({ title: "Cap Reached", summary: "the H-1B cap", matches: h1b });
    const asBody = gradeClassification({
      title: "Fee Schedule",
      summary: "Adjusts fees.",
      evidence: "This section applies to H-1B petitioners.",
      matches: h1b,
    });
    const asFootnote = gradeClassification({
      title: "Fee Schedule",
      summary: "Adjusts fees.",
      evidence: "See H-1B Registration, 76 FR 11686.",
      matches: h1b,
    });

    expect(asTitle).toBe("explicit_source");
    expect(asSummary).toBe("derived_high_confidence");
    expect(asBody).toBe("derived_high_confidence");
    expect(asFootnote).toBe("derived_weak");
    expect(confidenceFor(asTitle)).toBeGreaterThan(confidenceFor(asBody));
    expect(confidenceFor(asBody)).toBeGreaterThan(confidenceFor(asFootnote));
  });
});

// -----------------------------------------------------------------------------
// FAILURE CLASS: ungraded_confidence
// -----------------------------------------------------------------------------

describe("confidence is pinned to the method that earned it", () => {
  it("validates every committed record", () => {
    // Grading introduced confidences below 1 on entries whose basis is
    // "stated". The store's validator rejected 161 of them, which at the next
    // build would have dropped the classifications entirely. The invariant was
    // rewritten rather than the data bent to fit it.
    const errors = ALL.flatMap((e) => (e.impact ? validateImpact(e.impact, e.id) : []));
    expect(errors).toEqual([]);
  });

  it("rejects a graded entry whose confidence disagrees with its method", () => {
    const errors = validateImpact(
      {
        countries: [],
        visaCategories: [
          {
            entityId: "visa:h-1b",
            basis: "stated",
            method: "derived_weak",
            evidence: "See H-1B Registration, 76 FR 11686.",
            confidence: 1, // the bug: a footnote sold at full confidence
          },
        ],
        agencies: [],
        employers: [],
        universities: [],
        states: [],
        completeness: "partial",
      },
      "e:1"
    );
    expect(errors.join(" ")).toMatch(/derived_weak so confidence must be 0\.5/);
  });

  it("still requires confidence 1 from an ungraded stated entry", () => {
    const errors = validateImpact(
      {
        countries: [],
        visaCategories: [
          { entityId: "visa:h-1b", basis: "stated", evidence: "H-1B Cap Reached", confidence: 0.9 },
        ],
        agencies: [],
        employers: [],
        universities: [],
        states: [],
        completeness: "partial",
      },
      "e:1"
    );
    expect(errors.join(" ")).toMatch(/confidence is not 1/);
  });

  it("gives every method a distinct, ordered confidence", () => {
    const values = CLASSIFICATION_METHODS.map(confidenceFor);
    expect(values.every((v) => v > 0 && v <= 1)).toBe(true);
    expect(Math.min(...values)).toBe(0.5);
    expect(Math.max(...values)).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// THE BENCHMARK
// -----------------------------------------------------------------------------

describe("the h-1b benchmark, against hand-labelled records", () => {
  it("labels a pool larger than the classifier's own output", () => {
    // Scoring against your own output is how a metric gets gamed. The pool is
    // every record a reader could identify from the archive text, plus
    // everything the classifier claimed.
    const judged = TRUTH.relevant.length + TRUTH.notRelevant.length;
    expect(judged).toBeGreaterThanOrEqual(21);
    const claimed = ALL.filter((e) => strongVisas(e.id).includes("h-1b")).length;
    expect(judged).toBeGreaterThan(claimed);
  });

  it("names a failure class on every negative label", () => {
    for (const n of TRUTH.notRelevant) {
      expect(n.failureClass, n.id).toBeTruthy();
      expect(n.why.length, n.id).toBeGreaterThan(40);
    }
  });

  it("gives a reason for every positive label", () => {
    for (const r of TRUTH.relevant) {
      expect(r.why.length, r.id).toBeGreaterThan(20);
      expect(BY_ID.has(r.id), `${r.id} is still in the archive`).toBe(true);
    }
  });

  it("holds precision at or above 90% and recall at or above 85%", () => {
    const relevant = new Set(TRUTH.relevant.map((r) => r.id));
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (const r of [...TRUTH.relevant, ...TRUTH.notRelevant]) {
      const predicted = strongVisas(r.id).includes("h-1b");
      const actual = relevant.has(r.id);
      if (predicted && actual) tp++;
      else if (predicted && !actual) fp++;
      else if (!predicted && actual) fn++;
    }
    const precision = tp / (tp + fp);
    const recall = tp / (tp + fn);
    expect(precision).toBeGreaterThanOrEqual(0.9);
    expect(recall).toBeGreaterThanOrEqual(0.85);
  });
});

// -----------------------------------------------------------------------------
// THE FORMS DIMENSION
// -----------------------------------------------------------------------------

describe("forms are matched from evidence, not from a wish list", () => {
  it("matches a form the title names", () => {
    const out = formsFor("USCIS Publishes Revised Form I-129", "");
    expect(out.map((f) => f.entityId)).toContain("form:i-129");
    expect(out[0].method).toBe("explicit_source");
    expect(out[0].evidence).toContain("I-129");
  });

  it("does not match a longer number that merely starts the same way", () => {
    // I-94 must not fire inside I-941, which is a different form entirely.
    expect(formsFor("Changes to Form I-941", "").map((f) => f.entityId)).not.toContain("form:i-94");
  });

  it("accepts an unknown identifier only when the document calls it a form", () => {
    // The registry cannot keep up with the long tail — hand-labelling found
    // I-352, G-1650, I-901, N-336, ETA-9142B and more, none of them listed —
    // and a longer list is not the answer. When a document writes "Form I-352"
    // it has told us the token is a form, which is better evidence than our
    // own list membership.
    expect(formsFor("Revision of Form I-352", "").map((f) => f.entityId)).toContain("form:i-352");

    // A BARE unknown identifier is still refused. "I-352" alone could be a
    // section, a paragraph or a docket number.
    expect(formsFor("Provisions of I-352 apply", "").map((f) => f.entityId)).not.toContain(
      "form:i-352"
    );
  });

  it("carries a quote on every match", () => {
    for (const e of ALL) {
      for (const f of e.impact?.forms ?? []) {
        expect(f.evidence, `${e.id} ${f.entityId}`).toBeTruthy();
        expect(f.entityId.startsWith("form:"), f.entityId).toBe(true);
      }
    }
  });

  it("classifies only well-formed form identifiers", () => {
    // Either from the registry, or an identifier the document itself called a
    // form. Nothing else, and never a shape that is not a form number.
    const known = new Set(FORMS.map((f) => `form:${f.id}`));
    const WELL_FORMED = /^form:(?:i|n|g|ds|eta|ar|eoir)-\d{1,4}[a-z]?$/;
    for (const e of ALL) {
      for (const f of e.impact?.forms ?? []) {
        const ok = known.has(f.entityId) || WELL_FORMED.test(f.entityId);
        expect(ok, `${f.entityId} is a declared form or a well-formed identifier`).toBe(true);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// WHAT THE API PROMISES ABOUT ALL OF THIS
// -----------------------------------------------------------------------------

describe("the public shape reports strength rather than hiding it", () => {
  it("labels every classification with a method", () => {
    for (const e of ALL.slice(0, 200)) {
      const c = toPublicChange(e, TODAY);
      for (const x of [...c.visaCategories, ...c.countries, ...c.forms]) {
        expect(CLASSIFICATION_METHODS).toContain(x.method as never);
      }
    }
  });

  it("returns only strong classifications by default", () => {
    for (const e of ALL) {
      const c = toPublicChange(e, TODAY);
      for (const x of [...c.visaCategories, ...c.countries, ...c.forms]) {
        expect(isStrong(x.method), `${e.id} ${x.id} ${x.method}`).toBe(true);
      }
    }
  });

  it("returns weak classifications when asked, and they are the excluded ones", () => {
    const weakSomewhere = ALL.filter((e) => {
      const w = weakClassifications(e);
      return w.visaCategories.length + w.countries.length + w.forms.length > 0;
    });
    expect(weakSomewhere.length).toBeGreaterThan(0);

    for (const e of weakSomewhere) {
      const strong = toPublicChange(e, TODAY);
      const all = toPublicChange(e, TODAY, [], true);
      expect(all.visaCategories.length).toBeGreaterThanOrEqual(strong.visaCategories.length);
      for (const w of weakClassifications(e).visaCategories) {
        expect(isStrong(w.method)).toBe(false);
        expect(strong.visaCategories.map((v) => v.id)).not.toContain(w.id);
        expect(all.visaCategories.map((v) => v.id)).toContain(w.id);
      }
    }
  });

  it("distinguishes an unexamined dimension from an examined empty one", () => {
    const states = new Set(ALL.map((e) => toPublicChange(e, TODAY).classificationState.visaCategories));
    // Both answers must actually occur, or the field is decoration.
    expect(states.has("known")).toBe(true);
    expect(states.size).toBeGreaterThan(1);
  });

  it("never reports a classification without the quote behind it", () => {
    for (const e of ALL) {
      const c = toPublicChange(e, TODAY, [], true);
      for (const x of [...c.visaCategories, ...c.countries, ...c.forms]) {
        if (x.basis === "stated") expect(x.evidence, `${e.id} ${x.id}`).toBeTruthy();
      }
    }
  });

  it("keeps every impacted entry's confidence inside its declared range", () => {
    for (const e of ALL) {
      if (!e.impact) continue;
      for (const x of allImpacted(e.impact)) {
        expect(x.confidence).toBeGreaterThan(0);
        expect(x.confidence).toBeLessThanOrEqual(1);
        if (x.method) expect(x.confidence).toBe(confidenceFor(x.method));
      }
    }
  });
});

// -----------------------------------------------------------------------------
// THE PROCESS DIMENSION
// -----------------------------------------------------------------------------

describe("processes make employment developments retrievable", () => {
  it("matches a process the title names", () => {
    const out = processesFor("DHS Ends Automatic Extension of Employment Authorization", "");
    expect(out.map((p) => p.entityId)).toContain("process:employment-authorization");
    expect(out[0].method).toBe("explicit_source");
    expect(out[0].evidence).toContain("Employment Authorization");
  });

  it("does not let an agency's name decide what a document is about", () => {
    // "Office of Foreign Labor Certification" contains the process phrase.
    // Matching on it filed a change of mailing address as a labor
    // certification development.
    const out = processesFor(
      "Change of Physical Mailing Address",
      "The Office of Foreign Labor Certification has moved."
    );
    expect(out.map((p) => p.entityId)).not.toContain("process:labor-certification");
  });

  it("does not treat every registration as a cap registration", () => {
    // TPS re-registration periods matched "registration" and had nothing to do
    // with the H-1B or H-2B cap.
    const out = processesFor(
      "Extension of the Designation of Ukraine for Temporary Protected Status",
      "Existing beneficiaries must re-register during the registration period."
    );
    expect(out.map((p) => p.entityId)).not.toContain("process:cap-registration");
  });

  it("still matches a real cap record", () => {
    expect(
      processesFor("FY 2027 H-1B Cap Initial Registration Period Opens on March 4", "").map(
        (p) => p.entityId
      )
    ).toContain("process:cap-registration");
  });

  it("classifies only processes it declares", () => {
    const known = new Set(PROCESSES.map((p) => `process:${p.id}`));
    for (const e of ALL) {
      for (const p of e.impact?.processes ?? []) {
        expect(known.has(p.entityId), `${p.entityId} is a declared process`).toBe(true);
        expect(p.evidence, `${e.id} ${p.entityId}`).toBeTruthy();
      }
    }
  });

  it("reaches the employment records a visa filter alone misses", () => {
    // The measurement the dimension exists for. Of the USCIS newsroom records
    // whose text concerns employment, a visa-or-form filter reached 21 of 25.
    // Adding processes reaches 24.
    const employmentVisas = new Set([
      "h-1b", "h-1b1", "h-2a", "h-2b", "h-3", "l-1", "l-1a", "l-1b",
      "o-1", "tn", "e-3", "eb-1", "eb-2", "eb-3", "eb-4", "eb-5",
    ]);
    const employmentForms = new Set([
      "i-129", "i-140", "i-765", "i-9", "eta-9089", "eta-9035", "eta-790", "i-907",
    ]);
    const mentionsEmployment =
      /\b(employment|employer|worker|H-1B|H-2A|H-2B|labor certification|PERM|LCA|work authorization|EAD)\b/i;

    const candidates = ALL.filter(
      (e) => e.sourceKey === "uscis_newsroom" && mentionsEmployment.test(`${e.title} ${e.summary}`)
    );
    expect(candidates.length).toBeGreaterThanOrEqual(20);

    const reached = candidates.filter((e) => {
      const c = toPublicChange(e, TODAY);
      return (
        c.visaCategories.some((v) => employmentVisas.has(v.id)) ||
        c.forms.some((f) => employmentForms.has(f.id)) ||
        c.processes.length > 0
      );
    });
    expect(reached.length / candidates.length).toBeGreaterThanOrEqual(0.9);
  });

  it("does not classify a record that names no process in its own words", () => {
    // The honest residual, kept as a test so it cannot be quietly "fixed" by
    // inference: this record says "temporary agricultural worker petitions"
    // and never says H-2A. Inferring the visa from the description is exactly
    // the move the classifier refuses to make.
    const record = ALL.find((e) =>
      e.title.includes("Streamlines the Filing Process for Certain Agricultural")
    );
    expect(record, "the record is still in the archive").toBeTruthy();
    const c = toPublicChange(record as ChangeInput, TODAY);
    expect(c.visaCategories).toEqual([]);
    expect(c.classificationState.visaCategories).toBe("not_classified");
  });
});

// -----------------------------------------------------------------------------
// FAILURE CLASS: one country's name inside another's
// -----------------------------------------------------------------------------

describe("a country name inside a longer place name is not that country", () => {
  it("does not read South Sudan as Sudan, however many times it is repeated", () => {
    // The real evidence quote, which writes "South Sudan" three times. Claiming
    // only the first occurrence left the other two open for "Sudan" to match
    // inside — and Sudan holds its own separate TPS designation, so this sent a
    // Sudan subscriber a rule about a different country.
    const quote =
      "After January 5, 2026, nationals of South Sudan (and aliens having no nationality who " +
      "last habitually resided in South Sudan) who have been granted Temporary Protected Status " +
      "under South Sudan's designation will no longer have Temporary Protected Status.";
    const found = findCountriesInText(quote).map((m) => m.entityId);
    expect(found).toContain("country:south-sudan");
    expect(found).not.toContain("country:sudan");
  });

  it("still finds Sudan when the document means Sudan", () => {
    expect(findCountriesInText("nationals of Sudan are covered").map((m) => m.entityId)).toEqual([
      "country:sudan",
    ]);
  });

  it("finds both when both are genuinely named", () => {
    const found = findCountriesInText("citizens of Papua New Guinea and of Guinea").map((m) => m.entityId);
    expect(found).toContain("country:papua-new-guinea");
    expect(found).toContain("country:guinea");
  });

  it("does not read a United States territory as a foreign state", () => {
    // American Samoa is a U.S. territory. The independent state of Samoa is a
    // different place, and a rule about who is a U.S. national by birth in the
    // former says nothing about the latter.
    const quote =
      "Alien U.S. national status applies only to individuals who were born either in American " +
      "Samoa or on Swains Island to parents who are not citizens of the United States.";
    expect(findCountriesInText(quote).map((m) => m.entityId)).not.toContain("country:samoa");
  });

  it("does not read New Mexico as Mexico", () => {
    const found = findCountriesInText("nationals of Mexico, and residents of New Mexico").map(
      (m) => m.entityId
    );
    expect(found).toEqual(["country:mexico"]);
  });

  it("has removed the wrong classification from the committed record", () => {
    const record = BY_ID.get("federal_register:2025-19800");
    expect(record, "the South Sudan TPS record is still in the archive").toBeTruthy();
    const ids = toPublicChange(record as ChangeInput, TODAY, [], true).countries.map((c) => c.id);
    expect(ids).toContain("south-sudan");
    expect(ids).not.toContain("sudan");
  });
});

// -----------------------------------------------------------------------------
// EVERY COUNTRY CLAIM IS SUPPORTED BY ITS OWN QUOTE
// -----------------------------------------------------------------------------

describe("a stated country is supported by the quote stored with it", () => {
  it("holds for every committed record", () => {
    // The invariant the product's whole promise rests on, tested rather than
    // assumed: if the evidence quote does not contain the country, the claim
    // cannot be defended to anyone who reads it. Five pairs failed this when it
    // was first run and were removed.
    for (const e of ALL) {
      for (const c of e.impact?.countries ?? []) {
        const supported = findCountriesInText(c.evidence ?? "").some(
          (m) => m.entityId === c.entityId
        );
        expect(supported, `${e.id}: ${c.entityId} is not in its own evidence quote`).toBe(true);
      }
    }
  });
});

// -----------------------------------------------------------------------------
// THE COUNTRY BENCHMARK
// -----------------------------------------------------------------------------

describe("the benchmarks, scored the way the API answers", () => {
  const scores = measureAll(ALL as unknown as ImmigrationEvent[]);
  const by = (name: string) => scores.find((s) => s.dimension === name)!;

  it("scores every dimension that has a committed ground truth", () => {
    expect(scores.map((s) => s.dimension)).toEqual([
      "H-1B (original 21)",
      "H-1B (expanded)",
      "Country",
      "Forms",
      "Employment / process",
    ]);
    for (const s of scores) expect(s.combined.n).toBeGreaterThan(15);
  });

  it("keeps the original H-1B benchmark passing, unreplaced", () => {
    // A benchmark that gets quietly retired when a bigger one flatters the
    // classifier is not a benchmark. This one still has to hold.
    const original = by("H-1B (original 21)");
    expect(original.combined.precision).toBe(1);
    expect(original.combined.recall).toBe(1);
  });

  it("holds each dimension at or above the level this work reached", () => {
    // Floors, not targets. They exist so a later change cannot make a dimension
    // worse while every other number still looks fine. They are deliberately
    // below today's figures, because a floor set at today's exact value fails
    // on noise and gets deleted.
    const floors: Record<string, [number, number]> = {
      "H-1B (expanded)": [0.95, 0.75],
      Country: [0.9, 0.5],
      Forms: [0.9, 0.5],
      "Employment / process": [0.9, 0.5],
    };
    for (const [name, [p, r]] of Object.entries(floors)) {
      const s = by(name);
      expect(s.combined.precision ?? 0, `${name} precision`).toBeGreaterThanOrEqual(p);
      expect(s.combined.recall ?? 0, `${name} recall`).toBeGreaterThanOrEqual(r);
    }
  });

  it("reports a holdout separately, and does not average it away", () => {
    // The holdout informed nothing. Where it diverges from development, it is
    // the number to believe, so it has to be reported rather than folded in.
    for (const name of ["H-1B (expanded)", "Country", "Forms"]) {
      const s = by(name);
      expect(s.holdout.n, `${name} has a holdout`).toBeGreaterThan(10);
      expect(s.dev.n, `${name} has a development half`).toBeGreaterThan(10);
      expect(s.dev.n + s.holdout.n).toBe(s.combined.n);
    }
  });

  it("says which dimensions were not independently reviewed", () => {
    // Single-annotator labels are a weaker basis than checked ones, and the
    // difference has to travel with the number.
    expect(by("Forms").independentlyReviewed).toBe(false);
    expect(by("Employment / process").independentlyReviewed).toBe(false);
    expect(by("Country").independentlyReviewed).toBe(true);
    expect(by("H-1B (expanded)").independentlyReviewed).toBe(true);
  });

  it("excludes contested labels rather than resolving them by rule", () => {
    // A disputed label is not ground truth. Deciding it by procedure — the
    // reviewer always wins, or positives always lose — would settle a factual
    // question with a convention.
    expect(by("Country").contested).toBeGreaterThan(0);
  });
});

describe("readiness follows from the measurements", () => {
  const scores = measureAll(ALL as unknown as ImmigrationEvent[]);

  it("never calls an unmeasured dimension ready to push", () => {
    const unmeasured = readinessOf({
      dimension: "hypothetical",
      precision: null,
      recall: null,
      benchmarkN: null,
      humanReviewed: 0,
      evidenceComplete: true,
      note: "",
    });
    expect(unmeasured.tier).toBe("READY FOR PULL API");
    expect(unmeasured.precision).toBeNull();
    expect(unmeasured.f1).toBeNull();
  });

  it("reports an unmeasured metric as null, never as zero", () => {
    const r = readinessOf({
      dimension: "hypothetical",
      precision: 0.99,
      recall: null,
      benchmarkN: 40,
      humanReviewed: 0,
      evidenceComplete: true,
      note: "",
    });
    expect(r.recall).toBeNull();
    expect(r.tier).toBe("READY FOR HUMAN-ASSISTED MONITORING");
  });

  it("refuses to push on a small benchmark even when both bars are cleared", () => {
    const r = readinessOf({
      dimension: "hypothetical",
      precision: 1,
      recall: 1,
      benchmarkN: 12,
      humanReviewed: 0,
      evidenceComplete: true,
      note: "",
    });
    expect(r.tier).toBe("READY FOR HUMAN-ASSISTED MONITORING");
    expect(r.because).toMatch(/too few/i);
  });

  it("holds nothing to be push-ready today, and says so from the numbers", () => {
    // Not an aspiration and not a policy: it falls out of the measured recall.
    // If a later change earns it, this test is the thing that has to be updated
    // deliberately.
    for (const s of scores) {
      const r = readinessOf({
        dimension: s.dimension,
        precision: s.combined.precision,
        recall: s.combined.recall,
        benchmarkN: s.combined.n,
        humanReviewed: 0,
        evidenceComplete: true,
        note: "",
      });
      expect(r.tier, `${s.dimension}`).not.toBe("READY FOR PUSH/WEBHOOK");
    }
  });
});

// -----------------------------------------------------------------------------
// AN EVIDENCE QUOTE IS THE ONE FIELD A CONSUMER IS ASKED TO CHECK
// -----------------------------------------------------------------------------

describe("evidence reads as the document reads", () => {
  it("carries no HTML entities or markup", () => {
    // A quote containing "&nbsp;" is not verbatim, and verbatim is the entire
    // reason the field exists. The extractor normalized; the offline pass did
    // not, and stored raw archive text on one record.
    for (const e of ALL) {
      for (const dimension of ["visaCategories", "countries", "forms", "processes"] as const) {
        const list = (e.impact as Record<string, unknown> | undefined)?.[dimension] as
          | { entityId: string; evidence?: string }[]
          | undefined;
        for (const x of list ?? []) {
          expect(x.evidence ?? "", `${e.id} ${x.entityId}`).not.toMatch(
            /&(nbsp|amp|lt|gt|quot|#\d+);|<[a-z/]/i
          );
        }
      }
    }
  });

  it("is never empty on a stated classification", () => {
    for (const e of ALL) {
      for (const dimension of ["visaCategories", "countries", "forms", "processes"] as const) {
        const list = (e.impact as Record<string, unknown> | undefined)?.[dimension] as
          | { entityId: string; basis: string; evidence?: string }[]
          | undefined;
        for (const x of list ?? []) {
          if (x.basis === "stated") {
            expect((x.evidence ?? "").trim().length, `${e.id} ${x.entityId}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

// -----------------------------------------------------------------------------
// THE COUNTRY RELATION MODEL
// -----------------------------------------------------------------------------

describe("a country classification says what the country is doing", () => {
  const relationsIn = (text: string, isTitle = false) =>
    Object.fromEntries(findCountriesInText(text, { isTitle }).map((m) => [m.name, m.relation]));

  it("reads a headline as a statement of subject", () => {
    // Titles do not speak in scope grammar. "TPS for Yemen" contains no
    // designation phrase at all, and a cue-based reading dropped it — the same
    // failure that dropped ten USCIS records from the H-1B classifier.
    expect(relationsIn("DHS Terminates Temporary Protected Status for Yemen", true).Yemen).toBe(
      "title_subject"
    );
    // The same words in prose are not a title and get no free pass.
    expect(relationsIn("This continues TPS for Yemen").Yemen).toBe("contextual");
  });

  it("refuses a cited agreement's title even when it says 'Nationals of'", () => {
    const quote =
      "Agreement Between the Government of the United States of America and the Government of the " +
      "Republic of Guatemala Relating to the Transfer of Nationals of Central American Countries to " +
      "Guatemala, 90 FR 31670 (July 15, 2025).";
    expect(relationsIn(quote).Guatemala).toBe("agreement_party");
    // And it holds even when that citation is the document's own title.
    expect(relationsIn(quote, true).Guatemala).toBe("agreement_party");
  });

  it("refuses a named agreement whose name is its parties", () => {
    // "United States-Mexico-Canada Agreement" is one noun. A policy alert about
    // TN professionals under it is about the visa category, not about Mexico.
    const r = relationsIn("Policy alert: Professionals under the United States-Mexico-Canada Agreement", true);
    expect(r.Mexico).toBe("agreement_party");
    expect(r.Canada).toBe("agreement_party");
  });

  it("refuses a document inventory that names who holds the document", () => {
    expect(
      relationsIn("I-185, Nonresident Alien Canadian Border Crossing Card-- Citizens of Canada.").Canada
    ).toBe("document_population");
  });

  it("distinguishes a US post abroad from a foreign mission here", () => {
    expect(relationsIn("The U.S. Embassy in Nigeria will resume interviews.").Nigeria).toBe(
      "post_location"
    );
    // "Embassy OF Micronesia" is a commenter, not a place we operate.
    expect(
      relationsIn("DHS thanks the Embassy of the Federated States of Micronesia for their comment.")
        .Micronesia
    ).toBe("contextual");
  });

  it("treats a country name inside a larger place as not a country at all", () => {
    for (const text of [
      "the intersection of Palm Boulevard and Mexico Boulevard near Brownsville, Texas",
      "operations in the Gulf of Mexico",
      "authorizing the Colombia Solidarity Bridge at Laredo",
      "residents of New Mexico",
    ]) {
      expect(findCountriesInText(text), text).toEqual([]);
    }
  });

  it("only lets the scope-bearing relations reach a default filter", () => {
    for (const e of ALL) {
      const strongCountries = toPublicChange(e, TODAY).countries;
      for (const c of strongCountries) {
        expect(
          ["title_subject", "nationals_of", "present_in", "designated_list"],
          `${e.id} ${c.id} relation ${c.relation}`
        ).toContain(c.relation);
      }
    }
  });

  it("carries the relation through to the public shape", () => {
    const withCountry = ALL.find((e) => toPublicChange(e, TODAY).countries.length > 0);
    expect(withCountry).toBeTruthy();
    const c = toPublicChange(withCountry as ChangeInput, TODAY).countries[0];
    expect(c.relation).toBeTruthy();
    expect(c.evidence).toBeTruthy();
  });

  it("keeps the strongest relation when a country appears many times", () => {
    // A rule recites background before it states its own scope, so the first
    // mention is rarely the best one. Taking the first cost every TPS record
    // its designation.
    const text =
      "In 2019 processing times in Syria were longer. This rule applies to nationals of Syria.";
    expect(relationsIn(text).Syria).toBe("nationals_of");
  });
});
