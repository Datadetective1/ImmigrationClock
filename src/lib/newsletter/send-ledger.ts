// =============================================================================
// SEND LEDGER — one edition, one language, at most one send
//
// WHAT THIS REPLACES
// ------------------
// send-newsletter.ts set `name: ed.issueId` on every broadcast and both it and
// the workflow claimed that made creation idempotent: "a retry cannot deliver
// the same issue twice". That was never true. Resend documents `name` as "the
// friendly name of the broadcast — only used for internal reference", and its
// real idempotency feature, the `Idempotency-Key` header, is supported on
// `POST /emails` and `POST /emails/batch` and NOT on `POST /broadcasts`.
//
// So nothing prevented a double send. The workflow retries the send step twice.
// If English delivered and Spanish then failed, attempt two re-created and
// re-fired English, and every English subscriber received the issue twice.
//
// THE MECHANISM
// -------------
// A committed JSON ledger. Before sending, the script asks whether this exact
// edition has already gone to this exact destination; after a send succeeds it
// records the fact immediately, before moving to the next language.
//
// Deterministic and auditable by construction: it is a file in the repository,
// it is written by the same job that sends, and a human can read it. It does
// not depend on Resend's semantics, on wall-clock timing, or on a remote list
// query whose shape may change again.
//
// It survives both failure modes that matter:
//   • retry inside one workflow run — the file is on the runner's disk, written
//     the moment each send succeeded
//   • a re-run, or next week's run, on a fresh checkout — the workflow commits
//     the ledger to `main`, so the next checkout carries it
//
// WHY THE DESTINATION IS PART OF THE KEY
// --------------------------------------
// The key is issue + locale + audience, not issue + locale.
//
// A one-recipient smoke test sends `weekly-en-2026-08-08` to a throwaway
// segment. Keyed on issue and locale alone, that would mark the edition sent
// and silently block the real production send — the smoke test would eat the
// newsletter. Including the destination keeps the two independent while still
// giving production exactly the invariant it needs, because production has one
// audience per locale.
// =============================================================================

/** One successful send. Append-only: nothing here is ever edited or removed. */
export interface SendRecord {
  /** e.g. "weekly-en-2026-08-08" */
  issueId: string;
  locale: string;
  /** The Resend audience/segment the broadcast targeted. Part of the identity. */
  audienceId: string;
  /** Resend's id for the broadcast, so a delivery can be traced back. */
  broadcastId: string;
  /** ISO timestamp, for humans reading the file. Never used for comparison. */
  sentAt: string;
  /** True when an operator deliberately re-sent over an existing record. */
  override?: boolean;
}

export interface SendLedger {
  version: 1;
  sends: SendRecord[];
}

export const EMPTY_LEDGER: SendLedger = { version: 1, sends: [] };

/**
 * The identity of a send.
 *
 * Locale is included even though issueId already ends with it — the id format
 * is a convention of the selector, and a ledger that silently depended on that
 * convention would break the day it changed.
 */
export function sendKey(issueId: string, locale: string, audienceId: string): string {
  return `${issueId}::${locale}::${audienceId}`;
}

/** Has this exact edition already gone to this exact destination? */
export function alreadySent(
  ledger: SendLedger,
  issueId: string,
  locale: string,
  audienceId: string
): SendRecord | null {
  const key = sendKey(issueId, locale, audienceId);
  return ledger.sends.find((s) => sendKey(s.issueId, s.locale, s.audienceId) === key) ?? null;
}

/**
 * Append a send.
 *
 * Returns a NEW ledger rather than mutating, so a caller cannot half-apply a
 * record and then fail. Duplicates are permitted in the file when an operator
 * used the override — the history of what actually went out is more useful than
 * a tidy unique index, and `alreadySent` finds the first match either way.
 */
export function recordSend(ledger: SendLedger, record: SendRecord): SendLedger {
  return { version: 1, sends: [...ledger.sends, record] };
}

/**
 * Parse a ledger, tolerating anything.
 *
 * A missing file is the normal state before the first send. A corrupt one is
 * NOT treated as empty: returning EMPTY_LEDGER there would silently unlock
 * every edition it was supposed to be protecting, which is the one outcome this
 * module exists to prevent. Callers get `null` and must decide — send-newsletter
 * refuses to send.
 */
export function parseLedger(raw: string | null): SendLedger | null {
  if (raw === null) return EMPTY_LEDGER;
  const text = raw.trim();
  if (text === "") return EMPTY_LEDGER;
  try {
    const parsed = JSON.parse(text) as Partial<SendLedger>;
    if (parsed.version !== 1 || !Array.isArray(parsed.sends)) return null;
    for (const s of parsed.sends) {
      if (typeof s?.issueId !== "string" || typeof s?.locale !== "string" || typeof s?.audienceId !== "string") {
        return null;
      }
    }
    return { version: 1, sends: parsed.sends as SendRecord[] };
  } catch {
    return null;
  }
}

/** Stable on disk: sorted, so a rebuild produces no spurious diff. */
export function serializeLedger(ledger: SendLedger): string {
  const sends = [...ledger.sends].sort(
    (a, b) =>
      a.issueId.localeCompare(b.issueId) ||
      a.locale.localeCompare(b.locale) ||
      a.audienceId.localeCompare(b.audienceId) ||
      a.sentAt.localeCompare(b.sentAt)
  );
  return `${JSON.stringify({ version: 1, sends }, null, 2)}\n`;
}
