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
      "WHAT CHANGED, AND WHAT IT NOW REQUIRES. A genuinely new, qualifying " +
      "official development published in the last two days — a rule, policy " +
      "update, court decision or executive action. Lead with the change and, " +
      "where the document imposes one, the obligation it creates: a fee, a " +
      "filing requirement, an eligibility test. State requirements as facts " +
      "about the document, never as instructions to the reader. If nothing " +
      "clears the bar, this slot stays silent.",
    // No fallback, deliberately. This slot's silence IS its standard: a morning
    // with no qualifying development says nothing rather than reaching for a
    // page to fill the hour. That is where filler would be most visible and
    // least excusable.
    fallbackPools: [],
    // breaking_change is this slot's signature and belongs to it alone. The
    // other four are here because the news pool now reaches back five days and
    // an item aged 3–5 days is deliberately NOT offered breaking framing — it
    // has to earn one of these from its own data instead. Without them in this
    // list the graduated model would select a treatment the slot then filtered
    // out, and the widened window would have bought nothing.
    angles: [
      "breaking_change",
      "what_it_requires",
      "who_is_affected",
      "what_changed_from_previous",
      "effective_date_reminder",
    ],
  },
  {
    id: "afternoon",
    hour: 15,
    pool: "knowledge",
    purpose:
      "EXPLAIN SOMETHING. The teaching slot. Draw on the archive to make one " +
      "confusing thing clear: who an active rule actually reaches, what a " +
      "document changed from the version before it, what happens on an " +
      "effective date that is coming, or where a change sits in a sequence " +
      "we have been tracking. Written for someone with a real application in " +
      "progress, not for a policy analyst. Explanatory, never breaking.",
    // A development that published this morning is still the most useful thing
    // this account holds at 3pm. If the morning slot has already covered it, the
    // 7-day subject block and same-day topic variety keep it out; if it landed
    // after 9am, or the morning slot skipped it, this slot can now reach it
    // instead of explaining something older while the news sits unposted.
    fallbackPools: ["news"],
    angles: [
      "who_is_affected",
      "what_changed_from_previous",
      "effective_date_reminder",
      "historical_context",
      // Admitted for fallback candidates only: nothing in the knowledge pool
      // supports these, so they cannot change what this slot does with its own
      // material.
      "breaking_change",
      "what_it_requires",
    ],
  },
  {
    id: "evening",
    hour: 18,
    pool: "standing",
    purpose:
      "LOOK AHEAD, OR HAND SOMEONE A TOOL. Either a date on the horizon — a " +
      "window opening, a deadline closing, what the official source says about " +
      "its timing — or a durable ImmigrationClock resource worth knowing about: " +
      "key dates, H-1B sponsorship data, WARN layoff intelligence, the " +
      "timeline, the map, a country or visa hub. Useful on any evening, and " +
      "never manufactured urgency.",
    // THE SLOT THAT PUBLISHED THE METHODOLOGY POST.
    //
    // It could see fifteen standing pages and nothing else, so the only question
    // available to it was "which page", and a rotation index answered that. Now
    // it can see the news pool as well. Its own pool is still its primary
    // job — most evenings there is no development left unposted and it hands
    // someone a tool, which is what this slot is for — but on an evening when a
    // material development is sitting unposted, a page about our own methodology
    // no longer wins by default.
    //
    // Standing is never empty, so this slot's post count is unchanged by the
    // fallback. Only its choices are.
    //
    // NEWS ONLY, not the knowledge archive. A first draft of this let the
    // evening reach the archive too, and the preview showed exactly why that is
    // wrong: the archive holds dozens of live effective-date items, they all
    // rank in the deadline tier, and they swamped the datasets — two slots of
    // "a rule starts on the 18th" and no evening this account ever hands
    // somebody a tool. Archive alerts are the AFTERNOON's job. What the evening
    // needs from outside its own pool is the rarer thing: a development that
    // published today and has not been posted yet.
    fallbackPools: ["news"],
    // No historical_context here. Placing an item among related activity is a
    // treatment of an EVENT, and this slot's primary pool is durable pages and
    // recurring dates. Leaving it in let one angle span two slots for no
    // benefit; the afternoon slot owns it.
    angles: [
      "deadline_approaching",
      "preparation_window",
      "data_insight",
      // For fallback candidates only — a fresh development. The archive's own
      // treatments stay with the afternoon slot that owns them.
      "breaking_change",
      "what_it_requires",
    ],
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
