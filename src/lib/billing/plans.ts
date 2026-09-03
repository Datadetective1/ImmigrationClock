// =============================================================================
// WHAT IS FREE, WHAT IS PAID, AND WHY
//
// The founder directive is unambiguous (Part 5, "The Business Model"): the
// public platform stays the primary destination, and revenue is "earned by
// creating additional value, not by restricting essential public information."
// So this file starts from a rule rather than a price list:
//
//   NOTHING THAT IS FREE TODAY BECOMES PAID.
//
// Every capability below that carries a plan of "pro" is a capability the site
// does not have at all right now. The change archive, all 543 change pages, the
// 2,614-employer directory, the WARN feed, the free JSON and CSV API, the
// weekly newsletter, the explainers, the data signals, in-browser follows and
// the existing CSV buttons stay exactly as they are: free, indexable, and
// unauthenticated. A reader who never pays loses nothing they had.
//
// That is not only ethics, it is the SEO engine. Every one of those pages is a
// search entry point; putting any of them behind a login would remove them from
// the index and cut the top of the funnel that a paid tier depends on.
//
// WHAT PRO IS, THEN
// -----------------
// Pro is monitoring and bulk work — the two things a professional needs and a
// visitor does not:
//
//   • Alerts. The site already knows how to filter changes by entity
//     (src/lib/follows.ts) and the newsletter engine already supports an
//     entity-filtered edition (docs/newsletter.md §Segments). Nobody can
//     receive one, because there is no way to say "these are my entities" to
//     the server. That is the product.
//   • Bulk export. The archive and the directory are browsable one record at a
//     time. A researcher or a mobility team wants the whole filtered set.
//   • Depth. Filters and comparisons that only make sense to someone working
//     the data professionally.
//
// PRICES LIVE IN STRIPE, NOT HERE
// -------------------------------
// The amounts below are for DISPLAY and are labelled as an untested assumption
// in docs/monetization.md. The authoritative price is the Stripe Price object
// named by STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_ANNUAL. Nothing in this
// repository invents a Stripe id.
// =============================================================================

