// Central site configuration + shared copy.

export const SITE = {
  name: "ImmigrationClock",
  title: "The Immigration Clock",
  subtitle:
    "The latest available public data on U.S. immigration enforcement, visas, border activity, and workforce impact — every figure labelled reported, projected, or estimated.",
  positioning:
    "Track the immigration, visa, enforcement, and workforce numbers shaping America.",
  tagline: "Facts first. Freshness labelled. Sources included.",
  url:
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "http://localhost:3000",
  twitter: "@immigrationclock",
  // Public contact address — update to your real address (do NOT use a personal
  // inbox you don't want public). Used on About / Privacy / Terms pages.
  contactEmail: "hello@immigrationclock.com",
  searchPlaceholder: "Search employer, state, visa type, job title, or country.",
  heroDisclaimer:
    "Figures come from official U.S. government releases (USCIS, ICE, CBP, the State Department, and BLS). This is not a real-time feed: most datasets are published monthly to yearly. We show the latest available period and label every number reported, projected, or estimated.",
  footerDisclaimer:
    "This platform uses public datasets for informational and research purposes only. It does not provide legal, immigration, employment, or financial advice. It is not a real-time feed — datasets are refreshed on a schedule and lag official reporting. Every figure is labelled reported, projected, or estimated.",
};

// Grouped navigation. Top-level items are either a single link or a hub with a
// dropdown of related trackers. This keeps the bar to ~6 items (down from 14) and
// gives each audience a clear home — the two data hubs (Enforcement & Border, Work
// & Visas) are also the natural seams for a future site split.
export interface NavChild {
  href: string;
  label: string;
  desc?: string;
}
export interface NavItem {
  label: string;
  href?: string; // single link, or the hub landing page for a group
  children?: NavChild[];
}

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  {
    label: "Enforcement & Border",
    href: "/enforcement",
    children: [
      { href: "/enforcement", label: "Section overview", desc: "The enforcement & border picture at a glance" },
      { href: "/immigration/enforcement-trends", label: "Enforcement trends", desc: "ICE arrests, removals, detention" },
      { href: "/border/encounters", label: "Border encounters", desc: "CBP encounters & demographics" },
      { href: "/timeline", label: "Policy timeline", desc: "Events overlaid on the data" },
    ],
  },
  {
    label: "Work & Visas",
    href: "/work-visas",
    children: [
      { href: "/work-visas", label: "Section overview", desc: "Visas, sponsors & the workforce at a glance" },
      { href: "/h1b/top-sponsors", label: "Top H-1B sponsors", desc: "Approvals, denials, offered wages" },
      { href: "/h1b/employers", label: "Employer directory", desc: "Search 2,600+ real sponsors" },
      { href: "/visa/f1-student-visas", label: "F-1 student visas", desc: "Issuances by year & country" },
      { href: "/layoffs-vs-h1b", label: "Layoffs vs H-1B", desc: "Sponsorship & WARN, side by side" },
    ],
  },
  {
    label: "For Immigrants",
    href: "/for-you",
    children: [
      { href: "/for-you", label: "What this means for you", desc: "The data read for your situation" },
      { href: "/resources", label: "Resources & services", desc: "Legal, tax, money transfer & more" },
      { href: "/explained", label: "Explained", desc: "Plain-English definitions" },
    ],
  },
  { href: "/insights", label: "Insights" },
  { href: "/pulse", label: "Pulse" },
];

export const FOOTER_SECTIONS = [
  {
    title: "Dashboards",
    links: [
      { href: "/enforcement", label: "Enforcement & Border hub" },
      { href: "/immigration/enforcement-trends", label: "Enforcement trends" },
      { href: "/border/encounters", label: "Border encounters" },
      { href: "/work-visas", label: "Work & Visas hub" },
      { href: "/h1b/top-sponsors", label: "Top H-1B sponsors" },
      { href: "/h1b/employers", label: "H-1B employer directory" },
      { href: "/visa/f1-student-visas", label: "F-1 student visas" },
      { href: "/layoffs-vs-h1b", label: "Layoffs vs H-1B" },
    ],
  },
  {
    title: "Explore",
    links: [
      { href: "/for-you", label: "What this means for you" },
      { href: "/resources", label: "Resources for immigrants" },
      { href: "/insights", label: "Insights" },
      { href: "/timeline", label: "Timeline" },
      { href: "/state/CA", label: "State pages" },
      { href: "/country/india", label: "Country pages" },
      { href: "/company/amazon", label: "Employer pages" },
      { href: "/h1b/salaries/software-engineer", label: "H-1B salaries" },
    ],
  },
  {
    title: "About the data",
    links: [
      { href: "/explained", label: "Explained (plain English)" },
      { href: "/data", label: "Data & freshness" },
      { href: "/data-manifest", label: "Data manifest" },
      { href: "/methodology", label: "Methodology" },
      { href: "/sources", label: "Sources" },
      { href: "/admin/refresh-status", label: "Refresh status" },
      { href: "/admin/pulse-email", label: "Pulse email (weekly)" },
    ],
  },
];
