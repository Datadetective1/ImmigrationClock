// =============================================================================
// EDITORIAL EXPLAINERS — the evergreen content ImmigrationClock can publish on
// a quiet day without pretending anything happened
//
// WHAT THESE ARE
// --------------
// Short, source-backed explanations of a distinction readers get wrong: a
// proposed rule is not a rule, an effective date is not a publication date, an
// approval count is not a headcount. Each one is a closed fact set — the social
// copy engine may only restate what is written here, the validator grounds every
// figure against it, and the page at /explained/<slug> renders the same facts
// with the same sources.
//
// WHAT THEY ARE NOT
// -----------------
// Not generated. Every sentence was written by a person from the cited source,
// and `verifiedAt` records when that was last checked. Not advice: nothing here
// tells anyone what to do, and the social validator rejects copy that does.
//
// HOW TO ADD ONE
// --------------
// Write the facts from the source, cite the source, keep every figure in the
// facts (the validator will reject a post that states a number that is not
// here), and add at least one keyword so the explainer can be linked from the
// changes it explains. Then re-run the tests: they pin that every explainer has
// a source, a distinct slug, and no advisory language.
// =============================================================================

export type ExplainerGroup =
  | "rulemaking"
  | "agency-process"
  | "courts"
  | "work-visas"
  | "students"
  | "green-cards"
  | "citizenship"
  | "enforcement-data"
  | "workforce-data"
  | "how-we-work";

export interface ExplainerSource {
  name: string;
  url: string;
}

export interface Explainer {
  /** URL slug under /explained/. Stable; changing it breaks shared links. */
  slug: string;
  /** The headline, as a distinction or a plain question. */
  title: string;
  /** One line under the headline: the point, stated. */
  kicker: string;
  /**
   * The closed world. Finished sentences, each supportable from the sources
   * below. The copy engine may restate these and nothing else.
   */
  facts: string[];
  /** The practical reason a reader would want the distinction. Not advice. */
  whyItMatters: string;
  sources: ExplainerSource[];
  /** ImmigrationClock pages that hold the underlying data or record. */
  relatedPaths: string[];
  /** Lowercase terms; a change whose title or summary carries one is related. */
  keywords: string[];
  group: ExplainerGroup;
  /** ISO date a person last checked the facts against the sources. */
  verifiedAt: string;
}

