// =============================================================================
// WHAT AN ALERT MAY SAY
//
// This is the paid product's substance, so it is also the place where a claim
// that cannot be supported would do the most damage. Everything below is
// derived from committed data, and the two things this data CANNOT support are
// written down here rather than discovered by a subscriber.
//
// WHAT WE CAN HONESTLY ALERT ON
// -----------------------------
//   1. RECORDED CHANGES matching a followed visa, country, agency, topic or
//      policy. The archive already links every change to entity ids and
//      eventsForFollows() already selects them; this only adds "since when".
//
//   2. EMPLOYER MOVEMENT, which is the differentiated one. For an employer a
//      reader follows we can say two true things:
//        • a new WARN layoff notice has appeared, with its date and state, and
//        • the H-1B sponsorship figures moved when USCIS published a new
//          Employer Data Hub export.
//      That join — state layoff filings against federal sponsorship data,
//      matched on a normalized employer name — is the asset neither source
//      publishes on its own.
//
// WHAT WE CANNOT, AND MUST NEVER IMPLY
// ------------------------------------
//   • "A policy change mentions this employer." The archive carries entity ids
//     for agencies, topics, visas, countries, policies, court cases and
//     executive actions — and NOT for employers. No change record links to an
//     employer, so this alert cannot exist. Checked, not assumed:
//     the entity-id prefixes present in events-index.json are exactly
//     agency, topic, visa, policy, court_case, executive_action, country.
//
//   • "This layoff was related to sponsorship." The employer pages already
//     carry the correct wording — appearing in both datasets does not imply
//     one caused the other — and an alert must not quietly drop that caveat
//     because it is short. The caveat travels with the signal.
//
//   • Anything about an individual. An alert is about a record, never a person.
// =============================================================================

import type { IndexedEvent } from "@/lib/event-index";
import { changePath } from "@/lib/share";
import { CLASSIFICATION_LABEL, isNotInForce } from "@/lib/event-labels";
import { SOURCE_BY_KEY } from "@/lib/sources";
import type { EventClassification } from "@/domains/graph/events";

export type AlertKind = "change" | "warn_notice" | "h1b_export" | "effective_reminder";

export interface Alert {
  kind: AlertKind;
  /** Stable id, so the same signal is never sent twice. */
  id: string;
  /** The entity ids from the reader's watchlist that caused this to be selected. */
  matched: string[];
  title: string;
  /** One sentence. Facts only; the caveat, where one applies, is part of it. */
  detail: string;
  /** Site-relative. */
  href: string;
  /** ISO date the underlying thing happened or was published. */
  date: string;
  /** The official document, for alerts about a recorded change. */
  source?: { name: string; url: string };
}

/** An employer as the WARN feed knows it, narrowed to what an alert needs. */
export interface WarnEmployerLike {
  slug: string;
  name: string;
  notices: number;
  employees: number;
  states: string[];
  latestNotice: string | null;
}

/** An employer as the H-1B export knows it. */
export interface H1bEmployerLike {
  slug: string;
  name: string;
  approvals: number;
  denials: number;
}

/** What we already told this reader, so nothing repeats. */
export interface AlertCursor {
  /** ISO date of the most recent change already sent. */
  lastChangeDate?: string;
  /** Alert ids already sent, most recent first. Bounded — see CURSOR_MEMORY. */
  sent?: string[];
  /**
   * Unix seconds when the subscriber turned alerts off, from the unsubscribe
   * link or the account page. Absent means on.
   *
   * Kept in the cursor rather than on the subscriber record because
   * mergeSubscriber rebuilds that record field by field on every Stripe event,
   * and a preference stored there would be silently dropped by the next
   * renewal. The cursor is written only by the alert job and by this choice.
   */
  pausedAt?: number;
}

/** How many alert ids to remember. Enough to cover any plausible backlog. */
export const CURSOR_MEMORY = 200;

