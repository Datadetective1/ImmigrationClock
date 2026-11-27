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

  subject: (n, coreNews) => {
    if (n === 0) return "Quiet week: no new official immigration changes";
    const more = `${n} update${n === 1 ? "" : "s"}`;
    return coreNews.length === 0
      ? `Quiet week for H-1B and EB green cards. ${n} other ${n === 1 ? "update" : "updates"}`
      : `${en.joinList(coreNews)}: news this week, ${more} inside`;
  },
  preheader: (n, top, topIsCore) =>
    n === 0
      ? "No significant official changes recorded this week."
      : top
        ? `${topIsCore ? "Top story" : "Also this week"}: ${top}. Every update links to the official source.`
        : `${n} official U.S. immigration change${n === 1 ? "" : "s"}, each linked to its source document.`,

  hero: {
    title: (coreNews) =>
      coreNews.length === 0
        ? "Quiet week for H-1B and EB green cards"
        : `New this week for ${en.joinList(coreNews)}`,
    quietWeek: "A quiet week in official immigration news",
    meta: (n, m) => `${n} official update${n === 1 ? "" : "s"} · ${m} min read`,
  },

  core: { h1b: "H-1B", employmentGreenCard: "EB green cards" },
  joinList: (xs) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`),

  board: {
    title: "The topics we track",
    noChange: "No change",
    news: "New this week",
    note:
      "“No change” means our sources recorded nothing on that topic this week. That describes our " +
      "archive, not the whole world, so check the official source before acting.",
  },

  audience: {
    sij: "Special Immigrant Juvenile (SIJ) applicants",
    medicalExam: "Green card applicants who need a medical exam (Form I-693)",
    h1b: "H-1B workers and employers",
    seasonal: "Seasonal and farm workers (H-2A, H-2B)",
    students: "International students and exchange visitors",
    daca: "DACA recipients",
    tps: "People with Temporary Protected Status",
    asylum: "Asylum seekers and refugees",
    employmentGreenCard: "Employment-based green card applicants",
    family: "Family-based immigrants and their sponsors",
    naturalization: "Naturalization applicants",
    visaBulletin: "People waiting on a Visa Bulletin date",
    fees: "Anyone filing with USCIS (fees)",
    immigrationCourt: "People with cases in immigration court",
    labor: "Workers and employers under U.S. labor law",
  },

  kind: {
    new_information: "New information",
    updated_information: "Policy update",
    correction: "Correction",
    historical_revision: "Revision",
    announcement: "Announcement",
    data_release: "Data release",
    proposed_rule: "Proposed rule",
    final_rule: "Final rule",
    executive_action: "Executive action",
    court_decision: "Court decision",
    legislative_action: "Legislation",
    deadline: "Deadline",
  },

  cta: {
    kicker: "Visa Bulletin",
    title: "Waiting on the Visa Bulletin?",
    body:
      "Sign up for free email alerts with the two dates for your category and country.",
    button: "Sign up for free alerts",
  },

  brand: {
    productName: "ImmigrationClock",
    tagline: "Immigration Pulse",
    strapline: "Official U.S. immigration changes from government sources.",
  },

  issueLabel: (from, to) => `Week of ${fmt(from)} – ${fmt(to)}`,
  date: (iso) => fmt(iso),

  opening: {
    withChanges: (shown, recorded) =>
      recorded > shown
        ? `This week brought ${recorded} official immigration updates. The ${shown} most consequential ` +
          `${shown === 1 ? "is" : "are"} below; the rest are in the archive.`
        : (shown === 1
            ? `This week brought 1 official immigration update.`
            : `This week brought ${shown} official immigration updates.`),
    noChanges:
      "No significant official changes were recorded this week. That is a statement about what our " +
      "sources published, not a guarantee that nothing happened. Routine notices are still going into " +
      "the archive, and we will be back next week.",
  },

  sections: {
    others: "Other official updates this week",
    snapshot: "This week at a glance",
    topChanges: "H-1B, green cards and the Visa Bulletin",
    unchanged: "What did not change",
    upcoming: "Coming up",
    quickNumbers: "By the numbers",
    explore: "More on ImmigrationClock",
  },

  snapshot: {
    readingTime: (m) => `Estimated reading time: ${m} minute${m === 1 ? "" : "s"}`,
    none: (label) => `No ${label.toLowerCase()}`,
  },

  unchanged: {
    intro:
      "We monitor these closely. Nothing was recorded against them this week. That describes our " +
      "archive, not the whole world, so keep checking the official source before acting.",
    topics: {
      h1b: "H-1B rules and the cap",
      daca: "DACA",
      tps: "Temporary Protected Status",
      asylum: "Asylum and refugee admissions",
      students: "F-1 student visas",
      employmentGreenCard: "Employment-based green cards",
    },
    allChanged: "Every topic we watch closely moved this week. See the changes above.",
  },

  upcoming: {
    recurring: "Recurring",
    note: "Dates published by the agency itself. They can move; the source link is the authority.",
  },

  leadGroup: (label) => `Top ${label} changes`,

  item: {
    severity: { major: "Major", notable: "Notable", routine: "Routine" },
    agency: "Agency",
    published: "Published",
    scheduled: "Scheduled for publication",
    notInForce: "Proposed: not in force",
    whyItMatters: "Why it matters",
    readDocument: "Read the official document",
    fromDocument: "From the official text",
    top: "Top story",
    about: "Who it's about",
  },

  stats: {
    uscis_policy: "USCIS policy updates",
    executive_actions: "Executive orders & proclamations",
    federal_register: "Federal Register documents",
    court_decisions: "Court decisions",
    dhs_announcements: "DHS announcements",
    total_recorded: "Total changes recorded",
    other_changes: "Other recorded changes",
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
