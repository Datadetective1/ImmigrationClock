// =============================================================================
// RESOURCES CATALOG
//
// Founder Directive Part 5: "Revenue is earned by creating additional value, not
// by restricting essential public information", and Part 1: "Trust is the
// product. Revenue is the consequence of trust."
//
// This catalog was previously described as the site's primary revenue layer and
// rendered 16 partners across state pages, country pages, employer pages, the
// persona experience, and key dates. That put commercial offers inside the data
// experience, which is the tension the Directive resolves in favour of trust.
//
// As of 2026-08-01:
//   • The catalog is trimmed to services that answer a genuine IMMIGRATION need.
//     Generic newcomer commerce (money transfer, eSIM, insurance, moving, job
//     boards, consumer tax prep) was removed. It was not immigration information,
//     and it is the first thing a journalist or researcher would discount us for.
//   • Entries are split into OFFICIAL (free government / nonprofit resources,
//     no commercial relationship) and PARTNER (commercial, clearly labelled).
//   • Resources render ONLY on /resources. Data pages, employer pages, topic
//     pages, methodology, and the persona experience stay editorially clean.
//   • Display advertising was removed from the platform entirely.
//
// Compensation must never influence data presentation or ranking. Nothing in this
// file is referenced by any ranking, chart, or figure anywhere in the codebase.
// =============================================================================

export type PartnerCategory =
  | "legal"
  | "documents"
  | "career"
  | "money-transfer"
  | "tax"
  | "banking"
  | "insurance"
  | "connectivity"
  | "relocation"
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
  /**
   * `official` — a free government or nonprofit resource. No commercial
   * relationship exists or may exist. Carries no "Partner" label, needs no
   * affiliate disclosure, and is never rel="sponsored".
   * `partner` — a commercial service. Always labelled, always disclosed, always
   * rel="sponsored".
   */
  kind: "official" | "partner";
}

export const CATEGORY_META: Record<PartnerCategory, { label: string; blurb: string }> = {
  legal: {
    label: "Immigration legal help",
    blurb: "Attorney-reviewed applications and case help — green card, citizenship, work visas, RFEs.",
  },
  documents: {
    label: "Documents & credentials",
    blurb: "Certified translations and U.S. equivalency reports for the foreign documents and degrees USCIS asks for.",
  },
  career: {
    label: "Jobs & visa sponsorship",
    blurb: "Find employers with a track record of sponsoring work visas and green cards.",
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
  relocation: {
    label: "Moving & relocation",
    blurb: "Ship your belongings across borders and get settled once you arrive.",
  },
  education: {
    label: "Exam & document prep",
    blurb: "Study and document tools for the citizenship test, OPT, and the visa journey.",
  },
};

// The catalog. Defaults point to each service's public homepage; replace with your
// tracked affiliate/referral links via NEXT_PUBLIC_PARTNER_LINKS (see header).
const CATALOG: Partner[] = [
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
    kind: "partner",
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
    kind: "official",
  },
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
    kind: "partner",
  },
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
    kind: "official",
  },
  {
    id: "credential-evaluation",
    name: "Foreign degree evaluation",
    category: "documents",
    blurb: "Turn your overseas degree into a U.S. equivalency report — accepted by USCIS, employers, and licensing boards.",
    useWhen: "An employer, USCIS, or a licensing board asks for a U.S. equivalency of your foreign education.",
    cta: "Evaluate your degree",
    url: "https://www.wes.org",
    personas: ["h1b-worker", "eb-applicant", "f1-student", "general"],
    icon: "📜",
    kind: "partner",
  },
  {
    id: "document-translation",
    name: "Certified document translation",
    category: "documents",
    blurb: "USCIS-compliant certified translations of birth and marriage certificates, diplomas, and other records.",
    useWhen: "You're filing non-English documents with USCIS and need a certified English translation.",
    cta: "Get a translation quote",
    url: "https://www.rushtranslate.com",
    personas: ["eb-applicant", "h1b-worker", "f1-student", "general"],
    icon: "📄",
    kind: "partner",
  },
  {
    id: "credit-builder",
    name: "Build your U.S. credit score",
    category: "banking",
    blurb: "Credit-builder accounts and secured cards that report to the bureaus, so you can establish a U.S. score from scratch.",
    useWhen: "You have little or no U.S. credit history and want to start building a score.",
    cta: "Start building credit",
    url: "https://www.consumerfinance.gov/consumer-tools/building-credit/",
    personas: ["f1-student", "h1b-worker", "eb-applicant", "general"],
    icon: "📈",
    kind: "official",
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
/** The raw catalog, for tests and audits that must see every entry. */
export const PARTNERS_ALL: Partner[] = CATALOG;

export function allPartners(): ResolvedPartner[] {
  return CATALOG.map(resolve);
}

/** Partners grouped by category, in catalog order — for the /resources hub. */
export function partnersByCategory(): { category: PartnerCategory; partners: ResolvedPartner[] }[] {
  const order: PartnerCategory[] = [
    "legal",
    "documents",
    "career",
    "tax",
    "banking",
    "money-transfer",
    "insurance",
    "connectivity",
    "relocation",
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
