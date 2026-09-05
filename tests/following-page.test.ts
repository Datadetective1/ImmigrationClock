// =============================================================================
// /following — the follow feature's own address, and its primary action
//
// The engine already existed and was already tested (tests/follows.test.ts).
// What was missing was first a place to find it — the homepage CTA pointed at
// /what-changed#follow — and then, once the route was fixed, an obvious thing
// to do on arrival: the page opened with suggestion chips and a button labelled
// "Choose topics", which names neither of the two things "Follow a country or
// visa" promised.
//
// These tests are about REACHABILITY, the primary action, and the privacy claim
// the page makes. Follow logic is covered where it lives; duplicating it here
// would mean two suites drifting.
//
// WHY SOURCE TEXT AND NOT A RENDERED DOM
// This suite runs in `environment: "node"` with no DOM library in the project
// (see vitest.config.ts), so a component cannot be mounted here. What is
// assertable is the contract: which strings the reader is shown, which handlers
// the controls are wired to, and which modules a file is allowed to import.
// Anything with real behaviour behind it — search matching, group ordering, the
// period a digest may claim — was written as a pure function in @/lib/follows
// precisely so it could be tested for real, and it is, in follows.test.ts.
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
const PANEL = read("src/components/FollowingPanel.tsx");
const PANEL_CODE = code("src/components/FollowingPanel.tsx");
const DIGEST_CODE = code("src/components/ChangesForYou.tsx");

/**
 * Whitespace collapsed, for assertions about a SENTENCE.
 *
 * JSX wraps prose at whatever column the formatter chose, so a promise the
 * reader sees as one line can be three in the source. Matching the raw text
 * would make a reformat look like a removed promise.
 */
const prose = (s: string) => s.replace(/\s+/g, " ");
const PAGE_PROSE = prose(PAGE);

