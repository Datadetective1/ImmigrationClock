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
  orderGroupsForPicker,
  filterGroups,
  matchesFollowQuery,
  digestWindow,
  parseLastSeen,
  shouldAdvanceLastSeen,
  LAST_SEEN_MIN_INTERVAL_MS,
  buildDigest,
  ARCHIVE_START,
  MAX_FOLLOWS,
  FOLLOWABLE_TYPES,
  type Followable,
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

// =============================================================================
// WHAT THE READER CAN FIND
//
// The picker's ordering and search are product decisions — they decide whether
// someone arriving from "Follow a country or visa" can reach a country. Tested
// here, as pure functions, rather than left to live only inside JSX.
// =============================================================================

describe("picker ordering", () => {
  const groups = groupCatalog(buildFollowCatalog(EVENT_INDEX, labelForEntity));

  it("leads with countries, visas, agencies and topics, in that order", () => {
    const ordered = orderGroupsForPicker(groups).map((g) => g.type);
    expect(ordered.slice(0, 4)).toEqual(["country", "visa", "agency", "topic"]);
  });

  it("offers nothing the Monitor cannot match", () => {
    // THIS TEST REPLACES ONE THAT ASSERTED THE OPPOSITE.
    //
    // It used to require "policy" to appear in the picker, reasoning that
    // dropping the long tail "would silently break follows already stored
    // against them". The reverse was true. matchFollows() reads visa, country,
    // form, process, topic and agency and nothing else, and GET /api/v1/monitor
    // rejects anything outside that set with a 400 — which MonitorInbox renders
    // as a page-wide failure. So 52 of the 103 options the picker offered did
    // not merely return nothing; they broke the Monitor for that reader.
    //
    // Stored follows are not orphaned by this: sanitizeFollows() filters
    // everything read from storage through isFollowableId, so an existing
    // policy follow is dropped on read and the reader's Monitor starts working.
    const offered = new Set(orderGroupsForPicker(groups).map((g) => g.type));
    expect(offered.has("policy" as never)).toBe(false);
    expect(offered.has("employer" as never)).toBe(false);
  });

  it("loses nothing it was given", () => {
    expect(orderGroupsForPicker(groups)).toHaveLength(groups.length);
    expect(orderGroupsForPicker(groups).flatMap((g) => g.items)).toHaveLength(
      groups.flatMap((g) => g.items).length
    );
  });

  it("does not mutate the caller's array", () => {
    const before = groups.map((g) => g.type);
    orderGroupsForPicker(groups);
    expect(groups.map((g) => g.type)).toEqual(before);
  });
});

describe("picker search", () => {
  const item = (over: Partial<Followable> = {}): Followable => ({
    entityId: "country:venezuela",
    type: "country",
    label: "Venezuela",
    eventCount: 8,
    ...over,
  });

  it("matches a label case-insensitively, anywhere in it", () => {
    expect(matchesFollowQuery(item(), "venez")).toBe(true);
    expect(matchesFollowQuery(item(), "EZUEL")).toBe(true);
    expect(matchesFollowQuery(item({ label: "H-1B specialty occupation" }), "specialty")).toBe(true);
  });

  it("matches the id's slug, for a reader who knows it", () => {
    // "b-1-b-2" appears in the id but not in "B-1/B-2 visitor".
    expect(matchesFollowQuery(item({ entityId: "visa:b-1-b-2", type: "visa", label: "B-1/B-2 visitor" }), "b-1-b-2")).toBe(true);
  });

  it("searches the slug, not the raw id, so the prefix is not free text", () => {
    // Whether "visa" widens to the visa category is the category rule's job
    // below, deliberately and with a length guard. The id must not be a second,
    // unguarded route to the same widening.
    const tps = item({ entityId: "visa:tps", type: "visa", label: "Temporary Protected Status" });
    expect(matchesFollowQuery(tps, "visa:")).toBe(false);
    expect(matchesFollowQuery(tps, "tps")).toBe(true);
  });

  it("answers the words the search field advertises", () => {
    // The field says "search countries, visas, agencies, or topics". Returning
    // nothing for "countries" would teach the reader the picker is empty.
    expect(matchesFollowQuery(item(), "countries")).toBe(true);
    expect(matchesFollowQuery(item({ type: "visa", label: "H-1B" }), "visas")).toBe(true);
    expect(matchesFollowQuery(item({ type: "agency", label: "USCIS" }), "agencies")).toBe(true);
    expect(matchesFollowQuery(item({ type: "topic", label: "Border encounters" }), "topics")).toBe(true);
  });

  it("does not let a stray letter select a whole category", () => {
    // "c" is a keystroke, not a request for all 25 countries.
    const haiti = item({ entityId: "country:haiti", label: "Haiti" });
    expect(matchesFollowQuery(haiti, "c")).toBe(false);
    expect(matchesFollowQuery(haiti, "co")).toBe(false);
    // Three characters in, it is a word the search field invited.
    expect(matchesFollowQuery(haiti, "cou")).toBe(true);
  });

  it("returns everything for an empty query", () => {
    expect(matchesFollowQuery(item(), "")).toBe(true);
    expect(matchesFollowQuery(item(), "   ")).toBe(true);
  });

  it("filters groups and drops the ones left empty", () => {
    const groups = orderGroupsForPicker(groupCatalog(buildFollowCatalog(EVENT_INDEX, labelForEntity)));
    const result = filterGroups(groups, { query: "venezuela" });
    expect(result.every((g) => g.items.length > 0)).toBe(true);
    expect(result.flatMap((g) => g.items).some((i) => i.entityId === "country:venezuela")).toBe(true);
    expect(result.flatMap((g) => g.items).some((i) => i.type === "agency")).toBe(false);
  });

  it("narrows to one category on request, without a query", () => {
    const groups = orderGroupsForPicker(groupCatalog(buildFollowCatalog(EVENT_INDEX, labelForEntity)));
    const result = filterGroups(groups, { type: "country" });
    expect(result.map((g) => g.type)).toEqual(["country"]);
    expect(result[0].items.length).toBeGreaterThan(0);
  });

  it("returns no group at all when nothing matches, rather than empty headings", () => {
    const groups = orderGroupsForPicker(groupCatalog(buildFollowCatalog(EVENT_INDEX, labelForEntity)));
    expect(filterGroups(groups, { query: "zzzznotathing" })).toEqual([]);
  });
});

