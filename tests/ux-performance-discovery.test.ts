// =============================================================================
// PERFORMANCE, DISCOVERY AND MEASUREMENT
//
// WHAT THESE TESTS EXIST FOR
// --------------------------
// Four defects found by building the site, serving it, and driving it on a
// throttled phone rather than by reading the source:
//
//   1. recharts (391 kB raw / 100.6 kB gzipped) sat in the First Load JS graph
//      of ten routes and rendered NOTHING into the prerendered HTML — the
//      static document contained an empty <div class="recharts-responsive-
//      container">. So the whole page was inert behind a 100 kB download that
//      painted nothing. Those routes were 200-207 kB First Load against an
//      87.5 kB baseline; they are 100-107 kB now.
//
//   2. Stat put a long figure and a trend badge in a non-wrapping flex row
//      inside a 2-column mobile grid. The row overflowed its cell and the whole
//      DOCUMENT scrolled sideways — measured 22 px at 360 px wide and 7 px at
//      390 px on /visa/f1-student-visas, the only horizontal overflow across 16
//      routes at two mobile widths.
//
//   3. The 2,614 /employer/* pages — the largest family and the commonest
//      organic landing point — contained no link to any other employer.
//
//   4. 13 of the 17 events in the analytics taxonomy were declared and never
//      emitted, including both newsletter conversion events, entity follows,
//      and every search typed into the site-wide box.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { EMPLOYERS, relatedSponsors } from "@/lib/employers";
import { eventsAffecting, eventsForEntityId } from "@/lib/event-store";
import { entityId } from "@/domains/graph/entities";
import { sanitizeSearchTerm } from "@/lib/analytics";
import type { EntityId } from "@/domains/graph/entities";

const SRC = join(process.cwd(), "src");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf8");

/** Every .tsx under src, as [relative path, contents]. */
function allTsx(dir = SRC, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...allTsx(join(dir, entry.name), rel));
    else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
      out.push([rel, readFileSync(join(dir, entry.name), "utf8")]);
    }
  }
  return out;
}
const FILES = allTsx();

// --- Charts stay off the critical path ---------------------------------------

