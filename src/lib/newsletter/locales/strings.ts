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

  /**
   * Subject line. Leads with the answer most subscribers open the email for:
   * did anything change for H-1B or employment-based green cards? `coreNews`
   * holds the already-translated names of the CORE_WATCH topics that recorded
   * something this window; empty means both were quiet. Must contain the
   * shown-story count as digits whenever it is non-zero (validate.ts checks).
   * Aim for 50 characters; preflight advises past 60.
   */
  subject: (itemCount: number, coreNews: string[]) => string;
  /**
   * The grey preview line beside the subject. Names the top story so the
   * inbox row carries two different reasons to open, not one sentence twice.
   */
  preheader: (itemCount: number, topHeadline?: string) => string;

  /** The headline block under the masthead: the week in one line. */
  hero: {
    /** The h1. Same question the subject answers, as a full sentence. */
    title: (coreNews: string[]) => string;
    /** The h1 when the window produced nothing at all. */
    quietWeek: string;
    /** "5 official updates · 3 min read". Must print the minutes as digits. */
    meta: (itemCount: number, minutes: number) => string;
  };

  /** Short names for CORE_WATCH topics, used in the subject and the h1. */
  core: Record<string, string>;
  /** Joins two or more topic names: "H-1B and EB green cards". */
  joinList: (items: string[]) => string;

  /** The status board: every watched topic, quiet or not, before any story. */
  board: {
    title: string;
    noChange: string;
    news: string;
    /** What "no change" does and does not mean. Shown under the board. */
    note: string;
  };

  /** Plain-language name for an event classification, for the card kicker. */
  kind: Record<string, string>;

  /** The free Visa Bulletin alert sign-up block. Mirrors /visa-bulletin-alerts. */
  cta: {
    kicker: string;
    title: string;
    body: string;
    button: string;
  };

  brand: {
    /** Never translated — it is a proper noun. */
    productName: string;
    tagline: string;
    strapline: string;
  };

  /** "Week of 3 August 2026" — each locale formats its own date order. */
  issueLabel: (from: string, to: string) => string;
  /** One ISO date in this locale's long form, e.g. "20 November 2026". */
  date: (iso: string) => string;

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
    /** Label over the verbatim excerpt, so a quote never reads as our words. */
    fromDocument: string;
    /** Marker on the first card. */
    top: string;
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
