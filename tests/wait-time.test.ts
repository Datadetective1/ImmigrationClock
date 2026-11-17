// Wait-time pages: every page has a real cell behind it, slugs are stable and
// unique, and the answer line says only what the bulletin says.

import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { SITE } from "@/lib/site";
import { formatCutoff, getBulletin, latestBulletin } from "@/lib/visa-bulletin";
import { formatMonth } from "@/lib/visa-bulletin/forecast-format";
import {
  WAIT_PAIRS,
  WAIT_TIME_PATH,
  answerLine,
  behindWords,
  forecastLink,
  gapWords,
  pairFromSlug,
  ruleLine,
  waitFacts,
  waitPath,
  waitSlug,
  yearLine,
} from "@/lib/visa-bulletin/wait-time";

describe("wait-time pages", () => {
  it("has unique, readable slugs that round-trip", () => {
    const slugs = WAIT_PAIRS.map(waitSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain("eb-2-india");
    expect(slugs).toContain("eb-3-rest-of-world");
    expect(slugs).toContain("f2a-mexico");
    for (const s of slugs) {
      expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(waitSlug(pairFromSlug(s)!)).toBe(s);
    }
    expect(pairFromSlug("green-card-clock")).toBeNull();
  });

  it("backs every page with a printed cell in the newest bulletin", () => {
    const b = latestBulletin()!;
    for (const p of WAIT_PAIRS) {
      const f = waitFacts(p, b)!;
      expect(f.finalAction, waitSlug(p)).toBeDefined();
      expect(f.filing, waitSlug(p)).toBeDefined();
    }
  });

  it("answers EB-2 India from the November 2026 bulletin", () => {
    const f = waitFacts(pairFromSlug("eb-2-india")!, getBulletin("2026-11"))!;
    expect(f.finalAction).toBe("2013-11-01");
    expect(answerLine(f)).toBe(
      "In the November 2026 Visa Bulletin, the EB-2 India final action date is Nov 1, 2013, about 13 years behind the bulletin month."
    );
    expect(ruleLine(f)).toContain(formatCutoff("2013-11-01"));
    // November 2025 printed Apr 1, 2013: seven months of movement in a year.
    expect(f.yearAgo?.month).toBe("2025-11");
    expect(yearLine(f, formatMonth)).toBe(
      "Since November 2025 (Apr 1, 2013), the final action date moved ahead 7 months."
    );
  });

  it("words gaps plainly", () => {
    expect(gapWords({ months: 16, days: 0 })).toBe("1 year and 4 months");
    expect(gapWords({ months: 1, days: 3 })).toBe("1 month");
    expect(behindWords({ months: 6, days: 9 })).toBe("about 6 months");
    expect(behindWords({ months: 0, days: 9 })).toBe("less than a month");
    expect(behindWords({ months: 155, days: 0 })).toBe("about 13 years");
  });

  it("never says green card clock, and never uses an em dash", () => {
    const b = latestBulletin()!;
    for (const p of WAIT_PAIRS) {
      const f = waitFacts(p, b)!;
      const text = [answerLine(f), ruleLine(f) ?? "", yearLine(f, formatMonth) ?? ""].join(" ");
      expect(text.toLowerCase()).not.toContain("green card clock");
      expect(text).not.toContain("—");
      expect(text).not.toContain("--");
    }
  });

  it("opens the forecast on the same category and country", () => {
    expect(forecastLink(pairFromSlug("eb-3-china")!)).toBe(
      "/priority-date-forecast?section=employment&row=EB3&country=china"
    );
  });

  it("is in the sitemap", () => {
    const paths = new Set(sitemap().map((e) => e.url.replace(SITE.url, "")));
    expect(paths.has(WAIT_TIME_PATH)).toBe(true);
    for (const p of WAIT_PAIRS) expect(paths.has(waitPath(p)), waitPath(p)).toBe(true);
  });
});
