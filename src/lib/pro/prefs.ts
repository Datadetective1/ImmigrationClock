// =============================================================================
// BRIEFING PREFERENCES — how a subscriber wants to hear about changes
//
// This is the whole "profile". It deliberately holds delivery choices and
// nothing about the person: no status, no case, no personal dates, no notes.
// What a subscriber cares about is already their watchlist, and that is all
// relevance needs. /methodology promises no individual immigrant profiles,
// and a profile built from preferences like these keeps that promise.
//
// The defaults reproduce the alert job exactly as it ran before Briefing:
// daily, every match. A subscriber who never opens the settings sees no change.
// =============================================================================

export const FREQUENCIES = ["daily", "weekly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const RELEVANCE = ["all", "priority"] as const;
/**
 * "all": every recorded change that matches the watchlist.
 * "priority": only matches recorded as major, or with a stated effective date
 * within PRIORITY_EFFECTIVE_DAYS. Severity is the archive's own field, not a
 * judgment made here.
 */
export type Relevance = (typeof RELEVANCE)[number];

export const PRIORITY_EFFECTIVE_DAYS = 30;

/** Weekly digests go out on this UTC weekday (1 = Monday). */
export const WEEKLY_DAY = 1;

export interface BriefingPrefs {
  frequency: Frequency;
  relevance: Relevance;
  /** One reminder a week before a followed change's stated effective date. */
  reminders: boolean;
  /**
   * The Monday intelligence summary (when Intelligence is on). Opt-in: off
   * until the subscriber turns it on, including for prefs stored before this
   * field existed. Independent of the daily/weekly alert digest.
   */
  summary: boolean;
  /**
   * Bumped to revoke the private calendar link. The link is signed over this
   * number, so the old one stops working the moment it changes.
   */
  calendarVersion: number;
}

export const DEFAULT_PREFS: BriefingPrefs = {
  frequency: "daily",
  relevance: "all",
  reminders: false,
  summary: false,
  calendarVersion: 1,
};

/** Read whatever is stored, keeping only values this version understands. */
export function parsePrefs(raw: string | null): BriefingPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  let parsed: Partial<Record<keyof BriefingPrefs, unknown>>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_PREFS };
  }
  return sanitizePrefs(parsed, DEFAULT_PREFS);
}

/** Apply a partial update from a request body over a known-good base. */
export function sanitizePrefs(input: unknown, base: BriefingPrefs): BriefingPrefs {
  const v = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const version = v.calendarVersion;
  return {
    frequency: FREQUENCIES.includes(v.frequency as Frequency) ? (v.frequency as Frequency) : base.frequency,
    relevance: RELEVANCE.includes(v.relevance as Relevance) ? (v.relevance as Relevance) : base.relevance,
    reminders: typeof v.reminders === "boolean" ? v.reminders : base.reminders,
    summary: typeof v.summary === "boolean" ? v.summary : base.summary,
    calendarVersion:
      typeof version === "number" && Number.isInteger(version) && version >= 1 && version < 1_000_000
        ? version
        : base.calendarVersion,
  };
}

export function serializePrefs(prefs: BriefingPrefs): string {
  return JSON.stringify(prefs);
}

/** Is a digest due today? Daily always is; weekly only on WEEKLY_DAY (UTC). */
export function digestDue(prefs: BriefingPrefs, nowSeconds: number): boolean {
  if (prefs.frequency === "daily") return true;
  return new Date(nowSeconds * 1000).getUTCDay() === WEEKLY_DAY;
}
