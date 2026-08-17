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
  obligationLevel,
  isPostableSeverity,
  isSubstantive,
  NEWS_SCORE_FLOOR,
  KNOWLEDGE_SCORE_FLOOR,
} from "./score";
import { buildEventFacts, buildKeyDateFacts, buildAssetFacts } from "./facts";
import { buildAssetVisual, buildEventVisual, buildKeyDateVisual } from "./visuals";
import { keyDateMilestone, topicFamilyFor } from "./rotation";
import { assetInsights } from "./asset-facts";
import {
  CATEGORY_LABEL,
  CATEGORY_TIER,
  categoryForAsset,
  categoryForEvent,
} from "./categories";
import { BREAKING_MAX_AGE_DAYS } from "./validate";
import { SOURCE_BY_KEY } from "@/lib/sources";
import type { Angle, Candidate, PoolId, SlotDef } from "./types";

/**
 * How far back the news pool reaches.
 *
 * WAS 2, AND TWO WAS TOO STRICT. Measured against the real archive — 513
 * events, walking the 120 days to 2026-08-10 — a two-day window left the
 * morning slot, the only slot whose primary job is news, silent on 55% of days:
 *
 *     window   days with a candidate   silent
 *       2d          54 / 120            55%
 *       3d          62 / 120            48%
 *       5d          75 / 120            38%
 *       7d          87 / 120            28%
 *      14d         106 / 120            12%
 *
 * Qualifying news-grade developments arrive about four times a month, and they
 * clear a deliberately high bar (breadth ≥ 2 AND an obligation step). A DHS rule
 * does not stop mattering forty-eight hours after it publishes, and the window
 * was throwing away material that was still the most useful thing this account
 * held.
 *
 * FIVE, NOT SEVEN OR FOURTEEN. Past a week the mean age of the winning
 * candidate passes three days and a single item can hold the top of the pool for
 * over a fortnight, which is where calling it "news" stops being honest. The
 * knowledge pool already owns everything older.
 *
 * Widening the window does NOT widen what may be said about an item — see
 * BREAKING_MAX_AGE_DAYS. An item retained for five days is retained as a
 * development, not as a thing that just happened.
 */
export const NEWS_LOOKBACK_DAYS = 5;

/**
 * Score lost per day of age, inside the news pool only.
 *
 * SIZED SO IT CAN NEVER OUTRANK CONSEQUENCE. The ranking model's dominant
 * factor is breadth, at 1000 per step. Five days is the oldest anything in this
 * pool can be, so the most recency can ever move a candidate is
 *
 *     5 × 150 = 750  <  1000
 *
 * — strictly less than one breadth step. A development that reaches a broader
 * population therefore beats a fresher one every time, at any age difference the
 * pool can produce. What the gradient DOES decide is the case it was asked to:
 * two comparable developments, where the newer one should lead. A one-day
 * difference (150) outweighs one obligation step (100), which is the intended
 * "all else reasonably equal" behaviour.
 *
 * Applied to the news pool alone. The knowledge pool spans 6–180 days, where a
 * per-day decay of this size would cross tier boundaries and turn a category
 * ladder back into an age ladder.
 */
export const RECENCY_DECAY_PER_DAY = 150;

/** The afternoon slot starts where the morning slot stops. */
export const KNOWLEDGE_MIN_AGE_DAYS = NEWS_LOOKBACK_DAYS + 1;

/** How far back the afternoon slot will reach for something still worth explaining. */
export const KNOWLEDGE_LOOKBACK_DAYS = 180;

/** A key date closer than this leads the evening slot ahead of any dataset. */
export const DEADLINE_URGENT_DAYS = 45;

/**
 * The coarse subject a reader would name, used for same-day variety.
 *
 * Deliberately blunt. "H-1B" is one topic whether it arrives as a fee rule, the
 * employer directory, or the registration window — and a day carrying all three
 * reads as a single-issue feed however distinct their subject ids are.
 *
 * Returns "" when nothing better than the subject itself can be derived, and
 * checkSameDayVariety() treats an empty key as "do not enforce" rather than
 * blocking on an unknown.
 */
