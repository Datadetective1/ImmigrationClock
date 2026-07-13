// Real, multi-state WARN layoff feed. Reads the build-time snapshot emitted by
// scripts/build-warn.ts (src/lib/generated/warn.json) — live open-data notices
// from every state that publishes a structured feed. Separate from the compact
// homepage `WARN_LIVE` metric (dataset.json); this powers the dedicated /layoffs
// feed and the WARN × H-1B cross-link, mirroring how employers.ts backs the H-1B
// directory. Its weight only loads on the routes that import it.
import warn from "./generated/warn.json";
import { EMPLOYERS, type DirectoryEmployer } from "./employers";
import { normalizeEmployer } from "./format";

export interface WarnNotice {
  employer: string;
  normalized: string;
  city: string | null;
  county: string | null;
  state: string;
  noticeDate: string | null;
  effectiveDate: string | null;
  employees: number;
  layoffType: string | null;
  sourceUrl: string;
}

export interface WarnEmployer {
  normalized: string;
  name: string;
  slug: string;
  notices: number;
  employees: number;
  states: string[];
  latestNotice: string | null;
}

export interface WarnStateSummary {
  code: string;
  agency: string;
  pageUrl: string;
  datasetUrl: string;
  noticeCount: number;
  employeesTotal: number;
  latestNotice: string | null;
}

export const WARN_NOTICES = warn.notices as WarnNotice[]; // date-desc
export const WARN_EMPLOYERS = warn.byEmployer as WarnEmployer[]; // employees-desc
export const WARN_STATES = warn.states as WarnStateSummary[];
export const WARN_META = {
  generatedAt: warn.generatedAt as string,
  coverageNote: warn.coverageNote as string,
  stateCount: warn.stateCount as number,
  noticeCount: warn.noticeCount as number,
  employeesTotal: warn.employeesTotal as number,
  employerCount: warn.employerCount as number,
  minNoticeDate: warn.minNoticeDate as string | null,
  maxNoticeDate: warn.maxNoticeDate as string | null,
};

/** Most-recent notices for the live feed table. */
export function recentNotices(limit = 200): WarnNotice[] {
  return WARN_NOTICES.slice(0, limit);
}

// normalized H-1B employer name -> directory record (built once per process).
const H1B_BY_NORM = new Map<string, DirectoryEmployer>();
for (const e of EMPLOYERS) {
  const key = normalizeEmployer(e.name);
  // EMPLOYERS is pre-sorted by approvals desc; keep the biggest sponsor on collision.
  if (!H1B_BY_NORM.has(key)) H1B_BY_NORM.set(key, e);
}

export interface CrossLinkRow {
  name: string;
  warnSlug: string; // slug of the WARN employer name
  h1bSlug: string; // slug into /employer/[slug] (USCIS directory)
  layoffs: number; // employees affected (WARN)
  notices: number; // number of WARN notices
  states: string[];
  latestNotice: string | null;
  approvals: number; // H-1B approvals (USCIS)
  denials: number;
  approvalRate: number;
}

/**
 * Employers appearing in BOTH the real WARN feed and the USCIS H-1B directory.
 * This is the join no single-source layoff tracker can do — a company's layoff
 * notices next to its H-1B sponsorship. Appearing in both does NOT imply one
 * caused the other; see the on-page methodology note.
 */
export function warnH1bCrossLink(): CrossLinkRow[] {
  const rows: CrossLinkRow[] = [];
  for (const w of WARN_EMPLOYERS) {
    const h = H1B_BY_NORM.get(w.normalized);
    if (!h) continue;
    rows.push({
      name: w.name,
      warnSlug: w.slug,
      h1bSlug: h.slug,
      layoffs: w.employees,
      notices: w.notices,
      states: w.states,
      latestNotice: w.latestNotice,
      approvals: h.approvals,
      denials: h.denials,
      approvalRate: h.approvalRate,
    });
  }
  // Default ordering: most H-1B sponsorship first (the eye-catching rows).
  return rows.sort((a, b) => b.approvals - a.approvals);
}

// normalized employer name -> its WARN notices / summary (built once per process).
// Lets any employer page ask "does this company have WARN layoffs?" in O(1).
const NOTICES_BY_NORM = new Map<string, WarnNotice[]>();
for (const n of WARN_NOTICES) {
  if (!n.normalized) continue;
  const arr = NOTICES_BY_NORM.get(n.normalized);
  if (arr) arr.push(n);
  else NOTICES_BY_NORM.set(n.normalized, [n]);
}
const EMPLOYER_BY_NORM = new Map(WARN_EMPLOYERS.map((e) => [e.normalized, e]));

export interface EmployerWarn {
  summary: WarnEmployer;
  notices: WarnNotice[]; // date-desc
}

/**
 * WARN layoff record for a given employer name (matched via the shared
 * normalizer), or null if none. Used to surface a company's layoffs directly on
 * its H-1B sponsor page — the cross-link at the point of intent.
 */
export function warnForEmployer(name: string): EmployerWarn | null {
  const key = normalizeEmployer(name);
  if (!key) return null;
  const summary = EMPLOYER_BY_NORM.get(key);
  if (!summary) return null;
  return { summary, notices: NOTICES_BY_NORM.get(key) ?? [] };
}

export const WARN_PROVENANCE = {
  sourceName: "State WARN Act notices (state open-data portals)",
  sourceUrl: "https://www.dol.gov/agencies/eta/layoffs/warn",
  sourceUpdatedAt: (WARN_META.maxNoticeDate ?? WARN_META.generatedAt.slice(0, 10)) as string,
};
