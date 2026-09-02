// =============================================================================
// THE EDITORIAL REGISTRIES — explainers, data signals, discovery
//
// Three closed worlds the evergreen tier draws on. What these pin: every
// explainer cites a source and contains no advice; every signal's figures are
// in its own text and its provenance is one of the two allowed kinds; every
// discovery item points at a route the app actually serves; and the share
// module gives each of them a stable address and a card.
// =============================================================================

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { EXPLAINERS, EXPLAINER_BY_SLUG, explainersFor } from "@/lib/editorial/explainers";
import { buildSignals, SIGNAL_SLUGS, buildSignal } from "@/lib/editorial/signals";
import { buildDiscoveries } from "@/lib/editorial/discovery";
import { changeSlug, changePath, matchesChangeSlug, slugifyTitle, shortHash, trackedUrl, parseTracking, ogImagePath } from "@/lib/share";
import { digitRuns } from "@/lib/social/facts";
import { EVENTS } from "@/lib/event-store";

const ADVICE = /\byou (should|must|need to|have to)\b|\bmake sure (you|to)\b|\bapply (now|today)\b/i;
// "Among the most quoted" is a placement; "the most quoted" alone is a claim.
const SUPERLATIVE = /\bunprecedented\b|\bhistoric\b|\bsweeping\b|\bmassive\b|(?<!among )(?<!one of )\bthe most (common|quoted|misread)\b/i;

describe("explainers", () => {
  it("each has a distinct slug, a kicker, at least three facts, a source and a verification date", () => {
    const slugs = new Set(EXPLAINERS.map((e) => e.slug));
    expect(slugs.size).toBe(EXPLAINERS.length);
    for (const e of EXPLAINERS) {
      expect(e.slug).toMatch(/^[a-z0-9-]+$/);
      expect(e.kicker.length).toBeGreaterThan(10);
      expect(e.facts.length).toBeGreaterThanOrEqual(3);
      expect(e.sources.length).toBeGreaterThanOrEqual(1);
      for (const s of e.sources) expect(s.url).toMatch(/^https:\/\//);
      expect(e.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.keywords.length).toBeGreaterThan(0);
      expect(EXPLAINER_BY_SLUG.get(e.slug)).toBe(e);
    }
  });

  it("contains no advice and no superlative", () => {
    for (const e of EXPLAINERS) {
      const text = [...e.facts, e.whyItMatters, e.kicker].join(" ");
      expect(text, e.slug).not.toMatch(ADVICE);
      expect(text, e.slug).not.toMatch(SUPERLATIVE);
    }
  });

  it("links a change to the explainers that help read it", () => {
    const hits = explainersFor("DHS proposes to establish a fee for H-1B cap-subject petitions; a proposed rule open for comment");
    expect(hits.map((e) => e.slug)).toContain("proposed-rule-vs-final-rule");
  });
});

describe("data signals", () => {
  const today = "2026-09-02";
  const signals = buildSignals(today);

  it("are supported by the committed snapshots", () => {
    expect(signals.length).toBeGreaterThanOrEqual(8);
    expect(SIGNAL_SLUGS).toContain("h1b-sponsor-concentration");
  });

  it("state every figure inside their own points, and only reported or counted figures", () => {
    for (const s of signals) {
      expect(["reported", "own-archive"]).toContain(s.provenance);
      const corpus = digitRuns(`${s.figure} ${s.figureLabel} ${s.points.join(" ")}`);
      for (const run of digitRuns(s.figure)) expect(corpus, `${s.slug}: ${run}`).toContain(run);
      expect(s.points.length).toBeGreaterThanOrEqual(2);
      expect(s.caveats.length).toBeGreaterThanOrEqual(1);
      expect(s.sourceUrl).toMatch(/^https:\/\//);
      expect(s.explorePath.startsWith("/")).toBe(true);
    }
  });

  it("returns null rather than a guess when a builder is unknown", () => {
    expect(buildSignal("does-not-exist", today)).toBeNull();
  });

  it("never claims a trend between two months", () => {
    const warn = signals.find((s) => s.slug === "warn-latest-month");
    if (warn) {
      expect(warn.points.join(" ")).not.toMatch(/\b(rose|fell|increase|decrease|up from|down from|trend)\b/i);
    }
  });
});

describe("discovery", () => {
  it("points only at routes the app serves", () => {
    for (const d of buildDiscoveries()) {
      const route = d.path === "/" ? "src/app/page.tsx" : `src/app${d.path}/page.tsx`;
      expect(existsSync(resolve(route)), `${d.slug} → ${d.path}`).toBe(true);
      expect(d.facts.length).toBeGreaterThanOrEqual(2);
      expect(d.caveats.length).toBeGreaterThanOrEqual(1);
      expect([...d.facts, d.need].join(" ")).not.toMatch(ADVICE);
    }
  });
});

describe("share addresses", () => {
  it("give every recorded change a distinct, stable slug keyed on its id", () => {
    const slugs = new Set(EVENTS.map(changeSlug));
    expect(slugs.size).toBe(EVENTS.length);
    const e = EVENTS[0];
    expect(changePath(e)).toBe(`/what-changed/${changeSlug(e)}`);
    expect(matchesChangeSlug(e, changeSlug(e))).toBe(true);
    // A corrected title changes the readable part and not the key.
    expect(matchesChangeSlug(e, `some-other-title-${shortHash(e.id)}`)).toBe(true);
    expect(matchesChangeSlug(e, "some-other-title-zzzzzz")).toBe(false);
  });

  it("slugifies conservatively", () => {
    expect(slugifyTitle("Policy alert: Voter Registration & Ceremonies")).toBe("policy-alert-voter-registration-ceremonies");
    expect(slugifyTitle("A".repeat(200)).length).toBeLessThanOrEqual(72);
  });

  it("round-trips attribution through the URL", () => {
    const url = trackedUrl("https://immigrationclock.com/what-changed/x-abc123", { platform: "x", contentType: "why_it_matters", story: "change:abc123" });
    expect(url).toContain("utm_source=x");
    expect(url).toContain("utm_medium=social");
    expect(url).toContain("utm_campaign=why_it_matters");
    expect(url).toContain("utm_content=change%3Aabc123");
    expect(parseTracking(new URL(url).search)).toEqual({ platform: "x", contentType: "why_it_matters", story: "change:abc123" });
    expect(parseTracking("?utm_source=google&utm_medium=cpc")).toBeNull();
  });

  it("names a card for every kind of record", () => {
    expect(ogImagePath("change", "x-abc123")).toBe("/og/change/x-abc123.png");
    expect(ogImagePath("explainer", "proposed-rule-vs-final-rule")).toBe("/og/explainer/proposed-rule-vs-final-rule.png");
  });
});
