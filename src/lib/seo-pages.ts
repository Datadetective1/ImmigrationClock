import { companies, states } from "./dataset";
import { topOccupationsBySponsorship } from "./data";
import { slugify } from "./format";

// Programmatically enumerated SEO landing pages for the sitemap + internal links.
export interface SeoPageEntry {
  slug: string; // full path
  title: string;
  description: string;
  category: "h1b" | "enforcement" | "border" | "visa" | "layoffs";
  changefreq: string;
  priority: number;
}

export function seoPages(): SeoPageEntry[] {
  const pages: SeoPageEntry[] = [
    {
      slug: "/h1b/top-sponsors",
      title: "Top H-1B Sponsors",
      description: "The employers filing the most H-1B petitions, with approval rates and offered wages.",
      category: "h1b",
      changefreq: "weekly",
      priority: 0.9,
    },
    {
      slug: "/immigration/enforcement-trends",
      title: "Immigration Enforcement Trends",
      description: "ICE arrests, removals, and detention population over time.",
      category: "enforcement",
      changefreq: "weekly",
      priority: 0.9,
    },
    {
      slug: "/border/encounters",
      title: "Border Encounters",
      description: "CBP southwest, northern, and nationwide encounters by year and month.",
      category: "border",
      changefreq: "daily",
      priority: 0.9,
    },
    {
      slug: "/visa/f1-student-visas",
      title: "F-1 Student Visas",
      description: "F-1 academic student visa issuances and trends by country.",
      category: "visa",
      changefreq: "weekly",
      priority: 0.8,
    },
    {
      slug: "/layoffs-vs-h1b",
      title: "Layoffs vs H-1B Sponsorship",
      description: "Compare WARN layoff notices with H-1B sponsorship — without claiming causation.",
      category: "layoffs",
      changefreq: "weekly",
      priority: 0.8,
    },
  ];

  // /h1b/salaries/[jobTitle]
  for (const occ of topOccupationsBySponsorship()) {
    pages.push({
      slug: `/h1b/salaries/${slugify(occ.title)}`,
      title: `${occ.title} H-1B Salaries`,
      description: `Average H-1B offered wages and sponsoring employers for ${occ.title}.`,
      category: "h1b",
      changefreq: "monthly",
      priority: 0.7,
    });
  }

  // /h1b/state/[stateCode]
  for (const s of states) {
    pages.push({
      slug: `/h1b/state/${s.code}`,
      title: `H-1B Sponsorship in ${s.name}`,
      description: `Top H-1B employers, occupations, and offered wages in ${s.name}.`,
      category: "h1b",
      changefreq: "monthly",
      priority: 0.6,
    });
  }

  // /company/[slug]
  for (const c of companies) {
    pages.push({
      slug: `/company/${c.slug}`,
      title: `${c.name} H-1B & Workforce`,
      description: `${c.name} H-1B approvals, denials, offered wages, worksites, and layoffs.`,
      category: "h1b",
      changefreq: "weekly",
      priority: 0.7,
    });
  }

  return pages;
}

export const SALARY_JOB_TITLES = topOccupationsBySponsorship().map((o) => ({
  slug: slugify(o.title),
  title: o.title,
}));
