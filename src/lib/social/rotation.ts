// =============================================================================
// ROTATION — why "pick the highest score" was the wrong rule
//
// Scoring answers "how consequential is this?" and it answers it well. It is
// also, on its own, a machine for repetition: the Diversity Visa window scores
// the same today as yesterday, so it wins today and yesterday and tomorrow. The
// dedupe layer stopped the same SUBJECT×ANGLE going out twice, which is a
// different question and let the feed circle a handful of subjects for weeks.
//
// So the rule becomes:
//
//     pick the highest score among candidates that preserve feed diversity
//
// implemented as penalties subtracted from the base score, not as extra filters.
// A penalty lets a genuinely major development outrank freshness — which is
// correct, because a fee rule that lands today should not be deferred because
// fees were the topic on Tuesday — while making a merely-high-scoring evergreen
// lose to something the feed has not touched.
//
// FOUR MEMORIES, ONE WINDOW
// -------------------------
// Seven days of subjects, topic families, destinations and angles, all read from
// the ledger's POSTED rows. Nothing here consults a clock the caller did not
// pass, so a simulation and a production run of the same day agree exactly.
//
// THE ORDER OF SEVERITY IS THE EDITORIAL JUDGEMENT
// -----------------------------------------------
// Subject repetition is worst — it is literally the same post. Then topic, which
// is what makes a feed feel single-issue. Then destination, which is what makes
// it feel like an ad for one page. Angle last, because two different subjects
// treated the same way is a mild sameness a reader barely registers.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import type { Angle, Platform } from "./types";
import {
  MIX_PENALTY,
  MIX_WINDOW_DAYS,
  isOverTarget,
  mixBucketFor,
  type ContentCategory,
  type MixBucket,
} from "./categories";
import { publishedPosts, type PostLedger, type PostRecord } from "./ledger";

// -----------------------------------------------------------------------------
// TOPIC FAMILIES
// -----------------------------------------------------------------------------

/**
 * The coarsest useful grouping: what section of immigration this belongs to.
 *
 * One level above `topicKey`. "H-1B registration", "H-1B employer data" and an
 * H-1B fee rule are three topics and one family, and a week that never leaves
 * this family reads as an H-1B account whatever the subject ids say.
 */
export type TopicFamily =
  | "green-card"
  | "h1b"
  | "employment"
  | "family"
  | "enforcement"
  | "fees"
  | "filing-process"
  | "uscis-policy"
  | "state-dept"
  | "deadlines"
  | "data-trends"
  | "other";

export const TOPIC_FAMILIES: TopicFamily[] = [
  "green-card",
  "h1b",
  "employment",
  "family",
  "enforcement",
  "fees",
  "filing-process",
  "uscis-policy",
  "state-dept",
  "deadlines",
  "data-trends",
  "other",
];

/**
 * Which family a candidate belongs to.
 *
 * Ordered most-specific-first, and deliberately readable rather than clever: a
 * misfiled candidate produces a subtly repetitive feed, which is exactly the
 * failure that is hard to notice, so the rules are ones a human can check.
 */
