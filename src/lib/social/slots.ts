// =============================================================================
// SLOTS AND THE DST GATE
//
// GitHub Actions cron is ALWAYS UTC. There is no `timezone` key, and adding one
// to the workflow is silently ignored rather than rejected — which is the worst
// kind of wrong, because the schedule looks correct in the file and drifts by an
// hour twice a year in production.
//
// So the schedule is expressed twice, once per US offset:
//
//   - cron: "0 14,20,23 * * *"   # CDT (UTC-5): 9am, 3pm, 6pm Chicago
//   - cron: "0 0,15,21 * * *"    # CST (UTC-6): 6pm (prev day), 9am, 3pm
//
// Those hours are utcHoursFor() below, not a hand calculation. An earlier draft
// of the workflow used "0 13,19,22" for the second set, which maps to no slot in
// either offset — the winter half of the year would have had no valid firing at
// all. The test suite now pins both cron lines against this function.
//
// Both fire every day, so on any given day three of the six firings are an hour
// off. `currentSlot()` is what makes that safe: it asks what time it actually is
// in America/Chicago and returns null unless the local hour is exactly a slot
// hour. The wrong-offset firings exit cleanly having done nothing.
//
// Intl.DateTimeFormat with a timeZone is the only correct way to do this in
// Node without a dependency. Manual offset arithmetic gets the two annual
// transition days wrong, and those are precisely the days a reader would
// notice.
// =============================================================================

import type { SlotDef, SlotId } from "./types";

export const SLOTS: SlotDef[] = [
  {
    id: "morning",
    hour: 9,
    pool: "news",
    purpose:
      "WHAT CHANGED. A genuinely new, qualifying official development — a rule, " +
      "policy update, court decision or executive action published in the last " +
      "two days. If nothing clears the bar, this slot stays silent.",
    angles: ["breaking_change"],
  },
  {
    id: "afternoon",
    hour: 15,
    pool: "knowledge",
    purpose:
      "WHAT IT MEANS / WHO IT AFFECTS. Draw on the archive to explain an active " +
      "rule, an upcoming effective date, an obligation it creates, or how it " +
      "differs from what came before. Explanatory, not breaking.",
    angles: [
      "who_is_affected",
      "what_changed_from_previous",
      "effective_date_reminder",
      "historical_context",
    ],
  },
  {
    id: "evening",
    hour: 18,
    pool: "standing",
    purpose:
      "STANDING INTELLIGENCE. Point to a durable ImmigrationClock resource that " +
      "is useful on any day — key dates, H-1B sponsorship and salary data, WARN " +
      "layoff intelligence, the timeline, the migration map, or a country, visa, " +
      "agency or topic hub.",
    // No historical_context here. Placing an item among related activity is a
    // treatment of an EVENT, and this slot's pool is durable pages and recurring
    // dates. Leaving it in let one angle span two slots for no benefit; the
    // afternoon slot owns it.
    angles: ["deadline_approaching", "data_insight"],
  },
];

export const SLOT_BY_ID = new Map<SlotId, SlotDef>(SLOTS.map((s) => [s.id, s]));

export const TIMEZONE = "America/Chicago";

/**
 * Wall-clock time in Chicago, as fields rather than a Date.
 *
 * Returning parts instead of a shifted Date is deliberate: a Date that has been
 * offset to "look like" another zone is a lie that later code will act on. These
 * are just numbers, and they are only ever compared to slot hours.
 */
export function chicagoParts(at: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  date: string;
  time: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(at).filter((p) => p.type !== "literal").map((p) => [p.type, p.value])
  ) as Record<string, string>;

  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);

  return {
    year,
    month,
    day,
    hour,
    minute,
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/**
 * Which slot, if any, is open right now.
 *
 * Matches on the local HOUR only. A run that fires at 09:00 and a manual run at
 * 09:47 are both the morning slot; a run at 10:00 is nothing. The tolerance is
 * an hour because Actions cron is best-effort and routinely starts several
 * minutes late — a minute-exact gate would drop real runs.
 */
export function currentSlot(at: Date = new Date()): SlotDef | null {
  const { hour } = chicagoParts(at);
  return SLOTS.find((s) => s.hour === hour) ?? null;
}

/** The UTC hours a slot can fire at, across both offsets. Used by the tests. */
export function utcHoursFor(slot: SlotDef): number[] {
  // CST is UTC-6, CDT is UTC-5.
  return [(slot.hour + 6) % 24, (slot.hour + 5) % 24].sort((a, b) => a - b);
}

/**
 * Is this instant inside the daily publishing window at all?
 *
 * Used by the preflight to say "nothing would run right now" without pretending
 * a slot is open.
 */
export function inPublishingWindow(at: Date = new Date()): boolean {
  return currentSlot(at) !== null;
}
