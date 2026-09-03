// Number / date formatting helpers shared across the UI.

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n));
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatPercent(n: number, digits = 1): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function formatRate(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Format in UTC so an ISO date like "2026-05-20" never drifts a day in
  // negative-offset timezones.
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function fiscalYearLabel(fy: number): string {
  return `FY${String(fy).slice(2)}`;
}

const MONTHS = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export function monthLabel(m: number): string {
  return MONTHS[m] ?? String(m);
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Standardize an employer legal name so the same company matches across datasets
// (USCIS H-1B, DOL LCA, state WARN). Mirrors data_pipeline/common.normalize_employer
// so the TS site and the Python pipeline produce the same join keys.
//
// THE LIST IS SPLIT IN TWO, AND THE SPLIT IS LOAD-BEARING.
//
// Removing "Inc" loses nothing: it is a legal form, and no two companies are
// distinguished by it. Removing "Technologies" or "Services" is a different
// act — those words are part of a name and they separate real, separately
// filing entities. It is why QUALCOMM TECHNOLOGIES INC and QUALCOMM
// INCORPORATED collapse to one key, why HCL AMERICA SOLUTIONS INC becomes HCL
// AMERICA, and why the WARN feed's "CA Technologies" joins the H-1B export's
// "CA INC" on the two characters "CA".
//
// The behaviour is kept as-is on purpose: the Python pipeline computes the same
// key, and changing it here alone would silently split the join. What changes
// is that the two categories are now nameable, so a consumer can be told which
// kind of removal produced a given match instead of being handed a key and a
// blanket warning. See lib/intelligence/employer-match.ts.
export const EMPLOYER_LEGAL_FORMS = [
  "inc", "incorporated", "llc", "l l c", "ltd", "limited",
  "corp", "corporation", "co", "company", "plc", "llp", "lp",
] as const;

export const EMPLOYER_DESCRIPTIVE_WORDS = [
  "technologies", "technology", "solutions", "services", "usa", "us", "na",
] as const;

const EMPLOYER_SUFFIXES = new RegExp(
  `\\b(${[...EMPLOYER_LEGAL_FORMS, ...EMPLOYER_DESCRIPTIVE_WORDS].join("|")})\\b`,
  "gi"
);
export function normalizeEmployer(name: string): string {
  if (!name || typeof name !== "string") return "";
  let s = name.toUpperCase();
  s = s.replace(/[.,&]/g, " ");
  s = s.replace(EMPLOYER_SUFFIXES, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

export function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
