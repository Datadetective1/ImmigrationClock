// =============================================================================
// PLAIN-LANGUAGE EXPLAINERS — the "Explain like I'm 15" layer.
//
// Each core concept has three reading levels: simple (plain English), technical
// (precise definition), and methodology (how we source/derive it). Powers the
// /explained page's reading-level toggle so non-experts and experts both get a
// version that fits them. Content is factual and matches the rest of the site.
// =============================================================================
export type ExplainGroup = "border" | "enforcement" | "visa" | "workforce" | "data";

export interface Explainer {
  key: string;
  term: string;
  group: ExplainGroup;
  simple: string;
  technical: string;
  methodology: string;
}

export const EXPLAINERS: Explainer[] = [
  {
    key: "encounters",
    term: "Border encounters",
    group: "border",
    simple:
      "An “encounter” is each time U.S. border officials stop someone at or near the border. The same person can be stopped more than once, so it counts events, not people — and it is not the same as a deportation.",
    technical:
      "CBP nationwide encounters combine U.S. Border Patrol apprehensions (between ports of entry) and Office of Field Operations inadmissibles (at ports of entry), across all U.S. borders, by month and fiscal year.",
    methodology:
      "We sum CBP's published monthly encounters CSV by fiscal year. The current fiscal year is year-to-date; finished years are final. Citizenship and sector splits follow CBP's categories.",
  },
  {
    key: "ice",
    term: "ICE arrests vs removals vs detention",
    group: "enforcement",
    simple:
      "These are three different things. An arrest is when ICE takes someone into custody. A removal (deportation) is sending someone out of the country. Detention is how many people are being held on a given day. One arrest is not one deportation.",
    technical:
      "ICE administrative arrests, removals executed under an order of removal, and the point-in-time detained population are distinct measures with different denominators and should not be summed.",
    methodology:
      "From ICE ERO statistics and annual reports. Current-year arrest/removal totals are year-to-date shown with a projected full-year pace (labelled); detention is a dated point-in-time snapshot.",
  },
  {
    key: "h1b",
    term: "H-1B petition approvals",
    group: "visa",
    simple:
      "The H-1B lets a U.S. employer hire a foreign worker in a specialized job. An “approval” means the government approved an employer's petition — that is not the same as a visa being stamped at an embassy.",
    technical:
      "USCIS H-1B approvals count initial plus continuing petition approvals by fiscal year; the Employer Data Hub breaks them down by sponsoring employer.",
    methodology:
      "Headline H-1B totals are USCIS published figures (FY2024 is the latest complete employer release). Per-state and per-country splits are clearly-labelled estimates derived from those totals.",
  },
  {
    key: "issuance-vs-approval",
    term: "Visa issuance vs petition approval",
    group: "visa",
    simple:
      "Two agencies, two numbers. USCIS approves petitions inside the U.S.; the State Department issues the actual visa at an embassy abroad. The two counts measure different steps and will not match.",
    technical:
      "USCIS approvals (petitions adjudicated in the U.S.) and Department of State issuances (visas issued at consular posts) capture different stages of the process and use different reporting calendars.",
    methodology:
      "We show both and never combine them. State Department issuances come from monthly NIV/IV tables, which are published on a lag — see the reporting-lag breakdown on /data.",
  },
  {
    key: "f1",
    term: "F-1 student visas",
    group: "visa",
    simple:
      "An F-1 is the visa international students use to study in the U.S. The figure is how many were issued at embassies during the year.",
    technical:
      "F-1 academic student visa issuances reported by the Department of State by fiscal year; excludes M-1 vocational and J-1 exchange-visitor categories.",
    methodology:
      "From State Department visa statistics. Current-year figures are projected from year-to-date issuances and labelled as projections, not official totals.",
  },
  {
    key: "warn",
    term: "WARN layoff notices",
    group: "workforce",
    simple:
      "Large employers must warn the government before big layoffs. A WARN notice lists the employer and how many jobs are affected. It does not say that anyone was replaced.",
    technical:
      "The federal WARN Act requires advance notice of mass layoffs and plant closings; states publish the filings. Coverage thresholds and detail vary by state.",
    methodology:
      "We ingest Texas live from data.texas.gov; other states are curated. A layoff notice is not evidence of visa-related replacement and should not be read that way.",
  },
  {
    key: "provenance",
    term: "Reported, Projected, Estimated",
    group: "data",
    simple:
      "Every number here carries a tag. Reported means the agency published it. Projected means we stretched a partial year out to a full-year pace. Estimated means we split a national total into smaller pieces. Only “Reported” is an official figure.",
    technical:
      "Provenance labels separate source-published values from model-derived ones: projections (a full-year pace from year-to-date data) and estimates (apportioned shares of a reported total).",
    methodology:
      "We never present a projection or an estimate as an official figure. See /methodology for definitions and /data for how fresh each source is.",
  },
  {
    key: "fiscal-year",
    term: "Fiscal year & year-to-date",
    group: "data",
    simple:
      "The government's year runs October 1 to September 30, not January to December. “Year-to-date” means only the part of the current year that has happened so far — so it is smaller than a full year.",
    technical:
      "U.S. federal fiscal years run Oct 1–Sep 30 (FY2026 = Oct 2025–Sep 2026). Year-to-date figures cover only the elapsed portion of the current fiscal year.",
    methodology:
      "Current-FY cards are shown year-to-date; a full-year pace is computed only as a clearly-labelled projection from the elapsed share of the year.",
  },
];
