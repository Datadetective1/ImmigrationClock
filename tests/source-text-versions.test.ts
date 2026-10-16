// =============================================================================
// SOURCE TEXT VERSIONS — a changed document keeps its earlier text
//
// The store used to overwrite a document's text in place when it changed,
// which made any before/after comparison impossible. These tests run against
// a temporary store, never data/source-text.
// =============================================================================

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashText, putSourceText, readIndex, sourceTextFor, sourceVersionsFor, storedIds, verifyStore } from "@/lib/source-text";

let dir: string;
const put = (normalized: string, retrievedAt: string, adapter = "federal-register@2") =>
  putSourceText({ id: "federal_register:2026-1", normalized, textUrl: "https://example.gov/t.txt", retrievedAt, adapter }, dir);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "source-text-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("source text versions", () => {
  it("records nothing extra while the text is unchanged", () => {
    put("Original text.", "2026-10-01");
    const again = put("Original text.", "2026-10-10");
    expect(again.versions).toBeUndefined();
    expect(again.retrievedAt).toBe("2026-10-01");
    expect(sourceVersionsFor("federal_register:2026-1", dir)).toHaveLength(1);
  });

  it("keeps the previous text when the text changes, and the current text moves on", () => {
    put("Original text.", "2026-10-01", "federal-register@1");
    const ref = put("Corrected text.", "2026-10-12");
    expect(sourceTextFor("federal_register:2026-1", dir)).toBe("Corrected text.");
    expect(ref.retrievedAt).toBe("2026-10-12");
    expect(ref.versions).toEqual([
      expect.objectContaining({
        contentHash: hashText("Original text."),
        retrievedAt: "2026-10-01",
        supersededAt: "2026-10-12",
        adapter: "federal-register@1",
      }),
    ]);
    expect(readFileSync(join(dir, ref.versions![0].file), "utf8")).toBe("Original text.");

    const all = sourceVersionsFor("federal_register:2026-1", dir);
    expect(all.map((v) => [v.text, v.current])).toEqual([
      ["Original text.", false],
      ["Corrected text.", true],
    ]);
  });

  it("accumulates every revision in order and never duplicates one", () => {
    put("v1", "2026-10-01");
    put("v2", "2026-10-02");
    put("v3", "2026-10-03");
    put("v3", "2026-10-04"); // unchanged
    expect(sourceVersionsFor("federal_register:2026-1", dir).map((v) => v.text)).toEqual(["v1", "v2", "v3"]);
    expect(readIndex(dir).documents["federal_register:2026-1"].versions).toHaveLength(2);
  });

  it("does not record a version it cannot back with the original bytes", () => {
    put("Original text.", "2026-10-01");
    // The file was altered outside the store: its bytes no longer match the
    // recorded hash, so they are not evidence of what the document said.
    writeFileSync(join(dir, "federal_register_2026-1.txt"), "tampered");
    const ref = put("New text.", "2026-10-05");
    expect(ref.versions).toBeUndefined();
  });

  it("verifies kept versions as well as current texts, and they are not listed as documents", () => {
    put("v1", "2026-10-01");
    put("v2", "2026-10-02");
    expect(verifyStore(dir)).toEqual({ checked: 2, mismatched: [], missing: [] });
    expect(storedIds(dir)).toEqual(["federal_register_2026-1"]);
    const v = readIndex(dir).documents["federal_register:2026-1"].versions![0];
    writeFileSync(join(dir, v.file), "edited");
    expect(verifyStore(dir).mismatched).toHaveLength(1);
  });
});
