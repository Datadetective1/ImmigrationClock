import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { layoffRows } from "@/lib/source-data";
import * as datasetModule from "@/lib/dataset";
import { WARN_NOTICES, WARN_EMPLOYERS, warnH1bCrossLink } from "@/lib/warn";
import { WARN_SUMMARY, WARN_SOURCE, WARN_COVERAGE_SENTENCE } from "@/lib/warn-summary";
import { buildMetrics } from "@/lib/data";
import { buildChangeFeed } from "@/lib/changes";
import { buildInsights } from "@/lib/insights";

const src = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), "utf8");

// =============================================================================
// REGRESSION GUARD — fabricated WARN records must never return.
//
// Before 2026-08-01 the app synthesized individual "WARN notices" for named real
// companies: press-reported annual layoff totals split into invented events with
// invented filing dates, stamped with the State WARN Act source name and a
// dol.gov URL. These tests fail if any part of that mechanism reappears.
// =============================================================================
describe("no fabricated WARN records", () => {
  it("leaves the build-time layoff export empty and frozen", () => {
    expect(layoffRows).toHaveLength(0);
    expect(Object.isFrozen(layoffRows)).toBe(true);
  });

  it("does not re-export layoff rows to the running app at all", () => {
    // The app-facing dataset module must offer no layoff path whatsoever, so a
    // future caller cannot reach for one and get a silently empty array.
    expect(datasetModule).not.toHaveProperty("layoffRows");
    expect(datasetModule).not.toHaveProperty("WARN_LIVE");
  });

  it("keeps layoff data out of the dataset snapshot entirely", () => {
    const dataset = JSON.parse(src("lib/generated/dataset.json"));
    expect(dataset).not.toHaveProperty("layoffRows");
    expect(dataset).not.toHaveProperty("WARN_LIVE");
  });

  it("has no layoff synthesis left in the build-time source module", () => {
    const s = src("lib/source-data.ts");
    expect(s).not.toContain("EXTRA_LAYOFFS");
    expect(s).not.toContain("layoffYears");
    expect(s).not.toMatch(/employeesAffected:\s*affected/);
    // The old generator built filing dates from a template literal, hardcoding
    // the 15th of the month. No notice date may be constructed here at all —
    // dates must come from the state feed, never from string assembly.
    expect(s).not.toMatch(/noticeDate:/);
    expect(s).not.toMatch(/\$\{ly\.year\}/);
    expect(s).not.toMatch(/padStart\(2, "0"\)\}-15/);
  });

  it("does not carry a layoffs field on curated employer profiles", () => {
    expect(src("lib/types.ts")).not.toMatch(/^\s*layoffs:/m);
  });

  it("names no company in a layoff context outside the real feed", () => {
    // Employers previously hardcoded into EXTRA_LAYOFFS with invented dates.
    const fabricated = [
      "Peloton Interactive",
      "Charter Communications",
      "CVS Health",
      "Wells Fargo",
    ];
    const s = src("lib/source-data.ts");
    for (const name of fabricated) expect(s).not.toContain(name);
  });
});

