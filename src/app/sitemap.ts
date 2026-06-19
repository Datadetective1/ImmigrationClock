import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { companies, states, countries } from "@/lib/dataset";
import { EMPLOYERS } from "@/lib/employers";
import { seoPages, SALARY_JOB_TITLES } from "@/lib/seo-pages";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const base = SITE.url;

  const staticPaths = [
    "/",
    "/for-you",
    "/key-dates",
    "/resources",
    "/disclosure",
    "/pulse",
    "/insights",
    "/timeline",
    "/explained",
    "/methodology",
    "/sources",
    "/data",
    "/data-manifest",
    "/about",
    "/privacy",
    "/terms",
    "/enforcement",
    "/work-visas",
    "/immigration/enforcement-trends",
    "/border/encounters",
    "/visa/f1-student-visas",
    "/layoffs-vs-h1b",
    "/h1b/top-sponsors",
    "/h1b/employers",
  ];

  const entries: MetadataRoute.Sitemap = staticPaths.map((p) => ({
    url: `${base}${p}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: p === "/" ? 1 : 0.8,
  }));

  for (const c of companies) {
    entries.push({ url: `${base}/company/${c.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.7 });
  }
  for (const s of states) {
    entries.push({ url: `${base}/state/${s.code}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
    entries.push({ url: `${base}/h1b/state/${s.code}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  }
  for (const c of countries) {
    entries.push({ url: `${base}/country/${c.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  }
  for (const t of SALARY_JOB_TITLES) {
    entries.push({ url: `${base}/h1b/salaries/${t.slug}`, lastModified: now, changeFrequency: "monthly", priority: 0.6 });
  }
  for (const e of EMPLOYERS) {
    entries.push({ url: `${base}/employer/${e.slug}`, lastModified: now, changeFrequency: "yearly", priority: 0.5 });
  }

  // De-duplicate any overlap with the programmatic SEO list.
  const seen = new Set(entries.map((e) => e.url));
  for (const p of seoPages()) {
    const url = `${base}${p.slug}`;
    if (!seen.has(url)) {
      entries.push({ url, lastModified: now, changeFrequency: p.changefreq as "weekly", priority: p.priority });
      seen.add(url);
    }
  }

  return entries;
}
