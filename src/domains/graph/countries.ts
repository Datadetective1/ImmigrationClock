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
import {
  relationFor,
  strongerRelation,
  isScopeRelation,
  type CountryRelation,
} from "./country-relations";

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
 * Place names that CONTAIN a country name and are not that country.
 *
 * A United States territory is not a foreign state, and the difference is not
 * academic: a rule about who is a U.S. national by birth in AMERICAN SAMOA was
 * classified `country:samoa`, which would send a subscriber monitoring the
 * independent state of Samoa a rule that has nothing to do with it.
 *
 * These are matched first and their character ranges are claimed, so a country
 * name inside one of them cannot also match. They are never themselves
 * classified — a territory is not a country and this file does not pretend
 * otherwise. Where a territory needs to be a first-class entity, it needs its
 * own dimension rather than a wrong country edge.
 */
export const NOT_COUNTRIES = [
  "american samoa",
  "british virgin islands",
  "u.s. virgin islands",
  "us virgin islands",
  "new mexico",
  "northern mariana islands",
  "puerto rico",
  "guam",
  "swains island",
  "british indian ocean territory",
  "french guiana",
  "new jersey",
  "new york",
  "new hampshire",
  "indiana",
  "washington",
];

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
  /**
   * The same pattern, global, so every occurrence in a sentence can be walked.
   *
   * Needed because one country's name can sit inside another's: "Guinea"
   * occurs twice in "Papua New Guinea and Guinea", and only the second one is
   * a mention of Guinea. Testing the first occurrence alone would either
   * accept the wrong one or reject the right one.
   */
  reAll: RegExp;
  slug: string;
  surface: string;
  ambiguous: boolean;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Longest surface form first, so "South Korea" wins over "Korea". */
/** One global matcher per non-country place name, longest first. */
const NOT_COUNTRY_MATCHERS: RegExp[] = [...NOT_COUNTRIES]
  .sort((a, b) => b.length - a.length)
  .map((name) => new RegExp(`(?<![a-z0-9])${escapeRe(name)}(?![a-z0-9])`, "gi"));

