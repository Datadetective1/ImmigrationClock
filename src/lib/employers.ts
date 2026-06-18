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
  sourceName: data.sourceName as string,
  sourceUrl: data.sourceUrl as string,
  datasetUrl: (data as { datasetUrl?: string }).datasetUrl as string,
  generatedAt: data.generatedAt as string,
};

/** Name substring match, ranked by approvals (EMPLOYERS is pre-sorted). */
export function searchEmployers(q: string, limit = 50): DirectoryEmployer[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out: DirectoryEmployer[] = [];
  for (const e of EMPLOYERS) {
    if (e.name.toLowerCase().includes(s)) {
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
