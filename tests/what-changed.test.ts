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

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

const PAGE = read("src/app/what-changed/page.tsx");
const CARD = read("src/components/EventCard.tsx");

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
    // an obligation exists when a proposal is only open for comment.
    expect(CARD).toMatch(/proposed_rule: "Proposed rule — not in force"/);
    expect(CARD).toMatch(/creates no obligation today/);
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
    const severityBlock = CARD.slice(CARD.indexOf("const SEVERITY_LABEL"), CARD.indexOf("function entityName"));
    expect(severityBlock).not.toMatch(/status-red|status-green|text-red|text-green/);
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
