// =============================================================================
// DEDUPE — repetition is a wording problem AND a treatment problem
//
// The first design of this module banned a subject forever once it had been
// posted, keyed on subject and platform. That is wrong, and wrong in a way that
// actively degrades the feed: the H-1B and L-1 biometric fee rule is worth a
// post when it lands, a second when its effective date approaches, and a third
// explaining who actually pays it. Those are three different things to say, not
// one thing said three times. A permanent ban throws away two of them.
//
// So uniqueness is modelled as:
//
//     subject  ×  editorial angle  ×  platform  ×  cooldown
//
// and the thing the naive rule was really trying to prevent — the feed sounding
// like it is repeating itself — is caught directly, by comparing the actual
// wording, in checkWording() below.
//
// TWO GATES, DELIBERATELY SPLIT
// -----------------------------
// checkSubject() runs BEFORE the copy engine and is pure bookkeeping: it costs
// nothing and rejects most repetition without an API call. checkWording() runs
// AFTER generation, because you cannot compare wording that does not exist yet.
// Keeping them separate is what makes the expensive gate the rare one.
//
// COOLDOWNS DIFFER BY WHAT KIND OF THING THE SUBJECT IS
// ----------------------------------------------------
// An event is a moment: its news value expires, so a given treatment of it is
// spent once used. A standing asset is a permanent resource and a key date
// recurs every year — pointing at either again months later is normal
// behaviour, not repetition. Treating all three the same would either burn
// through the standing pool in three weeks or let a breaking story recycle
// forever.
// =============================================================================

import type { Angle, Platform, PoolId } from "./types";
import type { DedupeResult } from "./types";
import {
  hasTreatment,
  lastPostForSubject,
  lastPostForUrl,
  postsOnLocalDate,
  publishedPosts,
  recentStructures,
  recentTexts,
  recentValidationFailure,
  treatmentCount,
  type PostLedger,
} from "./ledger";

/** Subject kinds, derived from the id prefix. */
export type SubjectKind = "event" | "keydate" | "asset" | "explainer" | "signal" | "discovery";

export function subjectKind(subjectId: string): SubjectKind {
  if (subjectId.startsWith("keydate:")) return "keydate";
  if (subjectId.startsWith("asset:")) return "asset";
  if (subjectId.startsWith("explainer:")) return "explainer";
  if (subjectId.startsWith("signal:")) return "signal";
  if (subjectId.startsWith("discovery:")) return "discovery";
  return "event";
}

interface CooldownPolicy {
  /**
   * Days before the SAME angle on the same subject may run again.
   * `Infinity` means never — correct for events, whose moment does not return.
   */
  treatmentCooldownDays: number;
  /** Days before the subject may appear again under ANY angle. */
  subjectCooldownDays: number;
  /** Distinct angles a subject may ever receive. `Infinity` for durable subjects. */
  maxTreatments: number;
}

export const COOLDOWNS: Record<SubjectKind, CooldownPolicy> = {
  // A news event: each treatment is spent once, treatments are spaced a week
  // apart so a story cannot be milked, and four treatments is the ceiling.
  //
  // Seven, not fourteen. A breaking post, then a why-it-matters a week later,
  // then an effective-date reminder as the date approaches is the life of a
  // consequential rule, and each of those is a different thing to say. At
  // fourteen days the second and third could never happen for a rule that
  // starts within a month of publishing — which most do.
  event: { treatmentCooldownDays: Infinity, subjectCooldownDays: 7, maxTreatments: 4 },
  // An annual deadline. It genuinely comes round again.
  keydate: { treatmentCooldownDays: 300, subjectCooldownDays: 21, maxTreatments: Infinity },
  // A permanent page. Re-surfacing it a few months later is useful, not lazy.
  asset: { treatmentCooldownDays: 120, subjectCooldownDays: 21, maxTreatments: Infinity },
  // THE EVERGREEN TIER. An explainer is as true in four months as today and no
  // sooner; a data signal is recomputed from a refreshed snapshot, so it can
  // come round faster; a tool changes least of all. Each of these has exactly
  // one treatment, so the treatment and subject cooldowns are the same number.
  explainer: { treatmentCooldownDays: 120, subjectCooldownDays: 120, maxTreatments: Infinity },
  signal: { treatmentCooldownDays: 45, subjectCooldownDays: 45, maxTreatments: Infinity },
  discovery: { treatmentCooldownDays: 90, subjectCooldownDays: 90, maxTreatments: Infinity },
};

