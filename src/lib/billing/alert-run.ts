// =============================================================================
// THE ALERT JOB — one pass over every subscriber
//
// Called once a day by the Vercel cron (/api/billing/alerts/run). For each
// subscriber key in the store:
//
//   1. PAYING? accessFor() is the same gate every Pro route uses. A cancelled,
//      lapsed, refunded or disputed subscriber gets nothing, whatever their
//      cookie or their old cursor says. Free readers are never in the index.
//   2. FIRST RUN? A subscriber with no cursor gets one dated today and no
//      email. Alerts are about what happens next; replaying the archive as
//      "new" would be a first email full of last year.
//   3. OFF? A cursor with pausedAt set is skipped.
//   4. ANYTHING NEW? buildAlertBatch() decides, against the cursor, so nothing
//      is ever sent twice.
//   5. SEND, THEN ADVANCE. The cursor moves only after Resend accepts the
//      message. A failed send is retried on the next run. Resend's
//      Idempotency-Key, derived from the batch, stops a retried or overlapping
//      run from delivering the same batch twice.
//
// DRY RUN IS THE DEFAULT. Without `send: true` the job selects and counts but
// sends nothing and writes nothing except first-run cursors, so it can run in
// production before anyone has agreed to real email going out.
//
// Nothing personal is logged: counts only, never an address or a watchlist.
// =============================================================================

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  buildAlertBatch,
  initialCursor,
  parseCursor,
  serializeCursor,
  type H1bEmployerLike,
  type WarnEmployerLike,
} from "./alerts";
import { buildAlertEmail, type AlertEmail } from "./alert-email";
import type { SubscriberStore } from "./store";
import { accessFor } from "./subscription";
import type { IndexedEvent } from "@/lib/event-index";
import { appendHistory, parseHistory, serializeHistory } from "@/lib/pro/history";
import { PRIORITY_EFFECTIVE_DAYS, digestDue, parsePrefs } from "@/lib/pro/prefs";

/** Days ahead a reminder fires for a followed change's stated effective date. */
export const REMIND_WITHIN_DAYS = 7;

/** A signed, per-subscriber token for the one-click unsubscribe link. */
export function unsubscribeToken(key: string, secret: string): string {
  return createHmac("sha256", secret).update(`alerts-unsubscribe:${key}`).digest("base64url").slice(0, 32);
}

