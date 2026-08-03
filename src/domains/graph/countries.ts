// =============================================================================
// COUNTRY REGISTRY — for "Who is affected?" extraction
//
// The curated dataset carries ten countries because those are the ones with
// enough data for a country page. Impact extraction needs all of them: the Visa
// Bond Program names African countries that have no page here, and a reader from
// one of those countries still needs to know the rule exists.
//
// Every entry is `country:<slug>` in the graph, using the same normalizeSlug()
// as everything else, so a country resolved from a Federal Register rule is the
// same node as a country on an existing country page.
//
// ALIASES ARE THE WHOLE POINT
// ---------------------------
// Government documents are inconsistent: "Republic of Korea" / "South Korea",
// "Burma" / "Myanmar", "Cote d'Ivoire" / "Côte d'Ivoire" / "Ivory Coast". A
// missed alias means a reader from that country is told a rule does not affect
// them. Aliases are therefore generous — but short and ambiguous forms
// ("Chad", "Jordan", "Georgia", "Turkey") are handled in AMBIGUOUS_COUNTRY_NAMES
// below, because those words appear constantly in ordinary prose.
// =============================================================================

import { entityId, normalizeSlug, type EntityId } from "./entities";

export interface CountryDef {
  /** Canonical display name. */
  name: string;
  /** ISO 3166-1 alpha-2, for joining against other datasets. */
  iso2: string;
  /** Alternate names that appear in government text. */
  aliases?: string[];
}

/**
 * Country names that are also common English words, U.S. state names, or given
 * names. These are matched ONLY when a disambiguating context word is nearby
 * (see COUNTRY_CONTEXT_TERMS) — otherwise "nationals of Georgia" and "the state
 * of Georgia" would produce the same edge.
 */
export const AMBIGUOUS_COUNTRY_NAMES = new Set([
  "chad",
  "jordan",
  "georgia",
  "turkey",
  "guinea",
  "niger",
  "mali",
  "oman",
  "togo",
  "cuba",
  "chile",
  "china", // "china" as a material; rare but real in trade-adjacent notices
  "india", // "india ink"; rare, but the cost of a wrong edge is high
]);

/**
 * Words that, appearing near a country name, indicate it is being used as a
 * country. Immigration documents are formulaic enough that this is reliable.
 */
export const COUNTRY_CONTEXT_TERMS = [
  "national",
  "nationals",
  "citizen",
  "citizens",
  "country",
  "countries",
  "government of",
  "republic of",
  "born in",
  "chargeab", // "chargeability" — Visa Bulletin language
  "passport",
  "designat", // "designated countries"
  "applicant",
  "beneficiar",
  "from",
];

/**
 * ISO 3166-1 countries. Ordered alphabetically for maintenance, not by any
 * ranking — this list must never imply importance.
 */
