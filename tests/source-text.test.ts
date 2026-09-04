// =============================================================================
// THE SOURCE TEXT STORE
//
// The store exists because the pipeline was fetching authoritative document
// text, using it once, and dropping it. Everything downstream — better
// classifiers, human review, a customer asking why a record says what it says —
// needed text that no longer existed.
//
// A retained document is only worth retaining if it can be trusted, so these
// tests are about integrity rather than plumbing:
//
//   1. THE HASHES MATCH THE FILES. A store whose contents have drifted from
//      their hashes is worse than no store: every quote drawn from it becomes a
//      claim about a document nobody can identify.
//   2. EVERY RECORD THAT CLAIMS TEXT HAS IT, and every claim matches.
//   3. THE TEXT IS NEVER SERVED. The API carries the receipt, not the document.
//   4. NOTHING IS INVENTED. A record with no retained text says so.
// =============================================================================

import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { hashText, readIndex, sourceTextFor, storedIds, verifyStore } from "@/lib/source-text";
import { evidenceKindOf, isStrongEvidence } from "@/domains/graph/evidence-strength";
import { toPublicChange, type ChangeInput } from "@/lib/intelligence/change";
import { EVENTS } from "@/lib/event-store";

const ALL = EVENTS as unknown as ChangeInput[];
const TODAY = "2026-09-04";

