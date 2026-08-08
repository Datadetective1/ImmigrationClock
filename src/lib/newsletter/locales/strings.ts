// =============================================================================
// LOCALE CONTRACT
//
// The shape every language must satisfy. It is a TYPE rather than a convention,
// so a half-translated locale is a compile error rather than an English string
// appearing mid-paragraph in someone's Spanish newsletter.
//
// Functions rather than templates-with-placeholders wherever a number is
// involved: plural rules differ per language (Arabic has six categories), and
// `${n} changes` cannot express that. Giving each locale the number and letting
// it build the sentence is the only version that stays correct.
// =============================================================================

export interface LocaleStrings {
  /** BCP-47 tag for the `lang` attribute. */
  htmlLang: string;
  /** Name of this language, written in this language, for the selector. */
  endonym: string;

  /** Subject line. Kept under ~45 chars where the language allows. */
  subject: (itemCount: number) => string;
  /** The grey preview line beside the subject in most inboxes. */
  preheader: (itemCount: number) => string;

  brand: {
    /** Never translated — it is a proper noun. */
    productName: string;
    tagline: string;
    strapline: string;
  };

  /** "Week of 3 August 2026" — each locale formats its own date order. */
  issueLabel: (from: string, to: string) => string;

  opening: {
    /** Lead paragraph when the window produced items. */
    /**
     * `shown` is how many stories the issue renders; `recorded` is how many
     * eligible changes the window held. They differ whenever the archive found
     * more than the issue carries, and the copy must SAY so — the first
     * production issue printed "5 changes" beside a total of 6 and left a
     * reader to reconcile them.
     */
    withChanges: (shown: number, recorded: number) => string;
    /** Lead paragraph when it produced none. Must not imply nothing happened. */
    noChanges: string;
  };

  sections: {
    snapshot: string;
    topChanges: string;
    unchanged: string;
    upcoming: string;
    quickNumbers: string;
    explore: string;
  };

  snapshot: {
    /** "Estimated reading time: 4 minutes" — plural rules vary, so a function. */
    readingTime: (minutes: number) => string;
    /** "No Executive Orders" — takes an already-translated stat label. */
    none: (label: string) => string;
  };

  /** "What did NOT change" — the section that answers a weekly worry. */
  unchanged: {
    intro: string;
    /** Labels keyed by WATCHLIST key. */
    topics: Record<string, string>;
    /** Shown when every watched topic DID move this week. */
    allChanged: string;
  };

  upcoming: {
    /** Shown instead of a date for recurring items, e.g. the Visa Bulletin. */
    recurring: string;
    /** Reassures that these are scheduled, not predicted. */
    note: string;
  };

  /** Heading for the personalized group, e.g. "Top H-1B changes". */
  leadGroup: (label: string) => string;

  item: {
    severity: { major: string; notable: string; routine: string };
    agency: string;
    published: string;
    scheduled: string;
    notInForce: string;
    whyItMatters: string;
    readDocument: string;
  };

  /** Labels for IssueStat keys. Unknown keys are skipped rather than guessed. */
  stats: Record<string, string>;

  /** Buttons under "Continue exploring". Order is fixed by the renderer. */
  explore: {
    searchVisa: string;
    latestChanges: string;
    processingTimes: string;
    countries: string;
    greenCard: string;
    citizenship: string;
    h1b: string;
  };

  trust: {
    /** The closing promise. Required on every edition. */
    statement: string;
    /**
     * Why the headlines below are in English even in a translated edition.
     * The single most important localized string in this system.
     */
    sourceLanguageNote: string;
  };

  footer: {
    about: string;
    methodology: string;
    sources: string;
    privacy: string;
    contact: string;
    unsubscribe: string;
    /** Read this issue on the web. */
    viewOnline: string;
    disclaimer: string;
    /** Prefix for the language switcher row. */
    readIn: string;
  };
}
