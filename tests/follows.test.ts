// =============================================================================
// FOLLOWING
//
// Two things must hold, and they pull in opposite directions:
//
//   1. A follow set read from storage is UNTRUSTED INPUT. It is user-writable,
//      survives deploys, and can contain ids for entities that no longer exist.
//      A follow that can never match is a filter that silently returns nothing,
//      which reads to the user as "nothing has happened".
//
//   2. The matching itself must never over-claim. A personalized feed that shows
//      an event the reader did not ask for is noise; one that silently drops an
//      event they did ask for is a broken promise about coverage.
// =============================================================================
import { describe, it, expect } from "vitest";
import {
  isFollowableId,
  isFollowing,
  toggleFollow,
  sanitizeFollows,
  eventsForFollows,
  matchedFollows,
  buildFollowCatalog,
  groupCatalog,
  buildDigest,
  MAX_FOLLOWS,
  FOLLOWABLE_TYPES,
} from "@/lib/follows";
import { labelForEntity } from "@/lib/entity-labels";
import { EVENT_INDEX, type IndexedEvent } from "@/lib/event-index";

const ev = (over: Partial<IndexedEvent> = {}): IndexedEvent => ({
  id: "x:1",
  title: "A change",
  publishedAt: "2026-07-01",
  effectiveAt: null,
  scheduled: false,
  severity: "major",
  classification: "final_rule",
  sourceKey: "federal_register",
  sourceUrl: "https://example.gov/x",
  summary: "Summary.",
  entityIds: ["agency:uscis", "visa:h-1b"],
  ...over,
});

describe("what can be followed", () => {
  it("accepts the entity types a reader can reason about", () => {
    expect(isFollowableId("visa:h-1b")).toBe(true);
    expect(isFollowableId("country:venezuela")).toBe(true);
    expect(isFollowableId("agency:uscis")).toBe(true);
    expect(isFollowableId("topic:border")).toBe(true);
  });

  it("rejects entity types that are not meaningful to follow", () => {
    // A reader following a single court case or executive action would get a
    // feed of exactly one event forever.
    expect(isFollowableId("court_case:ca9-123")).toBe(false);
    expect(isFollowableId("executive_action:eo-14399")).toBe(false);
    expect(isFollowableId("dataset:cbp")).toBe(false);
  });

  it("rejects malformed ids", () => {
    expect(isFollowableId("visa")).toBe(false);
    expect(isFollowableId("")).toBe(false);
    expect(isFollowableId("nonsense")).toBe(false);
  });
});

describe("toggling", () => {
  it("adds and removes without mutating the input", () => {
    const before = ["visa:h-1b"];
    const added = toggleFollow(before, "country:haiti");
    expect(before).toEqual(["visa:h-1b"]);
    expect(added).toEqual(["visa:h-1b", "country:haiti"]);
    expect(toggleFollow(added, "visa:h-1b")).toEqual(["country:haiti"]);
  });

  it("ignores an unfollowable id rather than storing junk", () => {
    expect(toggleFollow([], "court_case:x")).toEqual([]);
    expect(toggleFollow([], "garbage")).toEqual([]);
  });

  it("refuses to grow past the cap", () => {
    const full = Array.from({ length: MAX_FOLLOWS }, (_, i) => `country:c${i}`);
    expect(toggleFollow(full, "visa:h-1b")).toHaveLength(MAX_FOLLOWS);
  });

  it("still allows removal at the cap", () => {
    const full = Array.from({ length: MAX_FOLLOWS }, (_, i) => `country:c${i}`);
    expect(toggleFollow(full, "country:c0")).toHaveLength(MAX_FOLLOWS - 1);
  });

  it("reports membership", () => {
    expect(isFollowing(["visa:h-1b"], "visa:h-1b")).toBe(true);
    expect(isFollowing(["visa:h-1b"], "visa:f-1")).toBe(false);
  });
});

// =============================================================================
// Storage is untrusted input.
// =============================================================================
describe("sanitizing stored follows", () => {
  it("survives anything that is not an array", () => {
    for (const junk of [null, undefined, "visa:h-1b", 42, {}, true]) {
      expect(sanitizeFollows(junk)).toEqual([]);
    }
  });

  it("drops non-strings, malformed ids, and unfollowable types", () => {
    expect(sanitizeFollows(["visa:h-1b", 5, null, "garbage", "court_case:x", ""])).toEqual(["visa:h-1b"]);
  });

  it("deduplicates", () => {
    expect(sanitizeFollows(["visa:h-1b", "visa:h-1b"])).toEqual(["visa:h-1b"]);
  });

  it("trims whitespace", () => {
    expect(sanitizeFollows(["  visa:h-1b  "])).toEqual(["visa:h-1b"]);
  });

  it("enforces the cap on data written by an older version", () => {
    const oversized = Array.from({ length: MAX_FOLLOWS + 20 }, (_, i) => `country:c${i}`);
    expect(sanitizeFollows(oversized)).toHaveLength(MAX_FOLLOWS);
  });

  it("drops ids that no longer exist in the archive", () => {
    // A follow that can never match is a filter that silently returns nothing,
    // which a reader reads as "nothing has happened".
    const known = new Set(["visa:h-1b"]);
    expect(sanitizeFollows(["visa:h-1b", "country:atlantis"], known)).toEqual(["visa:h-1b"]);
  });
});