export const COUNTRIES: CountryDef[] = [
  { name: "Afghanistan", iso2: "AF" },
  { name: "Albania", iso2: "AL" },
  { name: "Algeria", iso2: "DZ" },
  { name: "Andorra", iso2: "AD" },
  { name: "Angola", iso2: "AO" },
  { name: "Antigua and Barbuda", iso2: "AG" },
  { name: "Argentina", iso2: "AR" },
  { name: "Armenia", iso2: "AM" },
  { name: "Australia", iso2: "AU" },
  { name: "Austria", iso2: "AT" },
  { name: "Azerbaijan", iso2: "AZ" },
  { name: "Bahamas", iso2: "BS", aliases: ["The Bahamas"] },
  { name: "Bahrain", iso2: "BH" },
  { name: "Bangladesh", iso2: "BD" },
  { name: "Barbados", iso2: "BB" },
  { name: "Belarus", iso2: "BY" },
  { name: "Belgium", iso2: "BE" },
  { name: "Belize", iso2: "BZ" },
  { name: "Benin", iso2: "BJ" },
  { name: "Bhutan", iso2: "BT" },
  { name: "Bolivia", iso2: "BO" },
  { name: "Bosnia and Herzegovina", iso2: "BA", aliases: ["Bosnia"] },
  { name: "Botswana", iso2: "BW" },
  { name: "Brazil", iso2: "BR" },
  { name: "Brunei", iso2: "BN", aliases: ["Brunei Darussalam"] },
  { name: "Bulgaria", iso2: "BG" },
  { name: "Burkina Faso", iso2: "BF" },
  { name: "Burundi", iso2: "BI" },
  { name: "Cabo Verde", iso2: "CV", aliases: ["Cape Verde"] },
  { name: "Cambodia", iso2: "KH" },
  { name: "Cameroon", iso2: "CM" },
  { name: "Canada", iso2: "CA" },
  { name: "Central African Republic", iso2: "CF" },
  { name: "Chad", iso2: "TD" },
  { name: "Chile", iso2: "CL" },
  { name: "China", iso2: "CN", aliases: ["People's Republic of China", "mainland China"] },
  { name: "Colombia", iso2: "CO" },
  { name: "Comoros", iso2: "KM" },
  { name: "Congo (Republic)", iso2: "CG", aliases: ["Republic of the Congo", "Congo-Brazzaville"] },
  { name: "Congo (Democratic Republic)", iso2: "CD", aliases: ["Democratic Republic of the Congo", "DRC", "Congo-Kinshasa"] },
  { name: "Costa Rica", iso2: "CR" },
  { name: "Côte d'Ivoire", iso2: "CI", aliases: ["Cote d'Ivoire", "Ivory Coast"] },
  { name: "Croatia", iso2: "HR" },
  { name: "Cuba", iso2: "CU" },
  { name: "Cyprus", iso2: "CY" },
  { name: "Czechia", iso2: "CZ", aliases: ["Czech Republic"] },
  { name: "Denmark", iso2: "DK" },
  { name: "Djibouti", iso2: "DJ" },
  { name: "Dominica", iso2: "DM" },
  { name: "Dominican Republic", iso2: "DO" },
  { name: "Ecuador", iso2: "EC" },
  { name: "Egypt", iso2: "EG" },
  { name: "El Salvador", iso2: "SV" },
  { name: "Equatorial Guinea", iso2: "GQ" },
  { name: "Eritrea", iso2: "ER" },
  { name: "Estonia", iso2: "EE" },
  { name: "Eswatini", iso2: "SZ", aliases: ["Swaziland"] },
  { name: "Ethiopia", iso2: "ET" },
  { name: "Fiji", iso2: "FJ" },
  { name: "Finland", iso2: "FI" },
  { name: "France", iso2: "FR" },
  { name: "Gabon", iso2: "GA" },
  { name: "Gambia", iso2: "GM", aliases: ["The Gambia"] },
  { name: "Georgia", iso2: "GE" },
  { name: "Germany", iso2: "DE" },
  { name: "Ghana", iso2: "GH" },
  { name: "Greece", iso2: "GR" },
  { name: "Grenada", iso2: "GD" },
  { name: "Guatemala", iso2: "GT" },
  { name: "Guinea", iso2: "GN" },
  { name: "Guinea-Bissau", iso2: "GW" },
  { name: "Guyana", iso2: "GY" },
  { name: "Haiti", iso2: "HT" },
  { name: "Honduras", iso2: "HN" },
  { name: "Hungary", iso2: "HU" },
  { name: "Iceland", iso2: "IS" },
  { name: "India", iso2: "IN" },
  { name: "Indonesia", iso2: "ID" },
  { name: "Iran", iso2: "IR", aliases: ["Islamic Republic of Iran"] },
  { name: "Iraq", iso2: "IQ" },
  { name: "Ireland", iso2: "IE" },
  { name: "Israel", iso2: "IL" },
  { name: "Italy", iso2: "IT" },
  { name: "Jamaica", iso2: "JM" },
  { name: "Japan", iso2: "JP" },
  { name: "Jordan", iso2: "JO" },
  { name: "Kazakhstan", iso2: "KZ" },
  { name: "Kenya", iso2: "KE" },
  { name: "Kiribati", iso2: "KI" },
  { name: "Kosovo", iso2: "XK" },
  { name: "Kuwait", iso2: "KW" },
  { name: "Kyrgyzstan", iso2: "KG" },
  { name: "Laos", iso2: "LA", aliases: ["Lao People's Democratic Republic"] },
  { name: "Latvia", iso2: "LV" },
  { name: "Lebanon", iso2: "LB" },
  { name: "Lesotho", iso2: "LS" },
  { name: "Liberia", iso2: "LR" },
  { name: "Libya", iso2: "LY" },
  { name: "Liechtenstein", iso2: "LI" },
  { name: "Lithuania", iso2: "LT" },
  { name: "Luxembourg", iso2: "LU" },
  { name: "Madagascar", iso2: "MG" },
  { name: "Malawi", iso2: "MW" },
  { name: "Malaysia", iso2: "MY" },
  { name: "Maldives", iso2: "MV" },
  { name: "Mali", iso2: "ML" },
  { name: "Malta", iso2: "MT" },
  { name: "Marshall Islands", iso2: "MH" },
  { name: "Mauritania", iso2: "MR" },
  { name: "Mauritius", iso2: "MU" },
  { name: "Mexico", iso2: "MX" },
  { name: "Micronesia", iso2: "FM", aliases: ["Federated States of Micronesia"] },
  { name: "Moldova", iso2: "MD" },
  { name: "Monaco", iso2: "MC" },
  { name: "Mongolia", iso2: "MN" },
  { name: "Montenegro", iso2: "ME" },
  { name: "Morocco", iso2: "MA" },
  { name: "Mozambique", iso2: "MZ" },
  { name: "Myanmar", iso2: "MM", aliases: ["Burma"] },
  { name: "Namibia", iso2: "NA" },
  { name: "Nauru", iso2: "NR" },
  { name: "Nepal", iso2: "NP" },
  { name: "Netherlands", iso2: "NL", aliases: ["The Netherlands", "Holland"] },
  { name: "New Zealand", iso2: "NZ" },
  { name: "Nicaragua", iso2: "NI" },
  { name: "Niger", iso2: "NE" },
  { name: "Nigeria", iso2: "NG" },
  { name: "North Korea", iso2: "KP", aliases: ["Democratic People's Republic of Korea", "DPRK"] },
  { name: "North Macedonia", iso2: "MK", aliases: ["Macedonia"] },
  { name: "Norway", iso2: "NO" },
  { name: "Oman", iso2: "OM" },
  { name: "Pakistan", iso2: "PK" },
  { name: "Palau", iso2: "PW" },
  { name: "Panama", iso2: "PA" },
  { name: "Papua New Guinea", iso2: "PG" },
  { name: "Paraguay", iso2: "PY" },
  { name: "Peru", iso2: "PE" },
  { name: "Philippines", iso2: "PH", aliases: ["The Philippines"] },
  { name: "Poland", iso2: "PL" },
  { name: "Portugal", iso2: "PT" },
  { name: "Qatar", iso2: "QA" },
  { name: "Romania", iso2: "RO" },
  { name: "Russia", iso2: "RU", aliases: ["Russian Federation"] },
  { name: "Rwanda", iso2: "RW" },
  { name: "Saint Kitts and Nevis", iso2: "KN" },
  { name: "Saint Lucia", iso2: "LC" },
  { name: "Saint Vincent and the Grenadines", iso2: "VC" },
  { name: "Samoa", iso2: "WS" },
  { name: "San Marino", iso2: "SM" },
  { name: "Sao Tome and Principe", iso2: "ST", aliases: ["São Tomé and Príncipe"] },
  { name: "Saudi Arabia", iso2: "SA" },
  { name: "Senegal", iso2: "SN" },
  { name: "Serbia", iso2: "RS" },
  { name: "Seychelles", iso2: "SC" },
  { name: "Sierra Leone", iso2: "SL" },
  { name: "Singapore", iso2: "SG" },
  { name: "Slovakia", iso2: "SK" },
  { name: "Slovenia", iso2: "SI" },
  { name: "Solomon Islands", iso2: "SB" },
  { name: "Somalia", iso2: "SO" },
  { name: "South Africa", iso2: "ZA" },
  { name: "South Korea", iso2: "KR", aliases: ["Republic of Korea", "Korea, South"] },
  { name: "South Sudan", iso2: "SS" },
  { name: "Spain", iso2: "ES" },
  { name: "Sri Lanka", iso2: "LK" },
  { name: "Sudan", iso2: "SD" },
  { name: "Suriname", iso2: "SR" },
  { name: "Sweden", iso2: "SE" },
  { name: "Switzerland", iso2: "CH" },
  { name: "Syria", iso2: "SY", aliases: ["Syrian Arab Republic"] },
  { name: "Taiwan", iso2: "TW" },
  { name: "Tajikistan", iso2: "TJ" },
  { name: "Tanzania", iso2: "TZ" },
  { name: "Thailand", iso2: "TH" },
  { name: "Timor-Leste", iso2: "TL", aliases: ["East Timor"] },
  { name: "Togo", iso2: "TG" },
  { name: "Tonga", iso2: "TO" },
  { name: "Trinidad and Tobago", iso2: "TT" },
  { name: "Tunisia", iso2: "TN" },
  { name: "Turkey", iso2: "TR", aliases: ["Türkiye"] },
  { name: "Turkmenistan", iso2: "TM" },
  { name: "Tuvalu", iso2: "TV" },
  { name: "Uganda", iso2: "UG" },
  { name: "Ukraine", iso2: "UA" },
  { name: "United Arab Emirates", iso2: "AE", aliases: ["UAE"] },
  { name: "United Kingdom", iso2: "GB", aliases: ["Great Britain", "U.K."] },
  { name: "Uruguay", iso2: "UY" },
  { name: "Uzbekistan", iso2: "UZ" },
  { name: "Vanuatu", iso2: "VU" },
  { name: "Venezuela", iso2: "VE" },
  { name: "Vietnam", iso2: "VN", aliases: ["Viet Nam"] },
  { name: "Yemen", iso2: "YE" },
  { name: "Zambia", iso2: "ZM" },
  { name: "Zimbabwe", iso2: "ZW" },
];

