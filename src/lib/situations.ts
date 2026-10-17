// =============================================================================
// SITUATIONS — the starting points on /for-you and the homepage
//
// A situation is a READING AID, not a classification of a person. It names the
// visas and topics a reader in that position usually follows, and every link
// it produces rests on a relationship that already exists in the data:
//
//   • changes   — recorded events whose extracted impact says the document
//                 itself names one of `changeIds` among those affected. Never a
//                 keyword match: a rule that mentions "students" in passing does
//                 not become a student rule here.
//   • deadlines — key dates tagged for the persona by hand in key-dates.ts.
//   • explainers — chosen by an editor, listed by slug below.
//   • services  — one link to the filtered /resources directory. Commercial
//                 listings render only there (see partners.ts).
//
// Nothing here says a change applies to the reader. The page says which
// documents name the visa; whether one applies to a given case is a question
// for the document and a qualified professional.
// =============================================================================

import type { PartnerCategory, PersonaKey } from "./partners";

export interface Situation {
  key: Exclude<PersonaKey, "general"> | "humanitarian";
  /** Chip label. */
  label: string;
  /** One line under the heading. */
  blurb: string;
  /**
   * Visa categories whose recorded changes are listed: only changes whose
   * extracted impact says the DOCUMENT names one of these among those affected
   * (basis "stated", see eventsAffecting). A text mention is not enough.
   */
  changeIds: string[];
  /** `changeIds` in a heading's words: "H-1B", "F-1 or J-1". */
  changeLabel: string;
  /** What the Follow buttons add. Must be followable ids present in the archive index. */
  followIds: string[];
  /** The persona key-dates.ts tags deadlines with; absent when none are tagged. */
  datesPersona?: PersonaKey;
  /** Editorially chosen explainers, by slug. */
  explainerSlugs: string[];
  /** The /resources filter that holds the services for this situation. */
  resourceNeed: PartnerCategory;
  resourceLabel: string;
  /** Data pages for this situation. */
  dataLinks: { href: string; label: string }[];
}

export const SITUATIONS: Situation[] = [
  {
    key: "h1b-worker",
    label: "H-1B worker",
    blurb: "Specialty-occupation workers and people heading into the H-1B lottery.",
    changeIds: ["visa:h-1b"],
    changeLabel: "H-1B",
    followIds: ["visa:h-1b"],
    datesPersona: "h1b-worker",
    explainerSlugs: ["h1b-cap-and-registration", "h1b-approvals-vs-workers"],
    resourceNeed: "documents",
    resourceLabel: "Translations and degree evaluations",
    dataLinks: [
      { href: "/h1b/top-sponsors", label: "Top H-1B sponsors" },
      { href: "/work-visas", label: "Work visas & sponsors" },
    ],
  },
  {
    key: "f1-student",
    label: "International student",
    blurb: "F-1 and J-1 students and exchange visitors, including OPT.",
    changeIds: ["visa:f-1", "visa:j-1"],
    changeLabel: "F-1 or J-1",
    followIds: ["visa:f-1", "visa:j-1", "topic:international-students"],
    datesPersona: "f1-student",
    explainerSlugs: ["opt-in-plain-terms"],
    resourceNeed: "tax",
    resourceLabel: "Nonresident tax filing",
    dataLinks: [{ href: "/visa/f1-student-visas", label: "Student visa tracker" }],
  },
  {
    key: "eb-applicant",
    label: "Green-card applicant",
    blurb: "Employment-based immigrants waiting on a priority date.",
    changeIds: ["visa:eb-2", "visa:eb-3", "visa:eb-5"],
    changeLabel: "EB-2, EB-3 or EB-5",
    followIds: ["visa:eb-2", "visa:eb-3", "visa:eb-5"],
    datesPersona: "eb-applicant",
    explainerSlugs: ["visa-bulletin-priority-dates"],
    resourceNeed: "legal",
    resourceLabel: "Finding legal help",
    dataLinks: [{ href: "/visa/f1-student-visas", label: "Visa flow tracker" }],
  },
  {
    key: "employer",
    label: "Employer",
    blurb: "HR and mobility teams sponsoring H-1B, H-2A or H-2B workers.",
    changeIds: ["visa:h-1b", "visa:h-2a", "visa:h-2b"],
    changeLabel: "H-1B, H-2A or H-2B",
    followIds: ["topic:employers", "visa:h-1b", "visa:h-2a", "visa:h-2b"],
    datesPersona: "employer",
    explainerSlugs: ["h1b-cap-and-registration", "what-a-warn-notice-is"],
    resourceNeed: "legal",
    resourceLabel: "Finding legal help",
    dataLinks: [
      { href: "/h1b/top-sponsors", label: "Sponsor benchmarks" },
      { href: "/layoffs-vs-h1b", label: "Layoffs vs sponsorship" },
    ],
  },
  {
    key: "humanitarian",
    label: "TPS & asylum",
    blurb: "Temporary Protected Status holders and asylum seekers.",
    changeIds: ["visa:tps", "visa:asylum"],
    changeLabel: "TPS or asylum",
    followIds: ["visa:tps", "visa:asylum"],
    explainerSlugs: ["court-order-is-not-a-rule-change"],
    resourceNeed: "legal",
    resourceLabel: "Finding legal help",
    dataLinks: [{ href: "/enforcement", label: "Enforcement & border data" }],
  },
];

export const SITUATION_BY_KEY = new Map(SITUATIONS.map((s) => [s.key, s]));