// =============================================================================
// Every displayed WARN figure must trace to a real, sourced government filing.
// =============================================================================
describe("WARN feed integrity", () => {
  it("has notices, employers and states", () => {
    expect(WARN_NOTICES.length).toBeGreaterThan(0);
    expect(WARN_EMPLOYERS.length).toBeGreaterThan(0);
    expect(WARN_SUMMARY.stateCount).toBeGreaterThan(0);
  });

  it("gives every notice a source URL back to a government portal", () => {
    for (const n of WARN_NOTICES) {
      expect(n.sourceUrl, `notice for ${n.employer} has no sourceUrl`).toBeTruthy();
      expect(n.sourceUrl).toMatch(/^https?:\/\//);
    }
    // Spot-check that the feed is dominated by .gov / state open-data hosts
    // rather than an editorial source.
    const govish = WARN_NOTICES.filter((n) =>
      /\.gov|\.us\b|data\.[a-z]+\.gov/i.test(n.sourceUrl)
    ).length;
    expect(govish / WARN_NOTICES.length).toBeGreaterThan(0.9);
  });

  it("gives every notice a state and a non-negative headcount", () => {
    for (const n of WARN_NOTICES) {
      expect(n.state).toMatch(/^[A-Z]{2}$/);
      expect(n.employees).toBeGreaterThanOrEqual(0);
    }
  });

  it("dates notices plausibly — never before the WARN Act, never far future", () => {
    const maxYear = new Date().getUTCFullYear() + 3;
    for (const n of WARN_NOTICES) {
      for (const d of [n.noticeDate, n.effectiveDate]) {
        if (!d) continue;
        const year = Number(d.slice(0, 4));
        expect(year, `${n.employer}: implausible date ${d}`).toBeGreaterThanOrEqual(1988);
        expect(year, `${n.employer}: implausible date ${d}`).toBeLessThanOrEqual(maxYear);
      }
    }
  });

  it("does not concentrate filing dates on a single day of the month", () => {
    // The fabricated generator put nearly every notice on the 15th. Real filings
    // spread across the month, so a spike here means synthesis crept back in.
    const dayCounts = new Map<string, number>();
    let dated = 0;
    for (const n of WARN_NOTICES) {
      if (!n.noticeDate) continue;
      dated++;
      const day = n.noticeDate.slice(8, 10);
      dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    }
    const worst = Math.max(...dayCounts.values());
    expect(worst / dated).toBeLessThan(0.25);
  });
});

// =============================================================================
// Rollups must agree with the notices they are derived from.
// =============================================================================
describe("WARN summary matches the underlying notices", () => {
  it("reports the same notice and employee totals as the feed", () => {
    expect(WARN_SUMMARY.noticeCount).toBe(WARN_NOTICES.length);
    const employees = WARN_NOTICES.reduce((s, n) => s + n.employees, 0);
    expect(WARN_SUMMARY.employeesTotal).toBe(employees);
  });

  it("accounts for every notice in exactly one dating basis", () => {
    const {
      datedByNoticeDate: a,
      datedByEffectiveDate: b,
      noticesWithoutDate: c,
      noticeCount,
    } = WARN_SUMMARY;
    expect(a + b + c).toBe(noticeCount);
  });

  it("never lets yearly totals exceed the overall total", () => {
    const summed = WARN_SUMMARY.byYear.reduce((s, y) => s + y.employees, 0);
    expect(summed).toBeLessThanOrEqual(WARN_SUMMARY.employeesTotal);
  });

  it("never presents a future date as a 'last updated' date", () => {
    // Effective-date-only states (New Jersey) carry records dated months ahead.
    // Those are legitimate data, but nothing may surface one as a freshness date.
    const today = new Date().toISOString().slice(0, 10);
    expect(WARN_SOURCE.sourceUpdatedAt <= today).toBe(true);
    for (const m of buildMetrics()) {
      expect(m.sourceUpdatedAt.slice(0, 10) <= today, `${m.key} is dated in the future`).toBe(true);
    }
  });

  it("records which date basis each state publishes", () => {
    for (const s of WARN_SUMMARY.states) {
      expect(["notice", "effective", "mixed"]).toContain(s.dateBasis);
      // A state whose latest date is in the future must be flagged as
      // effective-date-based, so pages can word it correctly.
      const today = new Date().toISOString().slice(0, 10);
      if (s.latestNotice && s.latestNotice > today) {
        expect(s.dateBasis, `${s.code} has a future date but claims filing dates`).not.toBe("notice");
      }
    }
  });

  it("names the covered states explicitly so a partial total can't read as national", () => {
    expect(WARN_COVERAGE_SENTENCE).toContain("not a national total");
    for (const code of WARN_SUMMARY.stateCodes) {
      expect(WARN_COVERAGE_SENTENCE).toContain(code);
    }
  });
});

// =============================================================================
// Provenance labelling — no figure may be presented without one, and a modeled
// figure may never claim to be reported.
// =============================================================================
describe("provenance labelling", () => {
  const metrics = buildMetrics();
  const VALID = ["reported", "projected", "estimated", "modeled"];

  it("labels every homepage metric", () => {
    expect(metrics.length).toBeGreaterThan(0);
    for (const m of metrics) {
      expect(VALID, `${m.key} has provenance "${m.provenance}"`).toContain(m.provenance);
    }
  });

  it("gives every metric a source name, URL and date", () => {
    for (const m of metrics) {
      expect(m.sourceName, `${m.key} missing sourceName`).toBeTruthy();
      expect(m.sourceUrl, `${m.key} missing sourceUrl`).toMatch(/^https?:\/\//);
      expect(m.sourceUpdatedAt, `${m.key} missing sourceUpdatedAt`).toBeTruthy();
    }
  });

  it("labels the WARN layoff metric reported, since it is now real filings", () => {
    const warn = metrics.find((m) => m.key === "layoffs_year");
    expect(warn).toBeDefined();
    expect(warn!.provenance).toBe("reported");
    expect(warn!.tooltip).toContain("not a national total");
  });

  it("labels the curated-subset wage metric modeled, not reported", () => {
    const wage = metrics.find((m) => m.key === "avg_h1b_wage");
    expect(wage).toBeDefined();
    expect(wage!.provenance).toBe("modeled");
  });

  it("labels every change-feed and insight item", () => {
    for (const item of buildChangeFeed()) {
      expect(VALID, `change ${item.key}`).toContain(item.provenance);
      expect(item.sourceUrl).toMatch(/^https?:\/\//);
    }
    for (const item of buildInsights()) {
      expect(VALID, `insight ${item.key}`).toContain(item.provenance);
      expect(item.sourceUrl).toMatch(/^https?:\/\//);
    }
  });
});

// =============================================================================
// Fiscal-year drift — the year we CLAIM must equal the year we INGESTED.
// =============================================================================
describe("employer fiscal year", () => {
  it("derives the Data Hub year from the ingested file, not a constant", () => {
    const employers = JSON.parse(src("lib/generated/employers.json"));
    const dataset = JSON.parse(src("lib/generated/dataset.json"));
    expect(dataset.DATAHUB_LATEST_FY).toBe(employers.fiscalYear);
  });

  it("points the top-employer metric at the Data Hub year it actually read", () => {
    const employers = JSON.parse(src("lib/generated/employers.json"));
    const metric = buildMetrics().find((m) => m.key === "top_h1b_employer");
    expect(metric).toBeDefined();
    expect(metric!.fiscalYear).toBe(employers.fiscalYear);
    expect(metric!.tooltip).toContain(`FY${employers.fiscalYear}`);
  });

  it("shows the directory's #1 sponsor, not a curated profile", () => {
    const employers = JSON.parse(src("lib/generated/employers.json"));
    const metric = buildMetrics().find((m) => m.key === "top_h1b_employer");
    expect(metric!.value).toBe(employers.employers[0].approvals);
  });
});

// =============================================================================
// WARN × H-1B employer matching — the join behind the professional product.
// =============================================================================
describe("employer matching", () => {
  const rows = warnH1bCrossLink();

  it("returns rows that exist on both sides of the join", () => {
    for (const r of rows) {
      expect(r.warnSlug, `${r.name} missing WARN slug`).toBeTruthy();
      expect(r.h1bSlug, `${r.name} missing H-1B slug`).toBeTruthy();
      expect(r.approvals).toBeGreaterThan(0);
      expect(r.notices).toBeGreaterThan(0);
    }
  });

  it("never emits the same employer twice", () => {
    const slugs = rows.map((r) => r.h1bSlug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps approval rates within range", () => {
    for (const r of rows) {
      expect(r.approvalRate).toBeGreaterThanOrEqual(0);
      expect(r.approvalRate).toBeLessThanOrEqual(1);
    }
  });

  it("attaches at least one state to every matched employer", () => {
    for (const r of rows) {
      expect(r.states.length).toBeGreaterThan(0);
      for (const s of r.states) expect(s).toMatch(/^[A-Z]{2}$/);
    }
  });
});
