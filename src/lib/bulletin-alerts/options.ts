// Client-safe half of the free alerts module: the options the form offers and
// the consent words. No Node imports, so the signup form can use it.

import {
  CHARGEABILITY,
  CHARGEABILITY_SHORT,
  EMPLOYMENT_ROWS,
  FAMILY_ROWS,
  ROW_HINT,
  ROW_LABEL,
  type Chargeability,
  type Row,
  type Section,
} from "@/lib/visa-bulletin";

export const ALERTS_PAGE_PATH = "/visa-bulletin-alerts";

/** The words on the checkbox. Stored with each subscriber as the consent text. */
export const CONSENT_TEXT =
  "Email me when ImmigrationClock publishes each new Visa Bulletin month, with the dates for my category and country. I can unsubscribe from any email.";

/** Bumped whenever CONSENT_TEXT changes, so stored consent says which words were agreed to. */
export const CONSENT_VERSION = "2026-11-19";

/** How long a confirmation link works. */
export const CONFIRM_TTL_SECONDS = 7 * 24 * 60 * 60;

export const ALL_ROWS: readonly Row[] = [...EMPLOYMENT_ROWS, ...FAMILY_ROWS];

/** The categories offered in the form, grouped and in the order people look for them. */
export const ROW_OPTIONS: { group: string; rows: Row[] }[] = [
  { group: "Employment based", rows: ["EB1", "EB2", "EB3", "EW", "EB4", "SR", "EB5U", "EB5R", "EB5H", "EB5I"] },
  { group: "Family based", rows: ["F1", "F2A", "F2B", "F3", "F4"] },
];

export const COUNTRY_OPTIONS: { value: Chargeability; label: string }[] = [
  { value: "india", label: "India" },
  { value: "china", label: "China (mainland born)" },
  { value: "mexico", label: "Mexico" },
  { value: "philippines", label: "Philippines" },
  { value: "all", label: "All other countries" },
];

export function isRow(v: unknown): v is Row {
  return typeof v === "string" && (ALL_ROWS as readonly string[]).includes(v);
}

export function isCountry(v: unknown): v is Chargeability {
  return typeof v === "string" && (CHARGEABILITY as readonly string[]).includes(v);
}

export function sectionOf(row: Row): Section {
  return (FAMILY_ROWS as readonly string[]).includes(row) ? "family" : "employment";
}

/** "EB-2, India" / "F4, All other countries". */
export function pickLabel(row: Row, country: Chargeability): string {
  return `${ROW_LABEL[row]}, ${country === "all" ? "All other countries" : CHARGEABILITY_SHORT[country]}`;
}

/** "EB-2 (Advanced degree or exceptional ability)" for a select option. */
export function rowOptionLabel(row: Row): string {
  return `${ROW_LABEL[row]}: ${ROW_HINT[row]}`;
}
