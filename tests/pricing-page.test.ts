// =============================================================================
// WHAT /pricing PROMISES, AND WHAT IT CHARGES FOR
//
// This page is the whole commercial surface. Three defects lived on it at once,
// and each was the kind that only a customer would notice:
//
//   1. It called all five Pro capabilities "in build" when two were merely
//      planned — wrong in the flattering direction, in the one paragraph whose
//      whole job is precision, directly under badges that said otherwise.
//   2. It listed those capabilities comma-joined, and one of them is called
//      "Your watchlist, everywhere". Five capabilities read as six.
//   3. It rendered two enabled Subscribe buttons at $19 and $190 immediately
//      beneath a paragraph saying there is nothing to buy. The reader was told
//      not to subscribe and invited to in the same breath.
//
// The page is a server component, so it is asserted through the data it renders
// from and, for the rendered text, through the built markup in the CI build.
// =============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  CAPABILITY_SPECS,
  STATUS_LABEL,
  availableNow,
  capabilitiesFor,
  notYetAvailable,
  roadmap,
} from "@/lib/billing/plans";
import { BILLING_UNAVAILABLE_MESSAGE } from "@/lib/billing/config";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(join(root, "src/app/pricing/page.tsx"), "utf8");

describe("the pricing page cannot sell what does not exist", () => {
  it("gates the Subscribe buttons on a capability actually being available", () => {
    // Derived from the specs, not from a flag someone has to remember to flip.
    expect(source).toContain('const hasSomethingToSell = availableNow("pro").length > 0;');
    expect(source).toMatch(/\{purchasable \?/);
  });

  it("requires BOTH a working capability and billing being on", () => {
    // Watchlist sync now works, so the capability half is satisfied — but
    // BILLING_ENABLED is deliberately unset, and a Subscribe button that
    // answers "subscriptions are not open yet" is the same contradiction this
    // branch exists to remove, one click later. Both halves are required.
    expect(availableNow("pro").map((c) => c.id)).toEqual(["watchlist_sync"]);
    expect(source).toContain('const hasSomethingToSell = availableNow("pro").length > 0;');
    expect(source).toContain("hasSomethingToSell && billingStatus().checkoutReady");
    expect(source).toContain('data-testid="pro-not-for-sale"');
  });

  it("says which of the two reasons applies, rather than one catch-all", () => {
    // "None of it works yet" would now be false. The panel branches on
    // hasSomethingToSell so a reader is told the true reason.
    expect(source).toMatch(/\{hasSomethingToSell \? \(/);
    expect(source).toMatch(/subscriptions are not open yet/i);
    expect(source).toMatch(/none of it works yet/i);
  });

  it("keeps the intended price visible and the Stripe wiring intact", () => {
    // "Not purchasable" must not mean "the price disappeared" or "the payment
    // architecture was ripped out". Both intervals still render, and both
    // UpgradeButton call sites survive for the day the gate opens.
    expect(source).toMatch(/\$\{pro\.monthlyUsd\} a month/);
    expect(source).toMatch(/\$\{pro\.annualUsd\} a year/);
    expect(source.match(/<UpgradeButton/g) ?? []).toHaveLength(2);
    expect(source).toContain('interval="monthly"');
    expect(source).toContain('interval="annual"');
  });

  it("invents no scarcity and promises no date", () => {
    // "Coming soon" is honest; "only 50 seats" or "launching Tuesday" would not
    // be, and neither would a countdown.
    for (const forbidden of [
      /limited (?:time|seats|spots)/i,
      /only \d+ (?:seats|spots|left)/i,
      /founding member/i,
      /early.bird/i,
      /\bwait.?list\b/i,
      /launch(?:ing|es) (?:on |in )?\w+day/i,
    ]) {
      expect(source, `pricing page matched ${forbidden}`).not.toMatch(forbidden);
    }
  });
});

describe("a test deployment says so where the money is", () => {
  it("shows a test-mode notice beside the Subscribe buttons", () => {
    // /account already carried this. /pricing is where somebody actually
    // clicks, and it is the first page the activation walkthrough opens, so a
    // test deployment that looks live is a real hazard during activation.
    expect(source).toContain("billingStatus().testMode");
    expect(source).toMatch(/Test mode\. No real card is charged/);
  });

  it("drives it from the configured key, not a hand-set flag", () => {
    // isTestKey(STRIPE_SECRET_KEY) — so it cannot be left switched on when
    // live keys arrive, and cannot be switched off while test keys are in use.
    expect(source).not.toMatch(/testMode\s*=\s*(true|false)/);
  });
});

describe("the honesty paragraph is accurate", () => {
  it("sells nothing that does not exist", () => {
    // THE HONESTY PARAGRAPH USED TO BE THE FIX FOR SELLING FOUR THINGS THAT DID
    // NOT EXIST. The paragraph was accurate and the offer was still wrong: a
    // $190 annual subscriber was buying one working capability and four
    // intentions. The four are now roadmap rather than plan contents, so there
    // is no unfinished capability left for the paragraph to disclose.
    expect(notYetAvailable("pro")).toEqual([]);
    for (const c of capabilitiesFor("pro")) expect(c.status).toBe("available");

    // And they are still described somewhere, so removing the promise did not
    // become hiding the plan.
    expect(roadmap().length).toBeGreaterThan(0);
  });

  it("never comma-joins capability labels, because one contains a comma", () => {
    // "Your watchlist, everywhere" made five capabilities read as six.
    const commaJoined = CAPABILITY_SPECS.find((c) => c.label.includes(","));
    expect(commaJoined, "a capability label contains a comma").toBeTruthy();
    expect(source).not.toMatch(/\.join\(", "\)/);
  });

  it("keeps every capability's own status label reachable", () => {
    // The badge on each line is what the paragraph now points at, so it has to
    // still be rendered per capability.
    expect(source).toContain("STATUS_LABEL[f.status]");
    for (const c of CAPABILITY_SPECS) expect(STATUS_LABEL[c.status]).toBeTruthy();
  });
});

describe("a visitor is never shown configuration", () => {
  it("offers one safe sentence, naming nothing internal", () => {
    expect(BILLING_UNAVAILABLE_MESSAGE).not.toMatch(
      /BILLING_ENABLED|STRIPE_[A-Z_]+|KV_REST_API|process\.env|sk_(test|live)_|whsec_/
    );
    expect(BILLING_UNAVAILABLE_MESSAGE.length).toBeGreaterThan(20);
  });

  it("does not render an internal switch name anywhere on the page", () => {
    // COMMENTS ARE NOT RENDERED, and the guard is about what a visitor can see.
    // This grepped raw source and began failing when a comment explained WHY
    // the purchase path is gated on BILLING_ENABLED — documentation the next
    // reader of this file needs. Stripping comments keeps the guard pointed at
    // the thing it was written to protect: the strings that reach the browser.
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(withoutComments).not.toMatch(/BILLING_ENABLED|STRIPE_SECRET_KEY|KV_REST_API/);
  });
});
