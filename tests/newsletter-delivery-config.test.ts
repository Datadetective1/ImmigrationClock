// =============================================================================
// DELIVERY CONFIGURATION — the half of the pipeline nothing was watching
//
// THE FAILURE THESE TESTS EXIST FOR
// ---------------------------------
// The weekly newsletter was withheld for three consecutive weeks and every run
// was green. Three independent defects, all in the same seam — the boundary
// between "what the sender does" and "what the preflight checks":
//
//   1. The preflight resolved a locale's destination by reading
//      RESEND_AUDIENCE_<LOCALE> directly, while the sender resolved through
//      segmentIdFor(), which prefers the canonical RESEND_SEGMENT_<LOCALE>.
//      Migrating to the canonical names would have made the preflight stop
//      verifying anything at all — silently, and reporting success.
//
//   2. The preflight probed `/audiences/{id}/contacts` and treated any non-OK
//      response as BLOCKING. Resend has retired that path in favour of
//      `/segments/{id}/contacts`, which the sender was already updated for. The
//      first week an API key was configured, every locale would have 404'd and
//      preflight would have reported an outage at Resend on a week when Resend
//      was fine.
//
//   3. The alert that was supposed to announce the withheld delivery could not
//      be created, because `gh issue create --label` refuses unknown labels and
//      neither label existed. Its failure was swallowed into a ::warning:: on a
//      green run.
//
// Every one of them was invisible to the test suite because the code reached
// straight for `process.env` and the global `fetch`. The fix is as much about
// making this seam testable as about the three bugs.
// =============================================================================

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkAudiences } from "../scripts/newsletter-preflight";
import { contactPaths, liveContactCount } from "@/lib/newsletter/resend";
import { segmentIdFor, type EnvLookup } from "@/lib/newsletter/subscriber-language";

/** A minimally viable environment: everything present except the segments. */
const BASE_ENV = {
  NEXT_PUBLIC_CONTACT_EMAIL: "hello@immigrationclock.com",
  RESEND_API_KEY: "re_test",
};

/** A fetch that answers a fixed map of paths and records what it was asked. */
function fakeFetch(routes: Record<string, { status: number; body?: unknown }>) {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    const path = String(url).replace("https://api.test", "");
    calls.push(path);
    const hit = routes[path] ?? { status: 404 };
    return {
      ok: hit.status >= 200 && hit.status < 300,
      status: hit.status,
      json: async () => hit.body ?? {},
    } as Response;
  }) as typeof globalThis.fetch;
  return { impl, calls };
}

const deps = (env: EnvLookup, fetchImpl: typeof globalThis.fetch) => ({
  env,
  fetch: fetchImpl,
  apiBase: "https://api.test",
});

const contacts = (n: number, unsubscribed = 0) => ({
  data: [
    ...Array.from({ length: n }, (_, i) => ({ id: `c${i}`, unsubscribed: false })),
    ...Array.from({ length: unsubscribed }, (_, i) => ({ id: `u${i}`, unsubscribed: true })),
  ],
});

// =============================================================================
// 1. ONE RESOLVER, NOT TWO
// =============================================================================

describe("the preflight resolves destinations the way the sender does", () => {
  it("finds a segment configured under the CANONICAL name", () => {
    // The bug: this read RESEND_AUDIENCE_EN only, so a repository that had
    // migrated to RESEND_SEGMENT_EN — the migration the env-var family exists
    // to support — verified nothing and said so to nobody.
    const env = { ...BASE_ENV, RESEND_SEGMENT_EN: "seg_en" };
    const { impl, calls } = fakeFetch({ "/segments/seg_en/contacts": { status: 200, body: contacts(3) } });

    return checkAudiences(["en"], deps(env, impl)).then((v) => {
      expect(v.safe).toBe(true);
      expect(v.blocking).toEqual([]);
      expect(calls).toContain("/segments/seg_en/contacts");
      expect(v.warnings.join(" ")).not.toMatch(/unset|no segment configured/);
    });
  });

  it("still finds one configured under the DEPRECATED alias", async () => {
    // The currently-deployed configuration. It must keep working through the
    // cutover — that is the entire reason the alias is still read.
    const env = { ...BASE_ENV, RESEND_AUDIENCE_EN: "aud_en" };
    const { impl } = fakeFetch({ "/segments/aud_en/contacts": { status: 200, body: contacts(3) } });

    const v = await checkAudiences(["en"], deps(env, impl));
    expect(v.safe).toBe(true);
    expect(v.blocking).toEqual([]);
  });

  it("agrees with segmentIdFor for every shape of configuration", () => {
    // The property that matters is not which name wins, it is that ONE function
    // decides. Both callers now go through it.
    const cases: EnvLookup[] = [
      { RESEND_SEGMENT_EN: "canonical" },
      { RESEND_AUDIENCE_EN: "alias" },
      { RESEND_SEGMENT_EN: "canonical", RESEND_AUDIENCE_EN: "alias" },
      {},
    ];
    for (const env of cases) {
      const expected = segmentIdFor("en", env);
      expect(segmentIdFor("en", { ...BASE_ENV, ...env })).toBe(expected);
    }
    // And the canonical name wins when both are present.
    expect(segmentIdFor("en", { RESEND_SEGMENT_EN: "canonical", RESEND_AUDIENCE_EN: "alias" })).toBe(
      "canonical"
    );
  });

  it("names BOTH variables when a locale has no destination, so the fix is obvious", async () => {
    const { impl } = fakeFetch({});
    const v = await checkAudiences(["ar"], deps(BASE_ENV, impl));

    expect(v.safe).toBe(true); // a quiet language is not a failure
    const warning = v.warnings.find((w) => w.includes("ar"))!;
    expect(warning).toContain("RESEND_SEGMENT_AR");
    expect(warning).toContain("RESEND_AUDIENCE_AR");
  });
});

