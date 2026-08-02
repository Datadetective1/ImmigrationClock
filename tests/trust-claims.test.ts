import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { SOURCES, SOURCE_BY_KEY, officialSources, monthsSinceVerified } from "@/lib/sources";
import { refreshRows } from "@/lib/refresh";
import { buildInsights } from "@/lib/insights";
import { buildMetrics } from "@/lib/data";
import { SITE } from "@/lib/site";

const src = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");

// =============================================================================
// Founder Directive Part 2 Pillar 1 — Official Sources First.
// Part 2 Pillar 4 — every page shows source, dates, methodology, limitations.
// =============================================================================
describe("source registry", () => {
  it("gives every source the full provenance contract", () => {
    for (const s of SOURCES) {
      expect(s.name, `${s.key} missing name`).toBeTruthy();
      expect(s.agency, `${s.key} missing agency`).toBeTruthy();
      expect(s.homepageUrl, `${s.key} bad homepageUrl`).toMatch(/^https:\/\//);
      expect(s.datasetUrl, `${s.key} bad datasetUrl`).toMatch(/^https:\/\//);
      expect(s.limitations, `${s.key} missing limitations`).toBeTruthy();
      expect(s.limitations.length, `${s.key} limitations too thin to be useful`).toBeGreaterThan(40);
      expect(s.lastVerifiedAt, `${s.key} missing lastVerifiedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("uses unique keys", () => {
    const keys = SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never claims a verification date in the future", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const s of SOURCES) {
      expect(s.lastVerifiedAt <= today, `${s.key} verified in the future`).toBe(true);
      expect(monthsSinceVerified(s.key)).toBeGreaterThanOrEqual(0);
    }
  });

  it("marks non-government sources explicitly", () => {
    const trac = SOURCE_BY_KEY.trac;
    expect(trac.tier).toBe("third-party");
    expect(trac.limitations).toMatch(/NOT a government source/i);
    // Official-source-first: the overwhelming majority must be official.
    expect(officialSources().length / SOURCES.length).toBeGreaterThan(0.8);
  });

  it("points every machine-ingested source at a refresh key", () => {
    for (const s of SOURCES) {
      if (s.ingestion === "live-api" || s.ingestion === "live-file" || s.ingestion === "scheduled-scrape") {
        expect(s.refreshKey, `${s.key} is machine-ingested but has no refreshKey`).toBeTruthy();
      }
    }
  });
});

// =============================================================================
// The status page must not invent an outcome. This is the same failure class as
// the fabricated WARN records — a trust surface that is itself untrustworthy.
// =============================================================================
describe("refresh status honesty", () => {
  it("has no hardcoded failure list left in the module", () => {
    const s = src("lib/refresh.ts");
    expect(s).not.toContain("FAILED_KEYS");
    expect(s).not.toMatch(/intentionally shown as FAILED/i);
    expect(s).not.toContain("HTTP 503 from source endpoint");
  });

  it("reports PENDING, not SUCCESS, for sources no pipeline fetches", () => {
    const rows = refreshRows();
    for (const r of rows) {
      if (r.ingestion === "curated" || r.ingestion === "planned") {
        expect(r.status, `${r.key} is ${r.ingestion} but claims ${r.status}`).toBe("PENDING");
      }
    }
  });

  it("reports SUCCESS only where real output exists", () => {
    const rows = refreshRows();
    const warn = rows.find((r) => r.key === "warn_layoffs");
    const employers = rows.find((r) => r.key === "uscis_h1b");
    expect(warn?.status).toBe("SUCCESS");
    expect(warn?.rowCount).toBeGreaterThan(0);
    expect(employers?.status).toBe("SUCCESS");
  });

  it("surfaces verification age on every row", () => {
    for (const r of refreshRows()) {
      expect(r.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.monthsSinceVerified).not.toBeNull();
    }
  });
});

// =============================================================================
// Directive Part 1: "Every statistic must have a traceable source."
// A superlative is a claim; it needs evidence we actually hold.
// =============================================================================
describe("no unsourced superlatives", () => {
  const SUPERLATIVES =
    /\b(record|highest ever|all-time|unprecedented|worst ever|best ever|never before|historic high)\b/i;

  it("keeps superlative claims out of insight headlines", () => {
    for (const i of buildInsights()) {
      expect(SUPERLATIVES.test(i.headline), `insight "${i.key}" makes a superlative claim: ${i.headline}`).toBe(
        false
      );
    }
  });

  it("keeps superlative claims out of metric tooltips", () => {
    for (const m of buildMetrics()) {
      expect(SUPERLATIVES.test(m.tooltip), `metric "${m.key}" makes a superlative claim`).toBe(false);
    }
  });

  it("does not describe the detention figure as a record anywhere", () => {
    expect(src("lib/source-data.ts")).not.toMatch(/highest in system history/i);
    expect(src("lib/insights.ts")).not.toMatch(/near a record/i);
  });
});

// =============================================================================
// A point-in-time snapshot must visibly age rather than imply currency.
// =============================================================================
describe("point-in-time staleness", () => {
  it("flags the detention snapshot as dated once past its window", () => {
    const metric = buildMetrics().find((m) => m.key === "detention_population");
    expect(metric).toBeDefined();
    // The committed snapshot is months old, so the age must be surfaced.
    expect(metric!.tooltip).toMatch(/days old|snapshot of one day/i);
  });
});

// =============================================================================
// Claims the site makes about ITSELF are held to the same standard as data.
// =============================================================================
describe("self-claims", () => {
  it("does not hardcode a social handle or contact inbox", () => {
    const s = src("lib/site.ts");
    expect(s).not.toContain("@immigrationclock");
    expect(s).not.toContain("hello@immigrationclock.com");
    expect(s).toContain("NEXT_PUBLIC_TWITTER_HANDLE");
    expect(s).toContain("NEXT_PUBLIC_CONTACT_EMAIL");
  });

  it("omits sameAs from structured data when no handle is configured", () => {
    // With no env var set (the test environment), no ownership claim may be made.
    expect(SITE.twitter).toBe("");
    const s = src("components/StructuredData.tsx");
    expect(s).toContain("sameAs ? { sameAs } : {}");
  });

  it("never renders an empty mailto link", () => {
    for (const page of ["about", "privacy", "terms", "disclosure"]) {
      const s = src(`app/${page}/page.tsx`);
      expect(s, `${page} still builds a raw mailto`).not.toContain("mailto:${SITE.contactEmail}");
    }
  });
});