describe("the period a digest is allowed to claim", () => {
  it("says 'since your last visit' only when there was one", () => {
    const w = digestWindow("2026-06-01");
    expect(w.knewLastVisit).toBe(true);
    expect(w.since).toBe("2026-06-01");
    expect(w.label).toBe("Since your last visit");
  });

  it("reads a full timestamp, and bounds the digest by its DATE", () => {
    // Events carry `YYYY-MM-DD`. Comparing them against a timestamp would drop
    // everything published on the day of the visit itself.
    const w = digestWindow("2026-06-01T18:30:00.000Z");
    expect(w.since).toBe("2026-06-01");
    const d = buildDigest(
      [ev({ id: "same-day", publishedAt: "2026-06-01", entityIds: ["visa:h-1b"] })],
      ["visa:h-1b"],
      w.since
    );
    expect(d.total).toBe(1);
  });

  it("still understands the date-only stamps already in readers' browsers", () => {
    // The first version of this feature wrote dates. Treating those as absent
    // would tell a returning reader they had never been here.
    expect(digestWindow("2026-06-01").knewLastVisit).toBe(true);
  });

  it("NEVER claims a last visit on a first visit", () => {
    for (const absent of [null, undefined, "", "not-a-date", "2026-13-99x"]) {
      const w = digestWindow(absent);
      expect(w.knewLastVisit, `treated ${JSON.stringify(absent)} as a visit`).toBe(false);
      expect(w.label).toBe("Relevant changes from the archive");
      expect(w.label.toLowerCase()).not.toContain("last visit");
    }
  });

  it("shows the whole archive when there is no visit to measure from", () => {
    // A narrower window under vaguer words would hide the payoff from exactly
    // the reader who has not seen one yet.
    const w = digestWindow(null);
    expect(w.since).toBe(ARCHIVE_START);
    const d = buildDigest(
      [ev({ id: "ancient", publishedAt: "2019-02-02", entityIds: ["visa:h-1b"] })],
      ["visa:h-1b"],
      w.since
    );
    expect(d.total).toBe(1);
  });
});

describe("when a visit becomes the new reference point", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const at = (iso: string) => Date.parse(iso);

  it("records the first visit there is", () => {
    expect(shouldAdvanceLastSeen(null, at("2026-08-08T10:00:00Z"))).toBe(true);
    expect(shouldAdvanceLastSeen(undefined, at("2026-08-08T10:00:00Z"))).toBe(true);
  });

  it("does NOT re-stamp on a second look the same day", () => {
    // The failure this prevents: opening the page in the morning, opening it
    // again after lunch, and being told nothing has changed since lunch.
    const morning = "2026-08-08T09:00:00.000Z";
    expect(shouldAdvanceLastSeen(morning, at("2026-08-08T09:00:30Z"))).toBe(false);
    expect(shouldAdvanceLastSeen(morning, at("2026-08-08T14:00:00Z"))).toBe(false);
    expect(shouldAdvanceLastSeen(morning, at("2026-08-09T08:59:00Z"))).toBe(false);
  });

  it("advances once a full day has passed", () => {
    const morning = "2026-08-08T09:00:00.000Z";
    expect(shouldAdvanceLastSeen(morning, at("2026-08-08T09:00:00Z") + DAY)).toBe(true);
    expect(shouldAdvanceLastSeen(morning, at("2026-08-11T09:00:00Z"))).toBe(true);
  });

  it("treats an unreadable stamp as no stamp rather than as a fresh one", () => {
    // A corrupt value must not freeze the reference point forever.
    for (const junk of ["", "yesterday", "2026-13-45", "{}"]) {
      expect(shouldAdvanceLastSeen(junk, at("2026-08-08T10:00:00Z")), junk).toBe(true);
      expect(parseLastSeen(junk), junk).toBeNull();
    }
  });

  it("uses the interval it documents", () => {
    expect(LAST_SEEN_MIN_INTERVAL_MS).toBe(DAY);
  });
});
