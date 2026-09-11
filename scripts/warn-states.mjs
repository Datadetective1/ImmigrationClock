// =============================================================================
// WARN SCRAPER COVERAGE — the one list of states the wide-net job can scrape.
//
// Shared by scripts/warn-scrape-plan.mjs (turns it into the CI matrix),
// scripts/refresh-warn-scraper.mjs (agency + portal provenance per state) and
// the tests. Plain ESM so plain `node` can load it: the refresh workflow runs
// these scripts without tsx.
//
// STATE_SOURCE is every parser shipped in biglocalnews/warn-scraper — the
// warn/scrapers/*.py modules of the release named below, with the agency name
// and portal URL each module declares in its own `__source__`. It is a static
// copy rather than a runtime discovery on purpose: the plan step must reject a
// code the package cannot scrape BEFORE a runner is spent on it. That used to be
// fatal rather than wasteful: the CLI has no per-state error handling, so
// `import_module("warn.scrapers.mn")` raised for a state the package has never
// supported, and every state after it in the list was silently never run.
// =============================================================================

/** The warn-scraper release these lists were derived from. */
export const WARN_SCRAPER_VERSION = "1.2.143";

const DC_YEAR = new Date().getUTCFullYear();

/** code → { agency, portal }, from each scraper module's `__source__`. */
export const STATE_SOURCE = {
  AK: { agency: "Alaska Department of Labor and Workforce Development", portal: "https://jobs.alaska.gov/RR/WARN_notices.htm" },
  AL: { agency: "Alabama Department of Commerce", portal: "https://www.madeinalabama.com/warn-list/" },
  AZ: { agency: "Arizona Department of Economic Security", portal: "https://www.azjobconnection.gov/search/warn_lookups/new" },
  CA: { agency: "California Employment Development Department", portal: "https://edd.ca.gov/en/Jobs_and_Training/Layoff_Services_WARN" },
  CO: { agency: "Colorado Department of Labor and Employment", portal: "https://cdle.colorado.gov/employers/layoff-separations/layoff-warn-list" },
  CT: { agency: "Connecticut Department of Labor", portal: "https://dolpublicdocumentlibrary.ct.gov/CsblrCategory?prefix=%2Frapid_response%2Fwarn_documents" },
  // The DC scraper declares no __source__; this is the page it reads, which the
  // agency republishes under a new year-suffixed URL every January.
  DC: { agency: "District of Columbia Department of Employment Services", portal: `https://does.dc.gov/page/industry-closings-and-layoffs-warn-notifications-${DC_YEAR}` },
  DE: { agency: "Delaware Department of Labor", portal: "https://joblink.delaware.gov/search/warn_lookups/new" },
  FL: { agency: "Florida Department of Economic Opportunity", portal: "https://floridajobs.org/office-directory/division-of-workforce-services/workforce-programs/reemployment-and-emergency-assistance-coordination-team-react/warn-notices" },
  GA: { agency: "Georgia Department of Labor", portal: "https://www.dol.state.ga.us/public/es/warn/searchwarns/list" },
  HI: { agency: "Workforce Development Hawaii", portal: "https://labor.hawaii.gov/wdc/real-time-warn-updates/" },
  IA: { agency: "Iowa Workforce Development Department", portal: "https://workforce.iowa.gov/employers/business-resources/warn" },
  ID: { agency: "Idaho Department of Labor", portal: "https://www.labor.idaho.gov/businesss/layoff-assistance/" },
  IL: { agency: "Illinois Department of Commerce and Economic Opportunity", portal: "https://www2.illinois.gov/dceo/WorkforceDevelopment/warn/Pages/default.aspx" },
  IN: { agency: "Indiana Department of Workforce Development", portal: "https://www.in.gov/dwd/warn-notices/current-warn-notices/" },
  KS: { agency: "Kansas Department of Commerce", portal: "https://www.kansasworks.com/search/warn_lookups/new" },
  KY: { agency: "Kentucky Career Center", portal: "https://kcc.ky.gov/employer/Pages/Business-Downsizing-Assistance---WARN.aspx" },
  LA: { agency: "Louisiana Workforce Commission", portal: "https://www.laworks.net/Downloads/Downloads_WFD.asp" },
  MD: { agency: "Maryland Department of Labor", portal: "https://www.dllr.state.md.us/employment/warn.shtml" },
  ME: { agency: "Maine Department of Labor", portal: "https://joblink.maine.gov/search/warn_lookups/new" },
  MI: { agency: "Michigan Department of Technology, Management and Budget", portal: "https://www.michigan.gov/leo/bureaus-agencies/wd/data-public-notices/warn-notices" },
  MO: { agency: "Missouri Office of Workforce Development", portal: "https://jobs.mo.gov/warn/" },
  MT: { agency: "Montana Department of Labor and Industry", portal: "https://wsd.dli.mt.gov/wioa/related-links/warn-notice-page" },
  NE: { agency: "Nebraska Department of Labor", portal: "https://dol.nebraska.gov/ReemploymentServices/LayoffServices/LayoffsAndDownsizingWARN" },
  NJ: { agency: "New Jersey Department of Labor and Workforce Development", portal: "https://www.nj.gov/labor/employer-services/warn/" },
  NM: { agency: "New Mexico Department of Workforce Solutions", portal: "https://www.dws.state.nm.us/Rapid-Response" },
  NY: { agency: "New York Department of Labor", portal: "https://dol.ny.gov/warn-notices" },
  OH: { agency: "Ohio Department of Job and Family Services", portal: "https://jfs.ohio.gov/warn/index.stm" },
  OK: { agency: "Oklahoma Office of Workforce Development", portal: "https://www.employoklahoma.gov/Participants/s/warnnotices" },
  OR: { agency: "Oregon Higher Education Coordinating Commission", portal: "https://ccwd.hecc.oregon.gov/Layoff/WARN" },
  PA: { agency: "Pennsylvania Department of Labor and Industry", portal: "https://www.pa.gov/agencies/dli/programs-services/workforce-development-home/warn-requirements/warn-notices" },
  RI: { agency: "Rhode Island Department of Labor and Training", portal: "https://dlt.ri.gov/employers/worker-adjustment-and-retraining-notification-warn" },
  SC: { agency: "South Carolina Department of Employment and Workforce", portal: "https://scworks.org/employer/employer-programs/at-risk-of-closing/layoff-notification-reports" },
  SD: { agency: "South Dakota Department of Labor and Regulation", portal: "https://dlr.sd.gov/workforce_services/businesses/warn_notices.aspx" },
  TN: { agency: "Tennessee Department of Labor and Workforce Development", portal: "https://www.tn.gov/workforce/general-resources/major-publications0/major-publications-redirect/reports.html" },
  TX: { agency: "Texas Workforce Commission", portal: "https://www.twc.texas.gov/data-reports/warn-notice" },
  UT: { agency: "Utah Department of Workforce Services", portal: "https://jobs.utah.gov/employer/business/warnnotices.html" },
  VA: { agency: "Virginia Employment Commission", portal: "https://www.vec.virginia.gov/warn-notices" },
  VT: { agency: "Vermont Department of Labor", portal: "https://www.vermontjoblink.com/search/warn_lookups/new" },
  WA: { agency: "Washington Employment Security Department", portal: "https://esd.wa.gov/about-employees/WARN" },
  WI: { agency: "Wisconsin Department of Workforce Development", portal: "https://dwd.wisconsin.gov/dislocatedworker/warn/" },
};

