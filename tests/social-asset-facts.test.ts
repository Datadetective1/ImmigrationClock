// =============================================================================
// STANDING-ASSET FACT SETS
//
// This layer decides what an unattended process is allowed to assert about
// ImmigrationClock's own datasets, so the tests are written around the two ways
// it can be wrong, which are not symmetrical:
//
//   • A figure reaches the copy engine that the data does not support. That is a
//     published falsehood, and every guard here is aimed at it.
//   • An asset with a real insight loses it. That is a quiet evening, which
//     costs nothing — but it costs nothing only if it is visible, so the
//     rotation and the drop path are asserted too.
//
// The most important tests are the ones that pin the EDITORIAL LINE: which
// assets are allowed figures at all. That line follows the site's own provenance
// labels — reported figures only — and it is the sort of decision that erodes
// silently when someone later wants one more post to pass.
// =============================================================================

import { describe, it, expect } from "vitest";
import { assetInsights, assetsWithInsight } from "@/lib/social/asset-facts";
import { buildAssetFacts } from "@/lib/social/facts";
import { STANDING_ASSETS, ASSET_BY_ID, absolute } from "@/lib/social/links";
import { standingPool } from "@/lib/social/select";
import { buildUserPrompt } from "@/lib/social/prompt";
import { SLOTS } from "@/lib/social/slots";
import { allowedDigitRuns, validatePost } from "@/lib/social/validate";
import { digitRuns } from "@/lib/social/facts";
import { WARN_SUMMARY } from "@/lib/warn-summary";
import { EMPLOYERS_META } from "@/lib/employers";
import { CBP_LIVE } from "@/lib/dataset";
import { INDEX_COVERAGE } from "@/lib/event-index";
import { SOURCES } from "@/lib/sources";
import { formatNumber } from "@/lib/format";

const TODAY = "2026-08-09";

/**
 * Assets whose page figures the site itself labels modeled, estimated or
 * curated. They may qualify on a non-numeric insight; they may never carry a
 * number. Loosening this list is a decision about what the account claims, not a
 * tuning knob — the test names say so.
 */
const NEVER_NUMERIC = [
  "h1b-top-sponsors", // curated sponsor set, labelled modeled on its own page
  "enforcement-trends", // round curated ICE values, stale point-in-time detention
  "migration-map", // country splits apportioned from a national total
  "f1-student-visas", // DOS tables transcribed by hand, most recent years rounded
  "methodology",
  "timeline",
  "work-visas",
  "following",
];

