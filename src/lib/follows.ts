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

export interface FollowGroup {
  type: FollowableType;
  items: Followable[];
}

/** Group a catalogue by type, for a sectioned picker. */
export function groupCatalog(items: Followable[]): FollowGroup[] {
  return FOLLOWABLE_TYPES.map((type) => ({
    type,
    items: items.filter((i) => i.type === type),
  })).filter((g) => g.items.length > 0);
}

// -----------------------------------------------------------------------------
// What the picker offers, and in what order
//
// Pure, and here rather than inside the component, for the same reason the
// matching rules are: what a reader can find is a product decision, and a
// product decision that only exists inside JSX cannot be tested.
// -----------------------------------------------------------------------------

/**
 * The four categories the picker leads with, in the order it shows them.
 *
 * A visitor arriving from "Follow a country or visa" is looking for a country
 * or a visa. Policy Manual parts and employers remain followable — a stored
 * follow of either keeps working — but they are long tails of specialist ids,
 * and putting 53 Policy Manual parts above the 25 countries would bury the
 * thing the reader came for.
 */
export const PRIMARY_FOLLOW_TYPES = ["country", "visa", "agency", "topic"] as const;

export type PrimaryFollowType = (typeof PRIMARY_FOLLOW_TYPES)[number];

export function isPrimaryFollowType(type: string): type is PrimaryFollowType {
  return (PRIMARY_FOLLOW_TYPES as readonly string[]).includes(type);
}

/** Order groups so the four headline categories come first, tail types after. */
export function orderGroupsForPicker(groups: readonly FollowGroup[]): FollowGroup[] {
  const rank = (type: FollowableType) =>
    isPrimaryFollowType(type)
      ? PRIMARY_FOLLOW_TYPES.indexOf(type)
      : PRIMARY_FOLLOW_TYPES.length + FOLLOWABLE_TYPES.indexOf(type);
  return [...groups].sort((a, b) => rank(a.type) - rank(b.type));
}

/**
 * Words that should surface a whole category.
 *
 * The search field asks the reader to "search countries, visas, agencies, or
 * topics", so typing one of those words has to return that category. Matching
 * labels alone would answer "visas" with nothing, because no visa is labelled
 * "visa" — a search box that fails on the words it advertises teaches the
 * reader the picker is empty.
 */
const TYPE_KEYWORDS: Record<FollowableType, readonly string[]> = {
  country: ["country", "countries", "nationality"],
  visa: ["visa", "visas", "status", "program", "programs"],
  agency: ["agency", "agencies", "department"],
  topic: ["topic", "topics", "subject"],
  policy: ["policy", "policies", "manual"],
  employer: ["employer", "employers", "company", "companies"],
};

/** Below this, a category word is too ambiguous to widen a search with. */
const MIN_CATEGORY_QUERY = 3;

export function matchesFollowQuery(item: Followable, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (item.label.toLowerCase().includes(q)) return true;
  // The SLUG, not the whole id: "country:mexico" contains "count", and matching
  // the type prefix would quietly turn any such query into "every country" —
  // the widening the category rule below is deliberately careful about.
  if (item.entityId.slice(item.entityId.indexOf(":") + 1).toLowerCase().includes(q)) return true;
  // "c" must not mean "every country". Only a word long enough to be deliberate
  // widens the match to a whole category.
  if (q.length < MIN_CATEGORY_QUERY) return false;
  return TYPE_KEYWORDS[item.type].some((keyword) => keyword.startsWith(q));
}

/**
 * The groups a reader should currently see: one text query, one optional
 * category, and empty groups dropped so no heading stands over nothing.
 */
export function filterGroups(
  groups: readonly FollowGroup[],
  options: { query?: string; type?: FollowableType | null } = {}
): FollowGroup[] {
  const { query = "", type = null } = options;
  return groups
    .filter((g) => type === null || g.type === type)
    .map((g) => ({ type: g.type, items: g.items.filter((i) => matchesFollowQuery(i, query)) }))
    .filter((g) => g.items.length > 0);
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

/**
 * A date low enough to mean "everything we have".
 *
 * Dates in the index are ISO `YYYY-MM-DD` strings compared lexically, so this
 * sorts below every real one without pretending to be a real one.
 */
export const ARCHIVE_START = "0000-01-01";

export interface DigestWindow {
  /** Lower bound to pass to buildDigest. */
  since: string;
  /** How the window may be described to the reader, and no other way. */
  label: string;
  knewLastVisit: boolean;
}

/**
 * A stored visit stamp, or null if there is not a usable one.
 *
 * Accepts a bare `YYYY-MM-DD` as well as a full ISO timestamp: the first
 * version of this feature stored dates, those values are in readers' browsers
 * already, and treating them as absent would tell a returning reader they had
 * never been here.
 */
export function parseLastSeen(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

/** How long a recorded visit stays the reference point. */
export const LAST_SEEN_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Whether this page view should become the new "last visit".
 *
 * Stamping on every load destroys the thing the stamp is for. A reader who
 * opens /following twice in an afternoon would have their morning's reference
 * point overwritten by the morning itself, and the second view would report
 * "since your last visit: nothing" — technically true of a window three hours
 * wide, and useless. So a visit only becomes the new reference once it is a
 * day clear of the old one; until then, "since your last visit" keeps meaning
 * the last visit that was worth measuring from.
 */
export function shouldAdvanceLastSeen(
  stored: string | null | undefined,
  now: number = Date.now()
): boolean {
  const previous = parseLastSeen(stored);
  if (!previous) return true;
  return now - Date.parse(previous) >= LAST_SEEN_MIN_INTERVAL_MS;
}

/**
 * Decide what period a digest actually covers — and what it is allowed to claim.
 *
 * On a first visit there IS no last visit, so "since your last visit" would be
 * a small lie told to make a number look bigger. The honest alternative is not
 * a narrower window with vaguer words: it is the whole archive, described as
 * the whole archive. A reader who has just followed their first country should
 * see everything we hold on it, not the last thirty days of it.
 */
export function digestWindow(previousVisit: string | null | undefined): DigestWindow {
  const valid = parseLastSeen(previousVisit);
  return valid
    ? // The DATE part only: events carry `YYYY-MM-DD`, and comparing them
      // against a full timestamp would drop everything published on the day of
      // the visit itself.
      { since: valid.slice(0, 10), label: "Since your last visit", knewLastVisit: true }
    : { since: ARCHIVE_START, label: "Relevant changes from the archive", knewLastVisit: false };
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
