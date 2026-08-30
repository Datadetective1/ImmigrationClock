// Real USCIS H-1B Employer Data Hub directory (thousands of employers), read
// from the build-time generated snapshot. Used by the dedicated employer
// directory and the /search page — not by the always-loaded global search bar,
// so its weight only loads on those routes.
import data from "./generated/employers.json";

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
