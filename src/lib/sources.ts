// =============================================================================
// CANONICAL SOURCE REGISTRY
//
// Founder Directive Part 2 Pillar 1 ("Official Sources First") and Part 4
// ("Data Freshness") require that every figure on the platform resolve to a named
// official source with a visible publication date, data-through date, methodology,
// and known limitations.
//
// This module is that registry. It is the single place those facts live. Nothing
// else in the codebase may hardcode a source name, agency, or cadence — if a
// number appears on a page, its provenance is looked up here.
//
// Four DIFFERENT dates are tracked, and conflating them is how trust erodes:
//
//   sourceUpdatedAt  — when the AGENCY published the figure. Varies per release,
//                      so it lives with the data, not here.
//   dataThrough      — the last period the figure actually covers.
//   lastFetchedAt    — when OUR pipeline last pulled it. From refresh.json.
//   lastVerifiedAt   — when a human last confirmed this source's URL, shape, and
//                      publication cadence are still what we claim. Recorded here
//                      because it cannot be derived; it must be attested.
//
// `lastVerifiedAt` is deliberately honest: several entries below carry older
// dates because they have NOT been re-verified recently. That is surfaced in the
// UI rather than hidden. A stale verification date is information, not a bug.
// =============================================================================

/**
 * How close a source is to the government record.
 *
 * Directive Part 2: "Secondary reporting may provide context, but official
 * records remain the source of truth whenever available." Anything not `official`
 * must be visibly marked wherever it is used.
 */
export type SourceTier =
  /** Published by the federal or a state agency itself. */
  | "official"
  /** Aggregated by us from many official publications (e.g. 50 state WARN portals). */
  | "official-aggregated"
  /** Not a government source. Context and cross-checks only — never a headline figure. */
  | "third-party";

/** How the data physically reaches the site. Determines what we can promise. */
export type IngestionMode =
  /** Fetched from a machine-readable API on every build. */
  | "live-api"
  /** Fetched from a published machine-readable file on every build. */
  | "live-file"
  /** Scraped on a schedule; a committed snapshot is what the build reads. */
  | "scheduled-scrape"
  /** Hand-transcribed from an agency's published report or PDF. */
  | "curated"
  /** Registered as a source we intend to cover but do not ingest yet. */
  | "planned";

export type Cadence = "continuous" | "weekly" | "monthly" | "quarterly" | "annual";

export interface SourceDef {
  key: string;
  name: string;
  agency: string;
  tier: SourceTier;
  description: string;
  /** Human-readable agency landing page. */
  homepageUrl: string;
  /** The specific dataset or report we actually use. */
  datasetUrl: string;
  cadence: Cadence;
  ingestion: IngestionMode;
  /** Key in refresh.json when this source is machine-ingested. */
  refreshKey?: string;
  /** Typical months between a period ending and the agency publishing it. */
  typicalLagMonths: number | null;
  /**
   * When a human last confirmed the URL resolves, the shape is unchanged, and the
   * cadence claim still holds. Update this ONLY after actually checking.
   */
  lastVerifiedAt: string;
  /** Plain-English limitation, always displayed. Never omit this. */
  limitations: string;
}