export const PLAN_IDS = ["free", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export function isPlanId(value: string): value is PlanId {
  return (PLAN_IDS as readonly string[]).includes(value);
}

/** Every capability the site gates. A free capability is listed too, so the table is complete. */
export const CAPABILITIES = [
  "archive_read",
  "employer_directory",
  "public_api",
  "weekly_newsletter",
  "browser_follows",
  "page_csv",
  "watchlist_alerts",
  "watchlist_sync",
  "bulk_export",
  "advanced_filters",
  "employer_monitoring",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/**
 * Whether a paid capability actually works yet.
 *
 * This is on the pricing page, verbatim, beside each line. Selling five
 * features and shipping one is the fastest way to lose a subscriber and to
 * deserve it — and "coming soon" printed honestly costs far less than a refund
 * conversation. A free capability is always "available"; it is the site.
 */
export type CapabilityStatus = "available" | "building" | "planned";

export const STATUS_LABEL: Record<CapabilityStatus, string> = {
  available: "Available now",
  building: "In build",
  planned: "Planned",
};

export interface CapabilitySpec {
  id: Capability;
  label: string;
  /** What it does, in the reader's terms. */
  blurb: string;
  /** The lowest plan that has it. */
  plan: PlanId;
  /** True when the site does this today. A false here is a capability Pro adds. */
  existsToday: boolean;
  /** Does it work yet? Shown to the reader before they pay. */
  status: CapabilityStatus;
}

export const CAPABILITY_SPECS: CapabilitySpec[] = [
  {
    id: "archive_read",
    label: "The full change archive",
    blurb: "Every recorded change, with its source, dates, status and its own page.",
    plan: "free",
    existsToday: true,
    status: "available",
  },
  {
    id: "employer_directory",
    label: "The H-1B employer directory",
    blurb: "Every sponsoring employer in the USCIS export, with approvals, denials and rates.",
    plan: "free",
    existsToday: true,
    status: "available",
  },
  {
    id: "public_api",
    label: "The public WARN API",
    blurb: "The layoff feed as JSON and CSV, no key, no rate limit.",
    plan: "free",
    existsToday: true,
    status: "available",
  },
  {
    id: "weekly_newsletter",
    label: "The weekly newsletter",
    blurb: "Immigration Pulse, every week, free.",
    plan: "free",
    existsToday: true,
    status: "available",
  },
  {
    id: "browser_follows",
    label: "Follows in your browser",
    blurb: "Follow visas, countries, agencies, topics and employers. Stored on your device.",
    plan: "free",
    existsToday: true,
    status: "available",
  },
  {
    id: "page_csv",
    label: "Per-page CSV downloads",
    blurb: "Download the table you are looking at.",
    plan: "free",
    existsToday: true,
    status: "available",
  },
  {
    id: "watchlist_alerts",
    label: "Email alerts on your watchlist",
    blurb:
      "An email when something changes for the employers, visas, countries and topics you follow — not a digest of everything.",
    plan: "pro",
    existsToday: false,
    status: "building",
  },
  {
    id: "watchlist_sync",
    label: "Your watchlist, everywhere",
    blurb: "The same follows on every device, and kept if you clear your browser.",
    plan: "pro",
    existsToday: false,
    status: "available",
  },
  {
    id: "bulk_export",
    label: "Bulk export",
    blurb: "The whole filtered set — archive, directory or layoff feed — as CSV or Excel.",
    plan: "pro",
    existsToday: false,
    status: "planned",
  },
  {
    id: "advanced_filters",
    label: "Professional search",
    blurb: "Filter the archive by agency, classification, severity, effective date and date range at once.",
    plan: "pro",
    existsToday: false,
    status: "planned",
  },
  {
    id: "employer_monitoring",
    label: "Employer monitoring",
    blurb: "Tell me when an employer I watch files a WARN notice or its sponsorship numbers move.",
    plan: "pro",
    existsToday: false,
    status: "building",
  },
];

export const CAPABILITY_BY_ID = new Map(CAPABILITY_SPECS.map((c) => [c.id, c] as const));

export interface PlanSpec {
  id: PlanId;
  name: string;
  /** One line, on the pricing page, under the name. */
  tagline: string;
  /** Display only. Stripe is the authority — see the header. */
  monthlyUsd: number | null;
  annualUsd: number | null;
  /** Which env var names the Stripe Price for each interval. Never a price id. */
  priceEnv: { monthly: string; annual: string } | null;
}

export const PLANS: PlanSpec[] = [
  {
    id: "free",
    name: "Free",
    tagline: "Everything the public platform does. No account, no card, no limits.",
    monthlyUsd: 0,
    annualUsd: 0,
    priceEnv: null,
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "Monitoring and bulk work, for people who follow this professionally.",
    monthlyUsd: 19,
    annualUsd: 190,
    priceEnv: { monthly: "STRIPE_PRICE_PRO_MONTHLY", annual: "STRIPE_PRICE_PRO_ANNUAL" },
  },
];

export const PLAN_BY_ID = new Map(PLANS.map((p) => [p.id, p] as const));

/** The billing intervals a plan can be bought on. */
export const INTERVALS = ["monthly", "annual"] as const;
export type Interval = (typeof INTERVALS)[number];

export function isInterval(value: string): value is Interval {
  return (INTERVALS as readonly string[]).includes(value);
}

/** Two months free on the annual price, stated rather than implied. */
export function annualSavingUsd(plan: PlanSpec): number | null {
  if (plan.monthlyUsd === null || plan.annualUsd === null) return null;
  const saving = plan.monthlyUsd * 12 - plan.annualUsd;
  return saving > 0 ? saving : null;
}

/** The capabilities a plan includes, free ones included. */
export function capabilitiesFor(plan: PlanId): CapabilitySpec[] {
  return CAPABILITY_SPECS.filter((c) => c.plan === "free" || c.plan === plan);
}

/** The capabilities a plan adds over free. Empty for free itself. */
export function capabilitiesAddedBy(plan: PlanId): CapabilitySpec[] {
  return plan === "free" ? [] : CAPABILITY_SPECS.filter((c) => c.plan === plan);
}

/** Paid capabilities that work today. What a subscriber gets on the day they pay. */
export function availableNow(plan: PlanId): CapabilitySpec[] {
  return capabilitiesAddedBy(plan).filter((c) => c.status === "available");
}

/** Paid capabilities that do not work yet. Never sold as if they do. */
export function notYetAvailable(plan: PlanId): CapabilitySpec[] {
  return capabilitiesAddedBy(plan).filter((c) => c.status !== "available");
}
