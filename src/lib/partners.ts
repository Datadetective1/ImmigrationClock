// =============================================================================
// PARTNER / RESOURCE CATALOG — the site's primary revenue layer.
//
// ImmigrationClock sits in one of the highest-intent, highest-value verticals on
// the web: people making real immigration, money, and tax decisions. The most
// useful AND most monetizable thing we can do for them is point them — clearly
// and honestly — to vetted services they already need (immigration legal help,
// international money transfer, non-resident tax filing, newcomer banking,
// student/visitor health insurance, eSIMs). Most of these run affiliate or
// referral programs that pay per signup/lead, which in this niche is far more
// valuable per visitor than display ads.
//
// PRINCIPLES (so this stays trustworthy, which is what keeps it earning):
//   • Every placement is clearly labelled "Partner" and links to /disclosure.
//   • We only list services a real newcomer would plausibly want.
//   • Outbound partner links use rel="sponsored nofollow noopener".
//   • Nothing here is advice; it sits beside data, never inside it.
//
// HOW THE OPERATOR TURNS THIS INTO MONEY (no code changes required):
//   Set NEXT_PUBLIC_PARTNER_LINKS to a JSON object mapping partner id -> your
//   tracked affiliate/referral URL, e.g. in Vercel env:
//     NEXT_PUBLIC_PARTNER_LINKS={"wise":"https://wise.com/invite/...","sprintax":"https://..."}
//   Any id you don't override falls back to the partner's public homepage, so the
//   module is useful (but un-attributed) out of the box. You can also just edit the
//   `url` fields below directly.
// =============================================================================

export type PartnerCategory =
  | "legal"
  | "money-transfer"
  | "tax"
  | "banking"
  | "insurance"
  | "connectivity"
  | "education";

export type PersonaKey =
  | "h1b-worker"
  | "f1-student"
  | "employer"
  | "eb-applicant"
  | "general";

export interface Partner {
  id: string;
  name: string;
  category: PartnerCategory;
  /** One-line value proposition shown on the card. */
  blurb: string;
  /** When a visitor would actually reach for this — the "is this for me?" line. */
  useWhen: string;
  /** Button label. */
  cta: string;
  /** Default destination (public homepage). Override per id via NEXT_PUBLIC_PARTNER_LINKS. */
  url: string;
  /** Personas this is most relevant to (drives contextual placement). */
  personas: PersonaKey[];
  /** Optional badge, e.g. "Free", "Popular". */
  badge?: string;
  /** Emoji icon (kept text-only so the static export has zero image weight). */
  icon: string;
}

export const CATEGORY_META: Record<PartnerCategory, { label: string; blurb: string }> = {
  legal: {
    label: "Immigration legal help",
    blurb: "Attorney-reviewed applications and case help — green card, citizenship, work visas, RFEs.",
  },
  "money-transfer": {
    label: "Send money internationally",
    blurb: "Move money across borders at the real exchange rate, without the bank markup.",
  },
  tax: {
    label: "U.S. tax filing",
    blurb: "File correctly as a nonresident, visa holder, or new resident — including treaty benefits.",
  },
  banking: {
    label: "Banking & credit for newcomers",
    blurb: "Open accounts and build U.S. credit without a Social Security history.",
  },
  insurance: {
    label: "Health & travel insurance",
    blurb: "Coverage built for students, visa holders, and new arrivals in the U.S.",
  },
  connectivity: {
    label: "Phone & connectivity",
    blurb: "Get connected the day you land — eSIM data plans, no local contract needed.",
  },
  education: {
    label: "Exam & document prep",
    blurb: "Study and document tools for the citizenship test, OPT, and the visa journey.",
  },
};

