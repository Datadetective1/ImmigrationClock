// =============================================================================
// SELECTION — three pools, one candidate list per slot
//
// Everything in this file is deterministic. Given the same archive, the same
// date and the same ledger, it returns the same ordered candidates forever.
// Nothing reads a clock that is not passed in, and no ranking here is an
// opinion about a specific story.
//
// This matters more than it usually would: selection runs BEFORE the copy
// engine, and a slot with no candidate never makes an API call. The quality bar
// is therefore also the cost control, and both are enforced by code a human can
// read rather than by a prompt.
//
// WHY THE POOLS DO NOT OVERLAP
// ----------------------------
// The morning slot takes only what is new. The afternoon slot deliberately
// EXCLUDES the last two days, so it can never explain a rule the morning slot
// just broke — that would be the same subject twice in six hours with two
// different framings, which is exactly what reads as an automated account
// padding its schedule.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import { KEY_DATES, nextOccurrence, daysUntil, type KeyDate } from "@/lib/key-dates";
import { STANDING_ASSETS } from "./links";
import { resolveDeepLink } from "./links";
import {
  scoreEvents,
  isPostableSeverity,
  isSubstantive,
  NEWS_SCORE_FLOOR,
  KNOWLEDGE_SCORE_FLOOR,
} from "./score";
import { buildEventFacts, buildKeyDateFacts, buildAssetFacts } from "./facts";
import type { Angle, Candidate, SlotDef } from "./types";

/** How far back the morning slot will call something "new". */
export const NEWS_LOOKBACK_DAYS = 2;

/** The afternoon slot starts where the morning slot stops. */
export const KNOWLEDGE_MIN_AGE_DAYS = NEWS_LOOKBACK_DAYS + 1;

/** How far back the afternoon slot will reach for something still worth explaining. */
export const KNOWLEDGE_LOOKBACK_DAYS = 180;

/** A key date closer than this leads the evening slot ahead of any dataset. */
export const DEADLINE_URGENT_DAYS = 45;

