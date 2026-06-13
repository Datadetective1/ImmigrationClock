// Central site configuration + shared copy.

export const SITE = {
  name: "ImmigrationClock",
  title: "The Immigration Clock",
  subtitle:
    "Live and latest available public data on U.S. immigration enforcement, visas, border activity, and workforce impact.",
  positioning:
    "Track the immigration, visa, enforcement, and workforce numbers shaping America.",
  tagline: "Facts first. Trends live. Sources included.",
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000",
  twitter: "@immigrationclock",
  // Public contact address — update to your real address (do NOT use a personal
  // inbox you don't want public). Used on About / Privacy / Terms pages.
  contactEmail: "hello@immigrationclock.com",
  searchPlaceholder: "Search employer, state, visa type, job title, or country.",
  heroDisclaimer:
    "Figures come from official U.S. government releases (USCIS, ICE, CBP, the State Department, and BLS). FY2024 is the most recent complete year for most series; FY2025 is preliminary and detention is a point-in-time figure. Every counter shows its source and date.",
  footerDisclaimer:
    "This platform uses public datasets for informational and research purposes only. It does not provide legal, immigration, employment, or financial advice. Data may lag official reporting schedules.",
};

export const NAV_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/immigration/enforcement-trends", label: "Enforcement" },
  { href: "/border/encounters", label: "Border" },
  { href: "/h1b/top-sponsors", label: "H-1B" },
  { href: "/visa/f1-student-visas", label: "Visas" },
  { href: "/layoffs-vs-h1b", label: "Jobs & Wages" },
  { href: "/methodology", label: "Methodology" },
  { href: "/sources", label: "Sources" },
];

export const FOOTER_SECTIONS = [
  {
    title: "Dashboards",
    links: [
      { href: "/immigration/enforcement-trends", label: "Enforcement trends" },
      { href: "/border/encounters", label: "Border encounters" },
      { href: "/h1b/top-sponsors", label: "Top H-1B sponsors" },
      { href: "/visa/f1-student-visas", label: "F-1 student visas" },
      { href: "/layoffs-vs-h1b", label: "Layoffs vs H-1B" },
    ],
  },
  {
    title: "Explore",
    links: [
      { href: "/state/CA", label: "State pages" },
      { href: "/country/india", label: "Country pages" },
      { href: "/company/amazon", label: "Employer pages" },
      { href: "/h1b/salaries/software-engineer", label: "H-1B salaries" },
    ],
  },
  {
    title: "About the data",
    links: [
      { href: "/methodology", label: "Methodology" },
      { href: "/sources", label: "Sources" },
      { href: "/admin/refresh-status", label: "Refresh status" },
    ],
  },
];
