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
  searchPlaceholder: "Search a visa, country or topic",
  heroDisclaimer:
    "Figures come from official U.S. government releases (USCIS, ICE, CBP, the State Department, and BLS). This is not a real-time feed: most datasets are published monthly to yearly. We show the latest available period and label every number reported, projected, or estimated.",
  footerDisclaimer:
    "This platform uses public datasets for informational and research purposes only. It does not provide legal, immigration, employment, or financial advice. It is not a real-time feed. Datasets are refreshed on a schedule and lag official reporting. Every figure is labelled reported, projected, or estimated.",
};

// Task-first navigation. Five destinations a reader can name, one dropdown,
// and the professional tools in a small "Pro" menu beside search and the
// account, so they stay one tap away without dominating the public bar.
//
// Every route that used to be in the bar is still reachable: the data hubs and
// directories under "Data & trends", Timeline and Pulse from What Changed and
// Data & trends, Following and Explained from For you, and every page from the
// footer. Nothing was removed; only where the links live changed.
export interface NavChild {
  href: string;
  label: string;
  desc?: string;
}
export interface NavItem {
  label: string;
  href?: string; // single link, or the hub landing page for a group
  children?: NavChild[];
  /**
   * Extra path prefixes that belong to this section, for the "you are here"
   * highlight.
   *
   * Without this the navbar highlighted nothing on every generated page — the
   * 2,600+ employer records, the company, state, country and salary pages —
   * because no nav href is a prefix of any of them (/h1b/top-sponsors does not
   * contain /h1b/state/CA). Those are precisely the pages a reader arrives on
   * from Google, with the least idea where they have landed.
   */
  match?: string[];
  /** Rendered beside search and account rather than in the main bar. */
  utility?: boolean;
}

export const NAV: NavItem[] = [
  // First, deliberately: the platform's flagship answer and the reason a
  // reader comes back.
  { href: "/what-changed", label: "What changed", match: ["/what-changed", "/timeline"] },
  { href: "/for-you", label: "For you", match: ["/for-you", "/following", "/explained"] },
  {
    label: "Data & trends",
    href: "/insights",
    // Every generated employer, company, state, country and salary page lives
    // here — together the large majority of the site's URLs.
    match: [
      "/insights",
      "/pulse",
      "/work-visas",
      "/h1b",
      "/visa",
      "/company",
      "/employer",
      "/state",
      "/country",
      "/migration-map",
      "/layoffs",
      "/layoffs-vs-h1b",
      "/enforcement",
      "/immigration",
      "/border",
    ],
    children: [
      { href: "/work-visas", label: "Work visas & sponsors", desc: "H-1B sponsors, salaries, F-1 and the employer directory" },
      { href: "/enforcement", label: "Enforcement & border", desc: "ICE arrests, removals, detention and CBP encounters" },
      { href: "/layoffs", label: "Layoffs", desc: "WARN notices, and layoffs beside H-1B sponsorship" },
      { href: "/insights", label: "Insights", desc: "What the numbers say, in plain language" },
      { href: "/pulse", label: "Monthly Pulse", desc: "How the data moved this month" },
    ],
  },
  { href: "/key-dates", label: "Key dates" },
  { href: "/resources", label: "Resources" },
  {
    label: "Pro",
    href: "/pricing",
    utility: true,
    match: ["/pricing", "/briefing", "/monitor", "/developers"],
    children: [
      { href: "/briefing", label: "Your Briefing", desc: "Your follows, dates ahead and saved research" },
      // The live sample. Your Briefing above is a sign-in wall for a visitor,
      // so this is the one Pro page they can actually open and look at.
      { href: "/briefing/example", label: "Example Briefing", desc: "A live sample. No sign-up needed" },
      { href: "/monitor", label: "Monitor", desc: "What changed that matters to your work, with the evidence" },
      { href: "/developers", label: "API", desc: "The same intelligence as JSON. Free, no key" },
      { href: "/pricing", label: "Pricing", desc: "What Pro adds, and what stays free" },
    ],
  },
];

/** The mobile tab bar: the four things a returning reader opens most. */
export const TAB_BAR: { href: string; label: string; icon: "home" | "changes" | "dates" | "following" }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/what-changed", label: "What changed", icon: "changes" },
  { href: "/key-dates", label: "Key dates", icon: "dates" },
  { href: "/following", label: "Following", icon: "following" },
];

export const FOOTER_SECTIONS = [
  {
    title: "Data & trends",
    links: [
      { href: "/work-visas", label: "Work visas & sponsors" },
      { href: "/h1b/top-sponsors", label: "Top H-1B sponsors" },
      { href: "/h1b/employers", label: "H-1B employer directory" },
      { href: "/h1b/salaries/software-engineer", label: "H-1B salaries" },
      { href: "/visa/f1-student-visas", label: "F-1 student visas" },
      { href: "/migration-map", label: "Visa origin map" },
      { href: "/enforcement", label: "Enforcement & border" },
      { href: "/immigration/enforcement-trends", label: "Enforcement trends" },
      { href: "/border/encounters", label: "Border encounters" },
      { href: "/layoffs", label: "Live layoffs (WARN)" },
      { href: "/layoffs-vs-h1b", label: "Layoffs vs H-1B" },
      { href: "/state/CA", label: "State pages" },
      { href: "/country/india", label: "Country pages" },
      { href: "/company/amazon", label: "Employer pages" },
    ],
  },
  {
    title: "Stay informed",
    links: [
      { href: "/what-changed", label: "What changed" },
      { href: "/timeline", label: "Timeline" },
      { href: "/for-you", label: "What this means for you" },
      { href: "/key-dates", label: "Key dates & deadlines" },
      { href: "/following", label: "Following" },
      { href: "/resources", label: "Resources for immigrants" },
      { href: "/insights", label: "Insights" },
      // Was /admin/pulse-email — the operator's build dashboard, which under
      // this label is exactly what a reader looking for the weekly email
      // clicks. The page a reader wants is /pulse, where the sign-up form is.
      { href: "/pulse#subscribe", label: "Weekly Pulse email" },
      { href: "/briefing/example", label: "Example Pro Briefing" },
    ],
  },
  {
    title: "About the data",
    links: [
      { href: "/explained", label: "Explained (plain English)" },
      { href: "/methodology", label: "Methodology" },
      { href: "/sources", label: "Sources" },
      { href: "/data", label: "Data & freshness" },
      { href: "/data-manifest", label: "Data manifest" },
      { href: "/developers", label: "Free API" },
    ],
  },
];