export const SOURCES: SourceDef[] = [
  {
    key: "uscis_h1b",
    name: "USCIS H-1B Employer Data Hub",
    agency: "U.S. Citizenship and Immigration Services (DHS)",
    tier: "official",
    description:
      "Employer-level counts of H-1B petition approvals and denials (initial and continuing) by fiscal year.",
    homepageUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
    datasetUrl: "https://www.uscis.gov/archive/h-1b-employer-data-hub-files",
    cadence: "annual",
    ingestion: "live-file",
    refreshKey: "employers",
    typicalLagMonths: 18,
    // Verified 2026-08-01: the archive page was fetched and the newest export
    // enumerated. FY2024/FY2025 exports do not exist yet — FY2023 is the latest
    // USCIS has published.
    lastVerifiedAt: "2026-08-01",
    limitations:
      "Counts petitions, not people or visas issued. One worker can generate several petitions. The latest published export lags the current fiscal year by roughly 18 months.",
  },
  {
    key: "uscis_h1b_national",
    name: "USCIS H-1B petition statistics (national)",
    agency: "U.S. Citizenship and Immigration Services (DHS)",
    tier: "official",
    description:
      "Nationwide H-1B petition approvals and denials by fiscal year. A separate release from the Employer Data Hub, published on a shorter lag.",
    homepageUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
    datasetUrl: "https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub",
    cadence: "annual",
    ingestion: "curated",
    typicalLagMonths: 6,
    lastVerifiedAt: "2026-02-18",
    limitations:
      "A different USCIS release from the Employer Data Hub, covering a more recent year. Figures from the two will not add up to each other. The most recent year is preliminary until USCIS finalises it.",
  },
  {
    key: "dol_lca",
    name: "DOL OFLC Disclosure Data (LCA / PERM)",
    agency: "U.S. Department of Labor, Office of Foreign Labor Certification",
    tier: "official",
    description:
      "Labor Condition Application (LCA) and PERM disclosure files: job titles, worksites, offered and prevailing wages.",
    homepageUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance",
    datasetUrl: "https://www.dol.gov/agencies/eta/foreign-labor/performance",
    cadence: "quarterly",
    ingestion: "curated",
    typicalLagMonths: 12,
    lastVerifiedAt: "2025-01-31",
    limitations:
      "An LCA is a wage attestation filed before a petition — it is not an approval and not evidence anyone was hired. Offered wages are what the employer attested, not what was paid.",
  },
  {
    key: "ice_stats",
    name: "ICE Enforcement and Removal Statistics",
    agency: "U.S. Immigration and Customs Enforcement (DHS)",
    tier: "official",
    description:
      "Administrative arrests, removals, detention population, and criminality breakdowns.",
    homepageUrl: "https://www.ice.gov/statistics",
    datasetUrl: "https://www.ice.gov/statistics",
    cadence: "monthly",
    ingestion: "curated",
    typicalLagMonths: 2,
    lastVerifiedAt: "2026-06-09",
    limitations:
      "Arrests, removals, and detention measure three different things on different calendars and must never be added together. ICE does not publish these figures broken down by state.",
  },
  {
    key: "dhs_stats",
    name: "DHS Immigration Statistics (OHSS)",
    agency: "U.S. Department of Homeland Security, Office of Homeland Security Statistics",
    tier: "official",
    description: "Yearbook of Immigration Statistics and enforcement lifecycle reporting.",
    homepageUrl: "https://www.dhs.gov/immigration-statistics",
    datasetUrl: "https://www.dhs.gov/immigration-statistics",
    cadence: "annual",
    ingestion: "curated",
    typicalLagMonths: 12,
    lastVerifiedAt: "2026-06-09",
    limitations:
      "Annual publication with a long lag. Definitions differ from ICE's operational reporting, so the two will not reconcile exactly.",
  },
  {
    key: "cbp_encounters",
    name: "CBP Nationwide Encounters",
    agency: "U.S. Customs and Border Protection (DHS)",
    tier: "official",
    description:
      "Southwest, northern, and nationwide encounters by month, sector, demographic, and citizenship.",
    homepageUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
    datasetUrl: "https://www.cbp.gov/newsroom/stats/nationwide-encounters",
    cadence: "monthly",
    ingestion: "live-file",
    refreshKey: "cbp",
    typicalLagMonths: 1,
    // Verified 2026-08-01: the published CSV was fetched successfully by the
    // refresh pipeline during this session.
    lastVerifiedAt: "2026-08-01",
    limitations:
      "An encounter is an event, not a person — the same individual can be encountered several times. Encounters are not deportations. CBP's published nationality detail is coarser than the site's country pages.",
  },
  {
    key: "dos_visa",
    name: "Department of State Visa Statistics",
    agency: "U.S. Department of State, Bureau of Consular Affairs",
    tier: "official",
    description:
      "Nonimmigrant and immigrant visa issuances by class and country (NIV/IV tables).",
    homepageUrl: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html",
    datasetUrl: "https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html",
    cadence: "monthly",
    ingestion: "curated",
    typicalLagMonths: 3,
    lastVerifiedAt: "2026-05-31",
    limitations:
      "Published as PDFs with no machine-readable feed, so ingestion is manual and lags. A visa issued by a consulate is not the same as a USCIS petition approval; the two counts are not interchangeable.",
  },
  {
    key: "bls_wages",
    name: "BLS Occupational Employment & Wage Statistics (OEWS)",
    agency: "U.S. Bureau of Labor Statistics",
    tier: "official",
    description: "Mean and median wages and employment by occupation and state.",
    homepageUrl: "https://www.bls.gov/oes/",
    datasetUrl: "https://www.bls.gov/oes/tables.htm",
    cadence: "annual",
    ingestion: "curated",
    typicalLagMonths: 12,
    lastVerifiedAt: "2025-04-03",
    limitations:
      "Covers all workers in an occupation, not visa holders specifically. Not comparable to H-1B offered wages without care.",
  },
  {
    key: "bls_unemployment",
    name: "BLS national unemployment rate",
    agency: "U.S. Bureau of Labor Statistics",
    tier: "official",
    description:
      "Seasonally adjusted national unemployment rate (series LNS14000000), shown as labour-market context.",
    homepageUrl: "https://www.bls.gov/cps/",
    datasetUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data/LNS14000000",
    cadence: "monthly",
    ingestion: "live-api",
    refreshKey: "bls",
    typicalLagMonths: 1,
    // Verified 2026-08-01: the public API returned a current value during this
    // session's pipeline run.
    lastVerifiedAt: "2026-08-01",
    limitations:
      "Context only. It says nothing about immigration directly and must not be presented as an immigration statistic.",
  },
  {
    key: "warn_layoffs",
    name: "State WARN Act notices (state open-data portals)",
    agency: "State labor and workforce agencies",
    tier: "official-aggregated",
    description:
      "Employer layoff and plant-closing notices with employee counts, aggregated from the state portals that publish machine-readable feeds.",
    homepageUrl: "https://www.dol.gov/agencies/eta/layoffs/warn",
    datasetUrl: "https://www.dol.gov/agencies/eta/layoffs/warn",
    cadence: "weekly",
    ingestion: "scheduled-scrape",
    refreshKey: "warn",
    typicalLagMonths: 0,
    // Verified 2026-08-01: TX, OR and CA adapters plus the committed wide-net
    // cache all produced notices during this session's build.
    lastVerifiedAt: "2026-08-01",
    limitations:
      "Partial state coverage — most states publish WARN notices only as HTML, Excel, or PDF. Not a national total. Some states publish only the layoff effective date, not the filing date. WARN reports PLANNED layoffs and never identifies the immigration status of affected workers.",
  },
  {
    key: "federal_register",
    name: "Federal Register",
    agency: "Office of the Federal Register (NARA)",
    tier: "official",
    description:
      "The daily journal of the U.S. government: rules, proposed rules, notices, and Presidential documents from every federal agency, including USCIS, DHS, CBP, ICE, State, and Labor.",
    homepageUrl: "https://www.federalregister.gov",
    datasetUrl: "https://www.federalregister.gov/developers/documentation/api/v1",
    cadence: "continuous",
    ingestion: "live-api",
    refreshKey: "federalRegister",
    typicalLagMonths: 0,
    // Verified 2026-08-01: the public API was queried during this session and
    // returned current documents with the fields this platform relies on.
    lastVerifiedAt: "2026-08-01",
    limitations:
      "Publication is not the same as effect: a proposed rule may never be finalised, and a final rule usually takes effect later than its publication date. Many documents are routine paperwork notices rather than policy change. We classify and rank by explicit rules, never by an editorial judgement of political significance.",
  },
  {
    key: "uscis_newsroom",
    name: "USCIS newsroom",
    agency: "U.S. Citizenship and Immigration Services (DHS)",
    tier: "official",
    description:
      "USCIS announcements: cap and lottery news, policy changes, TPS designations, fee and form changes, and litigation notices.",
    homepageUrl: "https://www.uscis.gov/newsroom/all-news",
    datasetUrl: "https://www.uscis.gov/news/rss-feed/59144",
    cadence: "continuous",
    ingestion: "live-api",
    refreshKey: "uscisNewsroom",
    typicalLagMonths: 0,
    // Verified 2026-08-01: the RSS feed was fetched during this session and
    // returned 250 current items.
    lastVerifiedAt: "2026-08-01",
    limitations:
      "An agency announcement is not the legal instrument. Effect and detail arrive separately in the Federal Register or the USCIS Policy Manual. Individual criminal-prosecution press releases carried on the same feed are excluded by editorial policy — see docs/editorial-policy.md.",
  },
  {
    key: "uscis_policy_manual",
    name: "USCIS Policy Manual",
    agency: "U.S. Citizenship and Immigration Services (DHS)",
    tier: "official",
    description:
      "Policy alerts and technical updates to the controlling adjudication guidance USCIS officers apply, each listing the formal Policy Manual sections it changes.",
    homepageUrl: "https://www.uscis.gov/policy-manual",
    datasetUrl: "https://www.uscis.gov/policy-manual/updates",
    cadence: "continuous",
    ingestion: "scheduled-scrape",
    refreshKey: "uscisPolicyManual",
    typicalLagMonths: 0,
    // Verified 2026-08-01: the updates page was fetched during this session and
    // returned 341 structured update rows, each with a machine-readable
    // <time datetime> and its affected-section citations.
    lastVerifiedAt: "2026-08-01",
    limitations:
      "The Policy Manual is guidance to USCIS officers, not regulation: it governs how USCIS adjudicates and can be revised or withdrawn without rulemaking. The updates page publishes no effective date, so events from this source do not assert one — where guidance states an effective date, it is in the linked document. USCIS publishes this page as HTML with no API, so it is scraped; a structural change fails the ingestion loudly rather than reporting a quiet month.",
  },
  {
    key: "federal_courts",
    name: "Federal court decisions",
    agency: "U.S. federal judiciary",
    tier: "official",
    description:
      "Decisions from federal district courts, courts of appeals, and the Supreme Court affecting immigration administration.",
    homepageUrl: "https://www.uscourts.gov",
    datasetUrl: "https://www.courtlistener.com/api/rest/v4/search/",
    cadence: "continuous",
    ingestion: "live-api",
    refreshKey: "federalCourts",
    typicalLagMonths: 0,
    // Verified 2026-08-02: the CourtListener v4 search API was queried during
    // this session, keyless, and returned current opinions with the caption,
    // court, filing date, docket, and precedential status this platform uses.
    lastVerifiedAt: "2026-08-02",
    limitations:
      "A decision's reach depends on its court and whether it is stayed or appealed — a district-court injunction is not nationwide law, and presenting one as such would seriously mislead. We report only decisions that establish or change immigration law: published appellate rulings and institutional litigation. Routine individual petitions, asylum appeals, visa denials, and detainee habeas cases are deliberately excluded, because this platform reports the legal rule rather than the people in a case. That filter identifies parties from the caption, so a landmark decision captioned with an individual's name is excluded along with the routine ones. CourtListener publishes no summary for these decisions, so events report court, date, docket, and precedential status only.",
  },
  {
    key: "congress",
    name: "Congress — bills and public laws",
    agency: "U.S. Congress",
    tier: "official",
    description: "Introduced, advanced, and enacted immigration legislation.",
    homepageUrl: "https://www.congress.gov",
    datasetUrl: "https://api.congress.gov/",
    cadence: "continuous",
    ingestion: "planned",
    typicalLagMonths: 0,
    lastVerifiedAt: "2026-08-01",
    limitations:
      "Not yet ingested. The overwhelming majority of introduced bills never become law; treating introduction as a change would badly misinform readers about what is actually happening.",
  },
  {
    key: "state_agencies",
    name: "State government immigration actions",
    agency: "U.S. state governments",
    tier: "official-aggregated",
    description:
      "State-level policies affecting immigrants: licensing, benefits, tuition, and enforcement cooperation.",
    homepageUrl: "https://www.usa.gov/state-governments",
    datasetUrl: "https://www.usa.gov/state-governments",
    cadence: "continuous",
    ingestion: "planned",
    typicalLagMonths: 0,
    lastVerifiedAt: "2026-08-01",
    limitations:
      "Not yet ingested. There is no national feed of state immigration policy; coverage would be built state by state and would be partial for a long time.",
  },
  {
    key: "sevis",
    name: "SEVIS / SEVP student and school data",
    agency: "U.S. Immigration and Customs Enforcement (DHS)",
    tier: "official",
    description: "Certified schools and international-student counts by school, level, and country.",
    homepageUrl: "https://www.ice.gov/sevis",
    datasetUrl: "https://studyinthestates.dhs.gov/sevis-data-mapping-tool",
    cadence: "quarterly",
    ingestion: "planned",
    typicalLagMonths: 3,
    lastVerifiedAt: "2026-08-01",
    limitations:
      "Not yet ingested. SEVIS counts active records, not people, and a student can hold more than one record over time.",
  },
  {
    key: "trac",
    name: "TRAC Immigration (Syracuse University)",
    agency: "Transactional Records Access Clearinghouse",
    tier: "third-party",
    description:
      "FOIA-derived immigration court, detention, and enforcement data, used only as a cross-check against official figures.",
    homepageUrl: "https://trac.syr.edu/immigration/",
    datasetUrl: "https://trac.syr.edu/immigration/",
    cadence: "monthly",
    ingestion: "planned",
    typicalLagMonths: 2,
    lastVerifiedAt: "2026-06-01",
    limitations:
      "NOT a government source. TRAC derives its figures from FOIA requests and its totals can differ from the agencies' own published numbers. Never use as a headline figure.",
  },
];

