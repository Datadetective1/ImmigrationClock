// =============================================================================
// SELECTION — one ranked queue of everything the account could say today
//
// Everything in this file is deterministic. Given the same archive, the same
// date and the same registries, it returns the same ordered candidates forever.
// Nothing reads a clock that is not passed in, and no ranking here is an
// opinion about a specific story.
//
// THE CHANGE FROM THREE POOLS TO ONE QUEUE
// ----------------------------------------
// The first design gave each slot its own pool, on the reasoning that three
// slots competing for one thin news pool would starve. It was right about the
// starving and wrong about the cure: a slot whose pool was dry stayed silent
// while a real development sat in a pool the slot could not see, and a major
// court order never entered any pool because the ranking model saw no
// "obligation" keyword in a terse summary.
//
// Now every kind of post the account can make is a candidate in one queue —
// eight content types, each built from its own closed fact set — and the
// CADENCE policy (cadence.ts) decides which tiers a given window may draw from.
// A morning with a material change posts it; an afternoon with nothing new
// posts an explainer; an evening after two posts stays quiet. The queue is the
// same; only the permission changes.
//
// WHAT EACH RECORD MAY BECOME
// ---------------------------
//   a change ≤ 2 days old and consequential     breaking_change      news
//   a change ≤ 10 days old, worth a plain-English what changed    news / follow-up
//   a change ≤ 21 days old with derivable implications           why_it_matters
//   a rule with an effective date in the next 90 days            effective_date
//   a recurring date at a milestone                              key_date
//   a data signal today's snapshots support                      data_signal
//   an explainer, topical first                                  explainer
//   a verified capability                                        data_discovery
//
// One record can be several candidates; the dedupe layer spends each treatment
// once and the subject cooldown spaces them.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import { KEY_DATES, nextOccurrence, daysUntil, type KeyDate } from "@/lib/key-dates";
import { EXPLAINERS, type Explainer } from "@/lib/editorial/explainers";
import { buildSignals, type DataSignal } from "@/lib/editorial/signals";
import { buildDiscoveries, type Discovery } from "@/lib/editorial/discovery";
import { changePath, explainerPath, signalPath } from "@/lib/share";
import { SOURCE_BY_KEY } from "@/lib/sources";
import {
  scoreEvents,
  obligationLevel,
  isPostableSeverity,
  isSubstantive,
  NEWS_SCORE_FLOOR,
  KNOWLEDGE_SCORE_FLOOR,
} from "./score";
import {
  buildDiscoveryFacts,
  buildEventFacts,
  buildExplainerFacts,
  buildKeyDateFacts,
  buildSignalFacts,
  storyKeyForEvent,
} from "./facts";
import { buildEventVisual, buildKeyDateVisual } from "./visuals";
import { keyDateMilestone, topicFamilyFor } from "./rotation";
import {
  CATEGORY_LABEL,
  CATEGORY_TIER,
  categoryForEvent,
  categoryForEvergreen,
} from "./categories";
import {
  READER_VALUE_FLOOR,
  READER_VALUE_WEIGHT,
  DEVELOPMENT_READER_VALUE_FLOOR,
  readerValueForEvent,
  readerValueForKeyDate,
  treatmentFor,
  type ReaderValue,
} from "./reader-value";
import {
  STRUCTURES_FOR_TYPE,
  TIER_FOR_TYPE,
  TYPE_MAX_AGE_DAYS,
  type CadenceTier,
  type ContentType,
} from "./content-types";
import { ANGLE_FOR_TYPE, type Angle, type Candidate } from "./types";

/** How far back a development may be given the plain-English what-changed treatment. */
export const WHAT_CHANGED_MAX_AGE_DAYS = TYPE_MAX_AGE_DAYS.what_changed ?? 5;

/** How far back a development may be given the why-it-matters treatment. */
export const WHY_IT_MATTERS_MAX_AGE_DAYS = TYPE_MAX_AGE_DAYS.why_it_matters ?? 7;

/** Past this age a what-changed post is a follow-up, not news. */
export const WHAT_CHANGED_NEWS_AGE_DAYS = 2;

