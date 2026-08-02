// =============================================================================
// /what-changed — the flagship surface
//
// The event model enforces its guarantees at build time, but a reader never
// sees validateEvent(). These tests cover the trip from a validated event to
// the screen, where a correct record can still be presented misleadingly.
//
// Every case here is a way the page could be technically accurate and still
// tell someone something false about their obligations.
// =============================================================================
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { EVENTS, significantEvents, eventCoverageNote } from "@/lib/event-store";
import { NAV } from "@/lib/site";
import { sortResults } from "@/lib/event-index";
import {
  CLASSIFICATION_LABEL,
  SEVERITY_LABEL,
  SEVERITY_SHORT,
  isNotInForce,
} from "@/lib/event-labels";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const PAGE = read("src/app/what-changed/page.tsx");
const CARD = read("src/components/EventCard.tsx");
const EXPLORER = read("src/components/EventExplorer.tsx");

describe("what-changed surface", () => {
  it("is the first consumer of the event store", () => {
    // Phase 2A built the store; until this page it was write-only. If this
    // import ever disappears, the pipeline has gone back to feeding nothing.
    expect(PAGE).toMatch(/from "@\/lib\/event-store"/);
  });

  it("is reachable from the primary navigation", () => {
    const top = NAV.map((n) => n.href).filter(Boolean);
    expect(top).toContain("/what-changed");
  });

  it("is submitted for crawling", () => {
    expect(read("src/app/sitemap.ts")).toContain('"/what-changed"');
  });

  it("lets a reader search the whole archive, not just the visible feed", () => {
    // The feed is bounded to 30 days. Without search, the older events in the
    // store would be unreachable — present in the data and invisible to readers.
    expect(PAGE).toMatch(/<EventExplorer>/);
    expect(EXPLORER).toMatch(/from "@\/lib\/event-index"/);
  });

  it("keeps the editorial feed as the default view", () => {
    // Search is a tool a reader reaches for. Presenting an empty search box as
    // the answer to "what changed" would invert the point of the page.
    expect(EXPLORER).toMatch(/active \? \(/);
    expect(EXPLORER).toMatch(/children/);
  });

  it("reports zero-result searches, the platform's most valuable signal", () => {
    expect(EXPLORER).toMatch(/trackSearch/);
  });

  it("does not present an empty result as 'nothing happened'", () => {
    // An empty search means our archive cannot answer the question. That is our
    // gap, and saying otherwise would claim coverage we do not have.
    expect(EXPLORER).toMatch(/statement about what we have recorded/);
  });

  it("keeps a proposal marked as not in force in compact result rows too", () => {
    // The full card has a banner. A result row is smaller but must not lose the
    // one distinction that changes what a reader believes they must do — so both
    // surfaces read the SAME label from the shared module rather than each
    // keeping a copy that can drift.
    expect(EXPLORER).toMatch(/from "@\/lib\/event-labels"/);
    expect(EXPLORER).toMatch(/classificationLabel\(/);
  });

  it("tells the reader a result row is not the whole entry", () => {
    expect(EXPLORER).toMatch(/Search results are summaries/);
  });

  it("leads with change rather than routine paperwork", () => {
    // The natural failure mode of a change feed is filling quiet periods with
    // whatever it has until routine notices look like policy change. The lead
    // feed is severity-filtered; routine items live in their own disclosure.
    expect(PAGE).toMatch(/severity !== "routine"/);
    expect(PAGE).toMatch(/<details/);
  });

  it("keeps routine notices visible rather than dropping them", () => {
    // Filtering them out of the lead is editorial judgement; deleting them
    // would be hiding documents. They stay, labelled.
    expect(PAGE).toMatch(/severity === "routine"/);
  });

  it("states its own coverage on the page", () => {
    expect(PAGE).toContain("eventCoverageNote()");
    const note = eventCoverageNote();
    expect(note).toMatch(/More sources are being added/);
  });

  it("tells the reader when a source failed instead of showing a quiet feed", () => {
    // A lost source and a quiet month look identical to a reader. They are not
    // the same thing, and only one of them is our fault.
    expect(PAGE).toContain("failedAdapters()");
    expect(PAGE).toMatch(/did not report|may be missing/i);
  });
});

describe("event card integrity", () => {
  it("marks a proposed rule as not in force", () => {
    // The single most damaging thing this page could do is let someone believe
    // an obligation exists when a proposal is only open for comment. The wording
    // is asserted against the shared label module, which is the one place it now
    // lives; the card adds the banner on top of it.
    expect(CLASSIFICATION_LABEL.proposed_rule).toBe("Proposed rule — not in force");
    expect(isNotInForce("proposed_rule")).toBe(true);
    expect(isNotInForce("final_rule")).toBe(false);
    expect(CARD).toMatch(/creates no obligation today/);
  });

  it("keeps the not-in-force warning in the LABEL, not only in styling", () => {
    // Colour and a banner are layout. The label survives every layout, so the
    // consequential part is written into the words themselves.
    expect(CLASSIFICATION_LABEL.proposed_rule).toMatch(/not in force/);
  });

  it("defines every classification and severity the model can produce", () => {
    // A missing entry would render a raw enum like "historical_revision" to a
    // reader.
    for (const c of [
      "new_information", "updated_information", "correction", "historical_revision",
      "announcement", "data_release", "proposed_rule", "final_rule",
      "executive_action", "court_decision", "legislative_action", "deadline",
    ] as const) {
      expect(CLASSIFICATION_LABEL[c], `no label for ${c}`).toBeTruthy();
    }
    for (const s of ["major", "notable", "routine"] as const) {
      expect(SEVERITY_LABEL[s], `no label for ${s}`).toBeTruthy();
      expect(SEVERITY_SHORT[s], `no short label for ${s}`).toBeTruthy();
    }
  });

  it("keeps only one definition of the classification labels", () => {
    // REGRESSION: EventCard and EventExplorer each carried their own copy, which
    // meant three copies of "Proposed rule — not in force" in one codebase. One
    // could drift and start describing a proposal as a rule on a single surface
    // while the other still got it right, and nothing would fail.
    expect(CARD).not.toMatch(/proposed_rule:\s*"/);
    expect(EXPLORER).not.toMatch(/proposed_rule:\s*"/);
  });

  it("words a scheduled document as scheduled, never as published", () => {
    // Federal Register documents on public inspection carry a future date. The
    // store marks them `scheduled`; presenting one as "Published" would report
    // something that has not happened yet.
    expect(CARD).toMatch(/event\.scheduled/);
    expect(CARD).toMatch(/Scheduled for publication on/);
  });

  it("separates what the document states from what we inferred", () => {
    expect(CARD).toMatch(/basis !== "inferred"/);
    expect(CARD).toMatch(/our reading, not a stated scope/);
  });

  it("carries the evidence quote with the claim it supports", () => {
    expect(CARD).toMatch(/i\.evidence/);
    expect(CARD).toMatch(/Source says/);
  });

  it("renders the impact disclaimer beneath every impact block", () => {
    expect(CARD).toMatch(/impactDisclaimer\(impact\.completeness\)/);
  });

  it("explains an empty impact instead of showing silence", () => {
    // A blank "who is affected" reads as "nobody", which is a claim we have not
    // earned. The model supplies `undetermined`; the card must render it.
    expect(CARD).toMatch(/impact\.undetermined/);
  });

  it("always renders limitations", () => {
    expect(CARD).toMatch(/event\.limitations/);
  });

  it("links the original government document on every event", () => {
    expect(CARD).toMatch(/href=\{event\.sourceUrl\}/);
    expect(CARD).toMatch(/Read the original/);
  });

  it("does not colour severity as good or bad", () => {
    // The platform reports; it does not editorialize about whether a change is
    // welcome. Amber is reserved for the factual "this is not in force" banner.
    for (const label of Object.values(SEVERITY_LABEL)) {
      expect(label).not.toMatch(/urgent|alarm|danger|warning/i);
    }
    // Amber is reserved for the factual "this is not in force" banner, never for
    // severity.
    expect(CARD).not.toMatch(/severity === "major".*status-(red|amber)/s);
  });

  it("never phrases required action as advice", () => {
    expect(CARD).not.toMatch(/you should|you must|we recommend/i);
    expect(CARD).toMatch(/What the document says may be required/);
  });
});

describe("what the surface actually publishes", () => {
  it("shows no draft events", () => {
    for (const e of EVENTS) {
      expect(e.reviewStatus, `${e.id} is a draft and must not be public`).not.toBe("draft");
    }
  });

  it("gives every event on the lead feed a citable government source", () => {
    for (const e of significantEvents(100)) {
      expect(e.sourceUrl, `${e.id} has no absolute source URL`).toMatch(/^https?:\/\//);
      expect(e.title.trim().length, `${e.id} has no title`).toBeGreaterThan(0);
      expect(e.summary.trim().length, `${e.id} has no summary`).toBeGreaterThan(0);
    }
  });

  it("never puts an effective date on a proposal", () => {
    for (const e of EVENTS.filter((x) => x.classification === "proposed_rule")) {
      expect(e.effectiveAt, `${e.id} is a proposal with an effective date`).toBeFalsy();
    }
  });

  it("marks every future-dated event as scheduled", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const e of EVENTS.filter((x) => x.publishedAt > today)) {
      expect(e.scheduled, `${e.id} is future-dated but not marked scheduled`).toBe(true);
    }
  });
});

// =============================================================================
// ARCHIVE EXPERIENCE — sorting and paging
//
// Sorting must be TOTAL. A comparator that returns 0 for equal keys leaves the
// order at the mercy of the engine's sort stability, so a reader who scrolls,
// changes a filter, and comes back sees rows in a different order for no reason
// they can perceive.
// =============================================================================
describe("result ordering", () => {
  const e = (id: string, publishedAt: string, severity: "major" | "notable" | "routine") =>
    ({
      id, publishedAt, severity,
      title: id, effectiveAt: null, scheduled: false,
      classification: "final_rule" as const,
      sourceKey: "federal_register", sourceUrl: "https://x.gov", summary: "", entityIds: [],
    });

  it("sorts newest and oldest first", () => {
    const rows = [e("a", "2026-01-01", "major"), e("b", "2026-07-01", "major")];
    expect(sortResults(rows, "newest").map((r) => r.id)).toEqual(["b", "a"]);
    expect(sortResults(rows, "oldest").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("sorts by importance before date", () => {
    const rows = [e("routine-new", "2026-07-01", "routine"), e("major-old", "2026-01-01", "major")];
    expect(sortResults(rows, "importance").map((r) => r.id)).toEqual(["major-old", "routine-new"]);
  });

  it("breaks every tie deterministically", () => {
    // Same date, same severity. Without the id fallback the order would depend
    // on engine sort stability and could differ between renders.
    const rows = [e("b", "2026-07-01", "major"), e("a", "2026-07-01", "major")];
    expect(sortResults(rows, "newest").map((r) => r.id)).toEqual(["a", "b"]);
    expect(sortResults(rows, "importance").map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const rows = [e("b", "2026-01-01", "major"), e("a", "2026-07-01", "major")];
    sortResults(rows, "newest");
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("paging", () => {
  it("renders a bounded page rather than the whole result set", () => {
    // At 190 events rendering everything is survivable; at a few thousand it is
    // a multi-second layout. Paging is a property of the component so the
    // archive can grow without this page changing.
    expect(EXPLORER).toMatch(/const PAGE_SIZE = \d+/);
    expect(EXPLORER).toMatch(/results\.slice\(0, visible\)/);
  });

  it("groups only what is on screen", () => {
    expect(EXPLORER).toMatch(/groupByDay\(page\)/);
  });

  it("resets paging when the query changes", () => {
    expect(EXPLORER).toMatch(/setVisible\(PAGE_SIZE\)/);
  });

  it("tells the reader how much of the result set they are seeing", () => {
    expect(EXPLORER).toMatch(/Showing \{visible\} of \{results\.length\}/);
  });
});

// =============================================================================
// PRODUCTION READINESS
//
// The site is a static export: there is no server to catch a failure, so the
// browser is the only place one can be handled.
// =============================================================================
describe("error and not-found boundaries", () => {
  const ERROR_PAGE = read("src/app/error.tsx");
  const NOT_FOUND = read("src/app/not-found.tsx");
  // Comments explain what the screen must NOT say and quote those phrases, so a
  // negative assertion has to read what actually renders, not the reasoning.
  const ERROR_RENDERED = ERROR_PAGE.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("has an error boundary at all", () => {
    // Without one, an exception in any client component leaves a blank page and
    // no way back.
    expect(ERROR_PAGE).toMatch(/export default function Error/);
    expect(ERROR_PAGE).toMatch(/"use client"/);
  });

  it("offers a way to recover rather than a dead end", () => {
    expect(ERROR_PAGE).toMatch(/onClick=\{reset\}/);
    expect(ERROR_RENDERED).toMatch(/Try again/);
  });

  it("never lets a crash masquerade as an answer about the data", () => {
    // THE critical rule for this screen. "No data available" or "nothing found"
    // would be a claim about U.S. immigration policy made by a component that
    // only knows rendering threw. On a platform whose promise is that a quiet
    // feed means a quiet feed, that would be the worst possible failure mode.
    expect(ERROR_RENDERED).toMatch(/not a statement about/);
    expect(ERROR_RENDERED).toMatch(/no data has changed/i);
    expect(ERROR_RENDERED).not.toMatch(/no data available|no results found|nothing to show/i);
  });

  it("sends no error report anywhere", () => {
    // A crash report carrying a URL and stack trace from someone reading about
    // asylum policy is exactly the record /methodology promises not to hold.
    expect(ERROR_RENDERED).not.toMatch(/fetch\(|sendBeacon|navigator\.send/);
  });

  it("keeps a 404 that points somewhere useful", () => {
    expect(NOT_FOUND).toMatch(/export default function/);
  });
});
