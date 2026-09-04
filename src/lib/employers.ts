// Real USCIS H-1B Employer Data Hub directory (thousands of employers), read
// from the build-time generated snapshot. Used by the dedicated employer
// directory and the /search page — not by the always-loaded global search bar,
// so its weight only loads on those routes.
import data from "./generated/employers.json";
import { normalizeEmployer } from "./format";

export interface DirectoryEmployer {
  slug: string;
  name: string;
  approvals: number;
  denials: number;
  approvalRate: number;
  topState: string;
}

export const EMPLOYERS = data.employers as DirectoryEmployer[]; // pre-sorted by approvals desc
export const EMPLOYERS_META = {
  fiscalYear: data.fiscalYear as number,
  count: data.count as number,
  minApprovals: (data as { minApprovals?: number }).minApprovals ?? 10,
  nationalApprovals: (data as { nationalApprovals?: number }).nationalApprovals ?? 0,
  nationalDenials: (data as { nationalDenials?: number }).nationalDenials ?? 0,
  totalEmployers: (data as { totalEmployers?: number }).totalEmployers ?? EMPLOYERS.length,
  sourceName: data.sourceName as string,
  sourceUrl: data.sourceUrl as string,
  datasetUrl: (data as { datasetUrl?: string }).datasetUrl as string,
  generatedAt: data.generatedAt as string,
};

/** Average Data-Hub approval rate (approvals / (approvals + denials)). */
export const AVG_APPROVAL_RATE =
  EMPLOYERS_META.nationalApprovals + EMPLOYERS_META.nationalDenials > 0
    ? EMPLOYERS_META.nationalApprovals /
      (EMPLOYERS_META.nationalApprovals + EMPLOYERS_META.nationalDenials)
    : 0;

// slug -> { employer, rank } (rank = position among all sponsors by approvals).
const BY_SLUG = new Map<string, { employer: DirectoryEmployer; rank: number }>(
  EMPLOYERS.map((employer, i) => [employer.slug, { employer, rank: i + 1 }])
);
/**
 * Every H-1B filer whose name normalizes to the same key as this one.
 *
 * WHY THIS IS NEEDED, MEASURED. 20 normalized keys in the FY export carry more
 * than one filer — HCL AMERICA INC and HCL AMERICA SOLUTIONS INC both become
 * HCL AMERICA — and the WARN cross-link keeps ONE record per key, so 21 filers
 * are dropped from it. A row for such a key shows one entity's approvals under
 * a name that reads like the group's. This is what lets a consumer be told.
 *
 * Returns the names in directory order, the queried one included.
 */
const H1B_NAMES_BY_KEY = new Map<string, string[]>();
for (const e of EMPLOYERS) {
  const key = normalizeEmployer(e.name);
  if (!key) continue;
  const existing = H1B_NAMES_BY_KEY.get(key);
  if (existing) existing.push(e.name);
  else H1B_NAMES_BY_KEY.set(key, [e.name]);
}

export function h1bFilersSharingKey(name: string): string[] {
  return H1B_NAMES_BY_KEY.get(normalizeEmployer(name)) ?? [];
}

/**
 * Filers whose normalized key begins with the same word but is not the same key.
 *
 * The join can only ever match one key, so a group that files under several
 * names is understated by it in a way nothing inside the join reveals. Amazon
 * files under five entities producing four keys; Deloitte under six.
 *
 * A NAME OBSERVATION, NOT A CORPORATE-STRUCTURE CLAIM. Two companies can share
 * a first word and have nothing to do with each other, which is why the first
 * word must be distinctive — five characters or more — and why the caller is
 * handed the names rather than a merged total.
 */
const MIN_DISTINCTIVE_WORD = 5;
const H1B_BY_FIRST_WORD = new Map<string, DirectoryEmployer[]>();
for (const e of EMPLOYERS) {
  const first = normalizeEmployer(e.name).split(" ")[0];
  if (!first || first.length < MIN_DISTINCTIVE_WORD) continue;
  const existing = H1B_BY_FIRST_WORD.get(first);
  if (existing) existing.push(e);
  else H1B_BY_FIRST_WORD.set(first, [e]);
}