describe("asset insights exist for every asset in the catalogue", () => {
  it("returns something for every standing asset", () => {
    for (const a of STANDING_ASSETS) {
      expect(assetInsights(a.id, TODAY), a.id).not.toBeNull();
    }
  });

  it("returns null for an id with no builder, rather than inventing one", () => {
    expect(assetInsights("not-a-real-asset", TODAY)).toBeNull();
  });

  it("is deterministic for the same day", () => {
    for (const a of STANDING_ASSETS) {
      expect(assetInsights(a.id, TODAY)).toEqual(assetInsights(a.id, TODAY));
    }
  });

  it("gives every asset at least two points to choose a lede from", () => {
    for (const a of STANDING_ASSETS) {
      expect(assetInsights(a.id, TODAY)!.points.length, a.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("the reported-only line", () => {
  it("keeps figures out of every asset whose page figures are not reported", () => {
    for (const id of NEVER_NUMERIC) {
      const insight = assetInsights(id, TODAY);
      expect(insight, id).not.toBeNull();
      expect(insight!.numeric, id).toBe(false);
    }
  });

  it("a non-numeric asset's points state no measurement", () => {
    for (const id of NEVER_NUMERIC) {
      for (const point of assetInsights(id, TODAY)!.points) {
        // Visa names are the one place a digit is unavoidable ("H-1B", "F-1").
        // "H-1B", "L-1", "F-1", "EB-2" — the trailing letter is part of the
        // class name, so the word boundary has to be allowed to fall after it.
        const stripped = point.replace(/\b[A-Z]{1,2}-\d+[A-Z]?\b/g, "");
        expect(digitRuns(stripped), `${id}: ${point}`).toEqual([]);
      }
    }
  });

  it("a non-numeric asset says so in its caveats, so the prompt cannot imply otherwise", () => {
    for (const id of NEVER_NUMERIC) {
      const caveats = assetInsights(id, TODAY)!.caveats.join(" ");
      expect(caveats, id).toMatch(/No statistic from this dataset has been provided/);
    }
  });

  it("a numeric asset states at least one figure", () => {
    const numeric = STANDING_ASSETS.map((a) => a.id).filter(
      (id) => assetInsights(id, TODAY)!.numeric
    );
    expect(numeric.length).toBeGreaterThan(0);
    for (const id of numeric) {
      const digits = assetInsights(id, TODAY)!.points.flatMap((p) => digitRuns(p));
      expect(digits.length, id).toBeGreaterThan(0);
    }
  });
});

describe("figures match the datasets they claim to come from", () => {
  // These assertions are deliberately literal. If a data refresh moves a number,
  // the sentence carrying it must move with it, and a test that only checked
  // "some number is present" would let the two drift apart silently.

  it("WARN totals are the WARN rollup's own", () => {
    const points = assetInsights("layoffs", TODAY)!.points.join(" ");
    expect(points).toContain(formatNumber(WARN_SUMMARY.noticeCount));
    expect(points).toContain(formatNumber(WARN_SUMMARY.employeesTotal));
    expect(points).toContain(formatNumber(WARN_SUMMARY.employerCount));
    expect(points).toContain(WARN_SUMMARY.stateCodes.join(", "));
  });

  it("the H-1B directory totals are the ingested export's own", () => {
    const points = assetInsights("h1b-employers", TODAY)!.points.join(" ");
    expect(points).toContain(formatNumber(EMPLOYERS_META.count));
    expect(points).toContain(formatNumber(EMPLOYERS_META.totalEmployers));
    expect(points).toContain(formatNumber(EMPLOYERS_META.nationalApprovals));
    expect(points).toContain(String(EMPLOYERS_META.fiscalYear));
  });

  it("the border figures are the live CBP feed's own", () => {
    const insight = assetInsights("border-encounters", TODAY);
    if (!CBP_LIVE.ok) {
      // Fail closed: no live feed, no asset. Asserting this rather than skipping
      // is what stops a broken refresh from being papered over with the seeded
      // sector breakdowns.
      expect(insight).toBeNull();
      return;
    }
    expect(insight!.points.join(" ")).toContain(formatNumber(CBP_LIVE.currentFyYtd!));
    expect(insight!.points.join(" ")).toContain(CBP_LIVE.reportingMonthLabel!);
  });

  it("the archive count is the archive's own", () => {
    const points = assetInsights("what-changed", TODAY)!.points.join(" ");
    expect(points).toContain(formatNumber(INDEX_COVERAGE.stored));
  });

  it("the source-registry count is the registry's own", () => {
    const points = assetInsights("sources", TODAY)!.points.join(" ");
    expect(points).toContain(String(SOURCES.length));
  });

  it("WARN month figures follow the date they are asked about", () => {
    // The "most recent complete month" is relative to today. If it were read off
    // the wall clock instead, a simulated day would report a month it could not
    // have known about.
    const aug = assetInsights("layoffs", "2026-08-09")!.points.join(" ");
    const jul = assetInsights("layoffs", "2026-07-09")!.points.join(" ");
    expect(aug).toContain("July 2026");
    expect(jul).toContain("June 2026");
    expect(jul).not.toContain("July 2026");
  });
});

describe("caveats survive into the fact set", () => {
  it("the WARN post can state what WARN never records", () => {
    const facts = buildAssetFacts(ASSET_BY_ID.get("layoffs")!, TODAY)!;
    expect(facts.notes.join(" ")).toMatch(/never identifies the immigration status/i);
    expect(facts.notes.join(" ")).toMatch(/Not a national total/i);
  });

  it("the border post carries the encounter-is-not-a-person caveat", () => {
    const facts = buildAssetFacts(ASSET_BY_ID.get("border-encounters")!, TODAY)!;
    expect(facts.notes.join(" ")).toMatch(/an event, not a person/i);
  });

  it("the H-1B directory post carries the petitions-not-people caveat", () => {
    const facts = buildAssetFacts(ASSET_BY_ID.get("h1b-employers")!, TODAY)!;
    expect(facts.notes.join(" ")).toMatch(/Counts petitions, not people/i);
  });

  it("a numeric fact set forbids deriving a new number", () => {
    const facts = buildAssetFacts(ASSET_BY_ID.get("layoffs")!, TODAY)!;
    expect(facts.notes.join(" ")).toMatch(/Do not derive a new number/i);
  });

  it("the cross-link post forbids reading the two figures causally", () => {
    const facts = buildAssetFacts(ASSET_BY_ID.get("layoffs-vs-h1b")!, TODAY)!;
    expect(facts.notes.join(" ")).toMatch(/does not mean a layoff affected sponsored workers/i);
  });
});

describe("buildAssetFacts", () => {
  it("puts every stated figure inside the validator's permitted set", () => {
    for (const a of STANDING_ASSETS) {
      const facts = buildAssetFacts(a, TODAY);
      if (!facts) continue;
      const permitted = allowedDigitRuns(facts);
      for (const point of facts.dataPoints) {
        for (const run of digitRuns(point)) {
          expect(permitted.has(run.replace(/^0+/, "") || "0"), `${a.id}: ${run}`).toBe(true);
        }
      }
    }
  });

  it("attributes to the agency that published the figures, not to us", () => {
    expect(buildAssetFacts(ASSET_BY_ID.get("h1b-employers")!, TODAY)!.sourceName).toBe(
      "USCIS H-1B Employer Data Hub"
    );
    // Facts about our own archive are ours; nothing else published them.
    expect(buildAssetFacts(ASSET_BY_ID.get("what-changed")!, TODAY)!.sourceName).toBe(
      "ImmigrationClock"
    );
  });

  it("never widens the link whitelist beyond the asset's own page", () => {
    for (const a of STANDING_ASSETS) {
      const facts = buildAssetFacts(a, TODAY);
      if (!facts) continue;
      expect(facts.allowedUrls).toEqual([absolute(a.path)]);
      expect(facts.deepLink).toBe(absolute(a.path));
    }
  });

  it("offers no numbers for a non-numeric asset, but still permits a visa name", () => {
    const facts = buildAssetFacts(ASSET_BY_ID.get("h1b-top-sponsors")!, TODAY)!;
    // Nothing is advertised to the engine…
    expect(facts.figures).toEqual([]);
    // …but "H-1B" is still writable, because the validator grounds digits
    // against the whole fact set rather than against the offer list.
    const post = `This ranking covers a curated set of large H-1B sponsors, and the site labels its totals modeled rather than reported. ${facts.deepLink}`;
    expect(validatePost(post, "x", facts).failures).toEqual([]);
  });

  it("returns null for an asset with no grounded insight", () => {
    const invented = { id: "invented", label: "x", path: "/x", description: "y", tags: [] };
    expect(buildAssetFacts(invented, TODAY)).toBeNull();
  });
});

describe("the validator still refuses an ungrounded figure", () => {
  const facts = buildAssetFacts(ASSET_BY_ID.get("layoffs")!, TODAY)!;
  const link = facts.deepLink;

  it("accepts a figure the fact set computed", () => {
    const post = `ImmigrationClock holds ${formatNumber(
      WARN_SUMMARY.noticeCount
    )} state-filed WARN layoff notices from the six states that publish a machine-readable feed. ${link}`;
    expect(validatePost(post, "x", facts).failures).toEqual([]);
  });

  it("rejects a plausible figure it did not", () => {
    const post = `ImmigrationClock holds 8,412 state-filed WARN layoff notices from the six states that publish a machine-readable feed. ${link}`;
    const result = validatePost(post, "x", facts);
    expect(result.ok).toBe(false);
    expect(result.failures.join(" ")).toMatch(/8412/);
  });

  it("rejects a share derived from two figures it did have", () => {
    // The realistic failure once real numbers are in play is arithmetic, not
    // invention: both operands are grounded and the result is not.
    const post = `WARN notices cover 994,555 employees across 6,015 employers — an average of 165 each. ${link}`;
    expect(validatePost(post, "x", facts).ok).toBe(false);
  });
});

describe("the prompt tells the engine which kind of evening this is", () => {
  const slot = SLOTS.find((s) => s.pool === "standing")!;
  const ask = (id: string) =>
    buildUserPrompt({
      facts: buildAssetFacts(ASSET_BY_ID.get(id)!, TODAY)!,
      slot,
      angle: "data_insight",
      avoidOpenings: [],
    });

  it("renders the computed facts for an asset that has them", () => {
    const prompt = ask("layoffs");
    expect(prompt).toContain("ESTABLISHED FACTS FROM OUR OWN DATA");
    expect(prompt).toContain(formatNumber(WARN_SUMMARY.noticeCount));
    expect(prompt).toMatch(/Lead with the most striking of the established facts/);
  });

  it("does not claim there are no figures when there are", () => {
    // The bug this whole change fixes: the old brief told every evening slot it
    // had no figures, which is why its posts described pages.
    expect(ask("layoffs")).not.toMatch(/no figures you may quote/i);
  });

  it("still tells an asset without figures that it has none", () => {
    // A non-numeric asset still has established facts — they just carry no
    // measurement. What must change is the brief and the permitted-numbers line.
    const prompt = ask("methodology");
    expect(prompt).toContain("ESTABLISHED FACTS FROM OUR OWN DATA");
    expect(prompt).toMatch(/no figures you may quote/i);
    expect(prompt).toContain("NUMBERS YOU MAY USE: none");
  });
});

describe("the standing rotation", () => {
  it("carries only assets that have something to say", () => {
    const ids = assetsWithInsight(
      STANDING_ASSETS.map((a) => a.id),
      TODAY
    );
    const inPool = standingPool(TODAY)
      .filter((c) => c.subjectId.startsWith("asset:"))
      .map((c) => c.subjectId.slice("asset:".length));
    expect(new Set(inPool)).toEqual(new Set(ids));
  });

  it("gives every rotating asset a fact set", () => {
    for (const c of standingPool(TODAY)) {
      expect(c.facts.subjectId).toBe(c.subjectId);
      expect(c.facts.deepLink).toContain(c.deepLink);
    }
  });

  it("reaches every asset over a full turn of the rotation", () => {
    const usable = assetsWithInsight(STANDING_ASSETS.map((a) => a.id), TODAY).length;
    const leaders = new Set<string>();
    for (let d = 0; d < usable; d++) {
      const date = new Date(Date.parse(`${TODAY}T00:00:00Z`) + d * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const first = standingPool(date).filter((c) => c.subjectId.startsWith("asset:"))[0];
      leaders.add(first.subjectId);
    }
    expect(leaders.size).toBe(usable);
  });
});