// =============================================================================
// 2. THE ENDPOINT THAT WOULD HAVE WITHHELD DELIVERY ON A HEALTHY ACCOUNT
// =============================================================================

describe("the contacts probe tries both API generations", () => {
  it("prefers /segments, which is what the current API documents", async () => {
    const env = { ...BASE_ENV, RESEND_SEGMENT_EN: "seg_en" };
    const { impl, calls } = fakeFetch({
      "/segments/seg_en/contacts": { status: 200, body: contacts(5) },
      "/audiences/seg_en/contacts": { status: 200, body: contacts(999) },
    });

    const v = await checkAudiences(["en"], deps(env, impl));
    expect(v.safe).toBe(true);
    expect(calls).toEqual(["/segments/seg_en/contacts"]);
  });

  it("falls back to /audiences for an id created under the old API", async () => {
    // THE REGRESSION. Before this, a 404 from /audiences was the ONLY answer
    // preflight could get for a migrated account, and it recorded it as
    // blocking. This is the case that would have withheld three more weeks of
    // delivery the moment RESEND_API_KEY was set.
    const env = { ...BASE_ENV, RESEND_AUDIENCE_EN: "aud_en" };
    const { impl, calls } = fakeFetch({
      "/segments/aud_en/contacts": { status: 404 },
      "/audiences/aud_en/contacts": { status: 200, body: contacts(4) },
    });

    const v = await checkAudiences(["en"], deps(env, impl));
    expect(v.safe).toBe(true);
    expect(v.blocking).toEqual([]);
    expect(calls).toEqual(["/segments/aud_en/contacts", "/audiences/aud_en/contacts"]);
  });

  it("blocks only when EVERY path fails, and says what each one said", async () => {
    const env = { ...BASE_ENV, RESEND_SEGMENT_EN: "seg_en" };
    const { impl } = fakeFetch({
      "/segments/seg_en/contacts": { status: 500 },
      "/audiences/seg_en/contacts": { status: 503 },
    });

    const v = await checkAudiences(["en"], deps(env, impl));
    expect(v.safe).toBe(false);
    const reason = v.blocking.join(" ");
    expect(reason).toContain("500");
    expect(reason).toContain("503");
    expect(reason).toContain("no Resend segment could be verified");
  });

  it("does not retry the old path when the new one answered with a bad shape", async () => {
    // A 200 with an unreadable body is a finding, not a reason to keep looking:
    // the endpoint answered. Retrying would report the wrong diagnosis.
    const env = { ...BASE_ENV, RESEND_SEGMENT_EN: "seg_en" };
    const { impl, calls } = fakeFetch({
      "/segments/seg_en/contacts": { status: 200, body: { unexpected: true } },
      "/audiences/seg_en/contacts": { status: 200, body: contacts(4) },
    });

    const v = await checkAudiences(["en"], deps(env, impl));
    expect(v.safe).toBe(false);
    expect(v.blocking.join(" ")).toContain("unexpected shape");
    expect(calls).toEqual(["/segments/seg_en/contacts"]);
  });
});

