// =============================================================================
// THE MONTHLY SEND
//
// Run by the daily cron (/api/bulletin-alerts/send). On most days there is
// nothing to do: every subscriber has already had the newest month, or
// confirmed after it was published. On the day a new month is deployed, each
// subscriber gets one email with their two dates.
//
// Safe to run any number of times:
//   • a subscriber gets a month only if it is newer than the month they
//     confirmed on (sinceMonth), so nobody is sent dates they already saw;
//   • each (month, subscriber) is claimed in the store before sending, and the
//     claim is given back only if the send fails, so a re-run retries failures
//     and never repeats a success;
//   • Resend gets the same idempotency key on any retry.
//
// Nothing is sent unless `send` is true; otherwise it reports what it would do.
// =============================================================================

import type { Bulletin } from "@/lib/visa-bulletin";
import { type AlertSubscriber, unsubscribeUrl } from "./index";
import { alertEmail, listUnsubscribeHeaders, type BuiltEmail } from "./email";
import { ALERT_KEYS, type AlertStore } from "./store";

export interface RunInput {
  store: AlertStore;
  bulletin: Bulletin;
  previous: Bulletin | null;
  origin: string;
  secret: string;
  trialDays: number;
  /** False: count and report only. */
  send: boolean;
  deliver?: (to: string, mail: BuiltEmail, headers: Record<string, string>, idempotencyKey: string) => Promise<{ ok: boolean; detail?: string }>;
  /** Stop after this many sends, so one run fits inside a function timeout. The next run continues. */
  limit?: number;
}

export interface RunReport {
  month: string;
  subscribers: number;
  due: number;
  sent: number;
  failed: number;
  skippedAlreadySent: number;
  skippedNotDue: number;
  dryRun: boolean;
  remaining: number;
}

/** A subscriber is due a month that is newer than the one they signed up on. */
export function isDue(sub: Pick<AlertSubscriber, "sinceMonth">, month: string): boolean {
  return month > sub.sinceMonth;
}

export async function runBulletinAlerts(input: RunInput): Promise<RunReport> {
  const { store, bulletin } = input;
  const keys = await input.store.listKeys();
  const report: RunReport = {
    month: bulletin.id,
    subscribers: keys.length,
    due: 0,
    sent: 0,
    failed: 0,
    skippedAlreadySent: 0,
    skippedNotDue: 0,
    dryRun: !input.send,
    remaining: 0,
  };
  const limit = input.limit ?? Infinity;

  for (const key of keys) {
    const sub = await store.get(key);
    if (!sub) continue;
    if (!isDue(sub, bulletin.id)) {
      report.skippedNotDue += 1;
      continue;
    }
    report.due += 1;
    if (!input.send || !input.deliver) continue;
    if (report.sent + report.failed >= limit) {
      report.remaining += 1;
      continue;
    }

    const claim = ALERT_KEYS.sent(bulletin.id, key);
    // Kept for 120 days: long after the month has been replaced.
    if (!(await store.claim(claim, 120 * 24 * 60 * 60))) {
      report.skippedAlreadySent += 1;
      continue;
    }

    const unsub = unsubscribeUrl(input.origin, key, input.secret);
    const mail = alertEmail({
      pick: { row: sub.row, country: sub.country },
      bulletin,
      previous: input.previous,
      origin: input.origin,
      unsubscribeUrl: unsub,
      trialDays: input.trialDays,
    });
    let ok = false;
    try {
      const result = await input.deliver(sub.email, mail, listUnsubscribeHeaders(unsub), `balert-${bulletin.id}-${key}`);
      ok = result.ok;
      if (!ok) console.error(`[bulletin-alerts] send failed: ${result.detail ?? "unknown"}`);
    } catch (err) {
      console.error(`[bulletin-alerts] send threw: ${(err as Error)?.message}`);
    }
    if (ok) {
      report.sent += 1;
    } else {
      report.failed += 1;
      await store.release(claim);
    }
  }
  return report;
}