export const SOURCE_BY_KEY: Record<string, SourceDef> = Object.fromEntries(
  SOURCES.map((s) => [s.key, s])
);

/** Sources that come straight from a government publisher. */
export function officialSources(): SourceDef[] {
  return SOURCES.filter((s) => s.tier !== "third-party");
}

/** Sources whose data actually reaches the site through an automated pipeline. */
export function machineIngestedSources(): SourceDef[] {
  return SOURCES.filter(
    (s) => s.ingestion === "live-api" || s.ingestion === "live-file" || s.ingestion === "scheduled-scrape"
  );
}

/**
 * Months since a source's URL, shape, and cadence were last confirmed by a human.
 * Surfaced in the UI so a long-unchecked source is visible rather than implied
 * to be current.
 */
export function monthsSinceVerified(key: string, now = new Date()): number | null {
  const s = SOURCE_BY_KEY[key];
  if (!s) return null;
  const then = new Date(s.lastVerifiedAt).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((now.getTime() - then) / (86_400_000 * 30.44)));
}

export function sourceRef(key: string, updatedAt: string) {
  const s = SOURCE_BY_KEY[key];
  return {
    sourceName: s?.name ?? "Public dataset",
    sourceUrl: s?.homepageUrl ?? "https://www.dhs.gov/immigration-statistics",
    sourceUpdatedAt: updatedAt,
  };
}