export function parseCursor(raw: string | null): AlertCursor {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as AlertCursor;
    return {
      lastChangeDate: parsed.lastChangeDate,
      sent: Array.isArray(parsed.sent) ? parsed.sent : [],
      ...(typeof parsed.pausedAt === "number" ? { pausedAt: parsed.pausedAt } : {}),
    };
  } catch {
    // A damaged cursor must not stop alerts; the id memory below still prevents
    // a duplicate for anything it recognises, and worst case a reader sees one
    // repeat rather than nothing ever again.
    return {};
  }
}

export function serializeCursor(cursor: AlertCursor): string {
  return JSON.stringify({
    lastChangeDate: cursor.lastChangeDate,
    sent: (cursor.sent ?? []).slice(0, CURSOR_MEMORY),
    ...(typeof cursor.pausedAt === "number" ? { pausedAt: cursor.pausedAt } : {}),
  });
}

/** Turn alerts off or on without losing what was already sent. */
export function withPaused(cursor: AlertCursor, pausedAt: number | null): AlertCursor {
  const next: AlertCursor = { ...cursor };
  delete next.pausedAt;
  if (pausedAt !== null) next.pausedAt = pausedAt;
  return next;
}

/** Only these entity types can match a recorded change; "employer" cannot. */
const CHANGE_MATCHABLE = /^(visa|country|agency|topic|policy|court_case|executive_action):/;

/**
 * Recorded changes that match a watchlist and have not been sent.
 *
 * `publishedAt` decides recency, not the order of the file: the archive is
 * rebuilt daily and a late-arriving record with an older date must not be
 * skipped because something newer was already sent.
 */
