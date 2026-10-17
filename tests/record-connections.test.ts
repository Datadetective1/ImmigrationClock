// =============================================================================
// Change records link onward only through the document's stated scope
// =============================================================================

import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { connectionsFor, RECURRING_DATES_FOR_VISA } from "@/lib/connections";
import { EVENTS } from "@/lib/event-store";
import { EVENT_INDEX } from "@/lib/event-index";
import { KEY_DATES } from "@/lib/key-dates";
import { isFollowableId } from "@/lib/follows";
import type { EventImpact } from "@/domains/graph/impact";

const FOLLOWABLE = new Set(EVENT_INDEX.flatMap((e) => e.entityIds).filter(isFollowableId));
const pageExists = (href: string) => {
  const parts = href.split("/").filter(Boolean);
  const dir = join(process.cwd(), "src/app", ...parts);
  if (existsSync(join(dir, "page.tsx"))) return true;
  // A dynamic segment: /country/india → src/app/country/[countrySlug]
  return parts[0] === "country" && existsSync(join(process.cwd(), "src/app/country/[countrySlug]/page.tsx"));
};

function impact(over: Partial<EventImpact>): EventImpact {
  return {
    countries: [],
    visaCategories: [],
    agencies: [],
    employers: [],
    universities: [],
    states: [],
    ...over,
  } as EventImpact;
}

describe("record connections", () => {
  it("come only from stated scope, never inferred", () => {
    const c = connectionsFor(
      impact({ visaCategories: [{ entityId: "visa:h-1b", basis: "inferred" } as never] }),
      FOLLOWABLE
    );
    expect(c).toEqual({ data: [], follows: [], dates: [] });
    expect(connectionsFor(undefined, FOLLOWABLE)).toEqual({ data: [], follows: [], dates: [] });
  });

  it("link a stated visa to its data page, its recurring dates and a follow button", () => {
    const c = connectionsFor(
      impact({ visaCategories: [{ entityId: "visa:h-1b", basis: "stated" } as never] }),
      FOLLOWABLE
    );
    expect(c.data.map((d) => d.href)).toEqual(["/h1b/top-sponsors"]);
    expect(c.dates.map((d) => d.id)).toEqual(["h1b-registration", "fiscal-year-start"]);
    expect(c.follows.map((f) => f.id)).toEqual(["visa:h-1b"]);
    expect(c.dates[0].forLabel).toBe("H-1B");
  });

  it("map only to key dates that exist", () => {
    const ids = new Set(KEY_DATES.map((d) => d.id));
    for (const list of Object.values(RECURRING_DATES_FOR_VISA)) for (const id of list) expect(ids.has(id), id).toBe(true);
  });

  it("produce only real pages and offered follows across the archive", () => {
    let withAny = 0;
    for (const e of EVENTS) {
      const c = connectionsFor(e.impact, FOLLOWABLE);
      if (c.data.length || c.follows.length || c.dates.length) withAny++;
      for (const d of c.data) expect(pageExists(d.href), `${e.id}: ${d.href}`).toBe(true);
      for (const f of c.follows) expect(FOLLOWABLE.has(f.id)).toBe(true);
      const stated = new Set(
        [...(e.impact?.visaCategories ?? []), ...(e.impact?.countries ?? [])]
          .filter((x) => x.basis !== "inferred")
          .map((x) => x.entityId)
      );
      for (const f of c.follows) expect(stated.has(f.id)).toBe(true);
    }
    expect(withAny).toBeGreaterThan(0);
  });
});