export function topicKeyFor(input: {
  subjectId: string;
  event?: IndexedEvent | null;
  keyDateCategory?: string;
  assetTags?: string[];
}): string {
  if (input.subjectId.startsWith("keydate:")) {
    return input.keyDateCategory ? `topic:${input.keyDateCategory}` : "";
  }
  if (input.subjectId.startsWith("asset:")) {
    return input.assetTags?.length ? `topic:${input.assetTags[0]}` : "";
  }
  const ids = input.event?.entityIds ?? [];
  // Visa category first: it is the dimension readers actually sort themselves
  // by. Then country, then a non-catch-all topic.
  for (const prefix of ["visa:", "country:"]) {
    const hit = ids.find((id) => id.startsWith(prefix));
    if (hit) return hit;
  }
  const topic = ids.find((id) => id.startsWith("topic:") && id !== "topic:policy-changes");
  if (topic) return topic;
  return input.event ? `source:${input.event.sourceKey}` : "";
}

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
    .map((s) => {
      const ageDays = daysBetweenIso(s.event.publishedAt, today);
      const angles = newsAnglesFor(s.event, ageDays, today, events);

      // A retained item with no honest treatment does not enter the pool.
      //
      // This is the cost of the wider window, taken deliberately. A four-day-old
      // notice that imposes no obligation, names no population, carries no
      // effective date and revises nothing has nothing to say that is not
      // "this happened" — and at four days that framing is exactly what the
      // graduated model exists to refuse. It is not lost: at six days the
      // knowledge pool picks it up under the same earned-angle rules.
      if (angles.length === 0) return null;

      return toEventCandidate(
        s.event,
        s.score,
        s.explain,
        "news",
        angles,
        today,
        true,
        ageDays * RECENCY_DECAY_PER_DAY
      );
    })
    .filter((c): c is Candidate => c !== null);
}

/**
 * Which treatments a news-pool item may receive, given its age.
 *
 * The whole of the graduated framing model, in one function:
 *
 *   0–2 days   it genuinely just happened. `breaking_change` is on the table,
 *              plus `what_it_requires` when the ranking model scores a real
 *              obligation — the same rule as before.
 *
 *   3–5 days   it is a development, not an event. `breaking_change` is
 *              withdrawn entirely and the item must earn a treatment from its
 *              own data, exactly as an archive item does: what it requires, who
 *              it reaches, what it changed, when it starts. If it can earn
 *              none, it does not run.
 *
 * The angles for the older band come from anglesForArchiveEvent(), reused rather
 * than reimplemented, because "what may this document honestly be said to
 * support" is the same question at four days as at forty.
 */
