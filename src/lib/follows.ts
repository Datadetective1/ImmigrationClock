// =============================================================================
// FOLLOWING — personalized tracking, without tracking the person
//
// A reader can follow the things that decide whether a change matters to them:
// a visa category, a country, an agency, a topic, a Policy Manual part.
//
// -----------------------------------------------------------------------------
// WHERE THE PREFERENCES LIVE, AND WHY
// -----------------------------------------------------------------------------
// In the reader's own browser, in localStorage, and NOWHERE ELSE. No account, no
// server, no identifier, nothing transmitted.
//
// That is not a limitation we are working around — it is the correct design for
// this platform specifically. /methodology promises "no individual immigrant
// profiles, tracking, or identifying personal data". A logged-in profile
// recording that a particular person follows Venezuela, TPS, and asylum would be
// exactly the dataset that promise exists to prevent, and exactly the dataset
// that would be worth subpoenaing. The safest place for that list is a place we
// cannot read.
//
// The consequence is stated plainly in the UI: follows do not sync between
// devices, because syncing would require us to hold them.
//
// -----------------------------------------------------------------------------
// THE LOGIC IS PURE, THE STORAGE IS INJECTED
// -----------------------------------------------------------------------------
// Everything here is a pure function over a follow set. Nothing touches
// localStorage except the thin adapter at the bottom, so the matching rules —
// the part that decides what a reader is shown — are testable without a browser
// and portable to a server-side digest later without a rewrite.
// =============================================================================

import type { IndexedEvent } from "./event-index";

/** Entity types a reader can follow. Deliberately a subset of the graph's. */
export const FOLLOWABLE_TYPES = [
  "visa",
  "country",
  "agency",
  "topic",
  "policy",
  "employer",
] as const;

export type FollowableType = (typeof FOLLOWABLE_TYPES)[number];

export interface Followable {
  entityId: string;
  type: FollowableType;
  /** Human label, e.g. "Venezuela" or "H-1B". */
  label: string;
  /** How many events in the archive touch it. Zero-event options are not offered. */
  eventCount: number;
}

export const STORAGE_KEY = "immigrationclock.follows.v1";

/** The most follows we will store. A guard against unbounded local state. */
export const MAX_FOLLOWS = 60;

// -----------------------------------------------------------------------------
// Pure logic
// -----------------------------------------------------------------------------

export function isFollowableId(entityId: string): boolean {
  const type = entityId.split(":")[0];
  return (FOLLOWABLE_TYPES as readonly string[]).includes(type) && entityId.split(":").length >= 2;
}

export function isFollowing(follows: readonly string[], entityId: string): boolean {
  return follows.includes(entityId);
}

/**
 * Add or remove a follow.
 *
 * Returns a NEW array — never mutates — so React state updates behave and a
 * caller cannot accidentally share a mutable set between components.
 */
export function toggleFollow(follows: readonly string[], entityId: string): string[] {
  if (!isFollowableId(entityId)) return [...follows];
  if (follows.includes(entityId)) return follows.filter((f) => f !== entityId);
  if (follows.length >= MAX_FOLLOWS) return [...follows];
  return [...follows, entityId];
}

/**
 * Clean a follow set read from storage.
 *
 * Storage is user-writable and survives across deploys, so anything from it is
 * untrusted input: a hand-edited value, a stale id from a renamed entity, or a
 * set that grew past the cap in an older version. Unknown ids are dropped rather
 * than carried, because a follow that can never match is a filter that silently
 * returns nothing.
 */
export function sanitizeFollows(raw: unknown, knownIds?: ReadonlySet<string>): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!isFollowableId(id)) continue;
    if (knownIds && !knownIds.has(id)) continue;
    if (out.includes(id)) continue;
    if (out.length >= MAX_FOLLOWS) break;
    out.push(id);
  }
  return out;
}

/** Events touching anything the reader follows. Empty follows match nothing. */
export function eventsForFollows(events: readonly IndexedEvent[], follows: readonly string[]): IndexedEvent[] {
  if (follows.length === 0) return [];
  const set = new Set(follows);
  return events.filter((e) => e.entityIds.some((id) => set.has(id)));
}

/**
 * Which of a reader's follows an event matched.
 *
 * Shown on each result so a personalized feed never looks arbitrary — a reader
 * should always be able to see WHY something reached them.
 */
export function matchedFollows(event: IndexedEvent, follows: readonly string[]): string[] {
  const set = new Set(follows);
  return event.entityIds.filter((id) => set.has(id));
}

/**
 * Build the catalogue of things worth offering to follow.
 *
 * Derived from the archive rather than hardcoded, and filtered to entities that
 * actually have events. Offering "follow Bhutan" when no event has ever
 * mentioned Bhutan would be promising coverage we do not have — the reader would
 * follow it, see nothing, and reasonably conclude nothing happened.
 */
export function buildFollowCatalog(
  events: readonly IndexedEvent[],
  labelFor: (entityId: string) => string
): Followable[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    for (const id of new Set(e.entityIds)) {
      if (!isFollowableId(id)) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([entityId, eventCount]) => ({
      entityId,
      type: entityId.split(":")[0] as FollowableType,
      label: labelFor(entityId),
      eventCount,
    }))
    .sort((a, b) => b.eventCount - a.eventCount || a.label.localeCompare(b.label));
}

/** Group a catalogue by type, for a sectioned picker. */
export function groupCatalog(items: Followable[]): { type: FollowableType; items: Followable[] }[] {
  return FOLLOWABLE_TYPES.map((type) => ({
    type,
    items: items.filter((i) => i.type === type),
  })).filter((g) => g.items.length > 0);
}

/**
 * A digest of what changed for a reader since a given date.
 *
 * Pure and serializable so the same function can drive the on-site view today
 * and an emailed digest later, without two implementations that drift.
 */
export interface FollowDigest {
  since: string;
  total: number;
  significant: IndexedEvent[];
  routine: IndexedEvent[];
}

export function buildDigest(
  events: readonly IndexedEvent[],
  follows: readonly string[],
  since: string
): FollowDigest {
  const matched = eventsForFollows(events, follows).filter((e) => e.publishedAt >= since);
  return {
    since,
    total: matched.length,
    significant: matched.filter((e) => e.severity !== "routine"),
    routine: matched.filter((e) => e.severity === "routine"),
  };
}

// -----------------------------------------------------------------------------
// Storage adapter — the only part that knows about the browser
// -----------------------------------------------------------------------------

export function readStoredFollows(knownIds?: ReadonlySet<string>): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return sanitizeFollows(JSON.parse(raw), knownIds);
  } catch {
    // Corrupt or unreadable storage must not break the page. An empty set is a
    // correct, if disappointing, answer.
    return [];
  }
}

export function writeStoredFollows(follows: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...follows]));
  } catch {
    // Private browsing and quota limits both throw here. Following is an
    // enhancement, so failing to persist must never break the page.
  }
}
