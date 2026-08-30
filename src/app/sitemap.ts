import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { companies, states, countries, UPDATED } from "@/lib/dataset";
import { EMPLOYERS, EMPLOYERS_META } from "@/lib/employers";
import { WARN_SUMMARY } from "@/lib/warn-summary";
import { LAST_REFRESHED } from "@/lib/data";
import { seoPages, SALARY_JOB_TITLES } from "@/lib/seo-pages";

// Every entry carries a real lastModified: the date the DATA behind that page
// last moved. Previously every URL reported `new Date()` at build time, which
// told crawlers that all ~2,650 pages changed on every deploy — a signal that is
// both false and useless. Now a page's date reflects its own source.
// Clamped to "now": some states publish only the layoff EFFECTIVE date, which is
// routinely in the future. A future lastModified is invalid in a sitemap and
// tells crawlers nothing useful, so a forward-dated source falls back to the
// build date instead.
function asDate(iso: string | null | undefined, fallback: Date): Date {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return d.getTime() > Date.now() ? fallback : d;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url;
  const buildDate = asDate(LAST_REFRESHED, new Date());

  // Per-source freshness dates.
  const employerDate = asDate(EMPLOYERS_META.generatedAt, buildDate);
  const warnDate = asDate(WARN_SUMMARY.maxNoticeDate ?? WARN_SUMMARY.generatedAt, buildDate);
  const borderDate = asDate(UPDATED.cbp_encounters, buildDate);
  const enforcementDate = asDate(UPDATED.ice_stats, buildDate);
  const visaDate = asDate(UPDATED.dos_visa, buildDate);
  const wageDate = asDate(UPDATED.dol_lca, buildDate);

  type Entry = MetadataRoute.Sitemap[number];
  const entries: Entry[] = [];
  const seen = new Set<string>();

  function add(
    path: string,
    lastModified: Date,
    changeFrequency: Entry["changeFrequency"],
    priority: number
  ) {
    const url = `${base}${path}`;
    if (seen.has(url)) return;
    seen.add(url);
    entries.push({ url, lastModified, changeFrequency, priority });
  }

  // ---- Static routes. Grouped by what actually drives their content. -------
  // Anything rendered by the app and meant to be indexed belongs here. The
  // previous list silently omitted /developers, /layoffs, /migration-map,
  // /insights, /pulse and others, so they were never submitted for crawling.
  const STATIC: [path: string, lastModified: Date, freq: Entry["changeFrequency"], priority: number][] = [
    ["/", buildDate, "daily", 1],
    // Change + analysis surfaces — move with the data.
    // /what-changed rebuilds whenever an adapter finds a new government
    // document, which is most publication days, so it is crawled daily.
    ["/what-changed", buildDate, "daily", 0.9],
    ["/pulse", buildDate, "weekly", 0.9],
    ["/insights", buildDate, "weekly", 0.8],
    ["/timeline", buildDate, "monthly", 0.6],
    // Data sections.
    ["/enforcement", enforcementDate, "weekly", 0.8],
    ["/immigration/enforcement-trends", enforcementDate, "weekly", 0.9],
    ["/border/encounters", borderDate, "weekly", 0.9],
    ["/work-visas", employerDate, "weekly", 0.8],
    ["/migration-map", visaDate, "monthly", 0.7],
    ["/visa/f1-student-visas", visaDate, "weekly", 0.8],
    ["/h1b/top-sponsors", employerDate, "weekly", 0.9],
    ["/h1b/employers", employerDate, "weekly", 0.8],
    ["/layoffs", warnDate, "daily", 0.9],
    ["/layoffs-vs-h1b", warnDate, "weekly", 0.8],
    ["/developers", warnDate, "weekly", 0.7],
    // Audience + guidance.
    ["/for-you", buildDate, "monthly", 0.7],
    ["/following", buildDate, "monthly", 0.5],
    ["/key-dates", buildDate, "weekly", 0.8],
    ["/resources", buildDate, "monthly", 0.5],
    ["/explained", buildDate, "monthly", 0.6],
    // Trust + transparency.
    ["/methodology", buildDate, "monthly", 0.7],
    ["/data", buildDate, "weekly", 0.6],
    ["/data-manifest", buildDate, "weekly", 0.4],
    ["/sources", buildDate, "monthly", 0.5],
    ["/about", buildDate, "yearly", 0.4],
    // Policy pages — real, indexable, rarely change.
    ["/privacy", buildDate, "yearly", 0.3],
    ["/terms", buildDate, "yearly", 0.3],
    ["/disclosure", buildDate, "yearly", 0.3],
  ];
  for (const [path, lm, freq, priority] of STATIC) add(path, lm, freq, priority);

  // NOTE: /search is intentionally excluded — it is a navigation utility with no
  // standalone content, and /admin/* is excluded by robots.txt and noindex.

  // ---- Programmatic routes ------------------------------------------------
  for (const c of companies) add(`/company/${c.slug}`, employerDate, "monthly", 0.6);
  for (const s of states) {
    // A state page moves when its WARN feed moves, if it has one.
    const stateWarn = WARN_SUMMARY.states.find((w) => w.code === s.code);
    add(`/state/${s.code}`, asDate(stateWarn?.latestNotice, employerDate), "weekly", 0.6);
    add(`/h1b/state/${s.code}`, employerDate, "monthly", 0.6);
  }
  for (const c of countries) add(`/country/${c.slug}`, visaDate, "monthly", 0.6);
  for (const t of SALARY_JOB_TITLES) add(`/h1b/salaries/${t.slug}`, wageDate, "monthly", 0.6);
  for (const e of EMPLOYERS) add(`/employer/${e.slug}`, employerDate, "monthly", 0.5);

  // Any remaining programmatic SEO landing pages not already covered above.
  for (const p of seoPages()) {
    add(p.slug, buildDate, p.changefreq as Entry["changeFrequency"], p.priority);
  }

  return entries;
}
