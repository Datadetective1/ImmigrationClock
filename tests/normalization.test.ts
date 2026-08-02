import { describe, it, expect } from "vitest";
import { normalizeEmployer, slugify } from "@/lib/format";

// The normalizer is the join key between the WARN feed and the USCIS H-1B
// directory. Everything the professional product will claim about an employer
// rests on it, so its behaviour is pinned here rather than left implicit.
describe("normalizeEmployer", () => {
  it("is deterministic", () => {
    const a = normalizeEmployer("Amazon.com Services LLC");
    const b = normalizeEmployer("Amazon.com Services LLC");
    expect(a).toBe(b);
  });

  it("is case-insensitive", () => {
    expect(normalizeEmployer("AMAZON.COM SERVICES LLC")).toBe(
      normalizeEmployer("amazon.com services llc")
    );
  });

  it("ignores common legal-entity suffixes", () => {
    const base = normalizeEmployer("Contoso Systems");
    expect(normalizeEmployer("Contoso Systems, Inc.")).toBe(base);
    expect(normalizeEmployer("Contoso Systems LLC")).toBe(base);
  });

  it("collapses punctuation and whitespace differences", () => {
    expect(normalizeEmployer("Contoso   Systems")).toBe(normalizeEmployer("Contoso Systems"));
  });

  it("keeps genuinely different employers apart", () => {
    expect(normalizeEmployer("Contoso Systems")).not.toBe(normalizeEmployer("Fabrikam Systems"));
  });

  it("returns a falsy key for empty input rather than matching everything", () => {
    // A blank normalized key must never become a join magnet.
    expect(normalizeEmployer("")).toBeFalsy();
    expect(normalizeEmployer("   ")).toBeFalsy();
  });
});

describe("slugify", () => {
  it("produces URL-safe slugs", () => {
    expect(slugify("Amazon.com Services LLC")).toMatch(/^[a-z0-9-]+$/);
  });

  it("is stable for the same input", () => {
    expect(slugify("Tata Consultancy Svcs Ltd")).toBe(slugify("Tata Consultancy Svcs Ltd"));
  });

  it("never returns leading or trailing hyphens", () => {
    const s = slugify("  ...Contoso!!!  ");
    expect(s.startsWith("-")).toBe(false);
    expect(s.endsWith("-")).toBe(false);
  });
});
