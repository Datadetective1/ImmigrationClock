// =============================================================================
// WHAT CHANGED, REDESIGNED — compact cards that keep every fact one tap away
// =============================================================================

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeCard } from "@/components/ChangeCard";
import { LEAD_COUNT, WhatChangedV2 } from "@/components/WhatChangedV2";
import { EVENTS } from "@/lib/event-store";
import { changePath } from "@/lib/share";
import { sortEvents } from "@/domains/graph/events";

const TODAY = "2026-10-16";
const card = (e: (typeof EVENTS)[number]) => renderToStaticMarkup(createElement(ChangeCard, { event: e, today: TODAY }));
const esc = (s: string) => s.replace(/&/g, "&amp;");

describe("the change card", () => {
  it("links to its own record and to its official source, on every record", () => {
    for (const e of EVENTS) {
      const html = card(e);
      expect(html, e.id).toContain(`href="${changePath(e)}"`);
      expect(html, e.id).toContain(`href="${esc(e.sourceUrl)}"`);
    }
  });

  it("never says in force, and dates a proposal only by publication", () => {
    // Our own words only: the document's title and summary may quote anything.
    for (const e of EVENTS) expect(card({ ...e, title: "T", summary: "" }), e.id).not.toMatch(/in force|in effect/i);
    const proposal = EVENTS.find((e) => e.classification === "proposed_rule")!;
    const html = card(proposal);
    expect(html).toContain("Proposed rule");
    expect(html).toMatch(/Proposed <span[^>]*>/);
  });

  it("shows a final rule's date ahead with a countdown, and a passed one as only a stated date", () => {
    const base = EVENTS.find((e) => e.classification === "final_rule")!;
    expect(card({ ...base, effectiveAt: "2026-11-01" })).toMatch(/Takes effect.*in 16 days/);
    expect(card({ ...base, effectiveAt: "2026-09-09" })).toContain("Stated effective date");
  });

  it("keeps importance separate from stage", () => {
    const base = EVENTS.find((e) => e.classification === "proposed_rule")!;
    const major = card({ ...base, severity: "major" });
    expect(major).toContain("Proposed rule");
    expect(major).toContain("Changes requirements");
    expect(card({ ...base, severity: "routine" })).not.toContain("Changes requirements");
  });

  it("hides the publisher's 'no abstract' placeholder instead of presenting it as a summary", () => {
    const base = EVENTS[0];
    expect(card({ ...base, summary: "No abstract was published with this document." })).not.toMatch(/No abstract/);
  });
});

describe("the redesigned list", () => {
  const significant = sortEvents(EVENTS.filter((e) => e.severity !== "routine"));
  const byDay = new Map<string, typeof EVENTS>();
  for (const e of significant) byDay.set(e.publishedAt, [...(byDay.get(e.publishedAt) ?? []), e]);
  const days = [...byDay.entries()].slice(0, 30) as [string, typeof EVENTS][];
  const routine = sortEvents(EVENTS.filter((e) => e.severity === "routine")).slice(0, 12);
  const html = renderToStaticMarkup(
    createElement(WhatChangedV2, {
      days,
      routine,
      today: TODAY,
      totalRecorded: EVENTS.length,
      earliest: "2025-01-03",
      lastChecked: TODAY,
      olderCount: 5,
      failed: [],
      methodology: null,
    })
  );

  it("keeps every change in the HTML, the first ones outside any disclosure", () => {
    const all = [...days.flatMap(([, e]) => e), ...routine];
    for (const e of all) expect(html, e.id).toContain(`href="${changePath(e)}"`);
    // The first disclosure in the list itself is "show more" (the filters' one comes before the list).
    const beforeFirstDetails = html.slice(0, html.indexOf("more from the last 30 days"));
    const lead = days.flatMap(([, e]) => e).slice(0, LEAD_COUNT);
    for (const e of lead) expect(beforeFirstDetails, e.id).toContain(`href="${changePath(e)}"`);
  });

  it("states coverage in one line and links to Sources & coverage", () => {
    expect(html).toContain('href="/sources"');
    expect(html).toContain(`${EVENTS.length.toLocaleString()} changes recorded`);
    expect(html).not.toMatch(/Derived from this event|Assembled from the source document/);
  });

  it("names a failed source instead of letting silence read as a quiet period", () => {
    const failed = renderToStaticMarkup(
      createElement(WhatChangedV2, {
        days,
        routine: [],
        today: TODAY,
        totalRecorded: 1,
        earliest: null,
        lastChecked: null,
        olderCount: 0,
        failed: [{ key: "federal-register", name: "Federal Register" }],
        methodology: null,
      })
    );
    expect(failed).toMatch(/Some sources did not report/);
    expect(failed).toContain("Federal Register");
  });

  it("says an empty window describes our sources, not everything that happened", () => {
    const empty = renderToStaticMarkup(
      createElement(WhatChangedV2, {
        days: [],
        routine: [],
        today: TODAY,
        totalRecorded: 0,
        earliest: null,
        lastChecked: null,
        olderCount: 0,
        failed: [],
        methodology: null,
      })
    );
    expect(empty).toMatch(/describes the sources we cover, not everything that happened/);
  });
});