const MATCHERS: CountryMatcher[] = (() => {
  const out: CountryMatcher[] = [];
  for (const c of COUNTRIES) {
    const slug = normalizeSlug(c.name);
    for (const surface of [c.name, ...(c.aliases ?? [])]) {
      const lower = surface.toLowerCase();
      const pattern = `(?<![a-z0-9])${escapeRe(lower)}(?![a-z0-9])`;
      out.push({
        re: new RegExp(pattern, "i"),
        reAll: new RegExp(pattern, "gi"),
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
  /**
   * What the country is DOING in this document. See country-relations.ts.
   *
   * The strongest relation any mention of this country supported. A rule that
   * designates Yemen in its operative text and also cites an older Yemen
   * notice is a rule about Yemen, not a citation.
   */
  relation: CountryRelation;
  /**
   * Whether that relation means the document's own coverage is defined by this
   * country. Only three of the seven relations do.
   */
  isScope: boolean;
}

/**
 * Split text into sentences for evidence extraction. Crude but adequate:
 * we only need a quotable span, not linguistic correctness.
 */
function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    // Split on a full stop or a semicolon, NOT on a colon. A colon introduces
    // the list its own clause describes - "The following countries are
    // designated: El Salvador, Guatemala, and Honduras" - and splitting there
    // separates the cue from the countries it governs, which turned a
    // designation into three bare mentions.
    .split(/(?<=[.;])\s+(?=[A-Z(])/)
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
/**
 * Every country named in this text, with what each one is doing there.
 *
 * A country appearing many times keeps the STRONGEST relation any of its
 * mentions supports, and the evidence quote of that mention — so the quote a
 * consumer reads is the one that justifies the claim, not whichever came first.
 */
export function findCountriesInText(text: string, options: { isTitle?: boolean } = {}): CountryMatch[] {
  if (!text?.trim()) return [];
  const found = new Map<string, CountryMatch>();

  for (const sentence of sentences(text)) {
    const lower = sentence.toLowerCase();
    const hasContext = COUNTRY_CONTEXT_TERMS.some((t) => lower.includes(t));

    // Character ranges a longer country name has already claimed in THIS
    // sentence.
    //
    // WHY: word boundaries are not enough when one country's name contains
    // another's. A rule terminating Temporary Protected Status for SOUTH SUDAN
    // was classified as both south-sudan and sudan, because "Sudan" sits
    // inside "South Sudan" with a space before it and a boundary after it.
    // Sudan holds a separate TPS designation, so that single character range
    // sent a subscriber monitoring Sudan a rule about a different country —
    // exactly the kind of push a monitoring product cannot survive making.
    //
    // MATCHERS is already sorted longest-surface-first, so claiming the range
    // as each match is accepted is enough: the longer name always gets there
    // first. Guinea/Papua New Guinea, Niger/Nigeria, China and Dominica are
    // the same shape of problem and are covered by the same rule.
    const claimed: [number, number][] = [];
    const overlapsClaimed = (start: number, end: number) =>
      claimed.some(([from, to]) => start < to && end > from);

    // Claim the non-countries FIRST, before any country matcher runs. "American
    // Samoa" is spoken for, so "Samoa" cannot match inside it.
    for (const re of NOT_COUNTRY_MATCHERS) {
      re.lastIndex = 0;
      for (let x = re.exec(sentence); x !== null; x = re.exec(sentence)) {
        claimed.push([x.index, x.index + x[0].length]);
      }
    }

    for (const m of MATCHERS) {
      // NOT skipped when already found. The relation model needs every mention,
      // because the strongest one wins and the strongest is rarely the first:
      // a rule usually recites background before it states its own scope.
      if (m.ambiguous && !hasContext) continue;

      // Walk every occurrence and take the first that no longer name has
      // already claimed. "Papua New Guinea and Guinea" names both countries;
      // "South Sudan", however many times it is repeated, names only one.
      m.reAll.lastIndex = 0;
      const spans: [number, number][] = [];
      for (let x = m.reAll.exec(sentence); x !== null; x = m.reAll.exec(sentence)) {
        spans.push([x.index, x.index + x[0].length]);
      }
      const unclaimed = spans.filter(([start, end]) => !overlapsClaimed(start, end));
      if (unclaimed.length === 0) continue;

      // Claim EVERY occurrence, not only the one accepted. The TPS termination
      // for South Sudan writes the name three times; claiming one of them left
      // the other two open for "Sudan" to match inside, which is the bug this
      // whole guard exists to stop.
      claimed.push(...spans);

      const def = COUNTRY_BY_SLUG.get(m.slug);
      if (!def) continue;

      // ASK WHAT THE MENTION IS DOING, not merely whether it happened.
      //
      // Each unclaimed occurrence is judged on its immediate surroundings, and
      // the best relation wins. relationFor() returns null when the name turns
      // out to be part of a larger place — "Mexico Boulevard" — in which case
      // that occurrence is not a country reference at all.
      let best: CountryRelation | null = null;
      let bestAt = -1;
      for (const [start, end] of unclaimed) {
        const relation = relationFor({
          span: sentence,
          before: sentence.slice(Math.max(0, start - 80), start),
          after: sentence.slice(end, Math.min(sentence.length, end + 60)),
          inTitle: options.isTitle === true,
        });
        if (!relation) continue;
        if (best === null) {
          best = relation;
          bestAt = start;
        } else {
          const merged = strongerRelation(best, relation);
          if (merged !== best) {
            best = merged;
            bestAt = start;
          }
        }
      }
      if (best === null) continue;

      const existing = found.get(m.slug);
      const relation = existing ? strongerRelation(existing.relation, best) : best;
      // Keep the quote belonging to the winning relation, so the evidence a
      // consumer reads is the evidence that earned the claim.
      const keepExistingQuote = existing !== undefined && relation === existing.relation && relation !== best;

      found.set(m.slug, {
        entityId: entityId("country", def.name),
        name: def.name,
        iso2: def.iso2,
        surface: m.surface,
        relation,
        isScope: isScopeRelation(relation),
        // Trim very long sentences so the evidence quote stays readable while
        // still showing the reader exactly where the claim comes from.
        //
        // Trimmed on a WORD boundary. A fixed-width slice cuts mid-word and
        // hands the reader "…required from certain juris" as verbatim source
        // text — the same defect extract-impact.ts fixed in its own chunker, and
        // the same reason it matters: a mangled quote is worse than no quote.
        // THE QUOTE MUST RE-DERIVE THE CLAIM. A window cut from a long span can
        // drop the context that justified the match — "China" is only read as a
        // country when a nationality or presence word is nearby, and clipping
        // can leave the name without one. Where that happens the whole sentence
        // is quoted instead, because a quote that does not support its own
        // claim is not evidence.
        evidence: keepExistingQuote
          ? existing.evidence
          : selfSupporting(
              clipOnWord(quoteAround(sentence, bestAt), 320),
              m,
              m.ambiguous,
              sentence
            ),
      });
    }
  }
  return [...found.values()];
}

/**
 * The passage worth quoting for a mention at this position.
 *
 * Federal Register spans run long, and a quote clipped from the start of a
 * 400-character span can end before the country it is supposed to evidence.
 * Centring on the mention keeps the quote and the claim in the same sentence.
 */
/**
 * The quote, if re-reading it still finds this country. Otherwise the sentence.
 *
 * Enforced here rather than checked later, so no path can store a country whose
 * own evidence does not show it.
 */
function selfSupporting(
  quote: string,
  matcher: CountryMatcher,
  ambiguousNeedsContext: boolean,
  fallback: string
): string {
  // Checked directly rather than by re-entering findCountriesInText, which
  // would recurse without end. The two conditions are exactly the ones that
  // admitted the match in the first place: the name is present, and where the
  // name is ambiguous a disambiguating word is present with it.
  if (!matcher.re.test(quote)) return fallback;
  if (ambiguousNeedsContext) {
    const lower = quote.toLowerCase();
    if (!COUNTRY_CONTEXT_TERMS.some((t) => lower.includes(t))) return fallback;
  }
  return quote;
}

function quoteAround(sentence: string, at: number, width = 320): string {
  if (sentence.length <= width || at < 0) return sentence;

  let start = Math.max(0, at - Math.floor(width / 2));
  let end = Math.min(sentence.length, start + width);

  // Move both edges out to whitespace, so the quote never opens or closes
  // inside a word. A mangled quote is worse than no quote: it is the one field
  // a reader is asked to check the claim against.
  while (start > 0 && !/\s/.test(sentence[start - 1])) start--;
  while (end < sentence.length && !/\s/.test(sentence[end])) end++;

  // The mention must survive the trim. If the window somehow excluded it, quote
  // the whole sentence rather than evidence that does not show the claim.
  if (at < start || at > end) return sentence;

  const prefix = start > 0 ? "…" : "";
  const suffix = end < sentence.length ? "…" : "";
  return `${prefix}${sentence.slice(start, end).trim()}${suffix}`;
}
