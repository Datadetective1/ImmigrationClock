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
  | "education"
  | "citizenship";

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
   * The relationship, and nothing more than we can show:
   * `official`  — a free government or nonprofit resource. No commercial
   *               relationship exists or may exist.
   * `service`   — an independent commercial service we list because readers
   *               need it. We have NO agreement with it and earn nothing: no
   *               "Affiliate" label, no tracking, never rel="sponsored".
   * `affiliate` — a verified affiliate program we are enrolled in, with a
   *               referral URL in this file. Always labelled "Affiliate",
   *               always disclosed, always rel="sponsored", placement-tracked.
   * A service becomes an affiliate only when the program has approved us and
   * its referral URL is set here; a homepage link never earns a commission.
   */
  kind: "official" | "service" | "affiliate";
  /**
   * The query parameter this partner's affiliate program reads a placement
   * sub-id from. Defaults to `subid`. ImmiTranslate's dashboard reads `sub`.
   */
  subParam?: string;
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
  "citizenship": {
    label: "Citizenship test",
    blurb: "Free official study materials for the naturalization interview.",
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
    kind: "service",
  },
  {
    id: "attorney-match",
    name: "ABA lawyer referral directory",
    category: "legal",
    blurb: "The American Bar Association's directory of local lawyer referral services, for finding a licensed immigration attorney.",
    useWhen: "Your case is complicated, time-sensitive, or you've had a denial or RFE.",
    cta: "Find a referral service",
    url: "https://www.americanbar.org/groups/legal_services/flh-home/flh-lawyer-referral-directory/",
    personas: ["h1b-worker", "eb-applicant", "employer", "general"],
    icon: "🧑‍⚖️",
    kind: "official",
  },
  {
    id: "uscis-legal-services",
    name: "USCIS: find legal services",
    category: "legal",
    blurb: "USCIS's own guide to authorized help: licensed attorneys, accredited representatives, and how to avoid immigration scams.",
    useWhen: "You want free or low-cost help, or to check that someone helping you is authorized.",
    cta: "See who can help",
    url: "https://www.uscis.gov/avoid-scams/find-legal-services",
    personas: ["eb-applicant", "h1b-worker", "f1-student", "general"],
    badge: "Free",
    icon: "🏛️",
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
    kind: "service",
  },
  {
    id: "citizenship-prep",
    name: "USCIS citizenship study materials",
    category: "citizenship",
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
    kind: "service",
  },
  {
    id: "document-translation",
    name: "ImmiTranslate",
    category: "documents",
    blurb: "USCIS-compliant certified translations of birth and marriage certificates, diplomas, and other records.",
    useWhen: "You're filing non-English documents with USCIS and need a certified English translation.",
    cta: "Get a translation quote",
    // ImmigrationClock's own ImmiTranslate referral link (10% commission,
    // 90-day attribution). Public by nature — it is the href every reader
    // clicks — so it lives here rather than only in NEXT_PUBLIC_PARTNER_LINKS,
    // and production earns from it without depending on an env var.
    url: "https://immitranslate.com/?ref=948mg968",
    personas: ["eb-applicant", "h1b-worker", "f1-student", "general"],
    icon: "📄",
    kind: "affiliate",
    subParam: "sub",
  },
  {
    id: "credit-builder",
    name: "CFPB guide to building credit",
    category: "banking",
    blurb: "The Consumer Financial Protection Bureau's free guide to establishing a U.S. credit history from scratch.",
    useWhen: "You have little or no U.S. credit history and want to start building a score.",
    cta: "Read the guide",
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
    "citizenship",
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
