// =============================================================================
// THE NEWSLETTER QUESTION IS ASKED ONCE PER PAGE
//
// /pricing and /join/nip offer monthly and yearly side by side. Each button
// used to carry its own opt-in box, so the page showed the same checkbox twice,
// which reads as a glitch and lets the two answers disagree. The buttons now
// sit in one NewsletterOptInGroup that asks once.
// =============================================================================

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NewsletterOptInGroup, UpgradeButton } from "@/components/UpgradeButton";
import { CONSENT_TEXT } from "@/lib/billing/consent";

const read = (rel: string) => readFileSync(fileURLToPath(new URL("../" + rel, import.meta.url)), "utf8");
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("the newsletter opt-in", () => {
  it("renders once for a group of two buttons, unchecked", () => {
    const html = renderToStaticMarkup(
      createElement(
        NewsletterOptInGroup,
        null,
        createElement(UpgradeButton, { interval: "monthly", placement: "test", label: "Monthly" }),
        createElement(UpgradeButton, { interval: "annual", placement: "test", label: "Yearly" })
      )
    );
    expect(count(html, 'type="checkbox"')).toBe(1);
    expect(count(html, CONSENT_TEXT)).toBe(1);
    expect(html).not.toMatch(/checked=""/);
    expect(html).toContain("Monthly");
    expect(html).toContain("Yearly");
  });

  it("still renders for a button on its own", () => {
    const html = renderToStaticMarkup(
      createElement(UpgradeButton, { interval: "monthly", placement: "test", label: "Monthly" })
    );
    expect(count(html, 'type="checkbox"')).toBe(1);
  });

  it("is grouped on both pages that offer two plans", () => {
    for (const page of ["src/app/pricing/page.tsx", "src/app/join/nip/page.tsx"]) {
      const source = read(page);
      const open = source.indexOf("<NewsletterOptInGroup>");
      const close = source.indexOf("</NewsletterOptInGroup>");
      expect(open, page).toBeGreaterThan(-1);
      const inside = source.slice(open, close);
      expect(inside.match(/<UpgradeButton/g) ?? [], page).toHaveLength(2);
    }
  });
});