describe("charts load without blocking the page", () => {
  it("no page or component imports recharts through the eager module", () => {
    // The whole saving comes from every consumer going through LazyCharts. One
    // direct import of ./Charts anywhere pulls recharts back into that route's
    // First Load JS and silently undoes it for that page.
    const offenders = FILES.filter(
      ([path, src]) =>
        path !== "components/charts/Charts.tsx" &&
        path !== "components/charts/LazyCharts.tsx" &&
        /from ["'](@\/components\/charts\/Charts|\.\/charts\/Charts|\.\/Charts)["']/.test(src)
    ).map(([p]) => p);
    expect(offenders, "these bypass LazyCharts and re-block first load").toEqual([]);
  });

  it("recharts is imported in exactly one file", () => {
    const importers = FILES.filter(([, src]) => /from ["']recharts["']/.test(src)).map(([p]) => p);
    expect(importers).toEqual(["components/charts/Charts.tsx"]);
  });

  it("the lazy wrapper exports every chart the real module does", () => {
    // A chart that exists in Charts.tsx but not in LazyCharts.tsx is a chart no
    // page can reach without reintroducing the eager import.
    const real = [...read("components", "charts", "Charts.tsx").matchAll(/export function (\w+)/g)].map((m) => m[1]);
    const lazy = read("components", "charts", "LazyCharts.tsx");
    expect(real.length).toBeGreaterThan(0);
    for (const name of real) {
      expect(lazy, `LazyCharts is missing ${name}`).toMatch(new RegExp(`export function ${name}\\b`));
    }
  });

  it("defers rendering rather than server-rendering an empty container", () => {
    const lazy = read("components", "charts", "LazyCharts.tsx");
    // ssr:false is what keeps the library out of the initial graph. recharts
    // rendered an empty div on the server anyway, so nothing visible is lost.
    expect(lazy).toMatch(/ssr:\s*false/);
    // The placeholder must reserve the same height the chart will occupy, or
    // the swap becomes a layout shift the eager version did not have.
    expect(lazy).toMatch(/style=\{\{\s*width:\s*"100%",\s*height\s*\}\}/);
  });
});

// --- The mobile overflow -----------------------------------------------------

describe("Stat cannot push the page sideways", () => {
  it("wraps the value row instead of overflowing its grid cell", () => {
    const stat = read("components", "Stat.tsx");
    const row = stat.match(/<div className="mt-1\.5 flex[^"]*"/)?.[0] ?? "";
    expect(row, "the value/badge row must wrap").toContain("flex-wrap");
  });

  it("keeps StatRow at two columns on a phone, which is what makes wrapping necessary", () => {
    // If this ever widens, the fix above is still correct but the regression it
    // guards changes shape — so assert the layout the measurement was taken in.
    expect(read("components", "Stat.tsx")).toMatch(/grid-cols-2/);
  });
});

// --- Related sponsors are real relationships ---------------------------------

describe("related sponsors come from the data, not from affinity guessing", () => {
  it("offers neighbours by approval volume and by shared state", () => {
    const r = relatedSponsors("wipro-limited");
    expect(r.byVolume.length).toBeGreaterThan(0);
    expect(r.state).toBeTruthy();
    expect(r.byState.length).toBeGreaterThan(0);
    // Every state suggestion genuinely shares the state.
    for (const e of r.byState) expect(e.topState).toBe(r.state);
  });

  it("never suggests the employer you are already looking at", () => {
    for (const slug of ["wipro-limited", EMPLOYERS[0].slug, EMPLOYERS[EMPLOYERS.length - 1].slug]) {
      const r = relatedSponsors(slug);
      for (const e of [...r.byVolume, ...r.byState]) expect(e.slug).not.toBe(slug);
    }
  });

  it("never repeats an employer across the two groups", () => {
    const r = relatedSponsors("amazon-com-services-llc");
    const seen = new Set(r.byVolume.map((e) => e.slug));
    for (const e of r.byState) expect(seen.has(e.slug)).toBe(false);
  });

  it("gives the first and last sponsor a full set of neighbours", () => {
    // A window centred on rank 1 or rank 2,614 would otherwise come back half
    // empty, so those two pages would be the ones still dead-ending.
    for (const e of [EMPLOYERS[0], EMPLOYERS[EMPLOYERS.length - 1]]) {
      expect(relatedSponsors(e.slug).byVolume.length, e.name).toBe(4);
    }
  });

  it("returns nothing rather than throwing for an unknown employer", () => {
    expect(relatedSponsors("not-a-real-sponsor")).toEqual({ byVolume: [], byState: [], state: null });
  });

  it("only ever links to employers that have a page", () => {
    const slugs = new Set(EMPLOYERS.map((e) => e.slug));
    for (const slug of ["wipro-limited", "amazon-com-services-llc", EMPLOYERS[500].slug]) {
      for (const e of Object.values(relatedSponsors(slug)).flat()) {
        if (typeof e === "object" && e && "slug" in e) expect(slugs.has(e.slug)).toBe(true);
      }
    }
  });
});

// --- H-1B pages reach the archive --------------------------------------------

describe("the H-1B hub is connected to the policy archive", () => {
  it("has real H-1B events to show, so the panel is not decorative", () => {
    const id = entityId("visa", "H-1B") as EntityId;
    const stated = eventsAffecting(id).length;
    const mentioned = eventsForEntityId(id).length;
    expect(stated + mentioned, "no visa:h-1b events — the panel would be empty").toBeGreaterThan(5);
  });

  it("renders EntityChanges with the archive's own entity id, not a keyword guess", () => {
    const page = read("app", "h1b", "top-sponsors", "page.tsx");
    expect(page).toMatch(/<EntityChanges[\s\S]*?entityId=\{entityId\("visa", "H-1B"\)\}/);
  });
});

// --- Instrumentation ---------------------------------------------------------

describe("the questions we said we would answer are actually measurable", () => {
  const analytics = read("lib", "analytics.ts");
  /** Events emitted anywhere outside the analytics module itself. */
  const emitted = new Set<string>();
  for (const [path, src] of FILES) {
    if (path === "lib/analytics.ts") continue;
    for (const m of src.matchAll(/track\(\s*"([a-z_]+)"/g)) emitted.add(m[1]);
  }
  // Helpers wrap an event name; count what they emit as emitted.
  const viaHelper: Record<string, string[]> = {
    trackSearch: ["search_results", "search_no_results"],
    trackSourceClick: ["source_link_click"],
    trackCoverageGap: ["coverage_gap_shown"],
    trackRelatedClick: ["related_link_click"],
  };
  for (const [helper, events] of Object.entries(viaHelper)) {
    const used = FILES.some(([p, s]) => p !== "lib/analytics.ts" && new RegExp(`${helper}\\(`).test(s));
    if (used) for (const e of events) emitted.add(e);
  }

  it("records newsletter conversion at both ends of the funnel", () => {
    // Both were declared and never fired, so a signup funnel that leaks was
    // indistinguishable from one nobody reaches.
    expect(emitted.has("newsletter_signup_started")).toBe(true);
    expect(emitted.has("newsletter_signup_submitted")).toBe(true);
  });

  it("distinguishes which surface a signup came from", () => {
    const form = read("components", "PulseSignupForm.tsx");
    expect(form).toMatch(/newsletter_signup_started",\s*\{\s*placement/);
    // A placement only helps if the call sites actually differ.
    const placements = FILES.filter(([p]) => p.startsWith("app/"))
      .flatMap(([, s]) => [...s.matchAll(/<PulseSignup placement="([a-z-]+)"/g)].map((m) => m[1]));
    expect(new Set(placements).size, "every PulseSignup reports the same placement").toBeGreaterThan(1);
  });

  it("records searches from the site-wide box, not only the search page", () => {
    // The box on the homepage, /work-visas and the 404 page recorded nothing,
    // so the zero-result queries that say what coverage is missing were being
    // collected everywhere except where most people type.
    expect(read("components", "SearchBar.tsx")).toMatch(/trackSearch\(/);
    expect(read("components", "SearchPageClient.tsx")).toMatch(/trackSearch\(/);
    expect(read("components", "EventExplorer.tsx")).toMatch(/trackSearch\(/);
  });

  it("records follows, the one feature built to bring readers back", () => {
    expect(emitted.has("entity_follow")).toBe(true);
  });

  it("records whether derived related links actually move anyone", () => {
    expect(emitted.has("related_link_click")).toBe(true);
  });

  it("declares every event it emits", () => {
    for (const e of emitted) {
      expect(analytics, `${e} is emitted but not in the AnalyticsEvent union`).toMatch(
        new RegExp(`\\| "${e}"`)
      );
      expect(analytics, `${e} has no Plausible goal name`).toMatch(new RegExp(`\\b${e}:`));
    }
  });

  it("keeps search terms free of anything that could identify a person", () => {
    // The one free-text field that leaves the browser. Guarded here because the
    // new call site in SearchBar sends whatever a reader types on the homepage.
    expect(sanitizeSearchTerm("me@example.com")).toBeNull();
    expect(sanitizeSearchTerm("call 4155551234")).toBeNull();
    expect(sanitizeSearchTerm("  Does AMAZON sponsor H-1B?  ")).toBe("does amazon sponsor h-1b?");
    expect(sanitizeSearchTerm("x".repeat(200))?.length).toBe(60);
  });
});
