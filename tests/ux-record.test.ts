// =============================================================================
// ONE CHANGE'S RECORD, REDESIGNED — nothing dropped, nothing overstated
// =============================================================================

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChangeRecordV2 } from "@/components/ChangeRecordV2";
import { EVENTS } from "@/lib/event-store";
import { impactDisclaimer } from "@/domains/graph/impact";
import { changePath } from "@/lib/share";

const TODAY = "2026-10-16";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const render = (e: (typeof EVENTS)[number], amendedBy: string[] = []) =>
  renderToStaticMarkup(
    createElement(ChangeRecordV2, {
      event: e,
      title: e.title,
      path: changePath(e),
      canonical: `https://immigrationclock.com${changePath(e)}`,
      storyKey: `change:${e.id}`,
      today: TODAY,
      related: [],
      context: [],
      amendedBy,
    })
  );

describe("the redesigned record, on every record", () => {
  const pages = EVENTS.map((e) => ({ e, html: render(e) }));

  it("leads with the source button and the stage", () => {
    for (const { e, html } of pages) {
      const button = html.indexOf(`href="${esc(e.sourceUrl)}"`);
      expect(button, e.id).toBeGreaterThan(-1);
      expect(html.indexOf("The document&#x27;s summary") > button || html.indexOf("The document’s summary") > button, e.id).toBe(true);
    }
  });

  it("keeps every fact and caveat the old page carried", () => {
    for (const { e, html } of pages) {
      for (const l of e.limitations ?? []) expect(html, e.id).toContain(esc(l));
      if (e.impact) expect(html, e.id).toContain(esc(impactDisclaimer(e.impact.completeness)));
      expect(html, e.id).toMatch(/About this record/);
      expect(html, e.id).toMatch(/Classified automatically|Reviewed by a person/);
      expect(html, e.id).toMatch(/not legal advice/);
    }
  });

  it("never says a rule is in force or in effect in its own words", () => {
    for (const { e } of pages) {
      // Strip the document's own words (title, summary) before checking ours.
      const ours = render({ ...e, title: "T", summary: "S", whyItMatters: null } as never);
      // "not in force" (a proposal's stored limitation) is the correct negation.
      expect(ours, e.id).not.toMatch(/(?<!not )in force|in effect/i);
    }
  });

  it("says a proposal is not final, with a track that has no final rule unless a later record amends it", () => {
    const p = EVENTS.find((e) => e.classification === "proposed_rule")!;
    expect(render(p)).toMatch(/A proposal is not final/);
    expect(render(p)).toMatch(/None in our archive/);
    expect(render(p, ["federal_register:later"])).toMatch(/A later record amends this/);
  });
});