/** Days before the same destination URL may be linked again on a platform. */
export const URL_COOLDOWN_DAYS = 7;

/**
 * Days a treatment stands down after the validator rejected it twice.
 *
 * Short on purpose. The usual cause is transient — a generation that ran long,
 * or a figure the model reached for that was not in the fact set — and the next
 * attempt would probably succeed. What this prevents is the pathological case
 * where the failure is structural and the slot retries it daily forever.
 */
export const VALIDATION_COOLDOWN_DAYS = 5;

/** How many recent posts the wording check compares against. */
export const WORDING_HISTORY = 60;

/**
 * Jaccard similarity above which two posts are "the same post".
 *
 * 0.55 was chosen against the real archive: genuinely different treatments of
 * one rule land around 0.25–0.40 because they share the subject's proper nouns
 * but little else, while a regeneration of the same angle lands above 0.7. The
 * gap is wide enough that the threshold is not delicate.
 */
export const SIMILARITY_LIMIT = 0.55;

function daysBetween(aIso: string, bIso: string): number {
  return Math.abs(Date.parse(bIso) - Date.parse(aIso)) / 86_400_000;
}

// -----------------------------------------------------------------------------
// GATE 1 — bookkeeping, before any generation
// -----------------------------------------------------------------------------

export interface SubjectCheck {
  ok: boolean;
  reason: string;
  /** Angles still available for this subject on this platform. */
  availableAngles: Angle[];
}

/**
 * May we post about this subject, on this platform, today — and if so, under
 * which angles?
 *
 * Returns the surviving angles rather than a bare yes/no so the caller can pick
 * the best remaining treatment instead of giving up because its first choice
 * was taken.
 */
export function checkSubject(
  ledger: PostLedger,
  subjectId: string,
  candidateAngles: Angle[],
  platform: Platform,
  deepLink: string,
  now: Date,
  /** The pool this candidate came from. Governs how the URL cooldown applies. */
  pool: PoolId = "knowledge"
): SubjectCheck {
  const kind = subjectKind(subjectId);
  const policy = COOLDOWNS[kind];
  const nowIso = now.toISOString();

  // The destination is shared across subjects — two different events can both
  // resolve to /h1b/top-sponsors — so this check is about the reader's
  // experience of the feed, not about the subject.
  //
  // NEWS IS EXEMPT FROM COOLDOWNS CAUSED BY OTHER POOLS.
  //
  // Found in the seven-day simulation: a genuinely new final rule on H-1B and
  // L-1 fees was suppressed because the evening slot had linked
  // /h1b/top-sponsors five days earlier as a standing data post. That is exactly
  // backwards — new official developments are the rarest and most valuable thing
  // this account publishes, and deferring one because a reference page was
  // surfaced last week is a priority inversion, not a repetition guard.
  //
  // News still cools down against OTHER NEWS, so two consecutive breaking posts
  // cannot both land on the same page.
  const urlLedger =
    pool === "news"
      ? { ...ledger, posts: ledger.posts.filter((p) => p.pool === "news") }
      : ledger;

  const urlPost = lastPostForUrl(urlLedger, deepLink, platform);
  if (urlPost && daysBetween(urlPost.runAtUtc, nowIso) < URL_COOLDOWN_DAYS) {
    return {
      ok: false,
      reason: `URL cooldown: ${deepLink} was linked ${Math.round(
        daysBetween(urlPost.runAtUtc, nowIso)
      )} days ago (limit ${URL_COOLDOWN_DAYS})`,
      availableAngles: [],
    };
  }

  const last = lastPostForSubject(ledger, subjectId, platform);
  if (last && daysBetween(last.runAtUtc, nowIso) < policy.subjectCooldownDays) {
    return {
      ok: false,
      reason: `Subject cooldown: last posted ${Math.round(
        daysBetween(last.runAtUtc, nowIso)
      )} days ago (limit ${policy.subjectCooldownDays} for ${kind})`,
      availableAngles: [],
    };
  }

  if (treatmentCount(ledger, subjectId, platform) >= policy.maxTreatments) {
    return {
      ok: false,
      reason: `Treatment cap: ${policy.maxTreatments} angles already used for this ${kind}`,
      availableAngles: [],
    };
  }

  const available = candidateAngles.filter((angle) => {
    // A treatment the validator recently rejected stands down, so one
    // unpublishable candidate cannot occupy a slot every day forever.
    if (
      recentValidationFailure(ledger, subjectId, angle, platform, nowIso, VALIDATION_COOLDOWN_DAYS)
    ) {
      return false;
    }
    const prior = hasTreatment(ledger, subjectId, angle, platform);
    if (!prior) return true;
    if (policy.treatmentCooldownDays === Infinity) return false;
    return daysBetween(prior.runAtUtc, nowIso) >= policy.treatmentCooldownDays;
  });

  if (available.length === 0) {
    return {
      ok: false,
      reason: "Every supported angle for this subject has already been used",
      availableAngles: [],
    };
  }

  return { ok: true, reason: "eligible", availableAngles: available };
}

