// Central site configuration + shared copy.

export const SITE = {
  name: "ImmigrationClock",
  title: "The Immigration Clock",
  subtitle:
    "U.S. immigration policy changes traced to official sources, plus public data on enforcement, visas and the immigrant workforce.",
  positioning:
    "Track the immigration, visa, enforcement, and workforce numbers shaping America.",
  tagline: "Facts first. Freshness labelled. Sources included.",
  // Canonical production domain. Override with NEXT_PUBLIC_SITE_URL (e.g. for
  // local dev or preview deploys); defaults to the live domain so canonical,
  // sitemap, robots, and OG URLs are correct in production without extra config.
  url:
    (process.env.NEXT_PUBLIC_SITE_URL || "https://immigrationclock.com").replace(/\/$/, ""),
  // Social + contact are OPT-IN via environment variables, and default to empty.
  //
  // These appear in schema.org `sameAs` and on public pages, which means they are
  // claims the platform makes about itself. Asserting an account or inbox that is
  // not actually owned and monitored is the same category of error as publishing
  // an unsourced statistic — so they stay absent until configured, rather than
  // being hardcoded to a plausible-looking guess.
  //
  // Set NEXT_PUBLIC_TWITTER_HANDLE (the handle including its leading @) and
  // NEXT_PUBLIC_CONTACT_EMAIL once the account and inbox genuinely exist.
  twitter: process.env.NEXT_PUBLIC_TWITTER_HANDLE || "",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "",
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
  // Second position, deliberately. "What changed" is the platform's flagship
  // answer and the reason a reader comes back; burying it under a section menu
  // would make the recurring question the hardest one to reach.
  { href: "/what-changed", label: "What changed" },
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
      { href: "/migration-map", label: "Origin map", desc: "Where H-1B & F-1 visa holders come from" },
      { href: "/h1b/top-sponsors", label: "Top H-1B sponsors", desc: "Approvals, denials, offered wages" },
      { href: "/h1b/employers", label: "Employer directory", desc: "Search 2,600+ real sponsors" },
      { href: "/visa/f1-student-visas", label: "F-1 student visas", desc: "Issuances by year & country" },
      { href: "/layoffs", label: "Live layoffs", desc: "Real WARN notices from state portals" },
      { href: "/layoffs-vs-h1b", label: "Layoffs vs H-1B", desc: "Sponsorship & WARN, side by side" },
    ],
  },
  {
    label: "For Immigrants",
    href: "/for-you",
    children: [
      { href: "/for-you", label: "What this means for you", desc: "The data read for your situation" },
      { href: "/key-dates", label: "Key dates & deadlines", desc: "H-1B, tax, DV lottery, OPT — counted down" },
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
      { href: "/migration-map", label: "Visa origin map" },
      { href: "/h1b/top-sponsors", label: "Top H-1B sponsors" },
      { href: "/h1b/employers", label: "H-1B employer directory" },
      { href: "/visa/f1-student-visas", label: "F-1 student visas" },
      { href: "/layoffs", label: "Live layoffs (WARN)" },
      { href: "/layoffs-vs-h1b", label: "Layoffs vs H-1B" },
    ],
  },
  {
    title: "Explore",
    links: [
      { href: "/for-you", label: "What this means for you" },
      { href: "/key-dates", label: "Key dates & deadlines" },
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
      { href: "/developers", label: "Free WARN API" },
      { href: "/sources", label: "Sources" },
      { href: "/admin/refresh-status", label: "Refresh status" },
      { href: "/admin/pulse-email", label: "Pulse email (weekly)" },
    ],
  },
];
