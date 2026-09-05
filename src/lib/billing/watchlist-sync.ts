// =============================================================================
// WATCHLIST SYNC — the merge, as a pure function
//
// THE ONE MOMENT THAT MATTERS
// ---------------------------
// Someone has followed H-1B, Mexico and an employer in their browser. They pay,
// they sign in, and the server has an empty list or a different one. If signing
// in replaces what they built, the first thing Pro ever does is delete their
// work — and they will not follow those things again to find out whether it
// happens twice.
//
// So the FIRST sign-in on a device is a UNION: everything the server holds plus
// everything valid the browser holds. Nothing is lost in either direction.
//
// AND WHY IT IS ONLY THE FIRST TIME
// ---------------------------------
// A union on every load would make removal impossible. Unfollow Mexico on the
// laptop, open the phone whose local copy still has it, and the union puts it
// back — silently, and for as long as the stale copy exists. So the union runs
// once per device, at the moment local state would otherwise be discarded.
// Afterwards the server is the authority and the browser mirrors it, which is
// what makes an unfollow on one device an unfollow everywhere.
//
// That asymmetry is the whole design: MERGE ONCE, THEN FOLLOW THE SERVER.
//
// The ordering rule is not cosmetic. A stable order means the PUT that follows
// a merge is byte-identical for the same inputs, so a retry cannot write a
// different list than the attempt it is retrying.
// =============================================================================

import { MAX_FOLLOWS, sanitizeFollows } from "@/lib/follows";

export interface MergeResult {
  /** The list to store, sanitized, deduplicated, ordered and capped. */
  entityIds: string[];
  /** Ids the browser held that the server did not. Zero means nothing to push. */
  added: string[];
  /** Ids dropped because they are not followable — legacy types, junk, typos. */
  rejected: string[];
  /** True when the result differs from what the server already holds. */
  changed: boolean;
}

/**
 * Server list UNION valid local list.
 *
 * Both sides are sanitized with the site's own vocabulary rather than trusted.
 * The server list gets the same treatment as the browser's: a record written
 * before a follow type was retired would otherwise reintroduce ids that
 * /api/v1/monitor rejects, which is exactly the failure that broke the Monitor
 * page for anyone following a Policy Manual part.
 *
 * Server ids keep their position and local additions are appended, so a
 * merge never reorders what the account already had.
 */
export function mergeWatchlists(
  server: readonly unknown[],
  local: readonly unknown[],
  knownIds?: ReadonlySet<string>
): MergeResult {
  const cleanServer = sanitizeFollows([...server], knownIds);
  const cleanLocal = sanitizeFollows([...local], knownIds);

  const seen = new Set(cleanServer);
  const added: string[] = [];
  for (const id of cleanLocal) {
    if (seen.has(id)) continue;
    seen.add(id);
    added.push(id);
  }

  const entityIds = [...cleanServer, ...added].slice(0, MAX_FOLLOWS);

  // What the browser offered and the rules refused. Reported so the caller can
  // say "we kept 12 of your 14" rather than silently losing two.
  const kept = new Set([...cleanServer, ...cleanLocal]);
  const rejected = [...new Set(local.filter((v): v is string => typeof v === "string" && !kept.has(v)))];

  const sameAsServer =
    entityIds.length === cleanServer.length && entityIds.every((id, i) => id === cleanServer[i]);

  return { entityIds, added: added.slice(0, Math.max(0, MAX_FOLLOWS - cleanServer.length)), rejected, changed: !sameAsServer };
}

// -----------------------------------------------------------------------------
// PER-DEVICE SYNC STATE
// -----------------------------------------------------------------------------

/**
 * Records that THIS browser has already folded its local list into the account.
 *
 * Kept deliberately contentless: a boolean and a timestamp, no email, no
 * account id, no follow ids. Anyone reading this browser's storage learns that
 * a sync happened, not who it belonged to or what was in it.
 */
export const SYNC_STATE_KEY = "immigrationclock.sync.v1";

export interface SyncState {
  /** The first-sign-in union has run on this device. */
  merged: boolean;
  /** Unix seconds, for support questions. Never sent anywhere. */
  at: number;
}

export function readSyncState(): SyncState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SYNC_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return parsed?.merged === true ? { merged: true, at: Number(parsed.at) || 0 } : null;
  } catch {
    // Unreadable storage means "not merged yet". Merging twice is harmless —
    // it is a union — so the safe answer on doubt is to merge again.
    return null;
  }
}

export function writeSyncState(nowSeconds: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SYNC_STATE_KEY, JSON.stringify({ merged: true, at: nowSeconds }));
  } catch {
    // Quota or private browsing. The cost is one extra union next load, which
    // is idempotent, so this must never surface to the reader.
  }
}

/**
 * Forget that this device has merged.
 *
 * Called on sign-out, so that signing in again — possibly as somebody else on a
 * shared machine — starts with a union rather than assuming the local list
 * already belongs to the account being signed into.
 */
export function clearSyncState(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SYNC_STATE_KEY);
  } catch {
    /* nothing to do */
  }
}