export function topicFamilyFor(input: {
  subjectId: string;
  topicKey: string;
  event?: IndexedEvent | null;
  assetTags?: string[];
  keyDateCategory?: string;
}): TopicFamily {
  const { subjectId, topicKey, event } = input;

  // --- key dates: their own category is already the right answer -------------
  if (subjectId.startsWith("keydate:")) {
    switch (input.keyDateCategory) {
      case "h1b":
        return "h1b";
      case "green-card":
        return "green-card";
      case "students":
        return "employment";
      case "tax":
        return "deadlines";
      default:
        return "deadlines";
    }
  }

  // --- standing assets: their tags -------------------------------------------
  if (subjectId.startsWith("asset:")) {
    const tags = input.assetTags ?? [];
    // Pages about ImmigrationClock itself are not a data topic. Filing them under
    // "data-trends" made them compete for — and consume — the diversity slot that
    // belongs to actual datasets, so a methodology post could suppress an
    // enforcement figure the next day for looking like the same kind of thing.
    if (tags.includes("methodology") || tags.includes("product") || tags.includes("privacy")) {
      return "other";
    }
    if (tags.includes("h1b")) return "h1b";
    if (tags.includes("layoffs")) return "employment";
    if (tags.includes("enforcement") || tags.includes("border")) return "enforcement";
    if (tags.includes("deadlines")) return "deadlines";
    if (tags.includes("students") || tags.includes("visas")) return "employment";
    if (tags.includes("data") || tags.includes("map")) return "data-trends";
    return "data-trends";
  }

  // --- events: entity first, then what kind of document it is ----------------
  const title = `${event?.title ?? ""} ${event?.summary ?? ""}`.toLowerCase();

  if (topicKey.startsWith("visa:h-1b") || topicKey === "visa:h1b") return "h1b";
  if (topicKey.startsWith("country:")) return "family";

  // Fees are a family of their own because they are the change readers ask
  // about most and they cut across every visa category.
  if (/\bfee(s)?\b|\bfee schedule\b/.test(title)) return "fees";

  if (topicKey === "topic:enforcement" || /\b(removal|deportation|detention|enforcement)\b/.test(title)) {
    return "enforcement";
  }
  if (topicKey === "topic:green-card" || /\b(green card|adjustment of status|diversity visa)\b/.test(title)) {
    return "green-card";
  }
  if (topicKey === "topic:students") return "employment";
  if (topicKey.startsWith("visa:")) return "employment";

  switch (event?.sourceKey) {
    case "uscis_policy_manual":
      return "uscis-policy";
    case "dol_oflc":
      return "employment";
    case "cbp_encounters":
      return "enforcement";
    case "federal_register":
      // A Federal Register document with no clearer signal is a process change:
      // forms, filing requirements, procedural amendments.
      return "filing-process";
    case "uscis_newsroom":
      return "uscis-policy";
    default:
      return "other";
  }
}

// -----------------------------------------------------------------------------
// THE WINDOW AND THE WEIGHTS
// -----------------------------------------------------------------------------

/** Inside this many days, a subject is simply not available again. */
export const SUBJECT_BLOCK_DAYS = 7;

/** Between BLOCK and this, a subject is available but heavily penalised. */
export const SUBJECT_HEAVY_DAYS = 14;

/** How far back the topic, destination and angle memories reach. */
export const MEMORY_DAYS = 7;

/**
 * How far back the SUBJECT memory reaches — longer than the other three.
 *
 * The bands are 0-7 blocked, 8-14 heavily penalised, 15-30 allowed only with
 * something new to say, and free after that. The memory has to see the whole
 * range or the last band is dead code, and a standing page has to be able to
 * come back eventually — a month later, with the feed having moved on, is not
 * repetition.
 */
export const SUBJECT_MEMORY_DAYS = 30;

/**
 * Penalty weights, in the same units as the ranking model's score.
 *
 * Calibrated against that model's own steps — breadth is 1000, one obligation
 * step is 100 — so these are readable as editorial statements:
 *
 *   SUBJECT_HEAVY (2000) is two breadth steps. A subject seen last week has to
 *   be dramatically more consequential than a fresh one to come back.
 *
 *   TOPIC_RECENT (900) is just under one breadth step. A same-family item can
 *   still win if it is a genuinely bigger story, which is the escape hatch
 *   requirement 3 asks for ("unless there is genuinely important new
 *   information") expressed as arithmetic rather than a special case.
 *
 *   SAME_DAY_FAMILY (1200) is stronger than TOPIC_RECENT because three slots in
 *   one day is where sameness is most visible to a reader.
 */
export const PENALTY = {
  subjectHeavy: 2000,
  topicRecent: 900,
  topicOlder: 450,
  sameDayFamily: 1200,
  destination: 400,
  angle: 200,
} as const;

/**
 * Milestones at which a recurring date is worth resurfacing.
 *
 * The problem this solves: a countdown decrements every day, so "the number
 * changed" made every day look like new content and the DV window posted
 * forever. A day count is not news; crossing a threshold is.
 *
 * These are the points where the preparation value materially changes — two
 * months out, six weeks, a month, a fortnight, a week, and the last few days.
 */
export const KEY_DATE_MILESTONES = [60, 45, 30, 14, 7, 3, 1] as const;

