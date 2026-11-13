import type { ImmigrationEvent } from "./events";
import type { RssItem } from "./rss";
import { SCOTUS_APPLICATION } from "./adapters/federal-courts";
import { __testing as unTesting } from "./adapters/uscis-newsroom";

// =============================================================================
// COURT-RECORD CORRECTIONS for events already in the store
//
// Re-apply two court-record corrections to STORED events, found by checking the
// records against CourtListener on 2026-11-13. Fresh fetches cannot reach them:
// the federal-courts adapter has ingested nothing since CourtListener began
// requiring a token, and the USCIS item may have left the feed. Same shape as
// rescoreStoredNotice: re-runnable against stored fields, a reviewed change.
//
//  - A USCIS item is a court decision only if the current classifier says so.
//    "...Alien Terrorist Removal Court" names a tribunal in a DOJ press release.
//  - A Supreme Court ruling on an application (docket "26A308") was described
//    as "binding precedent in its circuit", the text for circuit courts.
// =============================================================================

export function correctStoredCourtRecord(e: ImmigrationEvent): ImmigrationEvent {
  if (e.sourceKey === "uscis_newsroom" && e.classification === "court_decision") {
    const item: RssItem = {
      title: e.title,
      link: e.sourceUrl,
      description: e.summary,
      publishedAt: e.publishedAt,
      guid: null,
      categories: [],
    };
    const classification = unTesting.classify(item);
    if (classification !== "court_decision") {
      return { ...e, classification, severity: unTesting.severity(item, classification) };
    }
  }
  const scotusApplication =
    /^Supreme Court of the United States issued a decision in .*, docket \d{2}A\d+\. Published appellate decision, binding precedent in its circuit\./;
  if (e.sourceKey === "federal_courts" && scotusApplication.test(e.summary)) {
    return {
      ...e,
      summary: e.summary.replace(
        "Published appellate decision, binding precedent in its circuit.",
        `${SCOTUS_APPLICATION.reason}.`
      ),
      limitations: (e.limitations ?? []).map((l) =>
        l.startsWith("A published appellate decision is binding precedent") ? SCOTUS_APPLICATION.limitation : l
      ),
    };
  }
  return e;
}