export function countryEntityId(name: string): EntityId {
  return entityId("country", name);
}

/** slug → definition, for looking up a country resolved from text. */
export const COUNTRY_BY_SLUG = new Map<string, CountryDef>(
  COUNTRIES.map((c) => [normalizeSlug(c.name), c])
);

/** iso2 → definition. */
export const COUNTRY_BY_ISO2 = new Map<string, CountryDef>(
  COUNTRIES.map((c) => [c.iso2, c])
);

interface CountryMatcher {
  re: RegExp;
  slug: string;
  surface: string;
  ambiguous: boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest surface form first, so "South Korea" wins over "Korea". */
const MATCHERS: CountryMatcher[] = (() => {
  const out: CountryMatcher[] = [];
  for (const c of COUNTRIES) {
    const slug = normalizeSlug(c.name);
    for (const surface of [c.name, ...(c.aliases ?? [])]) {
      const lower = surface.toLowerCase();
      out.push({
        re: new RegExp(`(?<![a-z0-9])${escapeRe(lower)}(?![a-z0-9])`, "i"),
        slug,
        surface,
        ambiguous: AMBIGUOUS_COUNTRY_NAMES.has(lower),
      });
    }
  }
  return out.sort((a, b) => b.surface.length - a.surface.length);
})();

export interface CountryMatch {
  entityId: EntityId;
  name: string;
  iso2: string;
  surface: string;
  /** Verbatim sentence containing the mention, used as impact evidence. */
  evidence: string;
}

/**
 * Split text into sentences for evidence extraction. Crude but adequate:
 * we only need a quotable span, not linguistic correctness.
 */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.;:])\s+(?=[A-Z(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Trim to a length on a word boundary, marking the cut. */
function clipOnWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const body = (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return body.endsWith("…") ? body : `${body}…`;
}

/**
 * Find countries named in a document, with the sentence that names each one.
 *
 * Ambiguous names ("Georgia", "Turkey", "Chad") are only accepted when the
 * containing sentence also carries a country-context term. Without that guard,
 * "the State of Georgia" and "nationals of Georgia" would produce the same edge
 * — and a reader from Tbilisi would be told a U.S. state law affects them.
 */
export function findCountriesInText(text: string): CountryMatch[] {
  if (!text?.trim()) return [];
  const found = new Map<string, CountryMatch>();

  for (const sentence of sentences(text)) {
    const lower = sentence.toLowerCase();
    const hasContext = COUNTRY_CONTEXT_TERMS.some((t) => lower.includes(t));

    for (const m of MATCHERS) {
      if (found.has(m.slug)) continue;
      if (!m.re.test(sentence)) continue;
      if (m.ambiguous && !hasContext) continue;

      const def = COUNTRY_BY_SLUG.get(m.slug);
      if (!def) continue;
      found.set(m.slug, {
        entityId: entityId("country", def.name),
        name: def.name,
        iso2: def.iso2,
        surface: m.surface,
        // Trim very long sentences so the evidence quote stays readable while
        // still showing the reader exactly where the claim comes from.
        //
        // Trimmed on a WORD boundary. A fixed-width slice cuts mid-word and
        // hands the reader "…required from certain juris" as verbatim source
        // text — the same defect extract-impact.ts fixed in its own chunker, and
        // the same reason it matters: a mangled quote is worse than no quote.
        evidence: clipOnWord(sentence, 320),
      });
    }
  }
  return [...found.values()];
}
