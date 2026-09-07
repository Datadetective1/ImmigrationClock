// =============================================================================
// THE STORE MUST NOT BE READ FROM A CACHE
//
// WHAT HAPPENED, AND WHY NOTHING ELSE IN THIS SUITE COULD SEE IT
// --------------------------------------------------------------
// Next.js replaces the global `fetch` and, left alone, writes the response into
// its Data Cache. `RedisStore.command()` is one POST to one URL with a
// different body per key — exactly the shape that caches cleanly — so the FIRST
// answer for a given subscriber key was replayed for every later read and the
// store stopped being a store.
//
// The blast radius was the entire entitlement model. `accessForKey` is the call
// every gate makes, and this codebase documents it everywhere as the authority
// that a cookie is only a fast path for. With the read cached:
//
//   • a refunded, disputed, cancelled or lapsed subscriber KEPT Pro, because
//     the revocation the webhook had just written was never read back;
//   • a customer who had just paid could be refused, when the "no record yet"
//     answer was the one that got cached;
//   • the duplicate-subscription guard read stale state.
//
// It was found by running the built server and watching the key-value store
// receive ZERO requests while the route kept answering 200 for a subscription
// that had been cancelled. `export const dynamic = "force-dynamic"` on the
// routes did not prevent it.
//
// EVERY OTHER TEST IN THIS SUITE RUNS OUTSIDE THE NEXT RUNTIME. Vitest calls
// the route handlers directly with a mocked global fetch, so there is no
// patched fetch and no Data Cache, and the bug was invisible in green tests —
// which is precisely why it survived several billing audits.
//
// So this file guards the property at the SOURCE, which is the one place a
// node-environment test can still see it. It is a lint with a memory: if a new
// outbound call is added without `cache: "no-store"`, this fails and names it.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = (rel: string) => readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");

/**
 * Every module that makes a SERVER-SIDE call to something outside this process.
 *
 * The browser half of watchlist sync is deliberately absent: it already passes
 * `cache: "no-store"` and it runs in a real browser, where Next's Data Cache
 * does not exist.
 */
const OUTBOUND = [
  ["src/lib/billing/store.ts", "the subscriber store — entitlement itself"],
  ["src/lib/billing/stripe.ts", "the Stripe API — payments and subscriptions"],
  ["src/app/api/billing/signin/route.ts", "the sign-in link email"],
  ["src/lib/billing/onboarding.ts", "the welcome email"],
  ["src/lib/billing/newsletter-enrollment.ts", "Resend contacts and segments"],
  ["src/app/api/subscribe/route.ts", "newsletter signup"],
] as const;

describe("no server-side call to an external service may be cached", () => {
  for (const [file, what] of OUTBOUND) {
    it(`${file} opts out of the Next fetch cache (${what})`, () => {
      expect(
        src(file),
        `${file} calls out to ${what} without cache: "no-store". Next.js caches ` +
          `fetch by default, so the second call returns the first call's answer — ` +
          `which for the store means a revoked subscriber keeps Pro, and for an ` +
          `email means the message is never sent.`
      ).toContain('cache: "no-store"');
    });
  }

  it("the two that decide entitlement say WHY, so the line is not tidied away", () => {
    // A bare `cache: "no-store"` reads like boilerplate and gets removed by
    // someone cleaning up. These two carry the reason in the code.
    expect(src("src/lib/billing/store.ts")).toMatch(/NEVER CACHED|no-store/);
    expect(src("src/lib/billing/store.ts")).toMatch(/Data Cache/i);
    expect(src("src/lib/billing/stripe.ts")).toMatch(/Never cached/i);
  });

  it("the store's cache opt-out sits on the request that reads entitlement", () => {
    // Scoped rather than "the file contains the string somewhere": the option
    // has to be on RedisStore.command's fetch, which is the one every read and
    // every write goes through.
    const source = src("src/lib/billing/store.ts");
    const start = source.indexOf("private async command");
    expect(start, "RedisStore.command was renamed or removed").toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("private async get(", start));
    expect(body, "RedisStore.command can be served from a cache").toContain('cache: "no-store"');
  });

  it("the Stripe client's opt-out sits on the request that creates sessions", () => {
    const source = src("src/lib/billing/stripe.ts");
    const start = source.indexOf("private async request");
    expect(start, "StripeClient.request was renamed or removed").toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("async createCheckoutSession", start));
    expect(body, "a cached POST to Stripe would hand two buyers one session").toContain(
      'cache: "no-store"'
    );
  });
});
