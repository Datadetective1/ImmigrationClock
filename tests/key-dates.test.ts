// =============================================================================
// KEY DATES AND THEIR SOURCES
//
// The H-1B registration entry pointed at a USCIS address that had become a 404
// after USCIS moved the page, and nothing noticed for weeks: the build passed,
// the tests passed, the social posts kept sending readers to it. These tests
// pin the offline half of the fix — every source is an official https address,
// no registry points at an address known to have died, and the verdict logic
// the weekly live check runs on reads HTTP the right way. The live half is
// scripts/check-sources.ts on a weekly schedule.
// =============================================================================

import { describe, it, expect } from "vitest";
import { KEY_DATES } from "@/lib/key-dates";
import { EXPLAINERS } from "@/lib/editorial/explainers";
import { RETIRED_SOURCE_PATHS, authoritativeSources, isTrustedSourceUrl, verdictFor } from "@/lib/source-check";

describe("every key date cites an official source", () => {
  it("links an https page on a government host", () => {
    for (const kd of KEY_DATES) {
      expect(isTrustedSourceUrl(kd.sourceUrl), `${kd.id}: ${kd.sourceUrl}`).toBe(true);
      expect(kd.sourceName.trim().length, kd.id).toBeGreaterThan(0);
    }
  });

  it("never points at an address known to have died", () => {
    const cited = authoritativeSources().map((s) => s.url);
    for (const dead of RETIRED_SOURCE_PATHS) {
      expect(cited, dead).not.toContain(dead);
    }
  });

  it("sends the H-1B registration date to USCIS's current registration page", () => {
    const kd = KEY_DATES.find((k) => k.id === "h1b-registration")!;
    expect(kd.sourceUrl).toBe(
      "https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupations/h-1b-electronic-registration-process"
    );
    // USCIS: the initial registration period runs "a minimum of 14 calendar
    // days"; FY 2027's ran March 4–19, 2026. The entry says so, approximately.
    expect(kd.month).toBe(3);
    expect(kd.approx).toBe(true);
    expect(kd.detail).toMatch(/14 calendar days/);
    expect(kd.detail).not.toMatch(/three weeks/);
  });
});

describe("the explainers' sources", () => {
  it("are official https addresses too, or the site's own methodology page", () => {
    for (const x of EXPLAINERS) {
      const urls = (x.sources ?? []).map((s) => (typeof s === "string" ? s : (s as { url: string }).url));
      expect(urls.length, x.slug).toBeGreaterThan(0);
      for (const u of urls) expect(isTrustedSourceUrl(u), `${x.slug}: ${u}`).toBe(true);
    }
  });

  it("are all collected once by the live check", () => {
    const all = authoritativeSources();
    expect(new Set(all.map((s) => s.url)).size).toBe(all.length);
    expect(all.some((s) => s.owner === "key-date:h1b-registration")).toBe(true);
    expect(all.some((s) => s.owner.startsWith("explainer:"))).toBe(true);
  });
});

describe("what an HTTP answer means for a source", () => {
  it("reads 2xx as there, 404/410 or no answer as gone, and a refusal as blocked rather than gone", () => {
    expect(verdictFor(200)).toBe("ok");
    expect(verdictFor(204)).toBe("ok");
    expect(verdictFor(404)).toBe("broken");
    expect(verdictFor(410)).toBe("broken");
    expect(verdictFor(null)).toBe("broken");
    // travel.state.gov answers 403 to anything that is not a browser: the page
    // exists, and a check that called it broken would cry wolf every Monday.
    expect(verdictFor(403)).toBe("blocked");
    expect(verdictFor(429)).toBe("blocked");
    expect(verdictFor(503)).toBe("error");
  });

  it("refuses a non-official or non-https address before fetching it", () => {
    expect(isTrustedSourceUrl("http://www.uscis.gov/x")).toBe(false);
    expect(isTrustedSourceUrl("https://example.com/uscis")).toBe(false);
    expect(isTrustedSourceUrl("https://immigrationclock.com/methodology")).toBe(true);
    expect(isTrustedSourceUrl("https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html")).toBe(true);
    expect(isTrustedSourceUrl("not a url")).toBe(false);
  });
});
