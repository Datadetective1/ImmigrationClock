// =============================================================================
// KEY IMMIGRATION DATES — the honest "urgency" layer.
//
// These are real, recurring U.S. immigration deadlines. Surfacing them is the
// useful kind of urgency: it helps people act in time AND routes high-intent
// visitors to the matching partner (a tax deadline -> tax filing; the H-1B window
// -> legal help). Countdown is computed client-side from the visitor's actual
// date, so it's always accurate regardless of when the static site was built.
//
// Exact windows (H-1B registration, the DV lottery, the Visa Bulletin) are set by
// the government each year — we link the official source and label approximate
// windows clearly. Nothing here is legal or tax advice.
// =============================================================================
import type { PersonaKey } from "./partners";

export type KeyDateCategory = "tax" | "h1b" | "green-card" | "students" | "general";

export interface KeyDate {
  id: string;
  title: string;
  detail: string;
  /** Fixed annual month (1-12) + day for a countdown, when there is one. */
  month?: number;
  day?: number;
  /** Window is approximate (exact dates announced yearly by the agency). */
  approx?: boolean;
  /** For recurring/guidance items with no single date (e.g. monthly bulletin). */
  cadence?: string;
  category: KeyDateCategory;
  personas: PersonaKey[];
  sourceName: string;
  sourceUrl: string;
  /** Partner ids surfaced as "get help" beside the date. */
  partnerIds: string[];
}

export const CATEGORY_LABEL: Record<KeyDateCategory, string> = {
  tax: "Taxes",
  h1b: "H-1B",
  "green-card": "Green card",
  students: "Students",
  general: "General",
};

export const KEY_DATES: KeyDate[] = [
  {
    id: "h1b-registration",
    title: "H-1B electronic registration",
    detail:
      "USCIS opens the H-1B cap registration window for about three weeks. Miss it and you wait a full year for the next lottery.",
    month: 3,
    day: 1,
    approx: true,
    category: "h1b",
    personas: ["h1b-worker", "employer"],
    sourceName: "USCIS — H-1B cap season",
    sourceUrl: "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations/h-1b-electronic-registration-process",
    partnerIds: ["boundless", "attorney-match"],
  },
  {
    id: "tax-deadline",
    title: "Federal tax filing deadline",
    detail:
      "Individual returns are due April 15 — including nonresident (1040-NR) returns for many F-1 and J-1 visa holders. File or request an extension by this date.",
    month: 4,
    day: 15,
    category: "tax",
    personas: ["h1b-worker", "f1-student", "eb-applicant", "general"],
    sourceName: "IRS — Tax deadlines",
    sourceUrl: "https://www.irs.gov/filing",
    partnerIds: ["resident-tax", "sprintax"],
  },
  {
    id: "dv-lottery",
    title: "Diversity Visa (green-card) lottery",
    detail:
      "The DV lottery registration opens for about one month in the fall, free, for nationals of eligible countries. A rare path to a green card with no employer or family sponsor.",
    month: 10,
    day: 1,
    approx: true,
    category: "green-card",
    personas: ["general", "eb-applicant"],
    sourceName: "U.S. Dept. of State — DV Program",
    sourceUrl: "https://travel.state.gov/content/travel/en/us-visas/immigrate/diversity-visa-program-entry.html",
    partnerIds: ["boundless", "document-translation"],
  },
  {
    id: "fiscal-year-start",
    title: "New fiscal year — H-1B start date",
    detail:
      "October 1 begins the federal fiscal year: cap-subject H-1B employment can start and a fresh set of visa numbers becomes available.",
    month: 10,
    day: 1,
    category: "h1b",
    personas: ["h1b-worker", "employer", "eb-applicant"],
    sourceName: "USCIS — H-1B specialty occupations",
    sourceUrl: "https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations",
    partnerIds: ["boundless", "attorney-match"],
  },
  {
    id: "visa-bulletin",
    title: "Visa Bulletin",
    detail:
      "The State Department publishes priority-date movement for family- and employment-based green cards. Check it the moment it drops to see if your date is current.",
    cadence: "Released monthly · around mid-month",
    category: "green-card",
    personas: ["eb-applicant"],
    sourceName: "U.S. Dept. of State — Visa Bulletin",
    sourceUrl: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html",
    partnerIds: ["boundless", "attorney-match"],
  },
  {
    id: "opt-window",
    title: "F-1 OPT application window",
    detail:
      "Post-completion OPT can be filed from 90 days before your program end date to 60 days after. Apply early — USCIS processing can take months.",
    cadence: "Per student · up to 90 days before graduation",
    category: "students",
    personas: ["f1-student"],
    sourceName: "USCIS — Optional Practical Training",
    sourceUrl: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students",
    partnerIds: ["visa-jobs", "credential-evaluation"],
  },
];

/** The next calendar occurrence of an annual month/day, relative to `from`. */
export function nextOccurrence(month: number, day: number, from: Date = new Date()): Date {
  const today = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  let d = new Date(Date.UTC(from.getUTCFullYear(), month - 1, day));
  if (d < today) d = new Date(Date.UTC(from.getUTCFullYear() + 1, month - 1, day));
  return d;
}

/** Whole days from `from` (today) until `target`. */
export function daysUntil(target: Date, from: Date = new Date()): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((b - a) / 86_400_000);
}

/** Key dates relevant to a persona (keeps general-interest ones too). */
export function keyDatesForPersona(persona: PersonaKey): KeyDate[] {
  return KEY_DATES.filter((d) => d.personas.includes(persona) || d.personas.includes("general"));
}