describe("the page exists and reuses the engine", () => {
  it("renders the existing FollowingPanel rather than a second implementation", () => {
    expect(PAGE).toMatch(/import \{ FollowingPanel \} from "@\/components\/FollowingPanel"/);
    expect(PAGE).toMatch(/<FollowingPanel showChanges=\{false\} openWhenEmpty \/>/);
  });

  it("does not re-implement any follow logic", () => {
    // Every follow primitive must come from the library, not be redefined here.
    for (const forbidden of ["toggleFollow", "writeStoredFollows", "STORAGE_KEY", "MAX_FOLLOWS"]) {
      expect(PAGE, `${forbidden} reimplemented on the page`).not.toContain(forbidden);
    }
  });

  it("does not open a second main landmark inside the layout's", () => {
    // src/app/layout.tsx already renders <main id="main-content">. Two mains
    // give a screen reader user two "main" targets and a choice they should
    // never have to make.
    expect(code("src/app/following/page.tsx")).not.toMatch(/<main[\s>]/);
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

  it("puts the choosing above the reading, and the small print below both", () => {
    // Order is the argument: choose, then see what it gave you, then read how
    // it works. An empty digest above an empty picker asks the reader to
    // imagine the payoff.
    const panelAt = PAGE.indexOf("<FollowingPanel");
    const digestAt = PAGE.indexOf("<ChangesForYou");
    const smallPrintAt = PAGE.indexOf("How this works");
    expect(panelAt).toBeGreaterThan(-1);
    expect(panelAt).toBeLessThan(digestAt);
    expect(digestAt).toBeLessThan(smallPrintAt);
  });
});

describe("the primary action names what a visitor came for", () => {
  it("says 'Choose countries, visas & topics', not 'Choose topics'", () => {
    expect(PANEL).toMatch(/Choose countries, visas & topics/);
    // The old label named none of the categories the homepage CTA promised.
    expect(PANEL_CODE).not.toMatch(/"Choose topics"/);
  });

  it("renders that label as the panel's accent-filled primary button", () => {
    expect(PANEL_CODE).toMatch(/aria-expanded=\{picking\}/);
    expect(PANEL_CODE).toMatch(/\{picking \? "Done choosing" : CHOOSE_CTA\}/);
    // Filled, not the outlined secondary it used to be — one obvious action.
    expect(PANEL_CODE).toMatch(/bg-accent text-ink-950 shadow-card/);
  });

  it("opens the picker in place rather than sending the reader elsewhere", () => {
    expect(PANEL_CODE).toMatch(/setPicking\(\(p\) => !p\);/);
    expect(PANEL_CODE).toMatch(/aria-controls="follow-picker"/);
    expect(PANEL_CODE).toMatch(/id="follow-picker"/);
  });

  it("moves focus to the search field when a CLICK opens the picker", () => {
    expect(PANEL_CODE).toMatch(/if \(picking && focusOnOpen\.current\) searchRef\.current\?\.focus\(\)/);
    expect(PANEL_CODE).toMatch(/focusOnOpen\.current = true;/);
  });

  it("opens the picker for a first-time visitor, without stealing focus on load", () => {
    // /following passes openWhenEmpty; the automatic open must not move focus,
    // because dropping a screen reader user into the middle of a page they have
    // not heard the top of yet is worse than one extra Tab.
    expect(PAGE).toMatch(/<FollowingPanel showChanges=\{false\} openWhenEmpty \/>/);
    expect(PANEL_CODE).toMatch(/if \(openWhenEmpty && follows\.length === 0\) setPicking\(true\)/);
    expect(PANEL_CODE).toMatch(/autoOpened\.current = true;/);
  });

  it("leaves the automatic open OFF for the other surfaces", () => {
    // /what-changed and /for-you are pages about something else with a follow
    // panel on them. 106 options unfurled by default would shove them aside.
    expect(PANEL_CODE).toMatch(/openWhenEmpty = false,/);
    for (const path of ["src/app/what-changed/page.tsx", "src/app/for-you/page.tsx"]) {
      expect(code(path), path).toMatch(/<FollowingPanel \/>/);
    }
  });

  it("lets a reader close the picker and keeps it closed", () => {
    // The automatic open is a starting position, not a state the component
    // insists on: the guard fires once, on hydration.
    expect(PANEL_CODE).toMatch(/if \(!hydrated \|\| autoOpened\.current\) return;/);
  });
});

describe("the four categories are exposed, not buried", () => {
  it("names Countries, Visas, Agencies and Topics as categories", () => {
    const labels = read("src/lib/entity-labels.ts");
    expect(labels).toMatch(/country: "Countries"/);
    expect(labels).toMatch(/visa: "Visas"/);
    expect(labels).toMatch(/agency: "Agencies"/);
    expect(labels).toMatch(/topic: "Topics"/);
  });

  it("leads the picker with those four, in that order", () => {
    // The ordering itself is asserted against the real archive in
    // follows.test.ts; this pins the declaration it reads from.
    expect(code("src/lib/follows.ts")).toMatch(
      /PRIMARY_FOLLOW_TYPES = \["country", "visa", "agency", "topic"\]/
    );
  });

  it("offers them as one-tap filters as well as headings", () => {
    expect(PANEL_CODE).toMatch(/CATEGORY_FILTERS\.map/);
    expect(PANEL_CODE).toMatch(/aria-label="Filter by category"/);
    expect(PANEL_CODE).toMatch(/SHORT_TYPE_LABEL\[group\.type\]/);
  });

  it("gives the search field a real label, not a placeholder pretending to be one", () => {
    expect(PANEL).toMatch(/Search countries, visas, agencies, or topics/);
    expect(PANEL_CODE).toMatch(/htmlFor="follow-search"/);
    expect(PANEL_CODE).toMatch(/id="follow-search"/);
  });

  it("reuses the library's search instead of a second filter implementation", () => {
    expect(PANEL_CODE).toMatch(/filterGroups\(GROUPED, \{ query, type: category \}\)/);
    // No hand-rolled toLowerCase().includes() loop left behind in the component.
    expect(PANEL_CODE).not.toMatch(/label\.toLowerCase\(\)\.includes/);
  });
});

describe("adding, removing and clearing follows", () => {
  it("adds a follow from the picker and from the suggestions", () => {
    // Both rows call the same toggle from useFollows — there is no second path
    // into storage. toggleFollow's own behaviour is covered in follows.test.ts.
    // syncStatus was added to the same destructure when watchlist sync shipped;
    // the assertion is about there being ONE path into storage, not about the
    // exact field list, so it pins the call rather than the shape.
    expect(PANEL_CODE).toMatch(/const \{ follows, toggle, clear, hydrated.*\} = useFollows\(KNOWN_IDS\)/);
    expect(PANEL_CODE).toMatch(/onClick=\{\(\) => toggle\(item\.entityId\)\}/);
  });

  it("removes a follow by clicking its chip, with an accessible name that says so", () => {
    expect(PANEL_CODE).toMatch(/onClick=\{\(\) => toggle\(id\)\}/);
    expect(PANEL_CODE).toMatch(/aria-label=\{`Stop following \$\{labelForEntity\(id\)\}`\}/);
  });

  it("marks picker chips as pressed so state is not colour-only", () => {
    expect(PANEL_CODE).toMatch(/aria-pressed=\{on\}/);
  });

  it("shows the selected follows under a heading that names them", () => {
    expect(PANEL).toMatch(/You're following/);
    expect(PANEL_CODE).toMatch(/\{follows\.map\(\(id\) => \(/);
  });

  it("offers Clear all, wired to the hook rather than to storage directly", () => {
    expect(PANEL).toMatch(/Clear all/);
    expect(PANEL_CODE).toMatch(/onClick=\{clear\}/);
  });

  it("keeps the picker and the digest below it in step, within the same page", () => {
    // Two components, two instances of the hook, one list. `storage` fires only
    // in OTHER tabs, so without this the digest under the chips would show the
    // previous answer until a reload.
    const hook = code("src/hooks/useFollows.ts");
    expect(hook).toMatch(/SYNC_EVENT = "immigrationclock:follows-changed"/);
    expect(hook).toMatch(/window\.dispatchEvent\(new CustomEvent\(SYNC_EVENT/);
    expect(hook).toMatch(/window\.addEventListener\(SYNC_EVENT, onSync\)/);
    // A DOM event inside one page — still nothing leaves the browser.
    expect(hook).not.toMatch(/fetch\(|sendBeacon|XMLHttpRequest/);
    // And the write still goes through the one storage adapter.
    expect(hook).toMatch(/writeStoredFollows\(next\)/);
  });

  it("keeps every control a real button with a real hit area", () => {
    // Chips are fingers-on-glass targets; text-xs/py-1 pills were too small.
    expect(PANEL_CODE).not.toMatch(/<div[^>]*onClick=/);
    const chipSizes = PANEL_CODE.match(/rounded-full border[^"`]*py-\d/g) ?? [];
    expect(chipSizes.length).toBeGreaterThan(0);
    for (const cls of chipSizes) expect(cls, cls).not.toMatch(/py-1(?![.\d])/);
  });
});

describe("suggestions are a quick start, not the navigation", () => {
  it("labels them 'Popular things to follow'", () => {
    expect(PANEL).toMatch(/Popular things to follow/);
  });

  it("still derives them from the archive rather than a hardcoded list", () => {
    // A suggestion with no events behind it teaches the reader the feature is
    // broken. Derived from CATALOG, they cannot go stale.
    expect(PANEL_CODE).toMatch(/const SUGGESTED = \(\(\) => \{/);
    expect(PANEL_CODE).toMatch(/CATALOG\.filter/);
  });

  it("disappears entirely once the reader has follows of their own", () => {
    // Their list and their changes are the point of the page from then on; our
    // recommendations are not competing furniture.
    expect(PANEL_CODE).toMatch(/\{!picking && follows\.length === 0 \? \(/);
  });
});

describe("the picker does not recommend the worst choices", () => {
  it("shows no event count on agencies", () => {
    // USCIS (257) and DHS (247) are the two biggest numbers in the catalogue
    // and the two least useful things to follow, because nearly every document
    // we record is a DHS document. A visible count is a recommendation.
    expect(PANEL_CODE).toMatch(/item\.type === "agency" \? null : \(/);
  });

  it("says why, rather than leaving the gap unexplained", () => {
    expect(prose(PANEL)).toMatch(/Nearly every recorded change names an agency, so following one is a wide net\./);
  });

  it("still offers every agency, and follows them the same way", () => {
    // De-emphasis is presentational. The catalogue, the toggle and the stored
    // ids are untouched — agency follows already in a browser keep working.
    expect(code("src/lib/follows.ts")).toMatch(/FOLLOWABLE_TYPES = \[[\s\S]*?"agency"/);
    expect(PANEL_CODE).toMatch(/CATEGORY_FILTERS/);
    expect(PANEL_CODE).not.toMatch(/filter\(\(\w+\) => \w+\.type !== "agency"\)/);
  });
});

describe("the empty states say only what is true", () => {
  it("tells a reader who follows nothing what to do", () => {
    expect(PANEL).toMatch(
      /Choose something to follow and ImmigrationClock will organize the relevant changes here\./
    );
    expect(DIGEST_CODE).toMatch(/NOTHING_FOLLOWED_COPY/);
  });

  it("never implies the world was quiet when the archive is", () => {
    expect(PANEL).toMatch(/No recorded changes currently match what you're following\./);
    expect(PANEL).toMatch(/not the whole world/i);
    // The caveat travels with the empty state wherever it is shown.
    expect(DIGEST_CODE).toMatch(/NO_MATCHES_COPY/);
    expect(DIGEST_CODE).toMatch(/ARCHIVE_CAVEAT/);
  });

  it("has no copy claiming nothing happened", () => {
    for (const src of [PANEL_CODE, DIGEST_CODE]) {
      expect(src).not.toMatch(/nothing (has )?changed/i);
      expect(src).not.toMatch(/no changes (have )?occurred/i);
    }
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

  it("says the list is not attached to an email address", () => {
    expect(PAGE_PROSE).toMatch(/not attached to your email address/i);
  });

  it("says following is not connected to the newsletter", () => {
    expect(PAGE_PROSE).toMatch(
      /not personalized from what you follow|tells us nothing about your interests/i
    );
    expect(PAGE_PROSE).toMatch(/Nothing is emailed/i);
  });

  it("keeps the promise on the panel too, in one line rather than two paragraphs", () => {
    // The panel travels to /what-changed and /for-you, where there is no "How
    // this works" section to carry it.
    expect(PANEL).toMatch(/stays in this browser/i);
    expect(PANEL).toMatch(/nothing sent to us/i);
  });

  it("keeps the detail below the primary interaction, not in front of it", () => {
    expect(PAGE).toMatch(/id="how-this-works"/);
  });
});

describe("the digest is client-side, and stays that way", () => {
  it("is a client component", () => {
    expect(DIGEST.startsWith('"use client"')).toBe(true);
  });

  it("reuses buildDigest rather than re-deriving matches", () => {
    expect(DIGEST).toMatch(
      /import \{ buildDigest, digestWindow, shouldAdvanceLastSeen \} from "@\/lib\/follows"/
    );
    expect(DIGEST).toMatch(/buildDigest\(EVENT_INDEX, follows, since\)/);
  });

  it("reuses the panel's event rendering rather than a second copy", () => {
    expect(DIGEST).toMatch(/FollowedEvent/);
    expect(DIGEST).toMatch(/from "@\/components\/FollowingPanel"/);
  });

  it("is headed 'Changes for you'", () => {
    expect(DIGEST).toMatch(/Changes for you/);
  });

  it("keeps the significant / routine distinction", () => {
    expect(DIGEST_CODE).toMatch(/significant/);
    expect(DIGEST_CODE).toMatch(/routine/);
  });

  it("TRANSMITS NOTHING — no fetch, no beacon, no image ping", () => {
    // The whole claim. A single fetch here would turn a local preference into a
    // server-side record of someone's immigration interests.
    for (const forbidden of ["fetch(", "sendBeacon", "XMLHttpRequest", "new Image(", "navigator.send"]) {
      expect(DIGEST, `${forbidden} in a component that must not transmit`).not.toContain(forbidden);
    }
  });

  it("never associates follows with an email address", () => {
    expect(DIGEST_CODE).not.toMatch(/email/i);
    expect(DIGEST_CODE).not.toMatch(/subscribe/i);
  });

  it("keeps the last-visit stamp local and separate from the follow set", () => {
    expect(DIGEST).toMatch(/localStorage/);
    expect(DIGEST).toMatch(/immigrationclock\.lastSeen/);
    // A separate key: clearing follows must not erase the visit stamp.
    expect(DIGEST).not.toMatch(/immigrationclock\.follows\.v1/);
  });

  it("asks digestWindow what period it may claim, instead of deciding inline", () => {
    // The decision has a test of its own (follows.test.ts). What matters here is
    // that the component cannot reach a label any other way.
    expect(DIGEST_CODE).toMatch(/digestWindow\(previousVisit\)/);
    expect(DIGEST_CODE).toMatch(/\{period\.label\}/);
    expect(DIGEST_CODE).not.toMatch(/"Since your last visit"/);
    expect(DIGEST_CODE).not.toMatch(/"Relevant changes from the archive"/);
  });

  it("does not re-stamp the visit on every page load", () => {
    // Stamping on load redefines "your last visit" as "a moment ago", and the
    // section then reports nothing forever. The rule has its own test in
    // follows.test.ts; what matters here is that the component asks.
    expect(DIGEST_CODE).toMatch(/if \(!shouldAdvanceLastSeen\(stored, Date\.now\(\)\)\) return;/);
    expect(DIGEST_CODE).toMatch(/setItem\(LAST_SEEN_KEY, new Date\(\)\.toISOString\(\)\)/);
  });

  it("reads the stamp before writing it", () => {
    // A write-then-read would erase the window it is about to describe.
    expect(DIGEST_CODE.indexOf("getItem(LAST_SEEN_KEY)")).toBeLessThan(
      DIGEST_CODE.indexOf("setItem(LAST_SEEN_KEY")
    );
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

  it("persists follows through exactly one key, written in exactly one place", () => {
    const lib = code("src/lib/follows.ts");
    expect(lib).toMatch(/STORAGE_KEY = "immigrationclock\.follows\.v1"/);
    // setItem for the follow set exists once, in the adapter at the bottom.
    expect((lib.match(/localStorage\.setItem/g) ?? []).length).toBe(1);
    for (const src of [PANEL_CODE, DIGEST_CODE, code("src/app/following/page.tsx")]) {
      expect(src).not.toMatch(/immigrationclock\.follows\.v1/);
    }
    // The UI reaches storage through the hook, never around it.
    expect(PANEL_CODE).not.toMatch(/localStorage/);
    expect(code("src/hooks/useFollows.ts")).toMatch(/from "@\/lib\/follows"/);
  });

  it("introduces no cookie, no IndexedDB and no sync path", () => {
    for (const src of [PANEL_CODE, DIGEST_CODE, code("src/lib/follows.ts"), code("src/hooks/useFollows.ts")]) {
      expect(src).not.toMatch(/document\.cookie|indexedDB|sessionStorage/);
    }
  });
});

describe("the follow feature and the newsletter stay strangers", () => {
  // Not "these files were not edited" — a test cannot see a diff. The invariant
  // that actually matters is that neither side can reach the other: no follow
  // module knows about sending, and no sending module knows about follows.
  const FOLLOW_MODULES = [
    "src/lib/follows.ts",
    "src/hooks/useFollows.ts",
    "src/components/FollowingPanel.tsx",
    "src/components/ChangesForYou.tsx",
    "src/app/following/page.tsx",
  ];

  const SEND_MODULES = [
    "scripts/send-newsletter.ts",
    "src/lib/newsletter.ts",
    "src/lib/newsletter/select.ts",
    "src/lib/newsletter/subscriber-language.ts",
    "src/lib/newsletter/send-ledger.ts",
    "src/app/api/subscribe/route.ts",
  ];

  it("keeps Resend, audiences and segments out of the follow feature", () => {
    for (const path of FOLLOW_MODULES) {
      const src = code(path);
      expect(src, path).not.toMatch(/resend|audience|segment|PULSE_SEND_ENABLED|RESEND_API_KEY/i);
    }
  });

  it("keeps follows out of the sending path", () => {
    for (const path of SEND_MODULES) {
      const src = code(path);
      expect(src, path).not.toMatch(/\bfollows\b|useFollows|FollowingPanel|buildDigest/);
    }
  });

  it("leaves the send switch where it lives — outside the app code entirely", () => {
    for (const path of [...FOLLOW_MODULES, ...SEND_MODULES]) {
      expect(code(path), path).not.toContain("PULSE_SEND_ENABLED");
    }
  });
});
