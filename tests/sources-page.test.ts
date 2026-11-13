// /sources tells a reader how each source reaches the site, and every date it
// shows is one the pipeline recorded or the agency's own. It used to fall back
// to Jan 1, 2026 for any source without a typed-in date.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SOURCES } from "@/lib/sources";
import { sourceReadState, sourcesReadAutomatically } from "@/lib/refresh";

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");

describe("source read states", () => {
  it("never puts a placeholder date on the Sources page", () => {
    expect(read("src/app/sources/page.tsx")).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("gives no date to a source we do not read", () => {
    for (const s of SOURCES.filter((x) => x.ingestion === "planned")) {
      expect(sourceReadState(s.key), s.key).toEqual({ kind: "not-read", at: null });
    }
  });

  it("never calls a hand-entered source automatic or gives it a typed-in date", () => {
    for (const s of SOURCES.filter((x) => x.ingestion === "curated")) {
      expect(sourceReadState(s.key), s.key).toEqual({ kind: "manual", at: null });
    }
  });

  it("dates every automatic source with a real fetch time", () => {
    for (const s of sourcesReadAutomatically()) {
      const at = sourceReadState(s.key).at;
      expect(at, s.key).toBeTruthy();
      expect(Number.isNaN(new Date(at as string).getTime()), s.key).toBe(false);
    }
  });

  it("lists the Visa Bulletin the forecast reads", () => {
    expect(SOURCES.some((s) => s.key === "dos_visa_bulletin")).toBe(true);
  });
});
