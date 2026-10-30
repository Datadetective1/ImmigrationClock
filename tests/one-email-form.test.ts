// =============================================================================
// THE PRICING PAGE ASKS FOR THE EMAIL ONCE
//
// With no verified address, pressing a Subscribe button turns it into an email
// form. The other plan's button stayed below it, and pressing that too put a
// second identical form on the page. Inside a plan group, the plan that is
// asking for an email is the only one shown, with a way back to the other.
// =============================================================================

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PlanGroupContext, UpgradeButton } from "@/components/UpgradeButton";
import type { Interval } from "@/lib/billing/plans";

const read = (rel: string) => readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");

function renderGroup(picked: Interval | null) {
  return renderToStaticMarkup(
    createElement(
      PlanGroupContext.Provider,
      { value: { optIn: false, picked, pick: () => {} } },
      createElement(UpgradeButton, { interval: "monthly", placement: "test", label: "Monthly" }),
      createElement(UpgradeButton, { interval: "annual", placement: "test", label: "Yearly" })
    )
  );
}

describe("one email form per plan group", () => {
  it("shows both plans while neither is asking for an email", () => {
    const html = renderGroup(null);
    expect(html).toContain("Monthly");
    expect(html).toContain("Yearly");
  });

  it("hides the yearly button once monthly is asking for an email", () => {
    const html = renderGroup("monthly");
    expect(html).toContain("Monthly");
    expect(html).not.toContain("Yearly");
  });

  it("hides the monthly button once yearly is asking for an email", () => {
    const html = renderGroup("annual");
    expect(html).toContain("Yearly");
    expect(html).not.toContain("Monthly");
  });

  it("claims the group when identity is required and lets the buyer switch plans", () => {
    const source = read("src/components/UpgradeButton.tsx");
    const verify = source.slice(source.indexOf('body.error === "identity_required"'));
    expect(verify.slice(0, 600)).toContain("group?.pick(interval)");
    expect(source).toContain("Choose a different plan");
    expect(source).toMatch(/group\.picked !== null && group\.picked !== interval\) return null/);
  });
});
