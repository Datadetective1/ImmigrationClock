import type { LocaleStrings } from "./strings";

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export const en: LocaleStrings = {
  htmlLang: "en",
  endonym: "English",

  subject: (n) =>
    n === 0 ? "Immigration Pulse — a quiet week" : `Immigration Pulse — ${n} change${n === 1 ? "" : "s"}`,
  preheader: (n) =>
    n === 0
      ? "No significant official changes recorded this week."
      : `${n} official U.S. immigration change${n === 1 ? "" : "s"}, each linked to its source document.`,

  brand: {
    productName: "ImmigrationClock",
    tagline: "Immigration Pulse",
    strapline: "Official U.S. immigration changes from government sources.",
  },

  issueLabel: (from, to) => `Week of ${fmt(from)} – ${fmt(to)}`,

  opening: {
    withChanges: (n) =>
      `This week brought ${n} official immigration update${n === 1 ? "" : "s"}. ` +
      `Every item below links directly to the government publication it came from. ` +
      `We report what changed — we do not tell you what it means for your case.`,
    noChanges:
      "No significant official changes were recorded this week. That is a statement about what our " +
      "sources published, not a guarantee that nothing happened — routine notices are still going into " +
      "the archive, and we will be back next week.",
  },

  sections: {
    topChanges: "This week's changes",
    quickNumbers: "By the numbers",
    explore: "Continue exploring ImmigrationClock",
  },

  item: {
    severity: { major: "Major", notable: "Notable", routine: "Routine" },
    agency: "Agency",
    published: "Published",
    scheduled: "Scheduled for publication",
    notInForce: "Proposed — not in force",
    whyItMatters: "Why it matters",
    readDocument: "Read the official document",
  },

  stats: {
    uscis_policy: "USCIS policy updates",
    executive_actions: "Executive orders & proclamations",
    federal_register: "Federal Register documents",
    court_decisions: "Court decisions",
    dhs_announcements: "DHS announcements",
    total_recorded: "Total changes recorded",
  },

  explore: {
    searchVisa: "Search your visa",
    latestChanges: "Latest immigration changes",
    processingTimes: "Processing & key dates",
    countries: "Country information",
    greenCard: "Green card",
    citizenship: "Citizenship",
    h1b: "H-1B",
  },

  trust: {
    statement:
      "Every update above links directly to the original government source. We summarize public " +
      "information. We never provide legal advice.",
    sourceLanguageNote:
      "Document titles and summaries are quoted exactly as the U.S. government published them, in " +
      "English. We do not translate official text, because a translated quote is no longer a quote.",
  },

  footer: {
    about: "About",
    methodology: "Methodology",
    sources: "Sources",
    privacy: "Privacy",
    contact: "Contact",
    unsubscribe: "Unsubscribe",
    viewOnline: "Read this issue online",
    disclaimer:
      "ImmigrationClock reports public U.S. government data. It is not a law firm and does not give legal advice.",
    readIn: "Read in",
  },
};