/**
 * An effective date this far ahead is worth a reminder.
 *
 * Thirty days, not ninety. A reminder two months out is a calendar entry; a
 * reminder in the month a rule starts is the thing a reader can still act on.
 * The explainer on effective dates covers the general point for everyone else.
 */
export const EFFECTIVE_DATE_HORIZON_DAYS = 30;

/** A key date closer than this leads the deadlines ahead of any dataset. */
export const DEADLINE_URGENT_DAYS = 45;

/**
 * Score lost per day of age, inside the news tier only. Bounded well below one
 * breadth step (5 × 150 < 1000), so it orders comparable developments and
 * never overturns a more consequential one.
 */
export const RECENCY_DECAY_PER_DAY = 150;

/**
 * The ranking floor, and the exception that fixes a real omission.
 *
 * The first design required breadth ≥ 2 AND one obligation step (2100), which
 * is right for a notice and wrong for an instrument whose consequence is its
 * kind: a court order enjoining two policy memos scored 2,029 because its
 * summary named no obligation, and never entered a pool. A major final rule,
 * an executive action or a court decision now qualifies on kind, at the
 * knowledge floor (breadth ≥ 2), and reader value still has to clear the bar.
 */
export function qualifiesAsNews(event: IndexedEvent, rank: number): boolean {
  if (rank >= NEWS_SCORE_FLOOR) return true;
  if (rank < KNOWLEDGE_SCORE_FLOOR) return false;
  return (
    event.classification === "court_decision" ||
    event.classification === "executive_action" ||
    (event.classification === "final_rule" && event.severity === "major")
  );
}

export function clearsReaderValueFloor(value: ReaderValue): boolean {
  return value.score >= READER_VALUE_FLOOR;
}

/** Reader value expressed in the same units as the rest of a candidate's score. */
export function readerValueMerit(value: ReaderValue): number {
  return value.score * READER_VALUE_WEIGHT;
}

/**
 * The coarse subject a reader would name, used for same-day variety.
 *
 * Deliberately blunt. "H-1B" is one topic whether it arrives as a fee rule, an
 * explainer about the cap, or a data signal about sponsors — and a day carrying
 * all three reads as a single-issue feed however distinct their subject ids are.
 */
export function topicKeyFor(input: {
  subjectId: string;
  event?: IndexedEvent | null;
  keyDateCategory?: string;
  assetTags?: string[];
  explicit?: string;
}): string {
  if (input.explicit) return input.explicit;
  if (input.subjectId.startsWith("keydate:")) {
    return input.keyDateCategory ? `topic:${input.keyDateCategory}` : "";
  }
  if (input.subjectId.startsWith("asset:")) {
    return input.assetTags?.length ? `topic:${input.assetTags[0]}` : "";
  }
  const ids = input.event?.entityIds ?? [];
  for (const prefix of ["visa:", "country:"]) {
    const hit = ids.find((id) => id.startsWith(prefix));
    if (hit) return hit;
  }
  const topic = ids.find((id) => id.startsWith("topic:") && id !== "topic:policy-changes");
  if (topic) return topic;
  return input.event ? `source:${input.event.sourceKey}` : "";
}

/** The Federal Register's own placeholder when a document ships without an abstract. */
const NO_ABSTRACT = /^\s*no abstract (was|is) published/i;