export function newsAnglesFor(
  event: IndexedEvent,
  ageDays: number,
  today: string,
  all: IndexedEvent[]
): Angle[] {
  const obligation = obligationLevel(event);

  if (ageDays <= BREAKING_MAX_AGE_DAYS) {
    // "What it requires" is earned from the ranking model's obligation factor,
    // never from the wording of the title. Level 2 means the document changes an
    // obligation, eligibility test or adjudication standard — enough that there
    // is a concrete requirement to state.
    const angles: Angle[] = ["breaking_change"];
    if (obligation >= 2) angles.push("what_it_requires");
    return angles;
  }

  const earned: Angle[] = [];
  if (obligation >= 2) earned.push("what_it_requires");
  for (const angle of anglesForArchiveEvent(event, today, all)) {
    // historical_context is the afternoon slot's treatment of the archive, not
    // a way to present something published this week.
    if (angle === "historical_context") continue;
    if (!earned.includes(angle)) earned.push(angle);
  }
  return earned;
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
      return toEventCandidate(s.event, s.score, s.explain, "knowledge", angles, today, false);
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

    // AND only at a milestone. A countdown decrements every day, which used to
    // make every day look like new content — the DV window won the evening slot
    // for weeks because 53 days scores the same as 54. Crossing a threshold is
    // news; a decrement is not.
    const milestone = keyDateMilestone(info.days);
    if (!milestone) continue;

    // Nearer deadlines score higher. The urgency figure is now an INTRA-TIER
    // ordering among deadlines rather than a bid against the datasets: a
    // deadline outranks a dataset because of what it is, not because 3000
    // happened to be larger than 1015.
    const urgency = info.days <= DEADLINE_URGENT_DAYS ? 3000 : 1500;
    const merit = urgency + Math.max(0, 120 - info.days);

    // Two different posts, not one post with two intensities. Inside the urgent
    // window the countdown itself is the news; outside it, the honest thing is
    // that a window is coming — which is useful without pretending it is
    // urgent, and is exactly the line "do not manufacture urgency" draws.
    const angle: Angle =
      info.days <= DEADLINE_URGENT_DAYS ? "deadline_approaching" : "preparation_window";

    out.push({
      subjectId: `keydate:${kd.id}`,
      pool: "standing",
      label: `${kd.title} (${milestone})`,
      category: "deadline",
      score: CATEGORY_TIER.deadline + merit,
      scoreExplain: `${CATEGORY_LABEL.deadline} (tier ${CATEGORY_TIER.deadline}) + ${merit}: days=${info.days} urgent=${info.days <= DEADLINE_URGENT_DAYS}`,
      supportedAngles: [angle],
      topicKey: topicKeyFor({ subjectId: `keydate:${kd.id}`, keyDateCategory: kd.category }),
      topicFamily: topicFamilyFor({
        subjectId: `keydate:${kd.id}`,
        topicKey: topicKeyFor({ subjectId: `keydate:${kd.id}`, keyDateCategory: kd.category }),
        keyDateCategory: kd.category,
      }),
      // Reaching selection at all means a milestone was crossed, which IS the
      // new information.
      hasNewInformation: true,
      deepLink: "/key-dates",
      sourceUrl: kd.sourceUrl,
      event: null,
      facts: buildKeyDateFacts(kd, info.days, info.dateLabel, today),
      visual: buildKeyDateVisual(kd, info.days, angle),
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

    // THE LINE THAT PUBLISHED THE METHODOLOGY POST.
    //
    // It read `score: 1000 + (usable.length - normalized)`, which gave fifteen
    // pages fifteen adjacent scores — 1001 to 1015 — with no signal in them
    // except today's rotation offset. The methodology page won its slot on 1015
    // because the calendar dealt it position zero, and the log recorded that as
    // a score, which is why it looked like a decision.
    //
    // The rotation index survives, doing the job it was always fit for: ordering
    // PEERS. What it can no longer do is answer "is this worth publishing at
    // all", because that question is now settled one tier up, where a page about
    // our own methodology sits six bands below a rule that changed something.
    const category = categoryForAsset(asset);
    const rotationMerit = usable.length - normalized;
    out.push({
      subjectId: `asset:${asset.id}`,
      pool: "standing",
      label: asset.label,
      category,
      score: CATEGORY_TIER[category] + rotationMerit,
      scoreExplain: `${CATEGORY_LABEL[category]} (tier ${CATEGORY_TIER[category]}) + ${rotationMerit}: rotation position=${normalized}`,
      supportedAngles: ["data_insight"],
      topicKey: topicKeyFor({ subjectId: `asset:${asset.id}`, assetTags: asset.tags }),
      topicFamily: topicFamilyFor({
        subjectId: `asset:${asset.id}`,
        topicKey: topicKeyFor({ subjectId: `asset:${asset.id}`, assetTags: asset.tags }),
        assetTags: asset.tags,
      }),
      // A standing page has nothing new by definition. It comes back on the
      // far side of the subject window, not because anything changed.
      hasNewInformation: false,
      deepLink: asset.path,
      sourceUrl: null,
      event: null,
      facts,
      // A card only when the asset carries a reported figure AND that figure is
      // the point. `heroFigure` returns null for the eight assets that qualify
      // on a non-numeric insight, so those post as text.
      visual: buildAssetVisual(asset, "data_insight", facts, heroFigure(asset.id, today)),
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

/**
 * The ordered candidate list for one slot on one day.
 *
 * Draws the slot's own pool first, then any fallback pool it declares. The
 * fallback is what stops the shape of failure this file shipped with: the
 * evening slot could only ever see fifteen standing pages, so "which of these
 * pages" was the only question it could ask, and the answer was decided by a
 * rotation offset. A slot that can see a real development can decline to post a
 * page about our methodology.
 *
 * Deduplicated by subject, keeping the higher-scoring entry, because the news
 * and knowledge pools can legitimately surface the same event on the boundary
 * day between them.
 */
export function candidatesFor(
  slot: SlotDef,
  events: IndexedEvent[],
  today: string
): Candidate[] {
  const seen = new Map<string, Candidate>();

  const primary = withSlotAngles(poolCandidates(slot.pool, events, today, slot), slot);

  // THE CADENCE IS NOT ALLOWED TO MOVE.
  //
  // A fallback pool may change WHAT a slot posts and must never change WHETHER
  // it posts. If this slot's own pool is empty it stays silent, exactly as it
  // did before fallbacks existed — a newsless morning is still silent, and an
  // afternoon with nothing in the archive worth explaining is still silent.
  // Fallbacks join a competition that was already going to happen; they never
  // start one.
  if (primary.length === 0) return [];

  for (const candidate of primary) seen.set(candidate.subjectId, candidate);

  for (const pool of slot.fallbackPools) {
    for (const candidate of poolCandidates(pool, events, today, slot)) {
      // Angles are still the slot's decision. A candidate whose treatments are
      // all outside this slot's remit does not enter it, however it scores.
      const angles = candidate.supportedAngles.filter((a) => slot.angles.includes(a));
      if (angles.length === 0) continue;

      const existing = seen.get(candidate.subjectId);
      if (existing && existing.score >= candidate.score) continue;
      seen.set(candidate.subjectId, { ...candidate, supportedAngles: angles });
    }
  }

  return [...seen.values()].sort(
    (a, b) => b.score - a.score || a.subjectId.localeCompare(b.subjectId)
  );
}

/** Keep only the treatments this slot is allowed to use, dropping what is left bare. */
function withSlotAngles(candidates: Candidate[], slot: SlotDef): Candidate[] {
  const out: Candidate[] = [];
  for (const candidate of candidates) {
    const angles = candidate.supportedAngles.filter((a) => slot.angles.includes(a));
    if (angles.length === 0) continue;
    out.push({ ...candidate, supportedAngles: angles });
  }
  return out;
}

function poolCandidates(
  pool: PoolId,
  events: IndexedEvent[],
  today: string,
  slot: SlotDef
): Candidate[] {
  switch (pool) {
    case "news":
      return newsPool(events, today);
    case "knowledge":
      return knowledgePool(events, today, slot);
    case "standing":
      return standingPool(today);
  }
}

function toEventCandidate(
  event: IndexedEvent,
  score: number,
  explain: string,
  pool: "news" | "knowledge",
  angles: Angle[],
  today: string,
  fresh: boolean,
  /** Recency decay, already computed. News pool only; 0 everywhere else. */
  recencyPenalty = 0
): Candidate | null {
  const deepLink = resolveDeepLink(event);
  // No destination, no post. Falling back to the homepage would waste the click
  // and is forbidden by links.ts.
  if (!deepLink) return null;

  const hasUpcomingEffectiveDate = Boolean(
    event.effectiveAt &&
      event.effectiveAt > today &&
      daysBetweenIso(today, event.effectiveAt) <= 90
  );

  const category = categoryForEvent({
    classification: event.classification,
    fresh,
    obligationLevel: obligationLevel(event),
    hasUpcomingEffectiveDate,
  });

  return {
    subjectId: `event:${event.id}`,
    pool,
    label: event.title,
    category,
    // Tier first, merits second, recency third. The ranking model's output is
    // preserved intact as the within-tier ordering, so an improvement to it
    // still improves social selection — it simply can no longer decide a
    // question of kind. The recency term is bounded well below one breadth step
    // (see RECENCY_DECAY_PER_DAY), so it orders comparable items and never
    // overturns a more consequential one.
    score: CATEGORY_TIER[category] + score - recencyPenalty,
    scoreExplain:
      `${CATEGORY_LABEL[category]} (tier ${CATEGORY_TIER[category]}) + ${score}` +
      `${recencyPenalty ? ` − ${recencyPenalty} recency` : ""}: ${explain}`,
    supportedAngles: angles,
    topicKey: topicKeyFor({ subjectId: `event:${event.id}`, event }),
    topicFamily: topicFamilyFor({
      subjectId: `event:${event.id}`,
      topicKey: topicKeyFor({ subjectId: `event:${event.id}`, event }),
      event,
    }),
    // News is new by definition. An archive item counts as new only when its
    // timing has moved into view — an effective date now inside 90 days is a
    // genuine reason to say it again.
    hasNewInformation: pool === "news" || hasUpcomingEffectiveDate,
    deepLink,
    sourceUrl: event.sourceUrl,
    event,
    facts: buildEventFacts(event, deepLink, today),
    // The strongest angle the candidate supports decides the card, because that
    // is the angle chooseCandidate() prefers.
    visual: buildEventVisual(event, angles[0], SOURCE_BY_KEY[event.sourceKey]?.name ?? event.sourceKey),
  };
}

/**
 * The one figure a data card would lead with, or null.
 *
 * Deliberately conservative: the FIRST computed point of a numeric asset, whose
 * leading figure is the one the sentence itself leads with. Picking "the most
 * impressive number" would be an editorial judgement made by a heuristic, which
 * is how a card ends up overstating a dataset.
 */
function heroFigure(assetId: string, today: string): { value: string; label: string } | null {
  const insight = assetInsights(assetId, today);
  if (!insight?.numeric) return null;
  const first = insight.points[0];
  const match = /([0-9][0-9,]*)/.exec(first);
  if (!match) return null;
  return { value: match[1], label: first.slice(0, 96) };
}
