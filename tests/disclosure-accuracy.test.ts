import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PARTNERS_ALL } from "@/lib/partners";

// Display advertising was removed (tests/editorial-integrity.test.ts), but the
// disclosure page kept saying "We may show ads through Google AdSense" and the
// privacy page's description still named AdSense. A disclosure that describes
// revenue the site does not have is as wrong as one that omits revenue it does.

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");

describe("disclosure matches how the site actually earns money", () => {
  const disclosure = read("src/app/disclosure/page.tsx");

  it("does not claim display advertising", () => {
    expect(disclosure).not.toMatch(/AdSense/i);
    expect(read("src/app/privacy/page.tsx")).not.toMatch(/AdSense/i);
  });

  it("discloses the Pro subscription and affiliate links", () => {
    expect(disclosure).toContain("ImmigrationClock Pro");
    expect(disclosure).toMatch(/affiliate/i);
  });

  it("sends certified-translation clicks to ImmiTranslate, labelled as a partner", () => {
    const translation = PARTNERS_ALL.find((p) => p.id === "document-translation");
    expect(translation?.url).toBe("https://immitranslate.com/?ref=948mg968");
    expect(translation?.kind).toBe("partner");
  });
});
