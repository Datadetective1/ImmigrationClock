// =============================================================================
// THE API CONTRACT
//
// The route handlers are called directly here, with real Request objects and
// the real committed data. No mocks: the point is to check what a consumer
// would actually receive, including the parts that are promises rather than
// plumbing.
//
// WHAT IS BEING PINNED
//   1. A FILTER RETURNS ONLY WHAT IT CAN DEFEND. The default response carries
//      strong classifications; a weak match reaches a caller only when they
//      ask for it by name.
//   2. THE RESPONSE STATES ITS OWN QUALITY. A consumer who never reads the
//      docs still learns what a filtered result does and does not mean.
//   3. BAD INPUT IS REFUSED, NOT GUESSED AT.
//   4. NOTHING INTERNAL LEAKS: no file paths, no draft records, no adapter
//      names, no personal data.
// =============================================================================

import { describe, it, expect } from "vitest";
import { GET as getChanges } from "@/app/api/v1/changes/route";
import { GET as getChange } from "@/app/api/v1/changes/[id]/route";
import { GET as getIndex } from "@/app/api/v1/route";
import { GET as getSignals } from "@/app/api/v1/employers/[slug]/signals/route";
import { EVENTS } from "@/lib/event-store";
import { EMPLOYERS } from "@/lib/employers";
import { shortHash } from "@/lib/share";
import type { ChangeInput } from "@/lib/intelligence/change";

const ALL = EVENTS as unknown as ChangeInput[];

async function changes(query: string): Promise<{ status: number; body: any }> {
  const res = await getChanges(new Request(`https://example.com/api/v1/changes${query}`));
  return { status: res.status, body: await res.json() };
}

// -----------------------------------------------------------------------------
// EVIDENCE STRENGTH IS THE DEFAULT, NOT AN OPTION
// -----------------------------------------------------------------------------

describe("GET /api/v1/changes returns only defensible matches by default", () => {
  it("labels every classification with the method that produced it", async () => {
    const { body } = await changes("?limit=100");
    const classified = body.data.flatMap((c: any) => [
      ...c.visaCategories,
      ...c.countries,
      ...c.forms,
      ...c.processes,
    ]);
    expect(classified.length).toBeGreaterThan(0);
    for (const x of classified) {
      expect(["explicit_source", "structured_source", "derived_high_confidence"]).toContain(x.method);
      expect(x.evidence, x.id).toBeTruthy();
    }
  });

  it("excludes the H-2A wage rule from a default h-1b filter", async () => {
    const { body } = await changes("?visa=h-1b&limit=100");
    const ids = body.data.map((c: any) => c.recordId);
    expect(ids).not.toContain("federal_register:2025-19365");
    expect(ids).not.toContain("federal_register:2026-09289");
    expect(body.pagination.total).toBeGreaterThan(10);
  });

  it("returns those records when weak matches are requested by name", async () => {
    const { body } = await changes("?visa=h-1b&include=weak&limit=100");
    const ids = body.data.map((c: any) => c.recordId);
    expect(ids).toContain("federal_register:2025-19365");
    const record = body.data.find((c: any) => c.recordId === "federal_register:2025-19365");
    expect(record.visaCategories.find((v: any) => v.id === "h-1b").method).toBe("derived_weak");
  });

  it("never returns more records with strong evidence than with weak included", async () => {
    const strong = await changes("?visa=h-1b&limit=100");
    const weak = await changes("?visa=h-1b&include=weak&limit=100");
    expect(weak.body.pagination.total).toBeGreaterThanOrEqual(strong.body.pagination.total);
  });

  it("refuses an include value it does not implement", async () => {
    const { status, body } = await changes("?include=everything");
    expect(status).toBe(400);
    expect(body.parameter).toBe("include");
  });
});

// -----------------------------------------------------------------------------
// THE NEW DIMENSIONS
// -----------------------------------------------------------------------------

