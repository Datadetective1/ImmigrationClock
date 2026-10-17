// The Diversity Visa key date exactly as it stood in August 2026, when the
// social regressions in these tests were recorded. The live entry has since
// lost its countdown (the State Department deferred the DV-2027 entry period),
// so tests that pin those historical fact sets read this frozen copy instead.
import type { KeyDate } from "@/lib/key-dates";

export const DV_KEY_DATE_2026_08: KeyDate = {
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
};
