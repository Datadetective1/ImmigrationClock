// The Add to Chrome link points at the published listing for our item id.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CHROME_EXTENSION_ID, CHROME_EXTENSION_URL } from "@/lib/extension";

describe("Chrome extension link", () => {
  it("is the store's canonical listing address for the published item", () => {
    expect(CHROME_EXTENSION_ID).toMatch(/^[a-p]{32}$/);
    expect(CHROME_EXTENSION_URL).toBe(
      "https://chromewebstore.google.com/detail/immigrationclock-visa-bul/ffccdabjconlcffjfpmjpfhkpjkkgbji"
    );
  });

  it("appears on the homepage, wait-time pages and Visa Bulletin page", () => {
    for (const f of [
      "src/app/page.tsx",
      "src/app/green-card-wait-time/page.tsx",
      "src/app/green-card-wait-time/[slug]/page.tsx",
      "src/components/VisaBulletinView.tsx",
    ]) {
      expect(readFileSync(f, "utf8")).toMatch(/AddToChromeButton|ChromeExtensionPanel/);
    }
  });
});