export function changeAlerts(
  events: readonly IndexedEvent[],
  follows: readonly string[],
  cursor: AlertCursor
): Alert[] {
  const watched = new Set(follows.filter((f) => CHANGE_MATCHABLE.test(f)));
  if (watched.size === 0) return [];
  const already = new Set(cursor.sent ?? []);

  const out: Alert[] = [];
  for (const event of events) {
    const matched = (event.entityIds ?? []).filter((id) => watched.has(id));
    if (matched.length === 0) continue;

    const id = `change:${event.id}`;
    if (already.has(id)) continue;
    if (cursor.lastChangeDate && event.publishedAt <= cursor.lastChangeDate) continue;

    out.push({
      kind: "change",
      id,
      matched,
      title: event.title,
      // "Stated", whether the date is ahead or has passed: the record states it,
      // and a passed date does not show the rule still applies.
      detail: event.effectiveAt
        ? `${labelFor(event)} · stated effective date ${dayLabel(event.effectiveAt)}`
        : labelFor(event),
      source: sourceOf(event),
      // The change's own page. Its address is the title slug plus a hash of the
      // id; a bare id is not a route and answered 404.
      href: changePath(event),
      date: event.publishedAt,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

function labelFor(event: IndexedEvent): string {
  const kind = CLASSIFICATION_LABEL[event.classification as EventClassification] ?? event.classification.replace(/_/g, " ");
  return `${kind} · ${SOURCE_BY_KEY[event.sourceKey]?.name ?? event.sourceKey.replace(/_/g, " ")}`;
}

function sourceOf(event: IndexedEvent): Alert["source"] {
  return event.sourceUrl ? { name: SOURCE_BY_KEY[event.sourceKey]?.name ?? "Official source", url: event.sourceUrl } : undefined;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Oct 14, 2026" — a reader's date, not a field value. */
function dayLabel(iso: string): string {
  const m = MONTHS[Number(iso.slice(5, 7)) - 1];
  return m ? `${m} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}` : iso;
}

/**
 * A new WARN notice for a followed employer.
 *
 * The signal is the employer's LATEST NOTICE DATE moving forward. The feed
 * gives a per-employer roll-up rather than a notice-level history, so the alert
 * id carries that date: the same employer alerts again only when a newer notice
 * appears, and never twice for the same one.
 */
export function warnAlerts(
  employers: readonly WarnEmployerLike[],
  follows: readonly string[],
  cursor: AlertCursor
): Alert[] {
  const watched = new Set(
    follows.filter((f) => f.startsWith("employer:")).map((f) => f.slice("employer:".length))
  );
  if (watched.size === 0) return [];
  const already = new Set(cursor.sent ?? []);

  const out: Alert[] = [];
  for (const employer of employers) {
    if (!watched.has(employer.slug) || !employer.latestNotice) continue;
    const id = `warn:${employer.slug}:${employer.latestNotice}`;
    if (already.has(id)) continue;

    out.push({
      kind: "warn_notice",
      id,
      matched: [`employer:${employer.slug}`],
      title: `${employer.name}: new WARN layoff notice`,
      // The caveat is part of the sentence, not a footnote that can be dropped.
      detail:
        `${employer.notices} notice(s) on file covering ${employer.employees.toLocaleString()} employees in ` +
        `${employer.states.join(", ")}. A WARN notice reports a planned layoff; it does not indicate whether ` +
        `or how those roles relate to visa sponsorship.`,
      href: `/employer/${employer.slug}`,
      date: employer.latestNotice,
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * The H-1B export moved for a followed employer.
 *
 * USCIS publishes the Employer Data Hub roughly annually, so this fires rarely
 * and is worth saying when it does: the figures on the employer's page are now
 * different. The id carries the fiscal year, so one export produces at most one
 * alert per employer.
 */
export function h1bAlerts(
  employers: readonly H1bEmployerLike[],
  follows: readonly string[],
  fiscalYear: string,
  cursor: AlertCursor
): Alert[] {
  const watched = new Set(
    follows.filter((f) => f.startsWith("employer:")).map((f) => f.slice("employer:".length))
  );
  if (watched.size === 0) return [];
  const already = new Set(cursor.sent ?? []);

  const out: Alert[] = [];
  for (const employer of employers) {
    if (!watched.has(employer.slug)) continue;
    const id = `h1b:${employer.slug}:${fiscalYear}`;
    if (already.has(id)) continue;

    const total = employer.approvals + employer.denials;
    const rate = total > 0 ? Math.round((employer.approvals / total) * 1000) / 10 : null;
    out.push({
      kind: "h1b_export",
      id,
      matched: [`employer:${employer.slug}`],
      title: `${employer.name}: new H-1B figures published`,
      detail:
        `USCIS published fiscal year ${fiscalYear}: ${employer.approvals.toLocaleString()} approvals, ` +
        `${employer.denials.toLocaleString()} denials` +
        `${rate === null ? "" : ` (${rate}% approved)`}. These are petition counts, not workers.`,
      href: `/employer/${employer.slug}`,
      date: `${fiscalYear}-10-01`,
    });
  }
  return out;
}

/**
 * A reminder that a followed change takes effect soon.
 *
 * Only changes whose record STATES an effective date, and only within the
 * window — never a guessed date. The id carries the effective date, so a
 * change whose date is later corrected reminds once more for the new date,
 * and never twice for the same one.
 */
export function reminderAlerts(
  events: readonly IndexedEvent[],
  follows: readonly string[],
  cursor: AlertCursor,
  today: string,
  withinDays: number
): Alert[] {
  const watched = new Set(follows.filter((f) => CHANGE_MATCHABLE.test(f)));
  if (watched.size === 0) return [];
  const already = new Set(cursor.sent ?? []);

  const out: Alert[] = [];
  for (const event of events) {
    if (!event.effectiveAt) continue;
    // A proposal is not in force, and any date it carries is a proposed one.
    // No reminder rests on it.
    if (isNotInForce(event.classification as EventClassification)) continue;
    const days = daysBetween(today, event.effectiveAt);
    if (days < 0 || days > withinDays) continue;
    const matched = (event.entityIds ?? []).filter((id) => watched.has(id));
    if (matched.length === 0) continue;
    const id = `effective:${event.id}:${event.effectiveAt.slice(0, 10)}`;
    if (already.has(id)) continue;
    out.push({
      kind: "effective_reminder",
      id,
      matched,
      title: `Takes effect ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}: ${event.title}`,
      detail: `Stated effective date ${dayLabel(event.effectiveAt)} · ${labelFor(event)}`,
      href: changePath(event),
      source: sourceOf(event),
      date: event.effectiveAt.slice(0, 10),
    });
  }
  return out;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to.slice(0, 10)) - Date.parse(from.slice(0, 10))) / 86_400_000);
}

/**
 * Is this change a priority for a subscriber who asked for "priority" only?
 * Major in the archive's own severity field, or a stated effective date within
 * the window. Nothing else is inferred.
 */
export function isPriorityEvent(event: IndexedEvent, today: string, withinDays: number): boolean {
  if (event.severity === "major") return true;
  if (!event.effectiveAt || isNotInForce(event.classification as EventClassification)) return false;
  const days = daysBetween(today, event.effectiveAt);
  return days >= 0 && days <= withinDays;
}

export interface AlertBatch {
  alerts: Alert[];
  cursor: AlertCursor;
}

export interface AlertBatchOptions {
  limit?: number;
  /** ISO date. Required for "priority" relevance and for reminders. */
  today?: string;
  /** "all" (the default) or "priority" — see src/lib/pro/prefs.ts. */
  relevance?: "all" | "priority";
  priorityWithinDays?: number;
  /** Days ahead to remind about followed changes' effective dates. Off when unset. */
  remindWithinDays?: number;
}

/**
 * Everything a reader should hear about, and the cursor to store afterwards.
 *
 * `limit` is a kindness and a safeguard: a watchlist of sixty entities on a
 * busy week could otherwise produce an email nobody reads, and a first run for
 * a new subscriber would replay the whole archive.
 *
 * With no options this behaves exactly as it did before Briefing: every change
 * match, no reminders, twelve at most.
 */
export function buildAlertBatch(
  input: {
    events: readonly IndexedEvent[];
    warnEmployers: readonly WarnEmployerLike[];
    h1bEmployers: readonly H1bEmployerLike[];
    fiscalYear: string;
  },
  follows: readonly string[],
  cursor: AlertCursor,
  limitOrOptions: number | AlertBatchOptions = 12
): AlertBatch {
  const options: AlertBatchOptions =
    typeof limitOrOptions === "number" ? { limit: limitOrOptions } : limitOrOptions;
  const limit = options.limit ?? 12;
  const today = options.today;

  const changeEvents =
    options.relevance === "priority" && today
      ? input.events.filter((e) => isPriorityEvent(e, today, options.priorityWithinDays ?? 30))
      : input.events;

  // Reminders go first: a date that is about to pass outranks news.
  const reminders =
    today && options.remindWithinDays !== undefined
      ? reminderAlerts(input.events, follows, cursor, today, options.remindWithinDays).sort((a, b) =>
          a.date.localeCompare(b.date)
        )
      : [];

  // One record, one line: a newly published change that also takes effect
  // within the reminder window is sent as the reminder only, and its change
  // id is recorded as sent so it never arrives later as "new".
  const reminded = new Set(reminders.map((r) => r.id.split(":").slice(1, -1).join(":")));
  const news = [
    ...changeAlerts(changeEvents, follows, cursor).filter((a) => !reminded.has(a.id.slice("change:".length))),
    ...warnAlerts(input.warnEmployers, follows, cursor),
    ...h1bAlerts(input.h1bEmployers, follows, input.fiscalYear, cursor),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const alerts = [...reminders, ...news].slice(0, limit);

  const newestChange = alerts.filter((a) => a.kind === "change").map((a) => a.date).sort().pop();

  return {
    alerts,
    cursor: {
      lastChangeDate: newestChange ?? cursor.lastChangeDate,
      sent: [
        ...alerts.map((a) => a.id),
        ...alerts.filter((a) => a.kind === "effective_reminder").map((a) => `change:${a.id.split(":").slice(1, -1).join(":")}`),
        ...(cursor.sent ?? []),
      ].slice(0, CURSOR_MEMORY),
      ...(typeof cursor.pausedAt === "number" ? { pausedAt: cursor.pausedAt } : {}),
    },
  };
}

/**
 * A first cursor for a new subscriber.
 *
 * Without this, someone who subscribes today receives every matching change in
 * the archive as "new". The cursor starts at today: alerts are about what
 * happens next, and the archive is free to browse for what already happened.
 */
export function initialCursor(today: string): AlertCursor {
  return { lastChangeDate: today, sent: [] };
}