export function h1bFilersOnRelatedKeys(name: string): { name: string; approvals: number }[] {
  const key = normalizeEmployer(name);
  const first = key.split(" ")[0];
  if (!first || first.length < MIN_DISTINCTIVE_WORD) return [];
  return (H1B_BY_FIRST_WORD.get(first) ?? [])
    .filter((e) => normalizeEmployer(e.name) !== key)
    .map((e) => ({ name: e.name, approvals: e.approvals }));
}

export function employerBySlug(slug: string): { employer: DirectoryEmployer; rank: number } | null {
  return BY_SLUG.get(slug) ?? null;
}

/**
 * Name substring match, ranked by approvals (EMPLOYERS is pre-sorted).
 *
 * Matching ignores punctuation on both sides. Data Hub legal names carry their
 * own spacing and punctuation ("WAL MART ASSOCIATES INC", "AMAZON.COM SERVICES
 * LLC"), which a reader does not reproduce: "walmart" and "amazon.com" both
 * used to return nothing for employers that are plainly there.
 */
export function searchEmployers(q: string, limit = 50): DirectoryEmployer[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const sq = s.replace(/[^a-z0-9]+/g, "");
  if (!sq) return [];
  const out: DirectoryEmployer[] = [];
  for (const e of EMPLOYERS) {
    const name = e.name.toLowerCase();
    if (name.includes(s) || name.replace(/[^a-z0-9]+/g, "").includes(sq)) {
      out.push(e);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Employer legal names arrive ALL-CAPS; title-case for display. */
export function displayEmployer(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Llc|Inc|Llp|Ltd|Plc|Usa|Us|It|Dba|Na)\b/g, (m) => m.toUpperCase());
}

// ---------------------------------------------------------------------------
// Related sponsors
// ---------------------------------------------------------------------------
//
// The 2,614 employer pages had no link to another employer — not one. Every one
// of them is a cul-de-sac inside its own family: the only ways out are the
// breadcrumb back to the directory, /layoffs, and USCIS. A reader arriving on
// Wipro from a search engine and wanting to compare Infosys had to go back and
// search again.
//
// These two relationships are real properties of the committed snapshot, not
// invented affinity. EMPLOYERS is pre-sorted by approvals, so adjacency in the
// array IS adjacency in sponsorship volume; and every one of the 2,614 rows
// carries a topState (52 states, exactly one of them with a single sponsor).
// Nothing here infers an industry, a relationship, or a similarity we cannot
// show from the data.

export interface RelatedSponsors {
  /** Sponsors immediately above and below this one by approval count. */
  byVolume: DirectoryEmployer[];
  /** Other large sponsors whose approvals concentrate in the same state. */
  byState: DirectoryEmployer[];
  /** The shared state, or null when this employer has none recorded. */
  state: string | null;
}

/**
 * Sponsors worth comparing against this one.
 *
 * `byVolume` is a window around the employer's own rank rather than the top of
 * the list: "the sponsors either side of you" is a comparison a reader can act
 * on, where "here are the ten biggest again" is the directory they just left.
 */
export function relatedSponsors(slug: string, perGroup = 4): RelatedSponsors {
  const found = BY_SLUG.get(slug);
  if (!found) return { byVolume: [], byState: [], state: null };
  const i = found.rank - 1;

  // A window centred on this employer, clamped at both ends of the list so the
  // first and last sponsors still get a full set of neighbours.
  const half = Math.ceil(perGroup / 2);
  let from = Math.max(0, i - half);
  const to = Math.min(EMPLOYERS.length, from + perGroup + 1);
  from = Math.max(0, to - perGroup - 1);
  const byVolume = EMPLOYERS.slice(from, to).filter((e) => e.slug !== slug);

  const state = found.employer.topState || null;
  const seen = new Set(byVolume.map((e) => e.slug));
  const byState = state
    ? EMPLOYERS.filter((e) => e.topState === state && e.slug !== slug && !seen.has(e.slug)).slice(0, perGroup)
    : [];

  return { byVolume, byState, state };
}
