import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { SOURCES, SOURCE_BY_KEY, officialSources, monthsSinceVerified } from "@/lib/sources";
import { refreshRows } from "@/lib/refresh";
import { buildInsights } from "@/lib/insights";
import { buildMetrics } from "@/lib/data";
import { SITE } from "@/lib/site";
import { jsonLd } from "@/lib/seo";
import { __testing as FR } from "@/domains/graph/adapters/federal-register";
import { EVENTS, EVENT_STORE_META, eventCoverageNote } from "@/lib/event-store";

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

// =============================================================================
// ARCHIVE COVERAGE — the store must describe itself by what it HOLDS.
//
// Both regressions below shipped to production and were found by audit, not by
// this suite. They are the same class of error: a number that looks like a fact
// about our data but is actually an artefact of the last build.
// =============================================================================
describe("archive coverage claims", () => {
  it("dates the archive from its oldest event, not the last run's lookback", () => {
    // `since` is one build's window. Rendering it as the coverage boundary told
    // readers the archive began 2026-05-04 on a page showing events from 2025.
    const oldest = EVENTS.reduce<string | null>(
      (min, e) => (min === null || e.publishedAt < min ? e.publishedAt : min),
      null
    );
    expect(EVENT_STORE_META.earliestEvent).toBe(oldest);
    // No ordering holds between the two: the archive starts at its oldest
    // DOCUMENT, which can fall either side of a given run's lookback. That they
    // are independent is the whole point — one cannot stand in for the other.
  });

  it("never quotes the run window as the archive's start to a reader", () => {
    const note = eventCoverageNote();
    expect(note).not.toContain(EVENT_STORE_META.since);
    if (EVENT_STORE_META.earliestEvent) {
      expect(note).toContain(EVENT_STORE_META.earliestEvent);
    }
  });

  it("paginates every Federal Register query instead of reading page one", () => {
    // Measured 2026-08-02: page-one-only read 100 of 4,196 matching documents
    // and reported no truncation. Any reintroduction of a bare `per_page` cap on
    // these two adapters is that bug returning.
    for (const a of ["federal-register", "executive-actions"]) {
      const s = src(`domains/graph/adapters/${a}.ts`);
      expect(s, `${a} must not hand-roll a page size`).not.toContain("per_page");
      expect(s, `${a} must read the whole window`).toContain("fetchAllDocuments");
      expect(s, `${a} must report when the per-run cap engages`).toContain("capEvents");
    }
  });
});

// =============================================================================
// STRUCTURED DATA — JSON-LD is injected as raw HTML, so it must be escaped.
// =============================================================================
describe("json-ld injection safety", () => {
  it("neutralises a tag-closing sequence in third-party text", () => {
    // Breadcrumb labels on /employer/[slug] come from DOL disclosure files.
    const evil = { name: "Acme </script><img src=x onerror=alert(1)>" };
    const out = jsonLd(evil);
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<img");
    // Escaping must not corrupt the data itself.
    expect(JSON.parse(out).name).toBe(evil.name);
  });

  it("is used by every script tag that injects structured data", () => {
    for (const c of ["Faq", "PageHeader", "StructuredData"]) {
      const s = src(`components/${c}.tsx`);
      expect(s, `${c} injects unescaped JSON`).not.toMatch(
        /__html:\s*JSON\.stringify/
      );
      expect(s, `${c} should use the escaping helper`).toContain("jsonLd(");
    }
  });
});

