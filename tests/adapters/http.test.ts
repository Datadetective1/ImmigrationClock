// =============================================================================
// ADAPTER HTTP — retries, and the failures that must NOT be retried
//
// The bug this covers cost a newsletter. On 2026-08-06 one CourtListener
// request aborted, the adapter reported failed=true, preflight read that as an
// anomaly, and four editions were built, archived, deployed and never mailed.
//
// The opposite mistake would be worse: retrying a 404 three times hides a
// source that genuinely moved, which is exactly the silent failure the whole
// preflight layer exists to catch. So both directions are tested.
// =============================================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithRetry, isTransientNetworkError } from "@/domains/graph/adapters/http";

const noSleep = () => Promise.resolve();
const ok = (body = "{}") => new Response(body, { status: 200 });

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Install a fetch stub and return the spy. */
function stubFetch(impl: (url: string) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("classifying a failure", () => {
  it("treats an abort as transient — this is the exact 2026-08-06 error", () => {
    const err = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    expect(isTransientNetworkError(err)).toBe(true);
  });

  it("treats undici's generic wrapper as transient", () => {
    expect(isTransientNetworkError(new TypeError("fetch failed"))).toBe(true);
  });

  it("treats socket and DNS errors as transient", () => {
    for (const code of ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]) {
      const err = Object.assign(new TypeError("fetch failed"), { cause: { code } });
      expect(isTransientNetworkError(err), code).toBe(true);
    }
  });

  it("does NOT treat a programming error as transient", () => {
    expect(isTransientNetworkError(new TypeError("x.map is not a function"))).toBe(false);
    expect(isTransientNetworkError(new SyntaxError("Unexpected token < in JSON"))).toBe(false);
  });
});

describe("fetchWithRetry", () => {
  it("returns the first successful response without retrying", async () => {
    const spy = stubFetch(async () => ok('{"results":[]}'));
    const res = await fetchWithRetry("https://example.gov/a", { sleep: noSleep });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("recovers from a single abort — the failure that cost a newsletter", async () => {
    let n = 0;
    const spy = stubFetch(async () => {
      if (++n === 1) throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
      return ok('{"results":[1]}');
    });
    const res = await fetchWithRetry("https://example.gov/a", { sleep: noSleep });
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("retries a 5xx and a 429, which are the server having a moment", async () => {
    for (const status of [500, 502, 503, 429]) {
      let n = 0;
      const spy = stubFetch(async () => {
        if (++n === 1) return new Response("", { status });
        return ok();
      });
      const res = await fetchWithRetry("https://example.gov/a", { sleep: noSleep });
      expect(res.status, `${status}`).toBe(200);
      expect(spy, `${status}`).toHaveBeenCalledTimes(2);
    }
  });

  it("does NOT retry a 404 — a moved source must surface, not be papered over", async () => {
    const spy = stubFetch(async () => new Response("", { status: 404 }));
    const res = await fetchWithRetry("https://example.gov/gone", { sleep: noSleep });
    expect(res.status).toBe(404);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 400", async () => {
    const spy = stubFetch(async () => new Response("", { status: 400 }));
    await fetchWithRetry("https://example.gov/bad", { sleep: noSleep });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a non-network throw", async () => {
    const spy = stubFetch(async () => {
      throw new SyntaxError("Unexpected token <");
    });
    await expect(fetchWithRetry("https://example.gov/a", { sleep: noSleep })).rejects.toThrow(SyntaxError);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured attempts and rethrows", async () => {
    const spy = stubFetch(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    await expect(
      fetchWithRetry("https://example.gov/a", { attempts: 3, sleep: noSleep })
    ).rejects.toThrow(/aborted/);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("reports each retry, so the adapter can say what happened", async () => {
    let n = 0;
    stubFetch(async () => {
      if (++n < 3) throw Object.assign(new Error("aborted"), { name: "AbortError" });
      return ok();
    });
    const notes: string[] = [];
    await fetchWithRetry("https://example.gov/a", {
      sleep: noSleep,
      onRetry: (attempt, reason) => notes.push(`${attempt}:${reason}`),
    });
    expect(notes).toEqual(["1:aborted", "2:aborted"]);
  });

  it("backs off further on each successive attempt", async () => {
    const waits: number[] = [];
    stubFetch(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    });
    await expect(
      fetchWithRetry("https://example.gov/a", {
        attempts: 3,
        sleep: async (ms) => void waits.push(ms),
      })
    ).rejects.toThrow();
    expect(waits).toEqual([1000, 2000]);
  });
});