describe("the dimensions a professional filters on", () => {
  it("filters by form and returns the quote behind each match", async () => {
    const { body } = await changes("?form=i-129&limit=100");
    expect(body.pagination.total).toBeGreaterThan(0);
    for (const c of body.data) {
      const match = c.forms.find((f: any) => f.id === "i-129");
      expect(match).toBeTruthy();
      expect(match.evidence).toMatch(/I-?129/i);
    }
  });

  it("filters by process and reaches records no visa filter would", async () => {
    const { body } = await changes("?process=employment-authorization&limit=100");
    expect(body.pagination.total).toBeGreaterThan(5);
    const withoutVisa = body.data.filter((c: any) => c.visaCategories.length === 0);
    expect(withoutVisa.length).toBeGreaterThan(0);
  });

  it("returns an empty page rather than an error for an unknown value", async () => {
    const { status, body } = await changes("?process=not-a-real-process");
    expect(status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
    // And it still says what an empty result means.
    expect(body.filterQuality.coverage).toMatch(/floor rather than a complete set/i);
  });
});

// -----------------------------------------------------------------------------
// THE RESPONSE EXPLAINS ITSELF
// -----------------------------------------------------------------------------

describe("a filtered response states what it does and does not mean", () => {
  it("says which evidence strength produced the result", async () => {
    const strong = await changes("?visa=h-1b");
    expect(strong.body.filterQuality.evidence).toBe("strong only");
    const weak = await changes("?visa=h-1b&include=weak");
    expect(weak.body.filterQuality.evidence).toBe("strong and weak");
  });

  it("publishes the measured quality of every dimension it filters on", async () => {
    const { body } = await changes("?visa=h-1b");
    const m: string = body.filterQuality.measured;
    expect(m).toMatch(/visa:h-1b: precision \d+%, recall \d+%/i);
    expect(m).toMatch(/countries: precision \d+%, recall \d+%/i);
    expect(m).toMatch(/forms: precision \d+%, recall \d+%/i);
    // Every figure carries the size of the set behind it. A percentage with no
    // n is a claim the reader cannot weigh.
    expect((m.match(/\(n=\d+\)/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // And the honest summary of the shape, which is the part a consumer acts on.
    expect(m).toMatch(/none clears the recall bar/i);
  });

  it("omits the note when no classification filter was used", async () => {
    const { body } = await changes("?limit=1");
    expect(body.filterQuality).toBeUndefined();
  });

  it("carries the attribution and schema version on every response", async () => {
    const { body } = await changes("?limit=1");
    expect(body.attribution.schemaVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.attribution.notLegalAdvice).toMatch(/not legal advice/i);
    expect(body.attribution.classificationQuality).toMatch(/hand-labelled/i);
  });

  it("distinguishes an unclassified record from one with nothing to classify", async () => {
    const { body } = await changes("?limit=100");
    const states = new Set(body.data.map((c: any) => c.classificationState.visaCategories));
    expect(states.size).toBeGreaterThan(1);
    for (const c of body.data) {
      if (c.visaCategories.length > 0) expect(c.classificationState.visaCategories).toBe("known");
    }
  });
});

// -----------------------------------------------------------------------------
// INPUT VALIDATION
// -----------------------------------------------------------------------------

describe("bad input is refused rather than guessed at", () => {
  it.each([
    ["?since=yesterday", "since"],
    ["?until=2026-13-99x", "until"],
    ["?limit=0", "limit"],
    ["?limit=101", "limit"],
    ["?limit=abc", "limit"],
    ["?offset=-1", "offset"],
  ])("rejects %s", async (query, parameter) => {
    const { status, body } = await changes(query);
    expect(status).toBe(400);
    expect(body.error).toBe("invalid_parameter");
    expect(body.parameter).toBe(parameter);
    expect(body.message.length).toBeGreaterThan(10);
  });

  it("caps the page size it will serve", async () => {
    const { body } = await changes("?limit=100");
    expect(body.data.length).toBeLessThanOrEqual(100);
    expect(body.pagination.limit).toBe(100);
  });

  it("paginates without reordering records between pages", async () => {
    const first = await changes("?limit=5&offset=0");
    const second = await changes("?limit=5&offset=5");
    const overlap = first.body.data
      .map((c: any) => c.recordId)
      .filter((id: string) => second.body.data.some((c: any) => c.recordId === id));
    expect(overlap).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// THE SINGLE RECORD
// -----------------------------------------------------------------------------

describe("GET /api/v1/changes/{id}", () => {
  const weakRecord = "federal_register:2025-19365";

  it("resolves by short id and by record id, to the same record", async () => {
    const short = await getChange(new Request("https://example.com"), {
      params: { id: shortHash(weakRecord) },
    });
    const long = await getChange(new Request("https://example.com"), {
      params: { id: encodeURIComponent(weakRecord) },
    });
    const a = await short.json();
    const b = await long.json();
    expect(a.data.recordId).toBe(weakRecord);
    expect(b.data.recordId).toBe(weakRecord);
  });

  it("reports weak matches separately instead of disagreeing with the list", async () => {
    // This route is prerendered and cannot read ?include=weak. It must not
    // silently answer differently from the list endpoint, and it must not hide
    // what the list would show under ?include=weak either.
    const res = await getChange(new Request("https://example.com"), {
      params: { id: shortHash(weakRecord) },
    });
    const body = await res.json();
    expect(body.data.visaCategories.map((v: any) => v.id)).not.toContain("h-1b");
    expect(body.alsoMatched.visaCategories.map((v: any) => v.id)).toContain("h-1b");
    expect(body.alsoMatched.note).toMatch(/NOT.*included in the fields above/i);
  });

  it("omits the weak block entirely when there is nothing weak", async () => {
    const clean = ALL.find(
      (e) =>
        (e.impact?.visaCategories ?? []).length > 0 &&
        (e.impact?.visaCategories ?? []).every((v) => v.method !== "derived_weak")
    );
    const res = await getChange(new Request("https://example.com"), {
      params: { id: shortHash(clean!.id) },
    });
    const body = await res.json();
    expect(body.alsoMatched).toBeUndefined();
  });

  it("returns a helpful 404 rather than an empty 200", async () => {
    const res = await getChange(new Request("https://example.com"), { params: { id: "zzzzzz" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(body.message).toMatch(/what-changed/);
  });
});

// -----------------------------------------------------------------------------
// EMPLOYER SIGNALS
// -----------------------------------------------------------------------------

describe("GET /api/v1/employers/{slug}/signals", () => {
  it("describes the join on the row rather than in the abstract", async () => {
    const overlapping = EMPLOYERS.find((e) => e.name.toUpperCase().startsWith("GOOGLE"));
    const res = await getSignals(new Request("https://example.com"), {
      params: { slug: overlapping!.slug },
    });
    const body = await res.json();
    const overlap = body.data.signals.find((s: any) => s.kind === "warn_h1b_overlap");
    if (!overlap) return; // Google may not be in the WARN overlap in a future refresh.
    expect(overlap.matchQuality.kind).toBeTruthy();
    expect(overlap.matchQuality.key.length).toBeGreaterThan(0);
    expect(overlap.matchQuality.note.length).toBeGreaterThan(40);
  });

  it("says what a missing signal means", async () => {
    const res = await getSignals(new Request("https://example.com"), {
      params: { slug: EMPLOYERS[0].slug },
    });
    const body = await res.json();
    expect(body.data.coverage.absenceMeaning).toMatch(/not that no layoff occurred/i);
  });

  it("carries no score, rank or risk field anywhere in the response", async () => {
    const res = await getSignals(new Request("https://example.com"), {
      params: { slug: EMPLOYERS[0].slug },
    });
    const json = JSON.stringify(await res.json());
    expect(json).not.toMatch(/"(riskScore|score|risk|grade|rating|likelihood|probability)"/i);
  });
});

// -----------------------------------------------------------------------------
// THE INDEX, AND WHAT MUST NEVER LEAK
// -----------------------------------------------------------------------------

describe("the API index states the boundary and the measurement", () => {
  it("documents every filter the list endpoint implements", async () => {
    const body = await (await getIndex()).json();
    const documented = Object.keys(body.endpoints[0].parameters);
    for (const p of ["visa", "form", "process", "country", "agency", "include", "limit", "offset"]) {
      expect(documented, `${p} is documented`).toContain(p);
    }
  });

  it("publishes what was measured, with the ground truth it was measured against", async () => {
    const body = await (await getIndex()).json();
    const measured = body.classification.measured;
    for (const key of ["visa:h-1b", "countries", "forms", "employment/process"]) {
      expect(Object.keys(measured), `${key} is published`).toContain(key);
      expect(measured[key].groundTruth, `${key} names its fixture`).toMatch(/fixtures\//);
      expect(measured[key].precision).toMatch(/^\d+%$/);
      expect(measured[key].recall).toMatch(/^\d+%$/);
    }
    // The holdout travels with the headline figure, so a consumer can see where
    // development and out-of-sample disagree.
    expect(measured["visa:h-1b"].holdout).toMatch(/precision/i);
    // Single-annotator dimensions say so where a reader will see it.
    expect(measured.forms.note).toMatch(/single-annotator/i);
    expect(body.classification.readiness).toMatch(/not ready for push/i);
    expect(body.classification.reproduce).toMatch(/intelligence:quality/);
  });

  it("states the boundary in the API itself", async () => {
    const body = await (await getIndex()).json();
    const joined = body.boundaries.join(" ");
    expect(joined).toMatch(/not legal advice/i);
    expect(joined).toMatch(/no determination about any individual/i);
    expect(joined).toMatch(/no personal data/i);
  });
});

describe("nothing internal reaches a consumer", () => {
  it("leaks no file paths, adapter names or secrets", async () => {
    const { body } = await changes("?limit=50");
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/[A-Za-z]:\\\\|\/src\/|\.ts"|node_modules/);
    expect(json).not.toMatch(/sk_live|sk_test|Bearer |api[_-]?key/i);
    expect(json).not.toMatch(/adapter|reviewQueue|scratchpad/i);
  });

  it("never serves a draft record", async () => {
    const { body } = await changes("?limit=100");
    for (const c of body.data) expect(c.verification).not.toBe("draft");
  });

  it("returns no field that decides anything about a person", async () => {
    // Checked as SHAPE, not as a substring. The word "eligibility" appears in
    // government document titles we quote verbatim — "Investigations and
    // Examinations for Naturalization Eligibility" is the name of a USCIS
    // policy alert, and refusing to publish it would be censoring the record
    // rather than avoiding a determination. What must not exist is a FIELD
    // that answers an eligibility question.
    const { body } = await changes("?limit=50");
    const fieldNames = new Set<string>();
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node)) {
          fieldNames.add(k.toLowerCase());
          walk(v);
        }
      }
    };
    walk(body);
    for (const forbidden of ["eligible", "eligibility", "qualifies", "outcome", "recommendation", "advice", "risk"]) {
      expect([...fieldNames], forbidden).not.toContain(forbidden);
    }
  });

  it("never addresses the reader as though the record were about them", async () => {
    // Second-person phrasing is how data turns into advice. Source quotes are
    // exempted from nothing here because government documents do not address a
    // reader this way; if one ever does, that is worth failing on and reading.
    const { body } = await changes("?limit=100");
    const json = JSON.stringify(body).toLowerCase();
    for (const forbidden of ["you should", "you need to", "your case", "your petition", "applies to you", "you may be eligible"]) {
      expect(json, forbidden).not.toContain(forbidden);
    }
  });
});