function isoShift(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

function daysBetweenIso(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

// -----------------------------------------------------------------------------
// POOL 1 — NEWS (morning)
// -----------------------------------------------------------------------------

/**
 * Genuinely new qualifying developments.
 *
 * Scheduled-for-publication documents are excluded on purpose. The Federal
 * Register puts items on public inspection days before their publication date,
 * and the archive faithfully records that with `scheduled: true` and a future
 * `publishedAt`. Posting one would force the copy into "scheduled for
 * publication on…" phrasing, which is both weaker and much easier to get subtly
 * wrong than simply waiting until it is actually published.
 */
export function newsPool(events: IndexedEvent[], today: string): Candidate[] {
  const from = isoShift(today, -NEWS_LOOKBACK_DAYS);

  const eligible = events.filter(
    (e) =>
      e.publishedAt <= today &&
      e.publishedAt >= from &&
      isPostableSeverity(e) &&
      isSubstantive(e)
  );

  return scoreEvents(eligible, from, today)
    .filter((s) => s.score >= NEWS_SCORE_FLOOR)
    .map((s) => toEventCandidate(s.event, s.score, s.explain, "news", ["breaking_change"], today))
    .filter((c): c is Candidate => c !== null);
}

// -----------------------------------------------------------------------------
// POOL 2 — KNOWLEDGE (afternoon)
// -----------------------------------------------------------------------------

export function knowledgePool(events: IndexedEvent[], today: string, slot: SlotDef): Candidate[] {
  const newest = isoShift(today, -KNOWLEDGE_MIN_AGE_DAYS);
  const oldest = isoShift(today, -KNOWLEDGE_LOOKBACK_DAYS);

  const eligible = events.filter(
    (e) =>
      e.publishedAt <= newest &&
      e.publishedAt >= oldest &&
      isPostableSeverity(e) &&
      isSubstantive(e)
  );

  return scoreEvents(eligible, oldest, today)
    .filter((s) => s.score >= KNOWLEDGE_SCORE_FLOOR)
    .map((s) => {
      const angles = anglesForArchiveEvent(s.event, today, events).filter((a) =>
        slot.angles.includes(a)
      );
      if (angles.length === 0) return null;
      return toEventCandidate(s.event, s.score, s.explain, "knowledge", angles, today);
    })
    .filter((c): c is Candidate => c !== null);
}

/**
 * Which treatments does this event's own data actually support?
 *
 * The rule is that an angle must be EARNED by a field, not chosen because the
 * slot needs one. An effective-date reminder requires a real future effective
 * date; a "what changed from the previous rule" requires the archive to say the
 * document updated or amended something. An angle the data cannot support is an
 * invitation for the model to invent the supporting detail, which is the exact
 * failure the whole trust layer exists to prevent.
 */
export function anglesForArchiveEvent(
  e: IndexedEvent,
  today: string,
  all: IndexedEvent[]
): Angle[] {
  const angles: Angle[] = [];

  if (e.effectiveAt && e.effectiveAt > today && daysBetweenIso(today, e.effectiveAt) <= 90) {
    angles.push("effective_date_reminder");
  }

  // "Who is affected" needs the archive to have linked a concrete population —
  // a visa category, a country, or a topic that is not the catch-all.
  const concrete = (e.entityIds ?? []).filter(
    (id) =>
      id.startsWith("visa:") ||
      id.startsWith("country:") ||
      (id.startsWith("topic:") && id !== "topic:policy-changes")
  );
  if (concrete.length > 0) angles.push("who_is_affected");

  if (e.classification === "updated_information" || /\b(amend|revis|supersed|replac)/i.test(e.title)) {
    angles.push("what_changed_from_previous");
  }

  // Historical context requires an actual sequence: at least two other events
  // sharing a distinctive entity, so there is something to place it among.
  const distinctive = concrete.filter((id) => !id.startsWith("topic:"));
  if (distinctive.length > 0) {
    const related = all.filter(
      (o) => o.id !== e.id && (o.entityIds ?? []).some((id) => distinctive.includes(id))
    );
    if (related.length >= 2) angles.push("historical_context");
  }

  return angles;
}

// -----------------------------------------------------------------------------
// POOL 3 — STANDING (evening)
// -----------------------------------------------------------------------------

/**
 * Durable resources. Unlike the other two pools this one is never empty, which
 * is why its quality bar is a rotation rather than a threshold: the question is
 * not "is anything good enough" but "which of these is most useful today".
 *
 * Key dates outrank datasets when a deadline is genuinely close, because a
 * countdown is time-sensitive in a way a dataset is not. Otherwise assets rotate
 * deterministically by day, so the evening feed moves through the whole catalogue
 * instead of parking on whichever page happened to sort first.
 */
export function standingPool(today: string): Candidate[] {
  const out: Candidate[] = [];
  const now = new Date(`${today}T00:00:00Z`);

  for (const kd of KEY_DATES) {
    const info = keyDateTiming(kd, now);
    if (!info) continue;
    // A deadline is worth a post when it is approaching, not year-round.
    if (info.days > 120) continue;

    // Nearer deadlines score higher; everything here outranks a dataset when
    // inside the urgent window.
    const urgency = info.days <= DEADLINE_URGENT_DAYS ? 3000 : 1500;
    const score = urgency + Math.max(0, 120 - info.days);

    out.push({
      subjectId: `keydate:${kd.id}`,
      pool: "standing",
      label: `${kd.title} (${info.days} days away)`,
      score,
      scoreExplain: `keydate days=${info.days} urgent=${info.days <= DEADLINE_URGENT_DAYS}`,
      supportedAngles: ["deadline_approaching"],
      deepLink: "/key-dates",
      sourceUrl: kd.sourceUrl,
      event: null,
      facts: buildKeyDateFacts(kd, info.days, info.dateLabel),
    });
  }

  // An asset whose underlying data supports nothing worth saying today does not
  // enter the rotation at all. Filtering BEFORE the rotation rather than after
  // matters: rotating over the full catalogue and dropping members later would
  // leave holes on fixed days, so the same weekday would go quiet every week for
  // no reason a reader could see.
  const usable = STANDING_ASSETS.map((asset) => ({ asset, facts: buildAssetFacts(asset, today) }))
    .filter((a): a is { asset: (typeof STANDING_ASSETS)[number]; facts: NonNullable<ReturnType<typeof buildAssetFacts>> } => a.facts !== null);

  // Deterministic rotation: the day number picks the starting offset, so the
  // catalogue advances one step a day and every asset comes round.
  const dayNumber = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000);
  usable.forEach(({ asset, facts }, i) => {
    const position = (i - dayNumber) % usable.length;
    const normalized = (position + usable.length) % usable.length;
    out.push({
      subjectId: `asset:${asset.id}`,
      pool: "standing",
      label: asset.label,
      score: 1000 + (usable.length - normalized),
      scoreExplain: `asset rotation position=${normalized}`,
      supportedAngles: ["data_insight"],
      deepLink: asset.path,
      sourceUrl: null,
      event: null,
      facts,
    });
  });

  return out.sort((a, b) => b.score - a.score || a.subjectId.localeCompare(b.subjectId));
}

/** Days until the next occurrence of a key date, when it has one. */
export function keyDateTiming(kd: KeyDate, from: Date): { days: number; dateLabel: string } | null {
  if (kd.month === undefined || kd.day === undefined) return null;
  const next = nextOccurrence(kd.month, kd.day, from);
  return { days: daysUntil(next, from), dateLabel: next.toISOString().slice(0, 10) };
}

// -----------------------------------------------------------------------------
// ENTRY POINT
// -----------------------------------------------------------------------------

/** The ordered candidate list for one slot on one day. */
export function candidatesFor(
  slot: SlotDef,
  events: IndexedEvent[],
  today: string
): Candidate[] {
  switch (slot.pool) {
    case "news":
      return newsPool(events, today);
    case "knowledge":
      return knowledgePool(events, today, slot);
    case "standing":
      return standingPool(today).map((c) => ({
        ...c,
        supportedAngles: c.supportedAngles.filter((a) => slot.angles.includes(a)),
      })).filter((c) => c.supportedAngles.length > 0);
  }
}

function toEventCandidate(
  event: IndexedEvent,
  score: number,
  explain: string,
  pool: "news" | "knowledge",
  angles: Angle[],
  today: string
): Candidate | null {
  const deepLink = resolveDeepLink(event);
  // No destination, no post. Falling back to the homepage would waste the click
  // and is forbidden by links.ts.
  if (!deepLink) return null;

  return {
    subjectId: `event:${event.id}`,
    pool,
    label: event.title,
    score,
    scoreExplain: explain,
    supportedAngles: angles,
    deepLink,
    sourceUrl: event.sourceUrl,
    event,
    facts: buildEventFacts(event, deepLink, today),
  };
}