describe("counting who would actually receive the broadcast", () => {
  it("excludes unsubscribed contacts, who are still returned by the API", () => {
    expect(liveContactCount(contacts(3, 2))).toBe(3);
  });

  it("returns null rather than 0 for a body it cannot read", () => {
    // The difference is load-bearing at both call sites: the sender prints
    // "unknown" instead of a reassuring zero, and the preflight reports an
    // unexpected shape instead of an empty audience.
    expect(liveContactCount({})).toBeNull();
    expect(liveContactCount(null)).toBeNull();
    expect(liveContactCount({ data: "nope" })).toBeNull();
    expect(liveContactCount(contacts(0))).toBe(0);
  });

  it("declares both paths in one place, so the two callers cannot drift", () => {
    expect(contactPaths("x")).toEqual(["/segments/x/contacts", "/audiences/x/contacts"]);

    const sender = readFileSync(resolve("scripts/send-newsletter.ts"), "utf8");
    const preflight = readFileSync(resolve("scripts/newsletter-preflight.ts"), "utf8");
    for (const [name, src] of [["sender", sender], ["preflight", preflight]] as const) {
      expect(src, name).toContain("contactPaths");
      // Neither may hand-roll the path again.
      expect(src, name).not.toMatch(/`\/audiences\/\$\{[^}]+\}\/contacts`/);
    }
  });
});

// =============================================================================
// 3. AN EMPTY AUDIENCE IS QUIET, NOT BROKEN
// =============================================================================

describe("what counts as unsafe", () => {
  it("warns rather than blocks when a segment has no subscribers", async () => {
    const env = { ...BASE_ENV, RESEND_SEGMENT_EN: "seg_en" };
    const { impl } = fakeFetch({ "/segments/seg_en/contacts": { status: 200, body: contacts(0) } });

    const v = await checkAudiences(["en"], deps(env, impl));
    expect(v.safe).toBe(true);
    expect(v.warnings.join(" ")).toMatch(/0 subscribed contacts/);
  });

  it("still blocks a missing contact address — the reason three weeks were held", async () => {
    const env = { RESEND_API_KEY: "re_test", RESEND_SEGMENT_EN: "seg_en" };
    const { impl } = fakeFetch({ "/segments/seg_en/contacts": { status: 200, body: contacts(3) } });

    const v = await checkAudiences(["en"], deps(env, impl));
    expect(v.safe).toBe(false);
    expect(v.blocking.join(" ")).toContain("NEXT_PUBLIC_CONTACT_EMAIL");
  });

  it("does not let a missing API key mask a missing contact address", async () => {
    // A TRAP RATHER THAN A LIVE BUG, fixed while the function was open.
    //
    // The early return for "no API key" said `safe: true` unconditionally while
    // `blocking` already held the contact-address finding. It never surfaced,
    // because main() recomputes the verdict from the merged blocking list and
    // ignores this field — which is exactly what makes it a trap: the function
    // is now exported and callable, and the next caller would have believed it.
    const { impl } = fakeFetch({});
    const v = await checkAudiences(["en"], deps({}, impl));

    expect(v.safe).toBe(false);
    expect(v.blocking.join(" ")).toContain("NEXT_PUBLIC_CONTACT_EMAIL");
    expect(v.warnings.join(" ")).toContain("RESEND_API_KEY not set");
  });
});

// =============================================================================
// 4. THE ALARM MUST NOT BE DEFEATED BY ITS OWN DECORATION
// =============================================================================

describe("the alert issue", () => {
  const workflow = readFileSync(resolve(".github/workflows/newsletter.yml"), "utf8");
  const script = readFileSync(resolve(".github/scripts/alert-issue.sh"), "utf8");

  it("never calls gh issue create with a bare --label from the workflow", () => {
    // `gh issue create --label` refuses the WHOLE creation when a label is
    // unknown. Neither "automated" nor "newsletter" existed, so every alert
    // this workflow ever tried to raise failed at the last step and was
    // swallowed into a warning on a green run.
    expect(workflow).not.toMatch(/gh issue create/);
    expect(workflow.match(/alert-issue\.sh/g) ?? []).toHaveLength(2);
  });

  it("creates the labels it uses, so a fresh repository can alert", () => {
    expect(script).toContain("gh label create");
    expect(script).toContain("--force");
  });

  it("retries WITHOUT labels, so filing can never cost the alert", () => {
    // The load-bearing line. It makes the alarm survive a label being renamed,
    // deleted or restricted at any point in the future — the class of change
    // nobody thinks to test.
    const invocations = script
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .filter((line) => line.includes("gh issue create"));
    expect(invocations).toHaveLength(2);
    expect(script).toMatch(/retrying without labels/i);
  });

  it("escalates to ::error:: when the alert genuinely cannot be delivered", () => {
    expect(script).toContain("::error::ALERT NOT DELIVERED");
  });

  it("exits 0, so a broken alarm does not become a second confusing failure", () => {
    expect(script.trimEnd().endsWith("exit 0")).toBe(true);
  });
});