/** Every postal code warn-scraper can be asked for, upper-case, sorted. */
export const SCRAPER_STATES = Object.keys(STATE_SOURCE).sort();

/**
 * States scripts/build-warn.ts already fetches from a structured feed on every
 * build. The scraper is not run for them by default: build-warn keeps the live
 * rows and drops scraped rows for any state its adapters fetched, so scraping
 * them would only spend runner minutes (California's parser reads a year of
 * PDFs) to produce rows that are thrown away.
 *
 * Oregon is deliberately NOT here. It has a live adapter too, but
 * data.oregon.gov answers the GitHub runners with HTTP 403, so the scraper — which
 * reads the agency's own Excel download instead — is the path that actually
 * delivers Oregon.
 */
export const LIVE_ADAPTER_STATES = ["TX", "CA"];

export const DEFAULT_SCRAPE_STATES = SCRAPER_STATES.filter((s) => !LIVE_ADAPTER_STATES.includes(s));

/** Federal overview page, used when a state has no portal of its own. */
export const FALLBACK_PORTAL = "https://www.dol.gov/agencies/eta/layoffs/warn";

/**
 * Turn a workflow input into the list of states to scrape.
 *
 *   "default"           → every supported state without a live adapter
 *   "all"               → every supported state
 *   "wa nj md" / "WA,NJ" → those states, in order, de-duplicated
 *
 * Unknown codes are returned separately rather than thrown, so the caller can
 * warn about them and still scrape the rest.
 */
export function resolveStates(input) {
  const raw = String(input ?? "").trim().toLowerCase();
  if (!raw || raw === "default") return { states: [...DEFAULT_SCRAPE_STATES], unknown: [] };
  if (raw === "all") return { states: [...SCRAPER_STATES], unknown: [] };
  const states = [];
  const unknown = [];
  for (const tok of raw.split(/[\s,]+/).filter(Boolean)) {
    const code = tok.toUpperCase();
    if (!SCRAPER_STATES.includes(code)) {
      if (!unknown.includes(code)) unknown.push(code);
    } else if (!states.includes(code)) {
      states.push(code);
    }
  }
  return { states, unknown };
}

/**
 * Split states into contiguous batches for a CI matrix. Each batch becomes one
 * runner; a state's failure or timeout inside a batch never affects the others
 * (see .github/scripts/scrape-warn-states.sh). Names read as "1/5 AK–FL".
 */
export function planBatches(states, batchCount) {
  const n = Math.max(1, Math.min(Number(batchCount) || 1, states.length || 1));
  const size = Math.ceil(states.length / n);
  const batches = [];
  for (let i = 0; i < states.length; i += size) {
    const slice = states.slice(i, i + size);
    batches.push({
      name: `${batches.length + 1}/${Math.ceil(states.length / size)} ${slice[0]}–${slice[slice.length - 1]}`,
      states: slice.map((s) => s.toLowerCase()).join(" "),
    });
  }
  return batches;
}
