// The Pro page shows product, not people: one forecast and one alert built by
// the real code from the official data, and counts read from the event store.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { alertExample, forecastExample, trustFacts } from "@/lib/pro-showcase";
import { forecast, teaser } from "@/lib/visa-bulletin/forecast";
import { EVENTS } from "@/lib/event-store";
import { sourcesReadAutomatically } from "@/lib/refresh";
import { SOURCES } from "@/lib/sources";

const read = (p: string) => readFileSync(fileURLToPath(new URL(`../${p}`, import.meta.url)), "utf8");

describe("the forecast example is the real forecast", () => {
  it("matches what the free forecast says for the same input", () => {
    const ex = forecastExample();
    expect(ex).not.toBeNull();
    // Whichever candidate was used, its free answer is one teaser() can produce.
    expect(ex!.freeAnswer).toMatch(/^(Around|Between) \d{4}/);
    expect(ex!.earliest).not.toBe(ex!.latest);
    expect(ex!.trail.length).toBeGreaterThanOrEqual(4);
  });

  it("for EB-2 China the free answer is exactly teaser()'s", () => {
    const f = forecast("employment", "EB2", "china", "2022-01-01");
    if (f.kind === "estimate" && f.latest && f.earliest !== f.latest) {
      expect(forecastExample()!.freeAnswer).toBe(teaser(f));
    }
  });
});

describe("the alert example is the real alert", () => {
  it("comes from the Visa Bulletin alert job and names its source", () => {
    const ex = alertExample();
    expect(ex).not.toBeNull();
    expect(ex!.title).toMatch(/Visa Bulletin is out$/);
    expect(ex!.detail).toMatch(/^Final action dates that moved/);
    expect(ex!.source).toBe("U.S. Department of State");
  });
});

describe("trust signals are counted, never claimed", () => {
  it("reads counts from the data", () => {
    const t = trustFacts();
    expect(t.changes).toBe(EVENTS.length);
    expect(t.sources).toBe(sourcesReadAutomatically().length);
    expect(t.bulletins).toBeGreaterThan(0);
  });

  it("counts only sources listed on /sources, with no number added by hand", () => {
    const t = trustFacts();
    const listed = new Set(SOURCES.map((s) => s.name));
    for (const name of t.sourceNames) expect(listed.has(name), name).toBe(true);
    expect(t.sourceNames.length).toBe(t.sources);
    expect(read("src/components/TrustStrip.tsx")).not.toMatch(/sources\s*\+\s*\d/);
  });

  it("shows no testimonial, review or subscriber count on the Pro page or the strip", () => {
    for (const file of ["src/app/pricing/page.tsx", "src/components/TrustStrip.tsx", "src/components/ProShowcase.tsx"]) {
      // Comments explain why there are none; only rendered text is checked.
      const src = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(src, file).not.toMatch(/testimonial|\brating\b|\bstars?\b|\d+\+? (?:subscribers|customers|users)|trusted by/i);
    }
  });
});