// -----------------------------------------------------------------------------
// GATE 1b — SAME-DAY VARIETY
//
// The cooldowns above are about a subject over WEEKS. This is about a reader
// opening the feed once and seeing three posts that are, to them, the same post.
//
// Subject ids do not catch it. An H-1B fee rule (event:), the H-1B employer
// directory (asset:), and the H-1B registration window (keydate:) are three
// distinct subjects with three distinct destinations and three distinct angles
// — every existing gate passes them — and together they are a day of nothing but
// H-1B. The destination cooldown does not catch it either, because news is
// deliberately exempt from cooldowns other pools caused.
//
// So variety is enforced on a coarser key: the topic. One topic per day, per
// platform. The morning slot runs first and therefore wins ties, which is the
// right priority — genuinely new official developments are the rarest thing this
// account publishes and must never be deferred to a standing asset.
// -----------------------------------------------------------------------------

/**
 * Has this topic already been covered today?
 *
 * Only POSTED rows count, so a dry run does not consume the day's variety
 * budget and a validator failure does not burn a topic.
 *
 * An empty or unknown topic never blocks. Rows written before this gate existed
 * carry no topic, and a candidate whose topic could not be derived is not
 * evidence of repetition — failing open here costs a little sameness, while
 * failing closed on missing data would silence slots for no reason.
 */
export function checkSameDayVariety(
  ledger: PostLedger,
  topicKey: string,
  localDate: string,
  platform: Platform
): { ok: boolean; reason: string } {
  if (!topicKey) return { ok: true, reason: "no topic key — variety not enforced" };

  const clash = postsOnLocalDate(ledger, localDate, platform).find(
    (p) => p.topicKey === topicKey
  );

  if (clash) {
    return {
      ok: false,
      reason: `Same-day variety: "${topicKey}" was already covered today by the ${clash.slot} slot ("${clash.subjectLabel}")`,
    };
  }
  return { ok: true, reason: "distinct topic for today" };
}

// -----------------------------------------------------------------------------
// GATE 2 — wording, after generation
// -----------------------------------------------------------------------------