// =============================================================================
// MOBILE INPUT SIZING
//
// iOS Safari zooms the viewport whenever a focused input renders below 16px,
// and does not zoom back out. On a text box that is a page-jump on every tap.
// Missed on the site-wide SearchBar during the first accessibility pass because
// only the /what-changed explorer was checked — so it is asserted across every
// text input rather than fixed one component at a time.
// =============================================================================
describe("typed inputs are at least 16px on mobile", () => {
  // Every .tsx under src, discovered rather than listed.
  //
  // The first version of this test named five components by hand and passed
  // while PulseSignup — the newsletter field, the one interaction the site
  // actually asks a reader to complete — sat at 14px. A hardcoded inventory
  // is the same defect as reading page one of a paginated API: it reports
  // confidently on whatever it happened to enumerate.
  function tsxFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) tsxFiles(p, acc);
      else if (entry.name.endsWith(".tsx")) acc.push(p);
    }
    return acc;
  }

  const SRC = fileURLToPath(new URL("../src", import.meta.url));
  // Controls that are not typed into never trigger the iOS zoom.
  const NOT_TYPED = new Set(["hidden", "checkbox", "radio", "submit", "button", "range", "color"]);

  it("finds inputs to check at all", () => {
    // Guards the guard: a regex that silently matches nothing would make every
    // assertion below vacuously true.
    expect(tsxFiles(SRC).length).toBeGreaterThan(20);
  });

  it("uses at least text-base on every element that takes typed text", () => {
    const offenders: string[] = [];
    let checked = 0;
    for (const file of tsxFiles(SRC)) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/<input[\s\S]*?\/>/g)) {
        const el = m[0];
        const type = (/type="([^"]*)"/.exec(el) ?? [, "text"])[1];
        if (NOT_TYPED.has(type)) continue;
        checked++;
        const cls = (/className="([^"]*)"/.exec(el) ?? [, ""])[1];
        if (/\btext-(xs|sm)\b/.test(cls)) {
          offenders.push(`${file.split(/[\/]/).pop()} (type=${type})`);
        }
      }
    }
    expect(checked, "no typed inputs were inspected — the matcher is broken").toBeGreaterThan(0);
    expect(offenders, "inputs below 16px make iOS zoom the viewport on focus").toEqual([]);
  });
});

// =============================================================================
// RELEVANCE — an agency's NAME is not evidence of a document's subject.
//
// "U.S. Customs and Border Protection" contains the word "border", and CBP names
// itself in the abstract of everything it publishes. The bare term "border"
// therefore admitted every customs document the agency has ever issued: 167 of
// 685 Federal Register events (24%), 21 of them ranked major — cargo manifests,
// free-trade agreements, quarterly IRS interest rates. Found by walking the site
// as a reader, not by any test, which is why one exists now.
//
// Third occurrence of this bug class; "petition" caused the first two.
// =============================================================================
describe("federal register relevance filter", () => {
  const relevant = (title: string, abstract: string | null = null) =>
    FR.isImmigrationRelevant({ title, abstract });

  it("does not treat the CBP agency name as an immigration signal", () => {
    // Real titles and abstracts from the store, all previously ingested.
    expect(
      relevant(
        "Extension of Import Restrictions on Archaeological and Ethnological Material of Türkiye",
        "This document amends U.S. Customs and Border Protection (CBP) regulations to reflect an extension of import restrictions."
      )
    ).toBe(false);
    expect(
      relevant("Customs User Fees To Be Adjusted for Inflation in Fiscal Year 2027", "CBP announces the adjusted amounts.")
    ).toBe(false);
    expect(
      relevant("Quarterly IRS Interest Rates Used in Calculating Interest on Overdue Accounts", "U.S. Customs and Border Protection publishes the rates.")
    ).toBe(false);
  });

  it("still admits genuine border-policy documents", () => {
    // The fix must not cost real coverage — this is the whole risk of tightening.
    expect(relevant("Securing the Border", "Restricting entry between ports of entry at the southwest border.")).toBe(true);
    expect(relevant("Expedited Removal at the Border", null)).toBe(true);
    expect(relevant("Inadmissibility of Certain Aliens", "Grounds of inadmissibility.")).toBe(true);
    expect(relevant("Application for Employment Authorization", null)).toBe(true);
  });

  it("keeps the committed store free of pure customs documents", () => {
    const junk = EVENTS.filter((e) =>
      /archaeological|ethnological|cargo manifest|free trade agreement|customs user fee|irs interest rate/i.test(
        e.title
      )
    );
    expect(junk.map((e) => `${e.id}: ${e.title}`)).toEqual([]);
  });
});