// =============================================================================
// Matching.
// =============================================================================
describe("matching events to follows", () => {
  const events = [
    ev({ id: "a", entityIds: ["agency:uscis", "visa:h-1b"] }),
    ev({ id: "b", entityIds: ["country:venezuela", "visa:tps"] }),
    ev({ id: "c", entityIds: ["topic:border"] }),
  ];

  it("matches nothing when nothing is followed", () => {
    // Critically NOT "everything". An empty follow set means the reader has not
    // chosen, and showing them the whole archive as "yours" would be a lie.
    expect(eventsForFollows(events, [])).toEqual([]);
  });

  it("matches on any followed entity", () => {
    expect(eventsForFollows(events, ["visa:h-1b"]).map((e) => e.id)).toEqual(["a"]);
    expect(eventsForFollows(events, ["country:venezuela"]).map((e) => e.id)).toEqual(["b"]);
  });

  it("unions across several follows rather than intersecting", () => {
    // Following two things means "tell me about either", not "only where both
    // appear" — the latter would return almost nothing.
    expect(eventsForFollows(events, ["visa:h-1b", "topic:border"]).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("returns each event once even when several follows match it", () => {
    expect(eventsForFollows(events, ["agency:uscis", "visa:h-1b"]).map((e) => e.id)).toEqual(["a"]);
  });

  it("explains why an event matched", () => {
    // A personalized feed must never be a black box.
    expect(matchedFollows(events[0], ["visa:h-1b", "country:haiti"])).toEqual(["visa:h-1b"]);
    expect(matchedFollows(events[0], ["agency:uscis", "visa:h-1b"])).toEqual(["agency:uscis", "visa:h-1b"]);
  });
});

// =============================================================================
// The catalogue is derived from the archive, never hardcoded.
// =============================================================================
describe("follow catalogue", () => {
  it("only offers entities that actually appear in the archive", () => {
    // Offering "follow Bhutan" when no event has mentioned Bhutan promises
    // coverage we do not have: the reader follows it, sees nothing, and
    // reasonably concludes nothing happened.
    const catalog = buildFollowCatalog(EVENT_INDEX, labelForEntity);
    expect(catalog.length).toBeGreaterThan(0);
    for (const item of catalog) {
      expect(item.eventCount, `${item.entityId} offered with no events`).toBeGreaterThan(0);
    }
  });

  it("only offers followable types", () => {
    for (const item of buildFollowCatalog(EVENT_INDEX, labelForEntity)) {
      expect(FOLLOWABLE_TYPES).toContain(item.type);
    }
  });

  it("counts each event once per entity", () => {
    const catalog = buildFollowCatalog(
      [ev({ entityIds: ["visa:h-1b", "visa:h-1b", "agency:uscis"] })],
      labelForEntity
    );
    expect(catalog.find((c) => c.entityId === "visa:h-1b")!.eventCount).toBe(1);
  });

  it("orders by coverage so the most useful follows come first", () => {
    const catalog = buildFollowCatalog(EVENT_INDEX, labelForEntity);
    for (let i = 1; i < catalog.length; i++) {
      expect(catalog[i - 1].eventCount >= catalog[i].eventCount).toBe(true);
    }
  });

  it("gives every offered entity a human label, never a raw id", () => {
    for (const item of buildFollowCatalog(EVENT_INDEX, labelForEntity)) {
      expect(item.label, `${item.entityId} has no label`).toBeTruthy();
      expect(item.label, `${item.entityId} leaked a raw id`).not.toMatch(/^[a-z_]+:/);
    }
  });

  it("groups by type without losing anything", () => {
    const catalog = buildFollowCatalog(EVENT_INDEX, labelForEntity);
    const grouped = groupCatalog(catalog);
    expect(grouped.reduce((n, g) => n + g.items.length, 0)).toBe(catalog.length);
  });

  it("offers countries, now that events link them", () => {
    // REGRESSION: for a long time no event carried a country link, because the
    // shared resolver had no country awareness. Nineteen TPS events naming
    // Venezuela, Haiti and Syria linked none of them, so "does anything affect
    // Venezuelans?" returned nothing across the whole archive.
    const countries = buildFollowCatalog(EVENT_INDEX, labelForEntity).filter((c) => c.type === "country");
    expect(countries.length).toBeGreaterThan(0);
  });
});

describe("digest", () => {
  const events = [
    ev({ id: "new", publishedAt: "2026-07-20", severity: "major", entityIds: ["visa:h-1b"] }),
    ev({ id: "old", publishedAt: "2025-01-05", severity: "major", entityIds: ["visa:h-1b"] }),
    ev({ id: "routine", publishedAt: "2026-07-21", severity: "routine", entityIds: ["visa:h-1b"] }),
  ];

  it("separates significant from routine", () => {
    const d = buildDigest(events, ["visa:h-1b"], "2026-01-01");
    expect(d.significant.map((e) => e.id)).toEqual(["new"]);
    expect(d.routine.map((e) => e.id)).toEqual(["routine"]);
    expect(d.total).toBe(2);
  });

  it("respects the since bound", () => {
    expect(buildDigest(events, ["visa:h-1b"], "2020-01-01").total).toBe(3);
  });

  it("is empty when nothing is followed", () => {
    expect(buildDigest(events, [], "2020-01-01").total).toBe(0);
  });
});
