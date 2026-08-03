// =============================================================================
// FEDERAL REGISTER TRANSPORT — shared by the two adapters that read this API
//
// WHY THIS FILE EXISTS
// --------------------
// The Federal Register API returns a PAGE, not a result set. Both adapters used
// to read page one and stop, which is not a cap — it is silent data loss dressed
// as a number. Measured on 2026-08-02 against the store's own window
// (since=2025-01-01):
//
//   federal-register    read 100 of 4,196 matching documents  (2.4%)
//   executive-actions   read 100 of   630 matching documents  (15.9%)
//
// Neither run said so. Worse, each reported "N document(s) were not
// immigration-related" computed over that single page, which reads as a survey
// of the whole window and is not one. A reader searching /what-changed for a
// rule that exists would conclude it never happened — the precise failure this
// platform is built to prevent.
//
// `capEvents` already encodes the house rule for the other six adapters: a cap
// is legitimate, hiding that it engaged is not. This module applies the same
// rule to the transport layer, so the cap that bites is the one we chose
// (`ctx.limit`) rather than an accident of page size.
// =============================================================================

export const FR_API = "https://www.federalregister.gov/api/v1/documents.json";
export const FR_UA = { "User-Agent": "ImmigrationClock/1.0 (+https://immigrationclock.com)" };

/**
 * The API's maximum page size. Verified 2026-08-02: `per_page=1000` returns a
 * full 1,000 documents, so the whole 2025-to-date immigration corpus is five
 * requests rather than forty-two.
 */
const PAGE_SIZE = 1000;

/**
 * The API rejects any request whose window extends past 10,000 documents —
 * verified 2026-08-02: `per_page=1000&page=11` returns HTTP 400. Stopping at ten
 * pages keeps us inside that ceiling and reports the truncation instead of
 * failing the run. A window that wide should be narrowed with EVENTS_SINCE.
 */
const MAX_PAGES = 10;

export interface FrFetchResult<T> {
  documents: T[];
  /** Total matching documents the API itself reports, across every page. */
  reported: number;
  /**
   * Set when we stopped before reading every matching document. Carries the
   * reason, ready to surface as an adapter warning — never a bare boolean, so
   * it cannot be dropped on the floor.
   */
  truncation: string | null;
  /** Transport failure. Non-null means the adapter should report `failed`. */
  error: string | null;
}

/**
 * Read EVERY document matching `params`, following pagination.
 *
 * `params` must not set `per_page` or `page`; this function owns both. Partial
 * success is preserved: if page four fails after three good pages, the caller
 * gets three pages of real documents plus an explicit truncation notice, which
 * is more useful and more honest than discarding the lot.
 */
export async function fetchAllDocuments<T>(
  params: URLSearchParams,
  timeoutMs = 30_000
): Promise<FrFetchResult<T>> {
  const documents: T[] = [];
  let reported = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams(params);
    query.set("per_page", String(PAGE_SIZE));
    query.set("page", String(page));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let payload: { results?: T[]; count?: number };
    try {
      const res = await fetch(`${FR_API}?${query}`, { headers: FR_UA, signal: controller.signal });
      if (!res.ok) {
        // A first-page failure is a dead source. A later-page failure still left
        // us with real documents, so keep them and say what is missing.
        if (page === 1) {
          return {
            documents: [],
            reported: 0,
            truncation: null,
            error: `HTTP ${res.status} from the Federal Register API`,
          };
        }
        return {
          documents,
          reported,
          truncation:
            `read ${documents.length} of ${reported} matching document(s) — ` +
            `page ${page} returned HTTP ${res.status}. The newest are kept.`,
          error: null,
        };
      }
      payload = (await res.json()) as { results?: T[]; count?: number };
    } catch (err) {
      if (page === 1) {
        return {
          documents: [],
          reported: 0,
          truncation: null,
          error: `fetch failed: ${(err as Error)?.message ?? String(err)}`,
        };
      }
      return {
        documents,
        reported,
        truncation:
          `read ${documents.length} of ${reported} matching document(s) — ` +
          `page ${page} failed: ${(err as Error)?.message ?? String(err)}. The newest are kept.`,
        error: null,
      };
    } finally {
      clearTimeout(timer);
    }

    if (typeof payload.count === "number") reported = payload.count;
    const batch = payload.results ?? [];
    documents.push(...batch);

    // Either the API ran out of documents or we have them all. Both are a
    // complete read, not a truncated one.
    if (batch.length < PAGE_SIZE || documents.length >= reported) {
      return { documents, reported: Math.max(reported, documents.length), truncation: null, error: null };
    }
  }

  return {
    documents,
    reported,
    truncation:
      `read ${documents.length} of ${reported} matching document(s) — the Federal Register API ` +
      `serves at most ${PAGE_SIZE * MAX_PAGES} documents per query. The newest are kept; ` +
      "narrow the window with EVENTS_SINCE to reach the rest.",
    error: null,
  };
}

/**
 * Map with a concurrency ceiling.
 *
 * Both adapters fetch each document's full text to answer "who is affected".
 * That was a bare `Promise.all`, which was survivable only because pagination
 * was broken and capped the fan-out at one page. Reading the whole corpus turns
 * the same code into hundreds of simultaneous requests to a government host —
 * which gets throttled, and every throttled body silently degrades an event's
 * impact record to abstract-only. Six at a time is polite and still fast.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** How many full-text reads may be in flight at once. */
export const BODY_FETCH_CONCURRENCY = 6;
