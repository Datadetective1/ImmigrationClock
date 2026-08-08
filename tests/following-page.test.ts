// =============================================================================
// /following — the follow feature's own address
//
// The engine already existed and was already tested (tests/follows.test.ts, 29
// cases). What was missing was a place to find it: the homepage CTA pointed at
// /what-changed#follow, so "Follow a country or visa" landed a reader on a page
// about something else and left them to spot a section.
//
// These tests are about REACHABILITY and about the privacy claim the page
// makes, not about follow logic — that is covered where it lives, and
// duplicating it here would mean two suites drifting.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

/**
 * Source with comments removed.
 *
 * These files DISCUSS email and following at length in their headers — that is
 * the documentation working. Asserting against raw text would fail on prose and
 * pass on a real regression buried in a comment, which is exactly backwards.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const PAGE = read("src/app/following/page.tsx");
const HOME = read("src/app/page.tsx");
const DIGEST = read("src/components/ChangesForYou.tsx");

describe("the page exists and reuses the engine", () => {
  it("renders the existing FollowingPanel rather than a second implementation", () => {
    expect(PAGE).toMatch(/import \{ FollowingPanel \} from "@\/components\/FollowingPanel"/);
    expect(PAGE).toMatch(/<FollowingPanel \/>/);
  });

  it("does not re-implement any follow logic", () => {
    // Every follow primitive must come from the library, not be redefined here.
    for (const forbidden of ["toggleFollow", "writeStoredFollows", "STORAGE_KEY", "MAX_FOLLOWS"]) {
      expect(PAGE, `${forbidden} reimplemented on the page`).not.toContain(forbidden);
    }
  });

  it("carries metadata so it is a real destination, not a fragment", () => {
    expect(PAGE).toMatch(/buildMetadata\(/);
    expect(PAGE).toMatch(/path: "\/following"/);
  });

  it("explains the value to a first-time visitor", () => {
    expect(PAGE).toMatch(/Follow what matters to you/);
    expect(PAGE).toMatch(/countries, visas, agencies or immigration topics/i);
    expect(PAGE).toMatch(/without creating a personal immigration profile/i);
  });
});

describe("the homepage sends people here", () => {
  it("routes the CTA to /following", () => {
    expect(HOME).toMatch(/href: "\/following", label: "Follow a country or visa"/);
  });

  it("no longer deep-links into another page's section", () => {
    expect(HOME).not.toContain("/what-changed#follow");
  });
});

describe("the privacy model is stated, not assumed", () => {
  it("tells the reader their choices stay on the device", () => {
    expect(PAGE).toMatch(/stay on this device/i);
    expect(PAGE).toMatch(/local storage/i);
  });

  it("admits the consequence rather than hiding it", () => {
    // Not syncing is the cost of not holding the data. Saying so is the point.
    expect(PAGE).toMatch(/do not sync/i);
  });

  it("says following is not connected to the newsletter", () => {
    expect(PAGE).toMatch(/not personalized from what you follow|tells us nothing about your interests/i);
  });
});

describe("the digest is client-side, and stays that way", () => {
  it("is a client component", () => {
    expect(DIGEST.startsWith('"use client"')).toBe(true);
  });

  it("reuses buildDigest rather than re-deriving matches", () => {
    expect(DIGEST).toMatch(/import \{ buildDigest \} from "@\/lib\/follows"/);
    expect(DIGEST).toMatch(/buildDigest\(EVENT_INDEX, follows, since\)/);
  });

  it("TRANSMITS NOTHING — no fetch, no beacon, no image ping", () => {
    // The whole claim. A single fetch here would turn a local preference into a
    // server-side record of someone's immigration interests.
    for (const forbidden of ["fetch(", "sendBeacon", "XMLHttpRequest", "new Image(", "navigator.send"]) {
      expect(DIGEST, `${forbidden} in a component that must not transmit`).not.toContain(forbidden);
    }
  });

  it("never associates follows with an email address", () => {
    const src = code("src/components/ChangesForYou.tsx");
    expect(src).not.toMatch(/email/i);
    expect(src).not.toMatch(/subscribe/i);
  });

  it("keeps the last-visit stamp local and separate from the follow set", () => {
    expect(DIGEST).toMatch(/localStorage/);
    expect(DIGEST).toMatch(/immigrationclock\.lastSeen/);
    // A separate key: clearing follows must not erase the visit stamp.
    expect(DIGEST).not.toMatch(/immigrationclock\.follows\.v1/);
  });

  it("degrades honestly when there is no previous visit to compare to", () => {
    // Claiming "since your last visit" without knowing when that was would be a
    // small lie told to make a number look bigger.
    expect(DIGEST).toMatch(/since your last visit/);
    expect(DIGEST).toMatch(/in the last \$\{RECENT_DAYS\} days/);
  });

  it("survives storage being unavailable", () => {
    // Private mode throws on access. The digest must still render.
    expect(DIGEST).toMatch(/catch \{/);
  });
});

describe("no server-side follow storage was introduced", () => {
  it("adds no API route for follows", () => {
    // Only one route exists, and it must never learn what anyone follows.
    const src = code("src/app/api/subscribe/route.ts");
    expect(src).not.toMatch(/\bfollows?\b/i);
    expect(src).not.toMatch(/interests|watchlist|topics/i);
  });

  it("keeps the follow store in the browser only", () => {
    const src = code("src/lib/follows.ts");
    expect(src).toMatch(/localStorage/);
    expect(src).not.toMatch(/fetch\(/);
  });
});