function isoShift(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

function daysBetweenIso(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** The day number, for deterministic rotations that advance one step a day. */
function dayNumber(today: string): number {
  return Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000);
}

// -----------------------------------------------------------------------------
// RECORDED CHANGES — up to four candidates per change
// -----------------------------------------------------------------------------

/**
 * Which treatments an archive event's own data supports, from the first
 * design. Still used to decide whether a change has a "who is affected" or a
 * "what changed from previous" story in it, which feeds the what-changed and
 * why-it-matters tests below.
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

  const concrete = (e.entityIds ?? []).filter(
    (id) =>
      id.startsWith("visa:") ||
      id.startsWith("country:") ||
      (id.startsWith("topic:") && id !== "topic:policy-changes")
  );
  if (concrete.length > 0) angles.push("who_is_affected");

  if (e.classification === "updated_information" || /\b(amend|revis|supersed|replac|rescind|reinstat)/i.test(e.title + " " + e.summary)) {
    angles.push("what_changed_from_previous");
  }

  const distinctive = concrete.filter((id) => !id.startsWith("topic:"));
  if (distinctive.length > 0) {
    const related = all.filter(
      (o) => o.id !== e.id && (o.entityIds ?? []).some((id) => distinctive.includes(id))
    );
    if (related.length >= 2) angles.push("historical_context");
  }

  return angles;
}

export function eventCandidates(events: IndexedEvent[], today: string): Candidate[] {
  const from = isoShift(today, -WHY_IT_MATTERS_MAX_AGE_DAYS);
  const horizon = isoShift(today, EFFECTIVE_DATE_HORIZON_DAYS);

  const recent = events.filter(
    (e) => e.publishedAt <= today && e.publishedAt >= from && isPostableSeverity(e) && isSubstantive(e)
  );
  // Effective-date reminders reach further back: a rule published in July that
  // starts in September is exactly the kind of thing a reader wants told twice.
  const dated = events.filter(
    (e) =>
      e.publishedAt <= today &&
      e.publishedAt < from &&
      e.effectiveAt &&
      e.effectiveAt > today &&
      e.effectiveAt <= horizon &&
      isPostableSeverity(e) &&
      isSubstantive(e)
  );

  const out: Candidate[] = [];
  const scored = scoreEvents([...recent, ...dated], isoShift(today, -180), today);

  for (const s of scored) {
    const e = s.event;
    const value = readerValueForEvent(e, today);
    if (!clearsReaderValueFloor(value)) continue;
    const ageDays = daysBetweenIso(e.publishedAt, today);
    const futureEffective =
      Boolean(e.effectiveAt && e.effectiveAt > today && e.effectiveAt <= horizon);

    // A record with no summary can only be restated as its title. It is a
    // real record and its page is real, but a post that "explains" it would
    // be explaining nothing — so it may carry a dated reminder and nothing
    // narrative.
    const hasSummary = !NO_ABSTRACT.test(e.summary ?? "") && (e.summary ?? "").trim().length >= 40;

    const types: { type: ContentType; tier: CadenceTier }[] = [];

    if (hasSummary && ageDays <= (TYPE_MAX_AGE_DAYS.breaking_change ?? 2)) {
      if (qualifiesAsNews(e, s.score) && value.score >= DEVELOPMENT_READER_VALUE_FLOOR) {
        types.push({ type: "breaking_change", tier: "news" });
      }
    }
    if (hasSummary && ageDays <= WHAT_CHANGED_MAX_AGE_DAYS && s.score >= KNOWLEDGE_SCORE_FLOOR) {
      types.push({
        type: "what_changed",
        tier: ageDays <= WHAT_CHANGED_NEWS_AGE_DAYS ? "news" : "follow_up",
      });
    }
    if (hasSummary && ageDays <= WHY_IT_MATTERS_MAX_AGE_DAYS && s.score >= KNOWLEDGE_SCORE_FLOOR) {
      const facts = buildEventFacts(e, changePath(e), today, "why_it_matters");
      if ((facts.implications?.length ?? 0) >= 2) types.push({ type: "why_it_matters", tier: "follow_up" });
    }
    if (futureEffective && ageDays > (TYPE_MAX_AGE_DAYS.breaking_change ?? 2)) {
      types.push({ type: "effective_date", tier: "follow_up" });
    }

    for (const { type, tier } of types) {
      const candidate = toEventCandidate(e, s.score, s.explain, type, tier, today, value, ageDays, futureEffective, events);
      if (candidate) out.push(candidate);
    }
  }

  return out;
}

function toEventCandidate(
  event: IndexedEvent,
  rank: number,
  explain: string,
  contentType: ContentType,
  tier: CadenceTier,
  today: string,
  value: ReaderValue,
  ageDays: number,
  hasUpcomingEffectiveDate: boolean,
  all: IndexedEvent[]
): Candidate | null {
  const path = changePath(event);
  const facts = buildEventFacts(event, path, today, contentType);
  const angle = ANGLE_FOR_TYPE[contentType];

  const fresh = contentType === "breaking_change";
  const category =
    contentType === "effective_date"
      ? "deadline"
      : categoryForEvent({
          classification: event.classification,
          fresh,
          obligationLevel: obligationLevel(event),
          hasUpcomingEffectiveDate,
          readerValue: value.score,
        });

  // News decays with age; follow-ups are ordered by how soon they matter.
  const recencyPenalty = tier === "news" ? ageDays * RECENCY_DECAY_PER_DAY : 0;
  // An effective date a week away outranks one two months away.
  const proximityMerit =
    contentType === "effective_date" && event.effectiveAt
      ? Math.max(0, EFFECTIVE_DATE_HORIZON_DAYS - daysBetweenIso(today, event.effectiveAt)) * 10
      : 0;

  const score = CATEGORY_TIER[category] + rank + readerValueMerit(value) + proximityMerit - recencyPenalty;

  const supported = [angle, ...anglesForArchiveEvent(event, today, all).filter((a) => a !== angle)];

  return {
    subjectId: `event:${event.id}`,
    pool: tier === "news" ? "news" : "knowledge",
    contentType,
    tier,
    structures: STRUCTURES_FOR_TYPE[contentType],
    label: event.title,
    category,
    score,
    scoreExplain:
      `${CATEGORY_LABEL[category]} (tier ${CATEGORY_TIER[category]}) + ${rank.toFixed(1)}` +
      ` + ${readerValueMerit(value)} reader value (${value.score}/100)` +
      `${proximityMerit ? ` + ${proximityMerit} proximity` : ""}` +
      `${recencyPenalty ? ` − ${recencyPenalty} recency` : ""}: ${explain}; ${value.reason}`,
    readerValue: value,
    treatment: treatmentFor({
      subjectKind: "document",
      angle,
      ageDays,
      hasFutureEffectiveDate: hasUpcomingEffectiveDate,
      hasFigures: facts.figures.length > 0,
      value,
    }),
    supportedAngles: supported,
    topicKey: topicKeyFor({ subjectId: `event:${event.id}`, event }),
    topicFamily: topicFamilyFor({
      subjectId: `event:${event.id}`,
      topicKey: topicKeyFor({ subjectId: `event:${event.id}`, event }),
      event,
    }),
    hasNewInformation: tier === "news" || hasUpcomingEffectiveDate,
    deepLink: path,
    storyKey: storyKeyForEvent(event),
    sourceUrl: event.sourceUrl,
    event,
    facts,
    visual: buildEventVisual(event, angle, SOURCE_BY_KEY[event.sourceKey]?.name ?? event.sourceKey),
  };
}

// -----------------------------------------------------------------------------
// RECURRING DATES — at milestones only
// -----------------------------------------------------------------------------

export function keyDateTiming(kd: KeyDate, from: Date): { days: number; dateLabel: string } | null {
  if (kd.month === undefined || kd.day === undefined) return null;
  const next = nextOccurrence(kd.month, kd.day, from);
  return { days: daysUntil(next, from), dateLabel: next.toISOString().slice(0, 10) };
}

export function keyDateCandidates(today: string): Candidate[] {
  const out: Candidate[] = [];
  const now = new Date(`${today}T00:00:00Z`);

  for (const kd of KEY_DATES) {
    const info = keyDateTiming(kd, now);
    if (!info) continue;
    if (info.days > 120) continue;

    // Only at a milestone. A countdown decrements every day, which would make
    // every day look like new content; crossing a threshold is news.
    const milestone = keyDateMilestone(info.days);
    if (!milestone) continue;

    const urgency = info.days <= DEADLINE_URGENT_DAYS ? 3000 : 1500;
    const merit = urgency + Math.max(0, 120 - info.days);
    const angle: Angle = info.days <= DEADLINE_URGENT_DAYS ? "deadline_approaching" : "preparation_window";

    const value = readerValueForKeyDate(kd, info.days);
    if (!clearsReaderValueFloor(value)) continue;
    const facts = buildKeyDateFacts(kd, info.days, info.dateLabel, today);
    const topicKey = topicKeyFor({ subjectId: `keydate:${kd.id}`, keyDateCategory: kd.category });

    out.push({
      subjectId: `keydate:${kd.id}`,
      pool: "standing",
      contentType: "key_date",
      tier: TIER_FOR_TYPE.key_date,
      structures: STRUCTURES_FOR_TYPE.key_date,
      label: `${kd.title} (${milestone})`,
      category: "deadline",
      score: CATEGORY_TIER.deadline + merit,
      scoreExplain:
        `${CATEGORY_LABEL.deadline} (tier ${CATEGORY_TIER.deadline}) + ${merit}: days=${info.days} ` +
        `urgent=${info.days <= DEADLINE_URGENT_DAYS}; ${value.reason}`,
      readerValue: value,
      treatment: treatmentFor({
        subjectKind: "recurring_date",
        angle,
        ageDays: null,
        hasFutureEffectiveDate: false,
        hasFigures: facts.figures.length > 0,
        value,
      }),
      supportedAngles: [angle],
      topicKey,
      topicFamily: topicFamilyFor({ subjectId: `keydate:${kd.id}`, topicKey, keyDateCategory: kd.category }),
      hasNewInformation: true,
      deepLink: "/key-dates",
      storyKey: `keydate:${kd.id}`,
      sourceUrl: kd.sourceUrl,
      event: null,
      facts,
      visual: buildKeyDateVisual(kd, info.days, angle),
    });
  }

  return out;
}

// -----------------------------------------------------------------------------
// THE EVERGREEN TIER
// -----------------------------------------------------------------------------

/** Reader value for a record whose worth is by construction, not by vocabulary. */
function evergreenValue(score: number, reason: string, hooks: string[]): ReaderValue {
  return { score, signals: [], lowValue: [], reason: `reader value ${score}/100 — ${reason}`, hooks };
}

/** Is this explainer about something that changed recently? */
function topicalBoost(e: Explainer, events: IndexedEvent[], today: string): { boost: number; why: string } {
  const since = isoShift(today, -14);
  const hit = events.find(
    (ev) =>
      ev.publishedAt >= since &&
      ev.publishedAt <= today &&
      ev.severity !== "routine" &&
      e.keywords.some((k) => `${ev.title} ${ev.summary}`.toLowerCase().includes(k))
  );
  return hit ? { boost: 2000, why: `topical: "${hit.title.slice(0, 50)}" (${hit.publishedAt})` } : { boost: 0, why: "" };
}

export function explainerCandidates(events: IndexedEvent[], today: string): Candidate[] {
  const day = dayNumber(today);
  const category = categoryForEvergreen("explainer");
  return EXPLAINERS.map((e, i) => {
    const facts = buildExplainerFacts(e, today);
    const { boost, why } = topicalBoost(e, events, today);
    const position = (((i - day) % EXPLAINERS.length) + EXPLAINERS.length) % EXPLAINERS.length;
    const rotationMerit = EXPLAINERS.length - position;
    const value = evergreenValue(
      60,
      "evergreen, source-backed explanation of a distinction readers get wrong",
      [`The distinction: ${e.kicker}`]
    );
    const topicKey = `explainer:${e.group}`;
    return {
      subjectId: `explainer:${e.slug}`,
      pool: "editorial",
      contentType: "explainer",
      tier: TIER_FOR_TYPE.explainer,
      structures: STRUCTURES_FOR_TYPE.explainer,
      label: e.title,
      category,
      score: CATEGORY_TIER[category] + boost + rotationMerit,
      scoreExplain:
        `${CATEGORY_LABEL[category]} (tier ${CATEGORY_TIER[category]})` +
        `${boost ? ` + ${boost} ${why}` : ""} + ${rotationMerit}: rotation position=${position}; ${value.reason}`,
      readerValue: value,
      treatment: "context_explainer",
      supportedAngles: ["explainer"],
      topicKey,
      topicFamily: topicFamilyFor({ subjectId: `explainer:${e.slug}`, topicKey, editorialGroup: e.group }),
      hasNewInformation: boost > 0,
      deepLink: explainerPath(e.slug),
      storyKey: `explainer:${e.slug}`,
      sourceUrl: e.sources[0]?.url ?? null,
      event: null,
      facts,
      visual: null,
    } satisfies Candidate;
  });
}

export function signalCandidates(today: string): Candidate[] {
  const signals = buildSignals(today);
  const day = dayNumber(today);
  const category = categoryForEvergreen("data_signal");
  return signals.map((s: DataSignal, i) => {
    const facts = buildSignalFacts(s, today);
    const position = (((i - day) % signals.length) + signals.length) % signals.length;
    const rotationMerit = signals.length - position;
    // A signal about what is ahead is worth more the closer the dates are; a
    // signal that summarises the last 30 days is worth more on a busy month.
    const value = evergreenValue(
      65,
      `a ${s.provenance === "reported" ? "reported" : "counted"} figure from ImmigrationClock's own data`,
      [`The figure: ${s.figure} — ${s.figureLabel}`]
    );
    return {
      subjectId: `signal:${s.slug}`,
      pool: "editorial",
      contentType: "data_signal",
      tier: TIER_FOR_TYPE.data_signal,
      structures: STRUCTURES_FOR_TYPE.data_signal,
      label: s.title,
      category,
      score: CATEGORY_TIER[category] + rotationMerit,
      scoreExplain:
        `${CATEGORY_LABEL[category]} (tier ${CATEGORY_TIER[category]}) + ${rotationMerit}: rotation position=${position}; ${value.reason}`,
      readerValue: value,
      treatment: "data_insight",
      supportedAngles: ["data_insight"],
      topicKey: s.topicKey,
      topicFamily: topicFamilyFor({ subjectId: `signal:${s.slug}`, topicKey: s.topicKey, editorialGroup: s.group }),
      hasNewInformation: false,
      deepLink: signalPath(s.slug),
      storyKey: `signal:${s.slug}`,
      sourceUrl: s.sourceUrl,
      event: null,
      facts,
      visual: null,
    } satisfies Candidate;
  });
}

export function discoveryCandidates(today: string): Candidate[] {
  const items = buildDiscoveries();
  const day = dayNumber(today);
  const category = categoryForEvergreen("data_discovery");
  return items.map((d: Discovery, i) => {
    const facts = buildDiscoveryFacts(d, today);
    const position = (((i - day) % items.length) + items.length) % items.length;
    const rotationMerit = items.length - position;
    const value = evergreenValue(50, "a verified tool, offered to a reader with the need it meets", [`The need: ${d.need}`]);
    return {
      subjectId: `discovery:${d.slug}`,
      pool: "editorial",
      contentType: "data_discovery",
      tier: TIER_FOR_TYPE.data_discovery,
      structures: STRUCTURES_FOR_TYPE.data_discovery,
      label: d.title,
      category,
      score: CATEGORY_TIER[category] + rotationMerit,
      scoreExplain:
        `${CATEGORY_LABEL[category]} (tier ${CATEGORY_TIER[category]}) + ${rotationMerit}: rotation position=${position}; ${value.reason}`,
      readerValue: value,
      treatment: "context_explainer",
      supportedAngles: ["data_discovery"],
      topicKey: d.topicKey,
      topicFamily: topicFamilyFor({ subjectId: `discovery:${d.slug}`, topicKey: d.topicKey }),
      hasNewInformation: false,
      deepLink: d.path,
      storyKey: `discovery:${d.slug}`,
      sourceUrl: null,
      event: null,
      facts,
      visual: null,
    } satisfies Candidate;
  });
}

// -----------------------------------------------------------------------------
// ENTRY POINT
// -----------------------------------------------------------------------------

/**
 * Every candidate the account could publish today, highest score first.
 *
 * One record may appear more than once, under different content types; the
 * runner's dedupe layer spends each treatment once. Ties break on the subject
 * id so the order is total and a preview matches a run.
 */
export function candidatesFor(events: IndexedEvent[], today: string): Candidate[] {
  return [
    ...eventCandidates(events, today),
    ...keyDateCandidates(today),
    ...signalCandidates(today),
    ...explainerCandidates(events, today),
    ...discoveryCandidates(today),
  ].sort(
    (a, b) =>
      b.score - a.score ||
      a.subjectId.localeCompare(b.subjectId) ||
      a.contentType.localeCompare(b.contentType)
  );
}