/** The milestone this day count is, or null if the date is not worth a post. */
export function keyDateMilestone(days: number): string | null {
  if (!KEY_DATE_MILESTONES.includes(days as (typeof KEY_DATE_MILESTONES)[number])) return null;
  if (days === 1) return "1 day away";
  return `${days} days away`;
}

// -----------------------------------------------------------------------------
// THE MEMORY
// -----------------------------------------------------------------------------

export interface RecentMemory {
  /** subjectId -> whole days since it last published. */
  subjects: Map<string, number>;
  families: Map<string, number>;
  destinations: Map<string, number>;
  angles: Map<string, number>;
  /** Families already used TODAY, which the daily diversity target reads. */
  familiesToday: Set<string>;
  /** Mix buckets already used TODAY. Drives the daily shape of the feed. */
  bucketsToday: Set<MixBucket>;
  /** Posts per bucket over MIX_WINDOW_DAYS, for the weekly share check. */
  bucketCounts: Record<MixBucket, number>;
}

const EMPTY_BUCKET_COUNTS = (): Record<MixBucket, number> => ({
  news: 0,
  alerts: 0,
  data: 0,
  evergreen: 0,
  product: 0,
});

function daysAgo(row: PostRecord, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(row.runAtUtc)) / 86_400_000);
}

/** Keep the SMALLEST day-distance per key: the most recent use is what bites. */
function remember(map: Map<string, number>, key: string | null, days: number) {
  if (!key) return;
  const seen = map.get(key);
  if (seen === undefined || days < seen) map.set(key, days);
}

export function buildMemory(
  ledger: PostLedger,
  platform: Platform,
  now: Date,
  localDate: string
): RecentMemory {
  const memory: RecentMemory = {
    subjects: new Map(),
    families: new Map(),
    destinations: new Map(),
    angles: new Map(),
    familiesToday: new Set(),
    bucketsToday: new Set(),
    bucketCounts: EMPTY_BUCKET_COUNTS(),
  };

  // The mix window is longer than the diversity window and is counted first, so
  // a share means something over a fortnight rather than over three posts. Rows
  // written before categories existed carry no category and are skipped rather
  // than guessed at — an unknown bucket must not be able to suppress a real one.
  for (const row of publishedPosts(ledger)) {
    if (row.platform !== platform) continue;
    if (!row.category) continue;
    const age = daysAgo(row, now);
    if (age > MIX_WINDOW_DAYS) continue;
    const bucket = mixBucketFor(row.category as ContentCategory);
    memory.bucketCounts[bucket] += 1;
    if (row.localDate === localDate) memory.bucketsToday.add(bucket);
  }

  for (const row of publishedPosts(ledger)) {
    if (row.platform !== platform) continue;
    const age = daysAgo(row, now);
    if (age > MEMORY_DAYS) continue;

    remember(memory.subjects, row.subjectId, age);
    remember(memory.families, row.topicFamily, age);
    remember(memory.destinations, row.deepLink, age);
    remember(memory.angles, row.angle, age);

    if (row.localDate === localDate && row.topicFamily) {
      memory.familiesToday.add(row.topicFamily);
    }
  }

  // Subjects need a longer reach than the other three — see SUBJECT_MEMORY_DAYS.
  for (const row of publishedPosts(ledger)) {
    if (row.platform !== platform) continue;
    const age = daysAgo(row, now);
    if (age > SUBJECT_MEMORY_DAYS) continue;
    remember(memory.subjects, row.subjectId, age);
  }

  return memory;
}

// -----------------------------------------------------------------------------
// THE ADJUSTMENT
// -----------------------------------------------------------------------------

export interface RotationResult {
  /** False means not publishable today at all, whatever it scores. */
  eligible: boolean;
  adjustedScore: number;
  penalty: number;
  /** Human-readable, recorded in the ledger and printed by the simulator. */
  explain: string;
  /** Set when `eligible` is false. */
  blockedBy: string | null;
}