/**
 * Normalize before comparing.
 *
 * URLs and digits are stripped: every post about the same subject links to the
 * same page and quotes the same dates, and leaving those in would make two
 * genuinely different treatments look similar for reasons that have nothing to
 * do with how they read.
 */
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#\w+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word trigrams. Word-level, not character-level: it is phrasing we care about. */
export function trigrams(text: string): Set<string> {
  const words = normalizeForComparison(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length < 3) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

export function similarity(a: string, b: string): number {
  const A = trigrams(a);
  const B = trigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return shared / (A.size + B.size - shared);
}

/** Does this wording read like something we have already published? */
export function checkWording(
  ledger: PostLedger,
  text: string,
  platform: Platform
): DedupeResult {
  const history = recentTexts(ledger, platform, WORDING_HISTORY);
  let max = 0;
  let nearest: string | null = null;

  for (const prior of history) {
    const s = similarity(text, prior);
    if (s > max) {
      max = s;
      nearest = prior;
    }
  }

  if (max >= SIMILARITY_LIMIT) {
    return {
      ok: false,
      reason: `Too similar to a recent post (${max.toFixed(2)} ≥ ${SIMILARITY_LIMIT})`,
      maxSimilarity: max,
      nearest,
    };
  }
  return { ok: true, reason: "distinct", maxSimilarity: max, nearest };
}

// -----------------------------------------------------------------------------
// GATE 2b — OPENING CONSTRUCTIONS
//
// checkWording() compares whole posts and catches a post that IS another post.
// It does not catch the subtler thing a feed does when it is written to a
// template: forty distinct posts, every one of them opening "USCIS has updated
// its guidance on…". Trigram similarity across those two sentences is low —
// they share three words out of thirty — so the similarity gate passes each of
// them individually while the feed reads as one voice with a stuck needle.
//
// What repeats in that failure is the SHAPE of the opening, not its content. So
// the shape is what is measured: the first few words, normalised down to the
// construction and away from the subject.
//
// A NUDGE IN THE PROMPT WAS NOT ENOUGH, WHICH IS WHY THIS IS A GATE. The prompt
// has always shown recent openings and asked the model not to echo them; a model
// obliges by changing the nouns and keeping the frame, because the frame is not
// what it was shown. Naming the frame — and refusing it — is the difference.
// -----------------------------------------------------------------------------

/**
 * How many words of an opening make up its "construction".
 *
 * Three. Two is too coarse ("USCIS has" would collide across genuinely different
 * sentences) and four is too fine — "USCIS has updated its" and "USCIS has
 * updated the" are the same opening to a reader and would slip past a
 * four-word key.
 */
export const OPENING_WORDS = 3;

/** How many recent published posts the construction check looks back over. */
export const OPENING_HISTORY = 12;

/**
 * How many times a construction may appear in that window before it is refused.
 *
 * Two, not one. One reuse across a fortnight is a coincidence and a feed that
 * banned it would start writing around its own rule, which produces worse
 * sentences than the repetition did. The third use is a pattern.
 */
export const OPENING_REPEAT_LIMIT = 2;

/**
 * The construction a post opens with: its first three words, normalised toward
 * the shape and away from the wording.
 *
 * NOT normalizeForComparison(), AND THE DIFFERENCE IS LOAD-BEARING. That
 * function deletes every digit, which is right for whole-post similarity — two
 * treatments of one rule quote the same dates, and leaving those in would make
 * them look alike for reasons that have nothing to do with how they read.
 * Applied to an OPENING the same rule is actively wrong, because in this domain
 * the digit is frequently the subject:
 *
 *     "H-1B/L-1 visas: the biometric entry-exit fee…"   ->   "h b l"
 *     "H-2B/L-1 visas: the seasonal worker cap…"        ->   "h b l"
 *
 * Two posts about different visa classes, keyed identically, and the second one
 * refused for repeating an opening it does not share. So designations survive
 * here: hyphens stay, digits stay, and everything else that is not a letter or a
 * digit becomes a space.
 *
 *     "H-1B/L-1 visas: …"   ->   "h-1b l-1 visas"
 *     "H-2B/L-1 visas: …"   ->   "h-2b l-1 visas"
 *
 * Returns "" for a post with nothing to key on, and every caller treats "" as
 * "do not enforce" — failing open, on the same reasoning as
 * checkSameDayVariety(): a little sameness is cheaper than a slot silenced by
 * missing data.
 */
export function openingConstruction(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/#\w+/g, " ")
    .replace(/[^a-z0-9-]/g, " ")
    // A hyphen stranded by punctuation is not part of a designation.
    .replace(/(^|\s)-+/g, " ")
    .replace(/-+(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (words.length < OPENING_WORDS) return "";
  return words.slice(0, OPENING_WORDS).join(" ");
}

/** The real first words of a post, for showing a human — or a model — the shape. */
export function openingPhrase(text: string, chars = 60): string {
  const clean = text.replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length > chars ? `${clean.slice(0, chars)}…` : clean;
}

/** How often each opening construction appears in the recent window. */
export function openingConstructionCounts(
  ledger: PostLedger,
  platform: Platform,
  limit = OPENING_HISTORY
): Map<string, { count: number; example: string }> {
  const counts = new Map<string, { count: number; example: string }>();
  for (const text of recentTexts(ledger, platform, limit)) {
    const key = openingConstruction(text);
    if (!key) continue;
    const seen = counts.get(key);
    // recentTexts() is newest-first, so keeping the FIRST example shows the most
    // recent use of the construction rather than an arbitrary one.
    counts.set(key, {
      count: (seen?.count ?? 0) + 1,
      example: seen?.example ?? openingPhrase(text),
    });
  }
  return counts;
}

/**
 * Constructions the account has already leaned on, with the most recent post
 * that used each.
 *
 * The raw data. bannedOpeningLines() below turns it into something a model can
 * read; this shape is for callers that want the key, the count, or both.
 */
export function overusedOpenings(
  ledger: PostLedger,
  platform: Platform,
  limit = OPENING_HISTORY
): { construction: string; example: string; count: number }[] {
  return [...openingConstructionCounts(ledger, platform, limit)]
    .filter(([, v]) => v.count >= OPENING_REPEAT_LIMIT)
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(([construction, v]) => ({ construction, example: v.example, count: v.count }));
}

/**
 * The refused openings as lines a model can act on, across every platform this
 * run will publish to.
 *
 * TWO FIXES IN ONE FUNCTION, BOTH FOUND BY ASKING WHAT THE MODEL ACTUALLY GETS.
 *
 * THE KEYS ARE NOT PROSE. openingConstruction() produces "h-1b l-1 visas" and
 * "employees across state" — normalised shapes, useful for comparison and close
 * to meaningless as an instruction. Handing those over and saying "do not write
 * these" repeats, one level down, the mistake of judging a model against a rule
 * it cannot see: it can see this rule and cannot read it. So the real opening
 * goes beside the key.
 *
 * AND THE CHECK IS PER PLATFORM WHILE THE BRIEF WAS NOT. checkOpeningVariety()
 * runs against each platform's own history, but the brief was built from X's
 * alone, so LinkedIn copy was judged against a list the engine had never been
 * shown. One call produces both variants, so the union is what it needs.
 */
export function bannedOpeningLines(
  ledger: PostLedger,
  platforms: Platform[],
  limit = OPENING_HISTORY
): string[] {
  const merged = new Map<string, { example: string; count: number }>();
  for (const platform of platforms) {
    for (const row of overusedOpenings(ledger, platform, limit)) {
      const seen = merged.get(row.construction);
      if (!seen || row.count > seen.count) {
        merged.set(row.construction, { example: row.example, count: row.count });
      }
    }
  }
  return [...merged]
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .map(
      ([construction, v]) =>
        `"${v.example}" — used ${v.count}x. Any opening whose first three words reduce to "${construction}" is refused.`
    );
}

/** Does this post open the way the account has already opened too often? */
export function checkOpeningVariety(
  ledger: PostLedger,
  text: string,
  platform: Platform,
  limit = OPENING_HISTORY
): { ok: boolean; reason: string; construction: string; seen: number } {
  const construction = openingConstruction(text);
  if (!construction) {
    return { ok: true, reason: "no opening construction to compare", construction: "", seen: 0 };
  }

  const seen = openingConstructionCounts(ledger, platform, limit).get(construction)?.count ?? 0;
  if (seen >= OPENING_REPEAT_LIMIT) {
    return {
      ok: false,
      reason:
        `Opening variety: "${construction}…" has opened ${seen} of the last ${limit} posts on ` +
        `${platform}. A third would make it this account's house sentence.`,
      construction,
      seen,
    };
  }
  return { ok: true, reason: "distinct opening construction", construction, seen };
}

// -----------------------------------------------------------------------------
// GATE 2c — THE SHAPE OF THE POST
//
// The opening-construction check catches "USCIS has updated…" three times. It
// does not catch the same SHAPE — subject, status, date — worn by three
// different openings, which is what twenty-two published posts turned out to
// be. The writer is now offered several shapes and reports the one it used;
// this refuses a third consecutive use of the same one.
//
// Mechanical and repairable: the facts are right, the frame is stale, and the
// writer can be told which other frames are open.
// -----------------------------------------------------------------------------

/** How many consecutive posts may share one shape before the next is refused. */
export const STRUCTURE_RUN_LIMIT = 2;

export function checkStructureVariety(
  ledger: PostLedger,
  structure: string | undefined,
  platform: Platform
): { ok: boolean; reason: string; run: number } {
  if (!structure) return { ok: true, reason: "no structure reported — variety not enforced", run: 0 };
  const recent = recentStructures(ledger, platform, STRUCTURE_RUN_LIMIT);
  const run = recent.length >= STRUCTURE_RUN_LIMIT && recent.every((s) => s === structure) ? recent.length : 0;
  if (run >= STRUCTURE_RUN_LIMIT) {
    return {
      ok: false,
      reason: `Structure variety: the last ${run} posts on ${platform} already used the "${structure}" shape. Use a different one of the shapes on offer.`,
      run,
    };
  }
  return { ok: true, reason: "distinct structure", run };
}

/** Every subject published in the window, for the simulation's repetition report. */
export function subjectsPostedSince(ledger: PostLedger, sinceIso: string): string[] {
  return publishedPosts(ledger)
    .filter((p) => p.runAtUtc >= sinceIso)
    .map((p) => p.subjectId ?? "")
    .filter(Boolean);
}
