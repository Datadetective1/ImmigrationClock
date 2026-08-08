// =============================================================================
// ADAPTER HTTP — one fetch that survives a bad thirty seconds
//
// WHY THIS EXISTS
// ---------------
// On 2026-08-06 the CourtListener request timed out once. That single abort set
// `failed: true` on the federal-courts adapter, which set `ok: false` in
// events.json, which newsletter-preflight.ts read as a blocking anomaly — and
// the week's issue was built, archived, deployed and never mailed.
//
// Nothing retried it, because nothing could: build-events.ts only exits
// non-zero when EVERY adapter fails, so `npm run prebuild` returned 0 and the
// workflow's three-attempt refresh loop never fired. One source having a bad
// thirty seconds cost a newsletter, silently.
//
// So retries belong at the request, where a transient failure is still
// recoverable and still cheap.
//
// WHAT IS AND IS NOT RETRIED
// --------------------------
// Retried: timeouts, aborts, DNS and socket errors, 429, and 5xx. These are the
// server or the network having a moment, and the same request later usually
// works.
//
// Not retried: 4xx other than 429. A 404 or a 400 means we asked the wrong
// question, and asking it three more times just takes longer to fail. A source
// that has genuinely moved SHOULD surface as a failure — that is the format
// change preflight exists to catch, and hiding it behind retries would be the
// more dangerous bug.
// =============================================================================

/** Status codes worth asking again about. */
function retryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * Network-layer errors worth asking again about.
 *
 * Matched on message text because undici surfaces most of these as a generic
 * `TypeError: fetch failed` whose real cause is only in `cause`, and an
 * AbortError from our own timeout has no code at all.
 */
export function isTransientNetworkError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (e?.name === "AbortError" || e?.name === "TimeoutError") return true;
  const code = e?.cause?.code ?? "";
  if (/^(ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR_)/.test(code)) return true;
  const text = `${e?.message ?? ""} ${e?.cause?.message ?? ""}`;
  return /fetch failed|aborted|timed? ?out|socket hang up|network|connection reset/i.test(text);
}

export interface FetchRetryOptions {
  /** Total attempts, including the first. */
  attempts?: number;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  headers?: Record<string, string>;
  /** Injected by tests; defaults to a real delay. */
  sleep?: (ms: number) => Promise<void>;
  /** Called for each retried failure, so the adapter can report what happened. */
  onRetry?: (attempt: number, reason: string) => void;
}

const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * fetch with a per-attempt timeout and bounded retries.
 *
 * Throws the last error, or returns the last response, exactly as `fetch`
 * would — so a caller that does not care about retries needs no other changes.
 *
 * Backoff is linear (1s, 2s) rather than exponential: these are eight
 * government endpoints polled once a run, not a hot loop, and a build that
 * stalls for a minute of backoff is its own problem.
 */
export async function fetchWithRetry(url: string, opts: FetchRetryOptions = {}): Promise<Response> {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const sleep = opts.sleep ?? nap;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: opts.headers,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (retryableStatus(res.status) && attempt < attempts) {
        opts.onRetry?.(attempt, `HTTP ${res.status}`);
        await sleep(attempt * 1000);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      // A non-transient throw is a real fault. Fail immediately rather than
      // spending two more timeouts confirming it.
      if (!isTransientNetworkError(err) || attempt === attempts) throw err;
      opts.onRetry?.(attempt, (err as Error)?.message ?? String(err));
      await sleep(attempt * 1000);
    }
  }

  throw lastError;
}