export interface RotationInput {
  subjectId: string;
  topicFamily: TopicFamily;
  /** What kind of content this is. Drives the mix penalties. */
  category: ContentCategory;
  deepLink: string;
  angle: Angle;
  baseScore: number;
  /**
   * True when the candidate carries something genuinely new — a milestone, a
   * timing change, a fresh publication. After the 14-day subject window this is
   * what distinguishes "worth saying again" from "still in the index".
   */
  hasNewInformation: boolean;
}

export function applyRotation(input: RotationInput, memory: RecentMemory): RotationResult {
  const parts: string[] = [];
  let penalty = 0;

  // --- subject: the largest weight, and the only hard block ------------------
  const subjectAge = memory.subjects.get(input.subjectId);
  if (subjectAge !== undefined) {
    if (subjectAge < SUBJECT_BLOCK_DAYS) {
      return {
        eligible: false,
        adjustedScore: -Infinity,
        penalty: Infinity,
        explain: `subject posted ${subjectAge}d ago (<${SUBJECT_BLOCK_DAYS}d)`,
        blockedBy: `subject-recency: last posted ${subjectAge} day(s) ago, inside the ${SUBJECT_BLOCK_DAYS}-day block`,
      };
    }
    if (subjectAge <= SUBJECT_HEAVY_DAYS) {
      penalty += PENALTY.subjectHeavy;
      parts.push(`subject ${subjectAge}d ago −${PENALTY.subjectHeavy}`);
    } else if (!input.hasNewInformation) {
      // Past 14 days the subject is allowed back, but only on its merits: a
      // recurring item with nothing new to say is still the same post.
      return {
        eligible: false,
        adjustedScore: -Infinity,
        penalty: Infinity,
        explain: `subject seen ${subjectAge}d ago and nothing new`,
        blockedBy: `subject-staleness: seen ${subjectAge} day(s) ago with no new information, timing change or approaching milestone`,
      };
    }
  }

  // --- topic family ----------------------------------------------------------
  const familyAge = memory.families.get(input.topicFamily);
  if (familyAge !== undefined) {
    const weight = familyAge <= 3 ? PENALTY.topicRecent : PENALTY.topicOlder;
    penalty += weight;
    parts.push(`family "${input.topicFamily}" ${familyAge}d ago −${weight}`);
  }

  // --- the daily diversity target -------------------------------------------
  if (memory.familiesToday.has(input.topicFamily)) {
    penalty += PENALTY.sameDayFamily;
    parts.push(`family already used today −${PENALTY.sameDayFamily}`);
  }

  // --- the content mix -------------------------------------------------------
  //
  // The only instrument the mix targets get, and it is a penalty on something
  // that has ALREADY had its turn — never a promotion, never a filter, and never
  // anything that could put a candidate in the running that did not earn its
  // way there. A bucket with nothing to offer simply yields its share to
  // whatever else qualifies, which is why these are targets and not quotas.
  //
  // sameDayBucket is exactly one tier step: it does not exclude a second
  // development, it makes that development compete one band down, on its own
  // merits, against the deadline or the dataset it would otherwise have
  // displaced. A big second story still wins. A routine one gives way.
  const bucket = mixBucketFor(input.category);
  if (memory.bucketsToday.has(bucket)) {
    penalty += MIX_PENALTY.sameDayBucket;
    parts.push(`"${bucket}" already posted today −${MIX_PENALTY.sameDayBucket}`);
  }
  if (isOverTarget(bucket, memory.bucketCounts)) {
    penalty += MIX_PENALTY.weekOvershoot;
    parts.push(`"${bucket}" over its ${MIX_WINDOW_DAYS}d share −${MIX_PENALTY.weekOvershoot}`);
  }

  // --- destination and angle -------------------------------------------------
  if (memory.destinations.get(input.deepLink) !== undefined) {
    penalty += PENALTY.destination;
    parts.push(`destination reused −${PENALTY.destination}`);
  }
  if (memory.angles.get(input.angle) !== undefined) {
    penalty += PENALTY.angle;
    parts.push(`angle reused −${PENALTY.angle}`);
  }

  return {
    eligible: true,
    adjustedScore: input.baseScore - penalty,
    penalty,
    explain: parts.length ? parts.join("; ") : "no repetition penalty",
    blockedBy: null,
  };
}
