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
import { CAPABILITY_SPECS, STATUS_LABEL, availableNow, notYetAvailable } from "@/lib/billing/plans";
import { BILLING_UNAVAILABLE_MESSAGE } from "@/lib/billing/config";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = readFileSync(join(root, "src/app/pricing/page.tsx"), "utf8");

describe("the pricing page cannot sell what does not exist", () => {
  it("gates the Subscribe buttons on a capability actually being available", () => {
    // Derived from the specs, not from a flag someone has to remember to flip:
    // the day a Pro capability is marked available, the buttons return on their
    // own and this test starts asserting the other branch.
    expect(source).toContain('const purchasable = availableNow("pro").length > 0;');
    expect(source).toMatch(/\{purchasable \?/);
  });

  it("renders no purchase path while Pro has nothing available", () => {
    // The state the site is in today.
    expect(availableNow("pro")).toEqual([]);
    expect(source).toContain('data-testid="pro-not-for-sale"');
    expect(source).toMatch(/Not for sale yet/);
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

describe("the honesty paragraph is accurate", () => {
  it("does not claim every unfinished capability is in build", () => {
    // Two of the five are "planned", not "building".
    const pending = notYetAvailable("pro");
    const building = pending.filter((c) => c.status === "building");
    const planned = pending.filter((c) => c.status === "planned");
    expect(building.length).toBeGreaterThan(0);
    expect(planned.length).toBeGreaterThan(0);

    // So a sentence asserting all of them are "in build" would be false.
    expect(source).not.toMatch(/capabilities above are still in build/);
    expect(source).toContain("inBuild");
    expect(source).toContain("planned");
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
    expect(source).not.toMatch(/BILLING_ENABLED|STRIPE_SECRET_KEY|KV_REST_API/);
  });
});