// The catalog. Defaults point to each service's public homepage; replace with your
// tracked affiliate/referral links via NEXT_PUBLIC_PARTNER_LINKS (see header).
const CATALOG: Partner[] = [
  // --- Immigration legal help (highest value per lead) ----------------------
  {
    id: "boundless",
    name: "Boundless",
    category: "legal",
    blurb: "Guided green-card, marriage-visa, and citizenship applications with independent attorney review.",
    useWhen: "You want a lawyer-checked application without paying full attorney rates.",
    cta: "Check your eligibility",
    url: "https://www.boundless.com",
    personas: ["eb-applicant", "h1b-worker", "general"],
    badge: "Attorney-reviewed",
    icon: "⚖️",
  },
  {
    id: "attorney-match",
    name: "Find an immigration attorney",
    category: "legal",
    blurb: "Connect with a licensed immigration lawyer for complex cases — RFEs, denials, appeals, employment-based filings.",
    useWhen: "Your case is complicated, time-sensitive, or you've had a denial or RFE.",
    cta: "Get matched with a lawyer",
    url: "https://www.americanbar.org/groups/legal_services/flh-home/flh-lawyer-referral-directory/",
    personas: ["h1b-worker", "eb-applicant", "employer", "general"],
    icon: "🧑‍⚖️",
  },

  // --- Money transfer / remittance ------------------------------------------
  {
    id: "wise",
    name: "Wise",
    category: "money-transfer",
    blurb: "Send money abroad at the mid-market rate with low, transparent fees and a multi-currency account.",
    useWhen: "You support family abroad or move money between countries and currencies.",
    cta: "See live transfer rates",
    url: "https://wise.com",
    personas: ["h1b-worker", "f1-student", "eb-applicant", "general"],
    badge: "Popular",
    icon: "💸",
  },
  {
    id: "remitly",
    name: "Remitly",
    category: "money-transfer",
    blurb: "Remittances built for immigrants — fast bank deposits and cash pickup to dozens of countries.",
    useWhen: "You send money home regularly and want delivery to a local bank or cash pickup.",
    cta: "Send your first transfer",
    url: "https://www.remitly.com",
    personas: ["h1b-worker", "f1-student", "general"],
    icon: "🌍",
  },

  // --- Tax filing ------------------------------------------------------------
  {
    id: "sprintax",
    name: "Sprintax",
    category: "tax",
    blurb: "Nonresident U.S. tax returns for F-1/J-1 students and scholars, with tax-treaty handling built in.",
    useWhen: "You're on an F-1 or J-1 visa and need to file a nonresident (1040-NR) return.",
    cta: "Start your nonresident return",
    url: "https://www.sprintax.com",
    personas: ["f1-student", "general"],
    badge: "For students",
    icon: "🧾",
  },
  {
    id: "resident-tax",
    name: "File your U.S. taxes",
    category: "tax",
    blurb: "Guided federal and state filing once you pass the substantial-presence test and file as a resident.",
    useWhen: "You're now a U.S. tax resident (e.g. on H-1B or a green card) and want simple guided filing.",
    cta: "File your return",
    url: "https://www.irs.gov/filing/free-file-do-your-federal-taxes-for-free",
    personas: ["h1b-worker", "eb-applicant", "general"],
    icon: "📊",
  },

  // --- Banking & credit ------------------------------------------------------
  {
    id: "newcomer-credit",
    name: "Newcomer banking & credit",
    category: "banking",
    blurb: "Open a U.S. account and get a credit card using your visa and global credit history — no SSN credit file required.",
    useWhen: "You just arrived and need a bank account and a way to start a U.S. credit score.",
    cta: "Compare newcomer accounts",
    url: "https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/",
    personas: ["h1b-worker", "f1-student", "eb-applicant", "general"],
    icon: "🏦",
  },

  // --- Insurance -------------------------------------------------------------
  {
    id: "newcomer-insurance",
    name: "Student & visitor health insurance",
    category: "insurance",
    blurb: "Medical coverage designed for international students, exchange visitors, and new arrivals to the U.S.",
    useWhen: "Your school, J-1 program, or family visit needs U.S.-compliant health coverage.",
    cta: "Get an insurance quote",
    url: "https://www.healthcare.gov/immigrants/",
    personas: ["f1-student", "general"],
    icon: "🩺",
  },

  // --- Connectivity ----------------------------------------------------------
  {
    id: "esim",
    name: "Airalo eSIM",
    category: "connectivity",
    blurb: "Land with data already working — a U.S. eSIM you install before your flight, no contract.",
    useWhen: "You're arriving in the U.S. and want a phone connection the moment you land.",
    cta: "Get a U.S. eSIM",
    url: "https://www.airalo.com",
    personas: ["f1-student", "h1b-worker", "general"],
    icon: "📱",
  },

  // --- Education / exam prep -------------------------------------------------
  {
    id: "citizenship-prep",
    name: "Citizenship test prep",
    category: "education",
    blurb: "Practice the official USCIS civics questions and English test, free, before your naturalization interview.",
    useWhen: "You're preparing for the naturalization (N-400) interview and civics test.",
    cta: "Practice the civics test",
    url: "https://www.uscis.gov/citizenship/find-study-materials-and-resources/study-for-the-test",
    personas: ["eb-applicant", "general"],
    badge: "Free",
    icon: "🎓",
  },
];

// --- Operator overrides ------------------------------------------------------
// Parse the JSON map of id -> tracked URL once at module load. Invalid JSON is
// ignored (we keep the homepage defaults) so a typo can never break the build.
function overrideMap(): Record<string, string> {
  const raw = process.env.NEXT_PUBLIC_PARTNER_LINKS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
const OVERRIDES = overrideMap();

/** A partner with its final (possibly operator-overridden) outbound URL resolved. */
export interface ResolvedPartner extends Partner {
  href: string;
  /** True when the operator has supplied a tracked affiliate/referral link. */
  tracked: boolean;
}

function resolve(p: Partner): ResolvedPartner {
  const override = OVERRIDES[p.id];
  return { ...p, href: override || p.url, tracked: Boolean(override) };
}

/** Whole catalog, resolved. */
export function allPartners(): ResolvedPartner[] {
  return CATALOG.map(resolve);
}

/** Partners grouped by category, in catalog order — for the /resources hub. */
export function partnersByCategory(): { category: PartnerCategory; partners: ResolvedPartner[] }[] {
  const order: PartnerCategory[] = [
    "legal",
    "tax",
    "money-transfer",
    "banking",
    "insurance",
    "connectivity",
    "education",
  ];
  return order
    .map((category) => ({
      category,
      partners: allPartners().filter((p) => p.category === category),
    }))
    .filter((g) => g.partners.length > 0);
}

/**
 * Best-fit partners for a persona, most relevant first, capped. Used for the
 * contextual modules on /for-you, company, country, and state pages.
 */
export function partnersForPersona(persona: PersonaKey, limit = 3): ResolvedPartner[] {
  const exact = allPartners().filter((p) => p.personas.includes(persona));
  if (exact.length >= limit) return exact.slice(0, limit);
  // Top up with general-interest partners not already included.
  const seen = new Set(exact.map((p) => p.id));
  const general = allPartners().filter((p) => p.personas.includes("general") && !seen.has(p.id));
  return [...exact, ...general].slice(0, limit);
}

/** A specific set of partners by id (for hand-placed modules). */
export function partnersByIds(ids: string[]): ResolvedPartner[] {
  const map = new Map(allPartners().map((p) => [p.id, p]));
  return ids.map((id) => map.get(id)).filter((p): p is ResolvedPartner => Boolean(p));
}
