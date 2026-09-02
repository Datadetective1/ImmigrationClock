// =============================================================================
// WINDOWS AND THE CLOCK
//
// THE FAILURE THIS FILE'S SECOND DESIGN ANSWERS
// --------------------------------------------
// The first design gated on an exact local hour: a run counted only if the
// Chicago hour was 9, 15 or 18. Measured against the GitHub Actions run log for
// the two weeks to 2026-09-01, that gate discarded most of the week:
//
//     08-21 to 08-25   crons fired 25–50 minutes late      every window open
//     08-26 onward     the 14:07Z and 20:07Z crons fired hours late or not at
//                      all; the 15:07Z cron arrived at 12:41, 13:22, 13:34,
//                      14:58 local — never at 9 or 15
//
// Six consecutive days with no morning run and four with no afternoon run,
// while the account's ledger showed the pipeline "working". GitHub documents
// that scheduled workflows are delayed under load; the design assumed they were
// not. Two consequences follow:
//
//   1. A window is a SPAN of local hours, not an hour. A run that lands anywhere
//      inside it counts, and the rerun guard in the ledger (one post per window
//      per day) is what stops two late firings from posting twice.
//   2. The workflow fires every hour of the publishing day, so a delay of an
//      hour or three moves a run inside its window instead of past it.
//
// GitHub Actions cron is always UTC and has no timezone key, so the local hour
// is read from the real America/Chicago wall clock via Intl.DateTimeFormat —
// the only correct way to do this in Node without a dependency, and the only
// way that gets both DST transition days right.
// =============================================================================

import type { SlotDef, SlotId } from "./types";

export const SLOTS: SlotDef[] = [
  {
    id: "morning",
    hour: 8,
    hours: [8, 12],
    purpose:
      "THE MORNING WINDOW. Where a material change published overnight or this " +
      "morning goes out first. News only: a quiet morning stays quiet, and the " +
      "evergreen tier waits for the afternoon.",
    pool: "news",
  },
  {
    id: "afternoon",
    hour: 13,
    hours: [13, 16],
    purpose:
      "THE AFTERNOON WINDOW. A change that landed during the day, a follow-up on " +
      "a recent one, or — on a quiet day — the first opportunity for an " +
      "explainer, a data signal or a tool.",
    pool: "knowledge",
  },
  {
    id: "evening",
    hour: 17,
    hours: [17, 20],
    purpose:
      "THE EVENING WINDOW. The last opportunity of the day: a change nothing " +
      "earlier caught, a date ahead, or the day's evergreen post if the day was " +
      "otherwise quiet.",
    pool: "editorial",
  },
];

export const SLOT_BY_ID = new Map<SlotId, SlotDef>(SLOTS.map((s) => [s.id, s]));

export const TIMEZONE = "America/Chicago";

/**
 * Wall-clock time in Chicago, as fields rather than a Date.
 *
 * Returning parts instead of a shifted Date is deliberate: a Date that has been
 * offset to "look like" another zone is a lie that later code will act on. These
 * are just numbers, and they are only ever compared to window hours.
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

/** Is this local hour inside the window? */
export function slotCoversHour(slot: SlotDef, hour: number): boolean {
  return hour >= slot.hours[0] && hour <= slot.hours[1];
}

/**
 * Which window, if any, is open right now.
 *
 * Matches on the local HOUR against each window's span. A run that fires at
 * 09:07 and one that arrives at 12:41 are both the morning window; a run at
 * 07:00 or at 21:30 is nothing.
 */
export function currentSlot(at: Date = new Date()): SlotDef | null {
  const { hour } = chicagoParts(at);
  return SLOTS.find((s) => slotCoversHour(s, hour)) ?? null;
}

/**
 * Every UTC hour at which this window can be open, across both US offsets.
 *
 * CST is UTC-6, CDT is UTC-5. Used by the tests to check that the workflow's
 * cron covers every one of them.
 */
export function utcHoursFor(slot: SlotDef): number[] {
  const out = new Set<number>();
  for (let h = slot.hours[0]; h <= slot.hours[1]; h++) {
    out.add((h + 6) % 24);
    out.add((h + 5) % 24);
  }
  return [...out].sort((a, b) => a - b);
}

/** Every UTC hour at which ANY window can be open. What the cron must cover. */
export function allPublishingUtcHours(): number[] {
  const out = new Set<number>();
  for (const slot of SLOTS) for (const h of utcHoursFor(slot)) out.add(h);
  return [...out].sort((a, b) => a - b);
}

/**
 * Is this instant inside the daily publishing window at all?
 *
 * Used by the preflight to say "nothing would run right now" without pretending
 * a window is open.
 */
export function inPublishingWindow(at: Date = new Date()): boolean {
  return currentSlot(at) !== null;
}

/**
 * A UTC instant that falls inside the given window on the given Chicago date.
 *
 * For simulations and previews, which have to construct "an afternoon on the
 * 14th" without knowing which offset that week is on. Tries the CDT arithmetic
 * first and falls back to CST, checking each against the real clock, so the
 * instant is right on both transition days too.
 */
export function instantInWindow(localDate: string, slot: SlotDef, minute = 5): Date {
  // One hour past the window's opening hour, so "morning" is 09:05 local — the
  // time a human would expect the first run of the day to land.
  const targetHour = Math.min(slot.hours[0] + 1, slot.hours[1]);
  for (const offset of [5, 6]) {
    const utcHour = targetHour + offset;
    const dayShift = utcHour >= 24 ? 1 : 0;
    const shifted = new Date(Date.parse(`${localDate}T00:00:00Z`) + dayShift * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const candidate = new Date(
      `${shifted}T${String(utcHour % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`
    );
    const p = chicagoParts(candidate);
    if (p.date === localDate && slotCoversHour(slot, p.hour)) return candidate;
  }
  // Unreachable for any real date: one of the two offsets is always in force.
  return new Date(`${localDate}T${String(targetHour + 5).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
}