export function verifyUnsubscribeToken(key: string, token: string, secret: string): boolean {
  if (!key || !token || !secret) return false;
  const expected = Buffer.from(unsubscribeToken(key, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function unsubscribeUrl(origin: string, key: string, secret: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/api/billing/alerts/unsubscribe?k=${encodeURIComponent(key)}&t=${unsubscribeToken(key, secret)}`;
}

/** Vercel cron sends `Authorization: Bearer $CRON_SECRET`. No secret, no entry. */
export function cronAuthorized(header: string | null, secret: string | undefined): boolean {
  const expected = (secret ?? "").trim();
  if (!expected || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${expected}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type SendAlert = (
  to: string,
  mail: AlertEmail,
  idempotencyKey: string
) => Promise<{ ok: true } | { ok: false; detail: string }>;

export interface AlertRunInput {
  store: SubscriberStore;
  nowSeconds: number;
  data: {
    events: readonly IndexedEvent[];
    warnEmployers: readonly WarnEmployerLike[];
    h1bEmployers: readonly H1bEmployerLike[];
    fiscalYear: string;
  };
  secret: string;
  origin: string;
  testMode: boolean;
  supportEmail?: string;
  /** False (the default) is a dry run: nothing is sent, no cursor advances. */
  send?: boolean;
  sender?: SendAlert;
  /**
   * The pro_briefing flag. When true, each subscriber's Briefing preferences
   * (frequency, relevance, reminders) shape the batch, and every accepted send
   * is recorded in their alert history. When false the job runs exactly as it
   * did before Briefing existed.
   */
  briefing?: boolean;
}

export interface AlertRunReport {
  mode: "send" | "dry_run";
  subscribers: number;
  notPro: number;
  started: number;
  paused: number;
  emptyWatchlist: number;
  nothingNew: number;
  /** Weekly subscribers on a day that is not their digest day. Briefing only. */
  notDue: number;
  /** Batches that would go out (dry run) or went out (send). */
  ready: number;
  sent: number;
  failed: number;
  /** Sent, but the history entry could not be written. Briefing only. */
  historyFailed: number;
  alerts: number;
}

export async function runAlerts(input: AlertRunInput): Promise<AlertRunReport> {
  const send = input.send === true;
  if (send && !input.sender) throw new Error("runAlerts: send requested without a sender");

  const report: AlertRunReport = {
    mode: send ? "send" : "dry_run",
    subscribers: 0,
    notPro: 0,
    started: 0,
    paused: 0,
    emptyWatchlist: 0,
    nothingNew: 0,
    notDue: 0,
    ready: 0,
    sent: 0,
    failed: 0,
    historyFailed: 0,
    alerts: 0,
  };
  const today = new Date(input.nowSeconds * 1000).toISOString().slice(0, 10);

  for (const key of await input.store.listSubscriberKeys()) {
    report.subscribers += 1;
    const record = await input.store.getSubscriber(key);
    const access = accessFor(record, input.nowSeconds);
    if (!access.pro || !record?.email) {
      report.notPro += 1;
      continue;
    }

    const raw = await input.store.getAlertCursor(key);
    if (raw === null) {
      // Writing a first cursor sends nothing, so it is safe in a dry run too —
      // and doing it now means the first real run cannot replay a backlog.
      await input.store.putAlertCursor(key, serializeCursor(initialCursor(today)));
      report.started += 1;
      continue;
    }
    const cursor = parseCursor(raw);
    if (typeof cursor.pausedAt === "number") {
      report.paused += 1;
      continue;
    }

    const follows = (await input.store.getWatchlist(key))?.entityIds ?? [];
    if (follows.length === 0) {
      report.emptyWatchlist += 1;
      continue;
    }

    const prefs = input.briefing ? parsePrefs(await input.store.getProDoc("prefs", key)) : null;
    if (prefs && !digestDue(prefs, input.nowSeconds)) {
      report.notDue += 1;
      continue;
    }
    const batch = prefs
      ? buildAlertBatch(input.data, follows, cursor, {
          today,
          // A weekly digest covers seven days, so it may carry more.
          limit: prefs.frequency === "weekly" ? 25 : 12,
          relevance: prefs.relevance,
          priorityWithinDays: PRIORITY_EFFECTIVE_DAYS,
          ...(prefs.reminders ? { remindWithinDays: REMIND_WITHIN_DAYS } : {}),
        })
      : buildAlertBatch(input.data, follows, cursor);
    if (batch.alerts.length === 0) {
      report.nothingNew += 1;
      continue;
    }

    report.ready += 1;
    report.alerts += batch.alerts.length;
    if (!send) continue;

    const mail = buildAlertEmail({
      alerts: batch.alerts,
      origin: input.origin,
      unsubscribeUrl: unsubscribeUrl(input.origin, key, input.secret),
      testMode: input.testMode,
      supportEmail: input.supportEmail,
    });
    const idempotencyKey = `alerts-${key}-${createHash("sha256")
      .update(batch.alerts.map((a) => a.id).join("|"))
      .digest("hex")
      .slice(0, 24)}`;

    let result: { ok: true } | { ok: false; detail: string };
    try {
      result = await input.sender!(record.email, mail, idempotencyKey);
    } catch (err) {
      result = { ok: false, detail: err instanceof Error ? err.message : "send threw" };
    }
    if (!result.ok) {
      report.failed += 1;
      continue;
    }
    // Re-read before writing: the subscriber may have unsubscribed while this
    // run was sending, and that choice must not be overwritten.
    const latest = parseCursor(await input.store.getAlertCursor(key));
    await input.store.putAlertCursor(
      key,
      serializeCursor({ ...batch.cursor, ...(latest.pausedAt ? { pausedAt: latest.pausedAt } : {}) })
    );
    if (input.briefing) {
      // History is a record of what was said, so it is written only after the
      // send was accepted, and a failure here must not undo a delivered email.
      try {
        const history = parseHistory(await input.store.getProDoc("history", key));
        await input.store.putProDoc("history", key, serializeHistory(appendHistory(history, batch.alerts, input.nowSeconds)));
      } catch {
        report.historyFailed += 1;
      }
    }
    report.sent += 1;
  }
  return report;
}

/** Send through Resend, as the welcome and sign-in emails already do. */
export function resendSender(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): SendAlert {
  return async (to, mail, idempotencyKey) => {
    const key = env.RESEND_API_KEY;
    if (!key) return { ok: false, detail: "RESEND_API_KEY is not set" };
    const base = (env.RESEND_API_BASE || "https://api.resend.com").replace(/\/$/, "");
    const from = env.RESEND_FROM_EMAIL || "Immigration Clock <noreply@immigrationclock.com>";
    const res = await fetchImpl(`${base}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        headers: mail.headers,
        ...(env.NEXT_PUBLIC_CONTACT_EMAIL ? { reply_to: env.NEXT_PUBLIC_CONTACT_EMAIL } : {}),
      }),
      signal: AbortSignal.timeout(8_000),
      // Never cached: see the note in store.ts.
      cache: "no-store",
    });
    return res.ok ? { ok: true } : { ok: false, detail: `Resend returned ${res.status}` };
  };
}