export const EXPLAINERS: Explainer[] = [
  {
    slug: "proposed-rule-vs-final-rule",
    title: "Proposed rule vs. final rule",
    kicker: "A proposed rule changes nothing. A final rule is the decision.",
    facts: [
      "A proposed rule is published in the Federal Register to invite public comment. It is a notice of what an agency intends to do, and by itself it changes no requirement, fee or eligibility test.",
      "The public may comment for a period the agency sets, commonly 30 to 60 days. The agency must consider the comments it receives before it decides.",
      "A final rule is the agency's binding decision. It can differ from the proposal, it states an effective date, and it can be delayed, challenged in court or rescinded by a later rule.",
      "A proposal can be withdrawn, or simply never finalised. Some are.",
      "ImmigrationClock labels a proposed rule \"not in force\" wherever it appears and never records an effective date for one.",
    ],
    whyItMatters:
      "Planning around a proposed fee or eligibility test as though it were already law is the most common way rulemaking news hurts a reader. The stage word is the whole story.",
    sources: [
      { name: "Regulations.gov — Learn about the regulatory process", url: "https://www.regulations.gov/learn" },
      {
        name: "5 U.S.C. § 553 — Rule making (Administrative Procedure Act)",
        url: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title5-section553&num=0&edition=prelim",
      },
    ],
    relatedPaths: ["/what-changed"],
    keywords: ["proposed rule", "notice of proposed rulemaking", "final rule", "comment period"],
    group: "rulemaking",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "effective-date-vs-publication-date",
    title: "An effective date is not a publication date",
    kicker: "A rule can be published, final, and still not apply for weeks.",
    facts: [
      "A final rule published in the Federal Register carries a publication date and, separately, an effective date. Its requirements apply from the effective date.",
      "Under the Administrative Procedure Act a substantive rule generally cannot take effect less than 30 days after it is published. The exceptions include rules that grant an exemption or relieve a restriction, and cases where the agency finds and states good cause.",
      "Some rules add a compliance date as well — a later date by which the people the rule covers must be in compliance.",
      "A document can appear on the Federal Register's public inspection list a day or more before it is published. Public inspection is not publication, and it is not effect.",
      "ImmigrationClock records the publication date and the effective date as two separate fields and only states an effective date the document itself gives.",
    ],
    whyItMatters:
      "The gap between publication and effect is the part a reader can still plan around. A post that says a rule \"took effect\" on the day it was published is usually wrong by a month.",
    sources: [
      {
        name: "5 U.S.C. § 553(d) — when a rule may take effect",
        url: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title5-section553&num=0&edition=prelim",
      },
      { name: "Federal Register — Public Inspection", url: "https://www.federalregister.gov/public-inspection/current" },
    ],
    relatedPaths: ["/what-changed", "/key-dates"],
    keywords: ["effective date", "effective", "compliance date", "public inspection"],
    group: "rulemaking",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "interim-final-rule",
    title: "What an interim final rule is",
    kicker: "In force first, comments after.",
    facts: [
      "An interim final rule takes effect without a comment period beforehand. The agency invokes an exception to notice-and-comment rulemaking, most often a finding of good cause, and states its reasons in the rule.",
      "It is binding from its effective date, like any final rule.",
      "The agency generally accepts public comments after publication and may later issue a further final rule that confirms, revises or withdraws the interim one.",
      "ImmigrationClock records an interim final rule as a rule in force from the effective date it states, and links the document so the comment instructions can be read in the original.",
    ],
    whyItMatters:
      "The word \"interim\" reads as \"temporary\" or \"not yet\". It means neither. The rule applies now; what is still open is whether it changes later.",
    sources: [
      {
        name: "5 U.S.C. § 553(b) — the exceptions to notice and comment",
        url: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title5-section553&num=0&edition=prelim",
      },
      { name: "Regulations.gov — Learn about the regulatory process", url: "https://www.regulations.gov/learn" },
    ],
    relatedPaths: ["/what-changed"],
    keywords: ["interim final rule", "good cause"],
    group: "rulemaking",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "uscis-policy-manual-updates",
    title: "What it means when USCIS updates the Policy Manual",
    kicker: "Guidance to officers, not a regulation — and it can change without rulemaking.",
    facts: [
      "The USCIS Policy Manual is the agency's centralized online repository for its immigration policies. It is organized in volumes by subject, and it is what USCIS officers apply when they adjudicate.",
      "USCIS announces a change with a policy alert on its Policy Manual updates page. Each alert names the volumes, parts and chapters it affects and describes what changed.",
      "The Policy Manual is guidance, not a regulation. It is not published in the Federal Register, and it can be revised or withdrawn without rulemaking.",
      "An alert usually states its own effective date inside the alert, and many take effect on the day they are published. The updates page itself does not list one, so ImmigrationClock records an effective date only when the document states it.",
      "ImmigrationClock records every alert as its own change, linked to the alert document and to the Policy Manual parts it names.",
    ],
    whyItMatters:
      "A Policy Manual update can change how a case is decided as soon as it is posted, without the comment period or the 30-day lead a regulation gets. That speed is why the updates page is worth watching, and why an update is not the same kind of thing as a rule.",
    sources: [
      { name: "USCIS Policy Manual", url: "https://www.uscis.gov/policy-manual" },
      { name: "USCIS Policy Manual — Updates", url: "https://www.uscis.gov/policy-manual/updates" },
    ],
    relatedPaths: ["/what-changed"],
    keywords: ["policy manual", "policy alert", "guidance"],
    group: "agency-process",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "h1b-approvals-vs-workers",
    title: "Why an H-1B approval count is not the number of workers",
    kicker: "USCIS counts petitions. A person can be behind several.",
    facts: [
      "USCIS reports H-1B petition approvals and denials by employer and fiscal year in its H-1B Employer Data Hub.",
      "A petition can be an initial petition for new employment, or a continuing one — an extension, an amendment, or a change of employer for someone already in H-1B status. One worker can be the beneficiary of more than one approved petition over time.",
      "The figure is therefore a count of adjudicated petitions. It is not a count of people currently working in H-1B status.",
      "It is not a count of visas either. Visas are issued by the State Department at consular posts, and many H-1B workers change to or extend the status from inside the United States without a visa being issued.",
      "ImmigrationClock's employer directory shows approvals and denials as USCIS reports them, labelled \"reported\", and keeps them separate from State Department issuance figures.",
    ],
    whyItMatters:
      "\"Company X got 4,000 H-1Bs\" is a sentence about petitions that gets read as a sentence about hiring. Knowing what the number counts is the difference between a fact and a talking point.",
    sources: [
      { name: "USCIS — H-1B Employer Data Hub", url: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub" },
      {
        name: "U.S. Department of State — Visa statistics",
        url: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html",
      },
    ],
    relatedPaths: ["/h1b/employers", "/h1b/top-sponsors", "/work-visas"],
    keywords: ["h-1b", "h1b", "petition", "approvals"],
    group: "work-visas",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "h1b-cap-and-registration",
    title: "How the H-1B cap works",
    kicker: "65,000 plus 20,000, a registration in spring, and an October 1 start.",
    facts: [
      "Congress set the regular H-1B cap at 65,000 new petitions per fiscal year, with an additional 20,000 for beneficiaries who hold a master's degree or higher from a U.S. institution.",
      "Employers register each beneficiary electronically during a registration period USCIS announces every year; in recent years it has opened in March. If registrations exceed the cap, USCIS selects among them and invites the selected employers to file petitions.",
      "Cap-subject H-1B employment can begin no earlier than October 1, the first day of the federal fiscal year.",
      "Some employers are exempt from the cap, including institutions of higher education and certain nonprofit or government research organizations. Petitions to extend or amend existing H-1B employment are not counted against it.",
      "ImmigrationClock tracks the registration window and the October 1 start on its key dates page, and links USCIS's own cap-season page for the current year's instructions.",
    ],
    whyItMatters:
      "The cap is the reason \"H-1B season\" exists. A reader who knows which petitions are capped, and when the window opens, can tell a real deadline from a headline.",
    sources: [
      {
        name: "USCIS — H-1B cap season",
        url: "https://www.uscis.gov/working-in-the-united-states/temporary-workers/h-1b-specialty-occupations-and-fashion-models/h-1b-cap-season",
      },
    ],
    relatedPaths: ["/key-dates", "/h1b/employers", "/work-visas"],
    keywords: ["h-1b cap", "cap-subject", "registration", "lottery"],
    group: "work-visas",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "opt-in-plain-terms",
    title: "OPT, in plain terms",
    kicker: "Twelve months, a 90-day filing window, and a STEM extension with its own rules.",
    facts: [
      "Optional Practical Training lets an F-1 student work in a job directly related to their major. A student may use up to 12 months of OPT per higher degree level, before or after completing the program.",
      "Post-completion OPT is requested from USCIS on Form I-765. The application can be filed up to 90 days before the program end date and no later than 60 days after it. Work may begin only once the employment authorization document is approved and its start date arrives.",
      "Students with a qualifying STEM degree may apply for a 24-month extension. The employer must be enrolled in E-Verify, and a formal training plan on Form I-983 is required.",
      "Time without a job counts: a student may accrue up to 90 days of unemployment during post-completion OPT, and an additional 60 days during the STEM extension.",
      "ImmigrationClock lists the OPT filing window among its recurring key dates and links USCIS's own OPT and STEM OPT pages for the current instructions.",
    ],
    whyItMatters:
      "Most OPT problems are calendar problems: a filing window missed, a start date misread, an unemployment limit run down. The rules are short. The dates are the hard part.",
    sources: [
      {
        name: "USCIS — Optional Practical Training (OPT) for F-1 Students",
        url: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-opt-for-f-1-students",
      },
      {
        name: "USCIS — Optional Practical Training Extension for STEM Students (STEM OPT)",
        url: "https://www.uscis.gov/working-in-the-united-states/students-and-exchange-visitors/optional-practical-training-extension-for-stem-students-stem-opt",
      },
    ],
    relatedPaths: ["/key-dates", "/visa/f1-student-visas"],
    keywords: ["opt", "practical training", "f-1", "stem"],
    group: "students",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "visa-bulletin-priority-dates",
    title: "How to read the Visa Bulletin",
    kicker: "A monthly table of cut-off dates decides who can move forward.",
    facts: [
      "The State Department publishes the Visa Bulletin every month. For each family-based and employment-based preference category, and for each country of chargeability, it lists the cut-off dates that determine when an immigrant visa number is available.",
      "A priority date is generally the date a petition was filed, or the date a labor certification was filed where one is required. An applicant may proceed when their priority date is earlier than the cut-off date listed for their category and country.",
      "The bulletin carries two charts: Final Action Dates and Dates for Filing. USCIS announces each month which chart applicants for adjustment of status inside the United States may use.",
      "Cut-off dates can retrogress — move backward — when demand in a category exceeds the annual limit. A date that was current one month can stop being current the next.",
      "ImmigrationClock lists the bulletin as a recurring monthly date and links the State Department page that publishes it.",
    ],
    whyItMatters:
      "For hundreds of thousands of people the Visa Bulletin is the only calendar that matters, and it is written in a format nobody explains. Knowing which chart, which category and which country to read is the whole skill.",
    sources: [
      {
        name: "U.S. Department of State — Visa Bulletin",
        url: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-bulletin.html",
      },
      {
        name: "USCIS — Visa Availability and Priority Dates",
        url: "https://www.uscis.gov/green-card/green-card-processes-and-procedures/visa-availability-priority-dates",
      },
    ],
    relatedPaths: ["/key-dates"],
    keywords: ["visa bulletin", "priority date", "retrogress", "final action"],
    group: "green-cards",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "court-order-is-not-a-rule-change",
    title: "What a court injunction does, and does not do",
    kicker: "An order stops enforcement. It does not rewrite the policy.",
    facts: [
      "An injunction is a court order requiring a party to do something, or to stop doing something. A preliminary injunction holds while the case is decided; a permanent injunction follows a final judgment.",
      "An injunction against a government policy stops the government from enforcing it as the order specifies. It does not rewrite the policy's text, and it does not change the statute the policy was issued under.",
      "Orders can be appealed, and a higher court can stay an order, which pauses its effect while the appeal is heard.",
      "The scope of an order — which parties it binds, and whether it reaches one district or the whole country — is set by the court that issues it and can be narrowed on appeal.",
      "ImmigrationClock records a court decision using the court's own description of what it did, links the order, and does not predict how an appeal will turn out.",
    ],
    whyItMatters:
      "\"A judge blocked the rule\" is true and incomplete. Whether the block is preliminary, who it covers and whether it has been stayed are the facts that decide what is actually in force today.",
    sources: [{ name: "U.S. Courts — Glossary of legal terms", url: "https://www.uscourts.gov/glossary" }],
    relatedPaths: ["/what-changed"],
    keywords: ["injunction", "court order", "enjoin", "vacat", "stay"],
    group: "courts",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "border-encounters-are-events",
    title: "A border encounter is an event, not a person",
    kicker: "The same person can be counted twice. A count of encounters is not a count of people.",
    facts: [
      "CBP's nationwide encounter figures combine U.S. Border Patrol apprehensions between ports of entry and Office of Field Operations inadmissibility determinations at ports of entry.",
      "The same person can be encountered more than once, so the number of encounters is larger than the number of unique individuals. CBP reports repeat encounters separately.",
      "An encounter is not a removal, a detention, or a grant of admission. Those are separate measures kept by separate agencies, and they cannot be read off the encounter total.",
      "CBP publishes encounters by month and by fiscal year. The federal fiscal year runs from October 1 to September 30, so the current year's total is incomplete until then.",
      "ImmigrationClock sums CBP's own published file by fiscal year, labels the current year as year-to-date, and never presents a partial year beside a full one as though they covered the same span.",
    ],
    whyItMatters:
      "Encounters are the most quoted immigration number and the most misread one. \"Two million encounters\" is not two million people, and it is not two million people who stayed.",
    sources: [
      { name: "CBP — Nationwide Encounters", url: "https://www.cbp.gov/newsroom/stats/nationwide-encounters" },
    ],
    relatedPaths: ["/border/encounters"],
    keywords: ["encounter", "encounters", "apprehension", "border"],
    group: "enforcement-data",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "arrests-removals-detention",
    title: "Arrests, removals and detention are three different numbers",
    kicker: "One arrest is not one deportation, and neither is a headcount in custody.",
    facts: [
      "An ICE arrest is an administrative arrest: the agency takes someone into custody. A removal is the execution of an order of removal — sending someone out of the country. The detained population is the number of people held in ICE custody on a given day.",
      "Arrests and removals are cumulative counts over a fiscal year. The detained population is a snapshot of one day, and a snapshot does not stay true the way a year-end total does.",
      "The three measures have different denominators and cannot be added together. Someone arrested in one year may be removed in another, or not at all.",
      "ImmigrationClock labels each figure by which of the three it is and how complete its period is, and shows the detention figure with the date it was taken.",
    ],
    whyItMatters:
      "\"ICE deported X people\" is usually a sentence about arrests, removals or detention, and which one changes the meaning entirely. The label is the fact.",
    sources: [{ name: "ICE — Statistics", url: "https://www.ice.gov/statistics" }],
    relatedPaths: ["/immigration/enforcement-trends"],
    keywords: ["removal", "removals", "detention", "arrests", "deportation"],
    group: "enforcement-data",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "what-a-warn-notice-is",
    title: "What a WARN notice is",
    kicker: "Sixty days' notice of a mass layoff, filed with the state — and silent on immigration status.",
    facts: [
      "The federal Worker Adjustment and Retraining Notification Act requires covered employers, generally those with 100 or more employees, to give 60 calendar days' written notice before a plant closing or a mass layoff as the Act defines them.",
      "Notice goes to the affected workers or their representatives, to the state's dislocated worker unit, and to the local government. Many states publish the notices they receive.",
      "Several states have their own laws with lower thresholds or longer notice periods, so a notice in one state is not always comparable to a notice in another.",
      "A WARN notice records an employer, a location, a date and a headcount. It says nothing about the immigration status of the workers affected.",
      "ImmigrationClock aggregates the notices published by the states that offer a machine-readable feed, and says which states those are. It is a growing subset, not a national total.",
    ],
    whyItMatters:
      "WARN notices are the earliest public record of a layoff, which is why they are worth tracking, and they are routinely misread as a record of who was laid off. They are a record of how many, and where.",
    sources: [
      {
        name: "U.S. Department of Labor — Worker Adjustment and Retraining Notification (WARN)",
        url: "https://www.dol.gov/agencies/eta/layoffs/warn",
      },
    ],
    relatedPaths: ["/layoffs", "/layoffs-vs-h1b", "/developers"],
    keywords: ["warn", "layoff", "layoffs", "plant closing"],
    group: "workforce-data",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "naturalization-ceremony",
    title: "What happens at a naturalization ceremony",
    kicker: "The oath is the last step. Until it is taken, the applicant is not yet a citizen.",
    facts: [
      "Taking the Oath of Allegiance at a naturalization ceremony is the final step in becoming a U.S. citizen. An applicant whose application has been approved is not a citizen until the oath is taken.",
      "Ceremonies are either judicial, administered by a court, or administrative, administered by USCIS.",
      "After the oath, the new citizen receives a Certificate of Naturalization, which is the proof of citizenship.",
      "USCIS's Policy Manual sets out how administrative ceremonies are conducted, including which outside organizations may take part and what they may do there. That guidance has changed more than once, and each change is recorded as a policy alert.",
      "ImmigrationClock records each Policy Manual change touching naturalization ceremonies as its own entry, linked to the alert.",
    ],
    whyItMatters:
      "The ceremony is where rules about voter registration, outside organizations and timing actually bite, and it is the step most people know least about until they are standing in it.",
    sources: [
      {
        name: "USCIS — Naturalization Ceremonies",
        url: "https://www.uscis.gov/citizenship/learn-about-citizenship/naturalization-ceremonies",
      },
    ],
    relatedPaths: ["/what-changed"],
    keywords: ["naturalization ceremon", "oath of allegiance"],
    group: "citizenship",
    verifiedAt: "2026-09-02",
  },
  {
    slug: "reported-projected-estimated",
    title: "How ImmigrationClock labels a number",
    kicker: "Every figure says how it was made.",
    facts: [
      "A figure labelled \"reported\" is one an agency published, or a fact about ImmigrationClock's own archive that can be counted exactly.",
      "\"Projected\" means a current, incomplete period extended to a full-period pace. \"Estimated\" means derived from a published share of a published total. \"Modeled\" means built from ImmigrationClock's own assumptions.",
      "Every figure also carries how complete its period is, and each source's known limitations are shown beside it rather than left for a reader to discover.",
      "The social account follows the same rule: a post may state a reported figure, and never a projected, estimated or modeled one.",
    ],
    whyItMatters:
      "A number without a label is a number a reader has to take on trust. The label is what lets a reader decide how much weight it can carry.",
    sources: [{ name: "ImmigrationClock — Methodology", url: "https://immigrationclock.com/methodology" }],
    relatedPaths: ["/methodology", "/data"],
    keywords: ["reported", "projected", "estimated", "modeled"],
    group: "how-we-work",
    verifiedAt: "2026-09-02",
  },
];

export const EXPLAINER_BY_SLUG = new Map(EXPLAINERS.map((e) => [e.slug, e]));

/** Explainers whose keywords appear in a piece of text. Used to link changes to context. */
export function explainersFor(text: string, limit = 3): Explainer[] {
  const hay = text.toLowerCase();
  return EXPLAINERS.filter((e) => e.keywords.some((k) => hay.includes(k))).slice(0, limit);
}
