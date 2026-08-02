import { describe, it, expect } from "vitest";
import sitemap from "@/app/sitemap";
import { SITE } from "@/lib/site";
import { EMPLOYERS } from "@/lib/employers";

const entries = sitemap();
const paths = new Set(entries.map((e) => e.url.replace(SITE.url, "")));

describe("sitemap", () => {
  it("includes every real public route", () => {
    // These were all missing before 2026-08-01 and were never submitted for crawl.
    const required = [
      "/",
      "/developers",
      "/layoffs",
      "/layoffs-vs-h1b",
      "/migration-map",
      "/insights",
      "/pulse",
      "/for-you",
      "/key-dates",
      "/methodology",
      "/h1b/employers",
      "/h1b/top-sponsors",
      "/border/encounters",
      "/immigration/enforcement-trends",
      "/visa/f1-student-visas",
    ];
    for (const p of required) {
      expect(paths.has(p), `sitemap is missing ${p}`).toBe(true);
    }
  });

  it("excludes routes that should not be indexed", () => {
    for (const p of paths) {
      expect(p.startsWith("/admin"), `admin route ${p} must not be in the sitemap`).toBe(false);
    }
    expect(paths.has("/search")).toBe(false);
  });

  it("contains no duplicate URLs", () => {
    const urls = entries.map((e) => e.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("keeps every programmatic employer page", () => {
    // These are the site's long-tail SEO asset — losing them silently would be
    // an invisible traffic regression.
    for (const e of EMPLOYERS.slice(0, 50)) {
      expect(paths.has(`/employer/${e.slug}`), `missing /employer/${e.slug}`).toBe(true);
    }
    const employerEntries = [...paths].filter((p) => p.startsWith("/employer/"));
    expect(employerEntries.length).toBe(EMPLOYERS.length);
  });

  it("uses absolute URLs on the canonical host", () => {
    for (const e of entries) {
      expect(e.url.startsWith(`${SITE.url}/`) || e.url === `${SITE.url}/`).toBe(true);
    }
  });

  it("reports real per-source dates, not one build timestamp for everything", () => {
    const stamps = new Set(
      entries.map((e) => (e.lastModified instanceof Date ? e.lastModified.toISOString() : String(e.lastModified)))
    );
    // Previously every entry shared a single `new Date()` value.
    expect(stamps.size).toBeGreaterThan(1);
  });

  it("never dates a page in the future", () => {
    const now = Date.now();
    for (const e of entries) {
      const t = e.lastModified instanceof Date ? e.lastModified.getTime() : Date.parse(String(e.lastModified));
      expect(t, `${e.url} is dated in the future`).toBeLessThanOrEqual(now + 86_400_000);
    }
  });
});
