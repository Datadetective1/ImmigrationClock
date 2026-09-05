// =============================================================================
// THE BROWSER'S HALF OF WATCHLIST SYNC
//
// A thin transport over /api/billing/watchlist. It holds no policy: the server
// decides who may sync, what a valid follow is, and how many are allowed. This
// file only carries bytes and classifies the answer.
//
// WHY THE STATUS CODE IS THE ENTITLEMENT PROBE
// --------------------------------------------
// There is no "am I Pro?" endpoint and there should not be one. The watchlist
// route already answers the question authoritatively as a side effect of doing
// its job: 401 not signed in, 402 signed in but not paying, 503 not configured,
// 200 here is your list. Adding a second endpoint that reports entitlement
// would be a second place for the answer to be wrong.
//
// NOTHING HERE IS A GATE. A browser that decides it is Pro gains exactly
// nothing: every write goes back through the same route, which re-reads the
// subscription from the store before it stores a single id. The client state is
// for what the reader is TOLD, never for what they are ALLOWED.
// =============================================================================

const ENDPOINT = "/api/billing/watchlist";

/**
 * Has anyone signed in on this browser?
 *
 * Read from the readable companion cookie, never from the signed one. This
 * exists so an ANONYMOUS reader makes no request at all: probing on every load
 * put a 503 in the console of every visitor to /following, which is console
 * noise on the free product in service of a paid one.
 *
 * It is a hint, not a gate. A forged value buys one request that answers 401,
 * and every real decision is still made server-side from the signed cookie and
 * a live read of the subscription.
 */
export function hasSessionHint(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)ic_session=1(?:;|$)/.test(document.cookie || "");
}

/** Why sync is or is not running, in terms the UI can show without lying. */
export type SyncStatus =
  /** Not signed in, not paying, or not configured. The free path, unchanged. */
  | "off"
  /** Signed in and paying; the list is on the server. */
  | "on"
  /** We asked and could not tell — offline, a 500, a timeout. */
  | "unknown";

export interface FetchResult {
  status: SyncStatus;
  entityIds: string[];
  /** HTTP status, for tests and for a support log. Never shown to a reader. */
  httpStatus: number;
}

function classify(httpStatus: number): SyncStatus {
  if (httpStatus === 200) return "on";
  // 401 not signed in · 402 no live subscription · 503 not configured.
  // All three mean the same thing to a reader: this browser keeps its own list.
  if (httpStatus === 401 || httpStatus === 402 || httpStatus === 503) return "off";
  return "unknown";
}

/**
 * Read the account's watchlist, and learn whether syncing is available at all.
 *
 * Never throws. A network failure is "unknown", which the caller treats as
 * "leave local storage alone" — the one outcome that cannot lose data.
 */
export async function fetchServerWatchlist(signal?: AbortSignal): Promise<FetchResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
      // The entitlement cookie is httpOnly and same-origin; nothing is attached
      // by hand, and no token is ever readable by script.
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    const status = classify(res.status);
    if (status !== "on") return { status, entityIds: [], httpStatus: res.status };

    const body = (await res.json()) as { entityIds?: unknown };
    const entityIds = Array.isArray(body.entityIds)
      ? body.entityIds.filter((v): v is string => typeof v === "string")
      : [];
    return { status: "on", entityIds, httpStatus: res.status };
  } catch {
    return { status: "unknown", entityIds: [], httpStatus: 0 };
  }
}

export interface SaveResult {
  status: SyncStatus;
  /** The list the server actually stored, after its own sanitizing and cap. */
  entityIds: string[];
  httpStatus: number;
}

/**
 * Replace the account's watchlist.
 *
 * PUT rather than PATCH because the browser always knows the whole list — there
 * is no partial state to reconcile — and a replace cannot half-apply.
 *
 * The server's response is authoritative: it may have dropped ids the browser
 * thought were fine, or capped the list, and the caller adopts what came back
 * rather than what it sent.
 */
export async function saveServerWatchlist(
  entityIds: readonly string[],
  signal?: AbortSignal
): Promise<SaveResult> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({ entityIds: [...entityIds] }),
      signal,
    });
    const status = classify(res.status);
    if (status !== "on") return { status, entityIds: [], httpStatus: res.status };

    const body = (await res.json()) as { entityIds?: unknown };
    const stored = Array.isArray(body.entityIds)
      ? body.entityIds.filter((v): v is string => typeof v === "string")
      : [];
    return { status: "on", entityIds: stored, httpStatus: res.status };
  } catch {
    return { status: "unknown", entityIds: [], httpStatus: 0 };
  }
}