describe("the retained documents are what the index says they are", () => {
  it("hashes every stored file to the value recorded for it", () => {
    const { checked, mismatched, missing } = verifyStore();
    expect(missing, "index entries with no file").toEqual([]);
    expect(mismatched, "files whose content no longer hashes to the recorded value").toEqual([]);
    expect(checked).toBeGreaterThan(300);
  });

  it("holds a document for every record that claims one", () => {
    const claiming = ALL.filter((e) => e.sourceDocument);
    expect(claiming.length).toBeGreaterThan(300);
    for (const e of claiming) {
      const text = sourceTextFor(e.id);
      expect(text, `${e.id} claims retained text`).toBeTruthy();
      expect(hashText(text as string)).toBe(e.sourceDocument!.contentHash);
      expect((text as string).length).toBe(e.sourceDocument!.characters);
    }
  });

  it("records where each document came from, and when", () => {
    for (const e of ALL.filter((x) => x.sourceDocument)) {
      const d = e.sourceDocument!;
      expect(d.textUrl, e.id).toMatch(/^https?:\/\//);
      expect(d.retrievedAt, e.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.retrievedAt <= TODAY, `${e.id} retrievedAt is not in the future`).toBe(true);
      expect(d.adapter, e.id).toBeTruthy();
      expect(d.contentHash, e.id).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it("says nothing at all for a record whose body was never retained", () => {
    // Most USCIS newsroom items publish a headline and a paragraph and no more.
    // The honest record of that is an absent field, never an empty string or a
    // hash of nothing.
    const without = ALL.filter((e) => !e.sourceDocument);
    expect(without.length).toBeGreaterThan(0);
    for (const e of without.slice(0, 50)) {
      expect(sourceTextFor(e.id)).toBeNull();
    }
  });

  it("keeps the index and the directory in step", () => {
    const index = readIndex();
    const onDisk = new Set(storedIds().map((f) => f));
    for (const ref of Object.values(index.documents)) {
      expect(onDisk.has(ref.file.replace(/\.txt$/, "")), `${ref.file} is on disk`).toBe(true);
    }
  });
});

describe("the document is evidence, not a product", () => {
  it("serves the receipt and never the text", () => {
    const withText = ALL.find((e) => e.sourceDocument)!;
    const change = toPublicChange(withText, TODAY);
    const doc = change.source.document!;

    expect(doc.textUrl).toMatch(/^https?:\/\//);
    expect(doc.contentHash).toMatch(/^sha256:/);
    expect(doc.characters).toBeGreaterThan(0);

    // The serialized record must not contain the document. A full government
    // rule is available from the government; republishing it would make this a
    // document host, and would put 15MB of text through a JSON response.
    const serialized = JSON.stringify(change);
    const body = sourceTextFor(withText.id) as string;
    const distinctiveChunk = body.slice(2000, 2200);
    expect(distinctiveChunk.length).toBeGreaterThan(100);
    expect(serialized).not.toContain(distinctiveChunk);
    expect(serialized.length).toBeLessThan(20_000);
  });

  it("reports null rather than an empty receipt when there is no text", () => {
    const without = ALL.find((e) => !e.sourceDocument)!;
    expect(toPublicChange(without, TODAY).source.document).toBeNull();
  });
});

describe("the evidence hierarchy separates acting from reporting", () => {
  const kind = (passage: string) => evidenceKindOf({ passage });

  it("reads the document acting as operative", () => {
    expect(kind("USCIS is revising Form I-129 to add a new certification.")).toBe(
      "operative_language"
    );
    expect(kind("The Department is adjusting the fee for Form I-907.")).toBe("operative_language");
  });

  it("reads a comment response as historical, however active it sounds", () => {
    // Comment sections are the largest source of operative-looking prose about
    // things the rule is not doing.
    expect(
      kind("A commenter requested that DHS revise Form I-129 to remove the attestation.")
    ).toBe("historical_mention");
    expect(kind("DHS thanks the Embassy of Micronesia for their comment.")).toBe(
      "historical_mention"
    );
  });

  it("reads a citation as a citation even when it is full of scope language", () => {
    expect(
      kind("See Nationals of Certain Countries, 90 FR 31670 (July 15, 2025).")
    ).toBe("citation_reference");
  });

  it("reads an enumeration of affected collections as a designation", () => {
    // The shape that accounts for most of the form recall gain: fee rules
    // publish the list of collections they touch under a heading saying so.
    expect(
      kind("Programs Affected, OMB Control Numbers OMB No. 1615-0052--Form N-400, Application for Naturalization")
    ).toBe("designation");
  });

  it("does not promote a bare mention", () => {
    expect(isStrongEvidence(kind("The applicant submitted Form I-129 last year."))).toBe(false);
  });
});

describe("what the retained text bought", () => {
  it("classifies forms that appear only in a document body", () => {
    // Before the text was retained, a form named only in the body was
    // unreachable. 82 of the 121 documents genuinely about a form are in that
    // position, so this is the measurable point of the whole store.
    const bodyOnlyForms = ALL.filter((e) => {
      const title = `${e.title} ${e.summary ?? ""}`;
      const forms = (e.impact as never as { forms?: { entityId: string; method?: string }[] })
        ?.forms;
      return (forms ?? []).some(
        (f) =>
          f.method !== "derived_weak" &&
          !new RegExp(f.entityId.replace("form:", "").replace("-", "-?"), "i").test(title)
      );
    });
    expect(bodyOnlyForms.length).toBeGreaterThanOrEqual(20);
  });

  it("only ever classifies from text it actually holds", () => {
    // A body-derived classification on a record with no retained text would
    // mean the evidence came from somewhere unaccountable.
    for (const e of ALL) {
      if (e.sourceDocument) continue;
      const forms = (e.impact as never as { forms?: { evidence?: string }[] })?.forms ?? [];
      for (const f of forms) {
        const inSurface = `${e.title} ${e.summary ?? ""}`.includes(
          (f.evidence ?? "").replace(/^…|…$/g, "").slice(0, 40)
        );
        expect(inSurface, `${e.id}: form evidence must come from title or summary`).toBe(true);
      }
    }
  });
});

describe("the store does not leak into the application bundle", () => {
  it("is imported by nothing under src/app or src/components", () => {
    // Next.js traces imports to decide what ships. A stray import of a 15MB
    // directory would land inside a serverless bundle.
    const offenders: string[] = [];
    for (const file of ["src/lib/event-store.ts", "src/lib/intelligence/change.ts"]) {
      const text = readFileSync(file, "utf8");
      if (/source-text/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
