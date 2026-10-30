// =============================================================================
// FIRST VISIT: every place a visitor can land offers a next step
//
// A walk of the live site as a new visitor found four dead ends: the Briefing
// page was a "Sign in" button and nothing else, the empty search page asked a
// visitor to guess what the site knows, the 404 page offered only search, and
// H-1B state pages for states outside the tracked employer list read "0
// approvals, $0 wage". These tests keep each of them pointing somewhere.
// =============================================================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { search } from "@/lib/data";
import { searchGuides } from "@/lib/site-search";
import { EVENT_INDEX, filterEvents } from "@/lib/event-index";
import { SEARCH_EXAMPLES } from "@/components/SearchPageClient";
import { NAV, FOOTER_SECTIONS } from "@/lib/site";
import { states } from "@/lib/dataset";
import { stateAggregate } from "@/lib/data";

const src = (...p: string[]) => readFileSync(join(process.cwd(), "src", ...p), "utf8");

describe("first-visit next steps", () => {
  it("every one-tap search example returns something", () => {
    for (const q of SEARCH_EXAMPLES) {
      const hits = search(q).length + searchGuides(q).length + filterEvents(EVENT_INDEX, { q }).length;
      expect(hits, q).toBeGreaterThan(0);
    }
  });

  it("the signed-out Briefing offers the live example, not only a sign-in", () => {
    const page = src("app", "briefing", "page.tsx");
    expect(page).toContain('href: "/briefing/example"');
    expect(page).toContain("primary={EXAMPLE}");
  });

  it("the example Briefing is reachable from the Pro menu, the footer and pricing", () => {
    const pro = NAV.find((i) => i.utility)!;
    expect(pro.children!.map((c) => c.href)).toContain("/briefing/example");
    expect(FOOTER_SECTIONS.flatMap((s) => s.links.map((l) => l.href))).toContain("/briefing/example");
    expect(src("app", "pricing", "page.tsx")).toContain('href="/briefing/example"');
  });

  it("the 404 page lists places to go", () => {
    const hrefs = [...src("app", "not-found.tsx").matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThanOrEqual(4);
  });

  it("an H-1B state page with no tracked sponsors says so instead of showing zeros", () => {
    const empty = states.filter((s) => stateAggregate(s.code)?.companies.length === 0);
    // The empty state only matters if some state hits it, which today several do.
    expect(empty.length).toBeGreaterThan(0);
    const page = src("app", "h1b", "state", "[stateCode]", "page.tsx");
    expect(page).toContain("No tracked sponsors with worksites in");
    expect(page).toContain("{empty ? null : (");
  });
});
